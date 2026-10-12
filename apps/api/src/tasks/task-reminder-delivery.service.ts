import { Inject, Injectable } from '@nestjs/common';

import { TASK_REMINDER_CLOCK, type TaskReminderClock } from './task-reminder-clock.js';
import {
  classifyTaskReminderFailure,
  isFinalTaskReminderAttempt,
  isTaskReminderBackoffElapsed,
  taskReminderBackoffElapsedWhere,
  type TaskReminderFailureCode,
} from './task-reminder-retry.js';
import { buildVisibleTaskWhere, resolveTaskAccessInTransaction } from './task-visibility.js';
import {
  Prisma,
  TaskAssignmentStatus,
  TaskEventAction,
  TaskReminderStatus,
  TaskStatus,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;

/** Upper bound on reminders or overdue tasks one tick touches. */
export const TASK_REMINDER_TICK_MAX_LIMIT = 100;

/** Overdue tasks examined per tick when the caller does not narrow it. */
export const TASK_OVERDUE_TICK_DEFAULT_LIMIT = 100;

const DELIVERY_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

const activeTaskStatuses = [
  TaskStatus.OPEN,
  TaskStatus.IN_PROGRESS,
  TaskStatus.WAITING,
  TaskStatus.BLOCKED,
] as const;

const activeTaskStatusSet = new Set<TaskStatus>(activeTaskStatuses);

/** Fixed TaskEvent summaries. They name the outcome only, never task content. */
export const TASK_REMINDER_EVENT_SUMMARIES = {
  DELIVERED: 'Task reminder delivered.',
  CANCELED_TASK_CLOSED: 'Task reminder canceled because the task is closed.',
  CANCELED_RECIPIENT_INELIGIBLE:
    'Task reminder canceled because the recipient is no longer eligible.',
  FAILED: 'Task reminder delivery failed after the retry limit.',
  OVERDUE_SENT: 'Task overdue notification processed.',
} as const;

/**
 * `scheduler` runs as the system (null actor); `manual` runs as the authorized
 * manager who called `POST /v1/tasks/reminders/process-due`.
 */
export type TaskReminderTickTrigger = 'scheduler' | 'manual';

export type TaskReminderTickInput = {
  /** The tick's single UTC instant. Defaults to the injected clock. */
  now?: Date;
  limit: number;
  trigger: TaskReminderTickTrigger;
  actorUserId: string | null;
  /** Overdue tasks to examine; defaults to {@link TASK_OVERDUE_TICK_DEFAULT_LIMIT}. */
  overdueLimit?: number;
};

export type TaskReminderTickResult = {
  trigger: TaskReminderTickTrigger;
  now: Date;
  candidates: number;
  delivered: number;
  skippedLocked: number;
  skippedStale: number;
  canceledTaskClosed: number;
  canceledRecipientIneligible: number;
  failedTransient: number;
  movedToFailed: number;
  failureNotRecorded: number;
  overdueCandidates: number;
  overdueNotificationsCreated: number;
  overdueSkippedLocked: number;
  overdueFailed: number;
};

/** What the candidate query observed; the failure recorder's guard compares against it. */
export type TaskReminderCandidate = {
  id: string;
  taskId: string;
  remindAt: Date;
  attemptCount: number;
  claimedAt: Date | null;
  updatedAt: Date;
};

export type TaskReminderDeliveryOutcome =
  | 'delivered'
  | 'skippedLocked'
  | 'skippedStale'
  | 'canceledTaskClosed'
  | 'canceledRecipientIneligible';

export type TaskReminderFailureOutcome = 'recorded' | 'movedToFailed' | 'stale';

export type TaskReminderLockedReminder = Prisma.TaskReminderGetPayload<{ include: { task: true } }>;

/**
 * Task reminder delivery engine (R-036 / D-088 PR A).
 *
 * PostgreSQL is the only coordination mechanism. Each reminder is delivered in its
 * own short transaction: the parent Task row is locked first with
 * `FOR UPDATE SKIP LOCKED` (the Task lock is the mutex for its reminders, so this
 * keeps the lock order every user write path uses), then the reminder is locked
 * and re-checked, and the Notification, the `SENT` state, and the TaskEvent commit
 * together. A failure rolls back only that reminder and is recorded separately.
 *
 * This is an internal trusted service. It is invoked by the authorized manual
 * endpoint today and by the scheduled runner later; it has no HTTP surface and
 * never acts as a user it was not given.
 */
@Injectable()
export class TaskReminderDeliveryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TASK_REMINDER_CLOCK) private readonly clock: TaskReminderClock,
  ) {}

  async runDueTick(input: TaskReminderTickInput): Promise<TaskReminderTickResult> {
    const actorUserId = this.assertTickActor(input.trigger, input.actorUserId);
    const limit = this.assertLimit(input.limit, 'limit');
    const overdueLimit = this.assertLimit(
      input.overdueLimit ?? TASK_OVERDUE_TICK_DEFAULT_LIMIT,
      'overdueLimit',
    );
    const now = new Date((input.now ?? this.clock.now()).getTime());
    const result: TaskReminderTickResult = {
      trigger: input.trigger,
      now,
      candidates: 0,
      delivered: 0,
      skippedLocked: 0,
      skippedStale: 0,
      canceledTaskClosed: 0,
      canceledRecipientIneligible: 0,
      failedTransient: 0,
      movedToFailed: 0,
      failureNotRecorded: 0,
      overdueCandidates: 0,
      overdueNotificationsCreated: 0,
      overdueSkippedLocked: 0,
      overdueFailed: 0,
    };

    const candidates = await this.selectDueReminders(now, limit);
    result.candidates = candidates.length;
    for (const candidate of candidates) {
      try {
        const outcome = await this.deliverReminder(candidate, now, actorUserId);
        result[outcome] += 1;
      } catch (error: unknown) {
        const code = classifyTaskReminderFailure(error);
        try {
          const recorded = await this.recordAttemptFailure(candidate, code, now, actorUserId);
          if (recorded === 'recorded') {
            result.failedTransient += 1;
          } else if (recorded === 'movedToFailed') {
            result.movedToFailed += 1;
          } else {
            result.skippedStale += 1;
          }
        } catch {
          // The reminder stays PENDING with its attempt count unchanged, so a later
          // tick retries it. There is no other place to keep this state.
          result.failureNotRecorded += 1;
        }
      }
    }

    const overdueTaskIds = await this.selectOverdueTasks(now, overdueLimit);
    result.overdueCandidates = overdueTaskIds.length;
    for (const taskId of overdueTaskIds) {
      try {
        const overdue = await this.notifyOverdueTask(taskId, now, actorUserId);
        if (overdue === 'skippedLocked') {
          result.overdueSkippedLocked += 1;
        } else {
          result.overdueNotificationsCreated += overdue;
        }
      } catch {
        // Nothing was committed for this task; it is selected again next tick.
        result.overdueFailed += 1;
      }
    }
    return result;
  }

  /**
   * Eligible `PENDING` reminders at `now`, oldest due first, with ties broken by
   * id. `now` is bound as a Prisma `DateTime` parameter; nothing reads the
   * database clock, so the database session time zone cannot change the result.
   */
  async selectDueReminders(now: Date, limit: number): Promise<TaskReminderCandidate[]> {
    return this.prisma.taskReminder.findMany({
      where: {
        status: TaskReminderStatus.PENDING,
        archivedAt: null,
        remindAt: { lte: now },
        ...taskReminderBackoffElapsedWhere(now),
      },
      orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        taskId: true,
        remindAt: true,
        attemptCount: true,
        claimedAt: true,
        updatedAt: true,
      },
    });
  }

  /** One reminder, one short transaction: Task lock, reminder lock, re-check, commit. */
  protected async deliverReminder(
    candidate: TaskReminderCandidate,
    now: Date,
    actorUserId: string | null,
  ): Promise<TaskReminderDeliveryOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const lockedTask = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Task" WHERE id = ${candidate.taskId}::uuid FOR UPDATE SKIP LOCKED
      `;
      if (lockedTask.length === 0) {
        return 'skippedLocked';
      }
      await tx.$queryRaw`
        SELECT id
        FROM "TaskReminder"
        WHERE id = ${candidate.id}::uuid
          AND "taskId" = ${candidate.taskId}::uuid
        FOR UPDATE
      `;
      const reminder = await tx.taskReminder.findFirst({
        where: { id: candidate.id, taskId: candidate.taskId },
        include: { task: true },
      });
      if (
        !reminder ||
        reminder.status !== TaskReminderStatus.PENDING ||
        reminder.archivedAt ||
        reminder.remindAt.getTime() > now.getTime() ||
        !isTaskReminderBackoffElapsed(reminder.attemptCount, reminder.claimedAt, now)
      ) {
        return 'skippedStale';
      }

      if (!activeTaskStatusSet.has(reminder.task.status) || reminder.task.archivedAt) {
        await this.cancelLockedReminder(tx, reminder, now, actorUserId, 'taskClosed');
        return 'canceledTaskClosed';
      }
      if (!(await this.isRecipientEligible(tx, reminder))) {
        // Lost eligibility is an authorization outcome, not a delivery fault:
        // system actor, no failureReason, no retry, never FAILED.
        await this.cancelLockedReminder(tx, reminder, now, null, 'recipientIneligible');
        return 'canceledRecipientIneligible';
      }

      await this.beforeDeliveryWrite(tx, reminder);
      await tx.notification.upsert({
        where: { idempotencyKey: `task-reminder:${reminder.id}` },
        update: {},
        create: {
          idempotencyKey: `task-reminder:${reminder.id}`,
          recipientUserId: reminder.recipientUserId,
          actorUserId: reminder.creatorUserId,
          type: 'tasks.reminder.due',
          title: 'Task reminder',
          bodySummary: 'A task reminder is due.',
          taskId: reminder.taskId,
          recruitmentMissionId: reminder.task.recruitmentMissionId,
          missionCandidateId: reminder.task.missionCandidateId,
        },
      });
      await tx.taskReminder.update({
        where: { id: reminder.id },
        data: {
          status: TaskReminderStatus.SENT,
          deliveredAt: now,
          claimedAt: now,
          attemptCount: { increment: 1 },
          processingToken: null,
          failureReason: null,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: reminder.taskId,
          actorUserId,
          action: TaskEventAction.REMINDER_DELIVERED,
          safeSummary: TASK_REMINDER_EVENT_SUMMARIES.DELIVERED,
        },
      });
      return 'delivered';
    }, DELIVERY_TRANSACTION_OPTIONS);
  }

  /**
   * Test seam inside the delivery transaction, after every check and before the
   * first write. Production does nothing here.
   */
  protected beforeDeliveryWrite(
    tx: PrismaTransaction,
    reminder: TaskReminderLockedReminder,
  ): Promise<void> {
    void tx;
    void reminder;
    return Promise.resolve();
  }

  /**
   * Records one transient failure in its own short transaction, after the delivery
   * transaction has rolled back. The guarded update only matches the exact row
   * state the candidate query saw, so a reschedule or cancel committed in between
   * wins and the stale failure is dropped. Lock order stays Task before reminder:
   * a `FOR KEY SHARE` on the Task waits for any user write holding the Task lock
   * instead of deadlocking against it.
   */
  protected async recordAttemptFailure(
    candidate: TaskReminderCandidate,
    code: TaskReminderFailureCode,
    now: Date,
    actorUserId: string | null,
  ): Promise<TaskReminderFailureOutcome> {
    const attemptCount = candidate.attemptCount + 1;
    const final = isFinalTaskReminderAttempt(attemptCount);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${candidate.taskId}::uuid FOR KEY SHARE`;
      const updated = await tx.taskReminder.updateMany({
        where: {
          id: candidate.id,
          taskId: candidate.taskId,
          status: TaskReminderStatus.PENDING,
          archivedAt: null,
          attemptCount: candidate.attemptCount,
          remindAt: candidate.remindAt,
          updatedAt: candidate.updatedAt,
        },
        data: {
          attemptCount,
          claimedAt: now,
          failureReason: code,
          processingToken: null,
          status: final ? TaskReminderStatus.FAILED : TaskReminderStatus.PENDING,
        },
      });
      if (updated.count === 0) {
        return 'stale';
      }
      if (!final) {
        return 'recorded';
      }
      await tx.taskEvent.create({
        data: {
          taskId: candidate.taskId,
          actorUserId,
          action: TaskEventAction.REMINDER_FAILED,
          safeSummary: TASK_REMINDER_EVENT_SUMMARIES.FAILED,
        },
      });
      return 'movedToFailed';
    }, DELIVERY_TRANSACTION_OPTIONS);
  }

  /**
   * Active overdue tasks that still have an owner or active assignee without a
   * `task-overdue:{taskId}:{userId}` notification, ordered by `dueAt` then id.
   * Tasks whose recipients are all notified drop out, so earlier tasks can never
   * occupy every slot. `now` is bound as text and cast to `timestamp(3)`, which
   * ignores the session time zone.
   */
  async selectOverdueTasks(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT t."id"
      FROM "Task" t
      WHERE t."dueAt" < ${now.toISOString()}::timestamp(3)
        AND t."status" IN ('open', 'in_progress', 'waiting', 'blocked')
        AND t."archivedAt" IS NULL
        AND EXISTS (
          SELECT 1
          FROM (
            SELECT t."ownerUserId" AS "userId"
            UNION
            SELECT a."userId"
            FROM "TaskAssignment" a
            WHERE a."taskId" = t."id"
              AND a."status" = 'active'
              AND a."archivedAt" IS NULL
          ) recipients
          WHERE recipients."userId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM "Notification" n
              WHERE n."idempotencyKey" =
                'task-overdue:' || t."id"::text || ':' || recipients."userId"::text
            )
        )
      ORDER BY t."dueAt" ASC, t."id" ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => row.id);
  }

  /** One overdue task, one short transaction, under the same Task-first lock. */
  protected async notifyOverdueTask(
    taskId: string,
    now: Date,
    actorUserId: string | null,
  ): Promise<number | 'skippedLocked'> {
    return this.prisma.$transaction(async (tx) => {
      const lockedTask = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Task" WHERE id = ${taskId}::uuid FOR UPDATE SKIP LOCKED
      `;
      if (lockedTask.length === 0) {
        return 'skippedLocked';
      }
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: {
          assignments: { where: { status: TaskAssignmentStatus.ACTIVE, archivedAt: null } },
        },
      });
      if (
        !task ||
        task.archivedAt ||
        !activeTaskStatusSet.has(task.status) ||
        !task.dueAt ||
        task.dueAt.getTime() >= now.getTime()
      ) {
        return 0;
      }
      const recipientIds = [
        ...new Set(
          [task.ownerUserId, ...task.assignments.map((assignment) => assignment.userId)].filter(
            (userId): userId is string => Boolean(userId),
          ),
        ),
      ];
      let created = 0;
      for (const recipientUserId of recipientIds) {
        const idempotencyKey = `task-overdue:${task.id}:${recipientUserId}`;
        const existing = await tx.notification.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          continue;
        }
        await tx.notification.upsert({
          where: { idempotencyKey },
          update: {},
          create: {
            idempotencyKey,
            recipientUserId,
            actorUserId,
            type: 'tasks.overdue',
            title: 'Task overdue',
            bodySummary: 'A task is overdue.',
            taskId: task.id,
            recruitmentMissionId: task.recruitmentMissionId,
            missionCandidateId: task.missionCandidateId,
          },
        });
        created += 1;
      }
      if (created > 0) {
        await tx.taskEvent.create({
          data: {
            taskId: task.id,
            actorUserId,
            action: TaskEventAction.OVERDUE_NOTIFICATION_SENT,
            safeSummary: TASK_REMINDER_EVENT_SUMMARIES.OVERDUE_SENT,
          },
        });
      }
      return created;
    }, DELIVERY_TRANSACTION_OPTIONS);
  }

  /**
   * The recipient must still exist, be active, internal, and non-archived, and
   * pass the authoritative Task visibility rule, all read under the Task lock.
   */
  private async isRecipientEligible(
    tx: PrismaTransaction,
    reminder: TaskReminderLockedReminder,
  ): Promise<boolean> {
    const recipient = await tx.user.findUnique({
      where: { id: reminder.recipientUserId },
      select: { status: true, userType: true, archivedAt: true },
    });
    if (
      !recipient ||
      recipient.status !== UserStatus.ACTIVE ||
      recipient.userType !== UserType.INTERNAL ||
      recipient.archivedAt
    ) {
      return false;
    }
    const access = await resolveTaskAccessInTransaction(tx, reminder.recipientUserId);
    const visible = await tx.task.count({
      where: {
        id: reminder.taskId,
        ...buildVisibleTaskWhere(reminder.recipientUserId, access),
      },
    });
    return visible > 0;
  }

  private async cancelLockedReminder(
    tx: PrismaTransaction,
    reminder: TaskReminderLockedReminder,
    now: Date,
    actorUserId: string | null,
    reason: 'taskClosed' | 'recipientIneligible',
  ): Promise<void> {
    await tx.taskReminder.update({
      where: { id: reminder.id },
      data: {
        status: TaskReminderStatus.CANCELED,
        canceledAt: now,
        canceledByUserId: actorUserId,
        processingToken: null,
      },
    });
    await tx.taskEvent.create({
      data: {
        taskId: reminder.taskId,
        actorUserId,
        action: TaskEventAction.REMINDER_CANCELED,
        safeSummary:
          reason === 'taskClosed'
            ? TASK_REMINDER_EVENT_SUMMARIES.CANCELED_TASK_CLOSED
            : TASK_REMINDER_EVENT_SUMMARIES.CANCELED_RECIPIENT_INELIGIBLE,
      },
    });
  }

  private assertTickActor(
    trigger: TaskReminderTickTrigger,
    actorUserId: string | null,
  ): string | null {
    if (trigger === 'manual') {
      if (!actorUserId) {
        throw new Error('A manual reminder tick requires the authorized manager as actor.');
      }
      return actorUserId;
    }
    if (actorUserId !== null) {
      throw new Error('A scheduler reminder tick runs as the system actor.');
    }
    return null;
  }

  private assertLimit(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 1 || value > TASK_REMINDER_TICK_MAX_LIMIT) {
      throw new RangeError(`${name} must be an integer from 1 to ${TASK_REMINDER_TICK_MAX_LIMIT}.`);
    }
    return value;
  }
}
