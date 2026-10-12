import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  TaskReminderDetailResponseSchema,
  TaskReminderProcessResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  Prisma,
  PrismaClient,
  RoleName,
  TaskAssignmentStatus,
  TaskEventAction,
  TaskReminderStatus,
  TaskStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import type { PrismaService } from '../src/persistence/prisma/prisma.service.js';
import type { TaskReminderClock } from '../src/tasks/task-reminder-clock.js';
import {
  TASK_REMINDER_EVENT_SUMMARIES,
  TaskReminderDeliveryService,
  type TaskReminderCandidate,
  type TaskReminderFailureOutcome,
  type TaskReminderLockedReminder,
  type TaskReminderTickInput,
} from '../src/tasks/task-reminder-delivery.service.js';
import type { TaskReminderFailureCode } from '../src/tasks/task-reminder-retry.js';
import { singleConnection } from './support/disposable-database.js';

/*
 * R-036 / D-088 PR A (Issue #169): Task reminder delivery engine.
 *
 * Every scheduler-domain tick runs on an injected clock fixed in January 2025.
 * Fixtures are placed relative to that instant, so rows other suites create with
 * the real clock are always in this suite's future and never selected. Concurrency
 * uses explicit promise barriers and real row locks; nothing sleeps on time.
 */

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const EMAIL_DOMAIN = '@r036-delivery.test';
const TITLE_PREFIX = 'R036 delivery';
const BASE_NOW = new Date('2025-01-15T12:00:00.000Z');
const MINUTE = 60_000;

const at = (offsetMs: number) => new Date(BASE_NOW.getTime() + offsetMs);

class FixedClock implements TaskReminderClock {
  constructor(public current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
}

type Gate = {
  entered: Promise<void>;
  release: () => void;
  signalEntered: () => void;
  released: Promise<void>;
};

function createGate(): Gate {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { entered, release, signalEntered, released };
}

function transientFault(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Synthetic transient fault naming jane@example.test',
    { code: 'P2034', clientVersion: 'test' },
  );
}

/**
 * The production engine with three test seams: a fault injector, a barrier held
 * inside the delivery transaction (with the Task lock taken), and a hook that runs
 * between the rolled-back delivery and the separate failure recorder.
 */
class TestDeliveryService extends TaskReminderDeliveryService {
  readonly faults = new Map<string, number>();
  readonly gates = new Map<string, Gate>();
  beforeRecord?: (candidate: TaskReminderCandidate) => Promise<void>;
  readonly recorderOutcomes: TaskReminderFailureOutcome[] = [];

  protected override async beforeDeliveryWrite(
    tx: Prisma.TransactionClient,
    reminder: TaskReminderLockedReminder,
  ): Promise<void> {
    const gate = this.gates.get(reminder.id);
    if (gate) {
      gate.signalEntered();
      await gate.released;
    }
    const remaining = this.faults.get(reminder.id) ?? 0;
    if (remaining > 0) {
      this.faults.set(reminder.id, remaining - 1);
      // A write before the fault proves the whole transaction rolls back.
      await tx.notification.create({
        data: {
          idempotencyKey: `task-reminder:${reminder.id}`,
          recipientUserId: reminder.recipientUserId,
          type: 'tasks.reminder.due',
          title: 'Task reminder',
          bodySummary: 'A task reminder is due.',
          taskId: reminder.taskId,
        },
      });
      throw transientFault();
    }
  }

  protected override async recordAttemptFailure(
    candidate: TaskReminderCandidate,
    code: TaskReminderFailureCode,
    now: Date,
    actorUserId: string | null,
  ): Promise<TaskReminderFailureOutcome> {
    if (this.beforeRecord) {
      await this.beforeRecord(candidate);
    }
    const outcome = await super.recordAttemptFailure(candidate, code, now, actorUserId);
    this.recorderOutcomes.push(outcome);
    return outcome;
  }
}

function engine(client: PrismaClient = prisma, now = BASE_NOW) {
  const clock = new FixedClock(now);
  return { clock, service: new TestDeliveryService(client as unknown as PrismaService, clock) };
}

function schedulerTick(
  service: TaskReminderDeliveryService,
  now: Date,
  overrides: Partial<TaskReminderTickInput> = {},
) {
  return service.runDueTick({
    now,
    limit: 100,
    trigger: 'scheduler',
    actorUserId: null,
    ...overrides,
  });
}

async function createUser(local: string, roleName: RoleName): Promise<string> {
  const email = `${local}${EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${local}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: { userId: user.id, passwordHash: await passwords.hashPassword(testPassword) },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

async function login(baseUrl: string, local: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${local}${EMAIL_DOMAIN}`, password: testPassword }),
  });
  return AuthResponseSchema.parse(await response.json()).accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function cleanTaskRows(): Promise<void> {
  const taskWhere = { title: { startsWith: TITLE_PREFIX } };
  await prisma.notification.deleteMany({
    where: {
      OR: [{ task: taskWhere }, { recipient: { normalizedEmail: { endsWith: EMAIL_DOMAIN } } }],
    },
  });
  await prisma.taskReminder.deleteMany({ where: { task: taskWhere } });
  await prisma.taskEvent.deleteMany({ where: { task: taskWhere } });
  await prisma.taskAssignment.deleteMany({ where: { task: taskWhere } });
  await prisma.task.deleteMany({ where: taskWhere });
}

async function cleanAll(): Promise<void> {
  await cleanTaskRows();
  const userWhere = { normalizedEmail: { endsWith: EMAIL_DOMAIN } };
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: userWhere }, { targetUser: userWhere }] },
  });
  await prisma.refreshSession.deleteMany({ where: { user: userWhere } });
  await prisma.passwordCredential.deleteMany({ where: { user: userWhere } });
  await prisma.userRole.deleteMany({ where: { user: userWhere } });
  await prisma.user.deleteMany({ where: userWhere });
}

describe('Task reminder delivery engine (R-036 / D-088 PR A, Issue #169)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let managerUserId: string;
  let recipientUserId: string;
  let scopedUserId: string;
  let managerToken: string;
  let manageOnlyToken: string;
  let guestToken: string;

  async function createTask(
    label: string,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ): Promise<string> {
    const task = await prisma.task.create({
      data: {
        title: `${TITLE_PREFIX} ${label}`,
        ownerUserId: managerUserId,
        createdByUserId: managerUserId,
        ...data,
      },
    });
    return task.id;
  }

  async function createReminder(
    taskId: string,
    remindAt: Date,
    data: Partial<Prisma.TaskReminderUncheckedCreateInput> = {},
  ) {
    return prisma.taskReminder.create({
      data: {
        taskId,
        recipientUserId,
        creatorUserId: managerUserId,
        remindAt,
        idempotencyKey: `r036:${randomUUID()}`,
        ...data,
      },
    });
  }

  async function dueReminder(label: string, remindAt = BASE_NOW) {
    const taskId = await createTask(label);
    return createReminder(taskId, remindAt);
  }

  const reminderRow = (id: string) => prisma.taskReminder.findUniqueOrThrow({ where: { id } });
  const notificationCount = (reminderId: string) =>
    prisma.notification.count({ where: { idempotencyKey: `task-reminder:${reminderId}` } });
  const events = (taskId: string, action: TaskEventAction) =>
    prisma.taskEvent.findMany({ where: { taskId, action }, orderBy: { createdAt: 'asc' } });

  async function holdTaskLock<T>(taskId: string, during: () => Promise<T>): Promise<T> {
    const gate = createGate();
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${taskId}::uuid FOR UPDATE`;
        gate.signalEntered();
        await gate.released;
      },
      { timeout: 30_000 },
    );
    await gate.entered;
    try {
      return await during();
    } finally {
      gate.release();
      await holder;
    }
  }

  beforeAll(async () => {
    await cleanAll();
    managerUserId = await createUser('manager', RoleName.HR_MANAGER);
    recipientUserId = await createUser('recipient', RoleName.HR_MANAGER);
    scopedUserId = await createUser('scoped', RoleName.TEAM_LEADER);
    await createUser('manage-only', RoleName.TEAM_LEADER);
    await createUser('guest', RoleName.GUEST);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    managerToken = await login(baseUrl, 'manager');
    manageOnlyToken = await login(baseUrl, 'manage-only');
    guestToken = await login(baseUrl, 'guest');
  }, 30_000);

  afterEach(async () => {
    await cleanTaskRows();
    await prisma.user.updateMany({
      where: { normalizedEmail: { endsWith: EMAIL_DOMAIN } },
      data: { status: UserStatus.ACTIVE },
    });
  });

  afterAll(async () => {
    await app?.close();
    await cleanAll();
    await prisma.$disconnect();
  });

  it('1. does not deliver a reminder due one millisecond after the tick', async () => {
    const reminder = await dueReminder('future', at(1));
    const { service } = engine();
    const tick = await schedulerTick(service, BASE_NOW);
    expect(tick.candidates).toBe(0);
    expect((await reminderRow(reminder.id)).status).toBe(TaskReminderStatus.PENDING);
    expect(await notificationCount(reminder.id)).toBe(0);
  });

  it('2. delivers a reminder due exactly now once, as the system actor, without a fake user', async () => {
    const usersBefore = await prisma.user.count();
    const reminder = await dueReminder('exact');
    const { service } = engine();
    const first = await schedulerTick(service, BASE_NOW);
    const second = await schedulerTick(service, BASE_NOW);
    expect(first.delivered).toBe(1);
    expect(second.delivered).toBe(0);
    const row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.SENT);
    expect(row.deliveredAt?.toISOString()).toBe(BASE_NOW.toISOString());
    expect(row.attemptCount).toBe(1);
    expect(row.failureReason).toBeNull();
    expect(await notificationCount(reminder.id)).toBe(1);
    const delivered = await events(reminder.taskId, TaskEventAction.REMINDER_DELIVERED);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.actorUserId).toBeNull();
    expect(delivered[0]!.safeSummary).toBe(TASK_REMINDER_EVENT_SUMMARIES.DELIVERED);
    const notification = await prisma.notification.findUniqueOrThrow({
      where: { idempotencyKey: `task-reminder:${reminder.id}` },
    });
    expect(notification.actorUserId).toBe(managerUserId);
    expect(notification.recipientUserId).toBe(recipientUserId);
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('3. delivers a reminder that has been overdue for three days', async () => {
    const reminder = await dueReminder('overdue', at(-3 * 24 * 60 * MINUTE));
    const { service } = engine();
    expect((await schedulerTick(service, BASE_NOW)).delivered).toBe(1);
    expect((await reminderRow(reminder.id)).status).toBe(TaskReminderStatus.SENT);
  });

  it('4. two concurrent workers produce exactly one notification per reminder', async () => {
    const reminders = [];
    for (let index = 0; index < 20; index += 1) {
      reminders.push(await dueReminder(`concurrent ${index}`, at(-index * 1000)));
    }
    const sameTaskSecond = await createReminder(reminders[0]!.taskId, at(-500));
    const workerClientA = new PrismaClient();
    const workerClientB = new PrismaClient();
    try {
      const [tickA, tickB] = await Promise.all([
        schedulerTick(engine(workerClientA).service, BASE_NOW),
        schedulerTick(engine(workerClientB).service, BASE_NOW),
      ]);
      expect(tickA.delivered + tickB.delivered).toBe(21);
      for (const reminder of [...reminders, sameTaskSecond]) {
        expect(await notificationCount(reminder.id)).toBe(1);
        expect((await reminderRow(reminder.id)).status).toBe(TaskReminderStatus.SENT);
      }
      expect(
        await prisma.taskEvent.count({
          where: {
            action: TaskEventAction.REMINDER_DELIVERED,
            task: { title: { startsWith: `${TITLE_PREFIX} concurrent` } },
          },
        }),
      ).toBe(21);

      // Deterministic variant: worker A holds the Task lock mid-delivery.
      const raced = await dueReminder('concurrent barrier');
      const { service: workerA } = engine(workerClientA);
      const gate = createGate();
      workerA.gates.set(raced.id, gate);
      const tickAPromise = schedulerTick(workerA, BASE_NOW);
      await gate.entered;
      const tickBWhileHeld = await schedulerTick(engine(workerClientB).service, BASE_NOW);
      expect(tickBWhileHeld.skippedLocked).toBe(1);
      expect(tickBWhileHeld.delivered).toBe(0);
      gate.release();
      expect((await tickAPromise).delivered).toBe(1);
      expect(await notificationCount(raced.id)).toBe(1);
    } finally {
      await workerClientA.$disconnect();
      await workerClientB.$disconnect();
    }
  });

  it('5. skips a reminder whose Task is locked elsewhere and delivers it on a later tick', async () => {
    const reminder = await dueReminder('locked');
    const { service } = engine();
    const whileLocked = await holdTaskLock(reminder.taskId, () => schedulerTick(service, BASE_NOW));
    expect(whileLocked.skippedLocked).toBe(1);
    expect(whileLocked.delivered).toBe(0);
    const row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.PENDING);
    expect(row.attemptCount).toBe(0);
    expect((await schedulerTick(service, BASE_NOW)).delivered).toBe(1);
    expect(await notificationCount(reminder.id)).toBe(1);
  });

  it('6. records a transient failure with a fixed code and retries after the backoff', async () => {
    const reminder = await dueReminder('transient');
    const { service } = engine();
    service.faults.set(reminder.id, 1);
    const failed = await schedulerTick(service, BASE_NOW);
    expect(failed.failedTransient).toBe(1);
    let row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.PENDING);
    expect(row.attemptCount).toBe(1);
    expect(row.claimedAt?.toISOString()).toBe(BASE_NOW.toISOString());
    expect(row.failureReason).toBe('TX_CONFLICT');
    expect(row.failureReason).not.toContain('jane');
    expect(await notificationCount(reminder.id)).toBe(0);

    expect((await schedulerTick(service, at(MINUTE - 1))).candidates).toBe(0);
    const retried = await schedulerTick(service, at(MINUTE));
    expect(retried.delivered).toBe(1);
    row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.SENT);
    expect(row.attemptCount).toBe(2);
    expect(row.failureReason).toBeNull();
    expect(await notificationCount(reminder.id)).toBe(1);
  });

  it('7. honors the 1, 5, 15, and 60 minute backoff boundaries on a fake clock', async () => {
    const reminder = await dueReminder('backoff');
    const { service } = engine();
    service.faults.set(reminder.id, Number.POSITIVE_INFINITY);
    let failedAt = BASE_NOW;
    expect((await schedulerTick(service, failedAt)).failedTransient).toBe(1);
    for (const [attempt, minutes] of [
      [1, 1],
      [2, 5],
      [3, 15],
    ] as const) {
      expect((await reminderRow(reminder.id)).attemptCount).toBe(attempt);
      const justBefore = new Date(failedAt.getTime() + minutes * MINUTE - 1);
      expect((await schedulerTick(service, justBefore)).candidates).toBe(0);
      failedAt = new Date(failedAt.getTime() + minutes * MINUTE);
      expect((await schedulerTick(service, failedAt)).failedTransient).toBe(1);
    }
    const row = await reminderRow(reminder.id);
    expect(row.attemptCount).toBe(4);
    expect(row.status).toBe(TaskReminderStatus.PENDING);
    const beforeLast = new Date(failedAt.getTime() + 60 * MINUTE - 1);
    expect((await schedulerTick(service, beforeLast)).candidates).toBe(0);
    expect(
      (await schedulerTick(service, new Date(failedAt.getTime() + 60 * MINUTE))).movedToFailed,
    ).toBe(1);
  });

  it('8. moves the fifth transient failure to FAILED and never selects it automatically', async () => {
    const reminder = await dueReminder('exhausted');
    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: { attemptCount: 4, claimedAt: at(-60 * MINUTE), failureReason: 'TIMEOUT' },
    });
    const { service } = engine();
    service.faults.set(reminder.id, 1);
    expect((await schedulerTick(service, BASE_NOW)).movedToFailed).toBe(1);
    const row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.FAILED);
    expect(row.attemptCount).toBe(5);
    expect(row.failureReason).toBe('TX_CONFLICT');
    expect(await notificationCount(reminder.id)).toBe(0);
    const failedEvents = await events(reminder.taskId, TaskEventAction.REMINDER_FAILED);
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]!.actorUserId).toBeNull();
    expect(failedEvents[0]!.safeSummary).toBe(TASK_REMINDER_EVENT_SUMMARIES.FAILED);
    const muchLater = await schedulerTick(service, at(365 * 24 * 60 * MINUTE));
    expect(muchLater.candidates).toBe(0);
    expect((await reminderRow(reminder.id)).status).toBe(TaskReminderStatus.FAILED);
  });

  it('9. cancels instead of delivering when the recipient is no longer active', async () => {
    const reminder = await dueReminder('inactive recipient');
    await prisma.user.update({
      where: { id: recipientUserId },
      data: { status: UserStatus.SUSPENDED },
    });
    const { service } = engine();
    const tick = await schedulerTick(service, BASE_NOW);
    expect(tick.canceledRecipientIneligible).toBe(1);
    expect(tick.failedTransient + tick.movedToFailed).toBe(0);
    const row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.CANCELED);
    expect(row.canceledByUserId).toBeNull();
    expect(row.canceledAt?.toISOString()).toBe(BASE_NOW.toISOString());
    expect(row.failureReason).toBeNull();
    expect(row.attemptCount).toBe(0);
    expect(await notificationCount(reminder.id)).toBe(0);
    const canceled = await events(reminder.taskId, TaskEventAction.REMINDER_CANCELED);
    expect(canceled).toHaveLength(1);
    expect(canceled[0]!.actorUserId).toBeNull();
    expect(canceled[0]!.safeSummary).toBe(
      TASK_REMINDER_EVENT_SUMMARIES.CANCELED_RECIPIENT_INELIGIBLE,
    );
    expect((await schedulerTick(service, at(24 * 60 * MINUTE))).candidates).toBe(0);
  });

  it('10. re-checks Task visibility at delivery and cancels when the recipient lost it', async () => {
    const taskId = await createTask('visibility');
    const assignment = await prisma.taskAssignment.create({
      data: { taskId, userId: scopedUserId, assignedByUserId: managerUserId },
    });
    const visible = await createReminder(taskId, at(-2 * MINUTE), {
      recipientUserId: scopedUserId,
    });
    const { service } = engine();
    expect((await schedulerTick(service, at(-2 * MINUTE))).delivered).toBe(1);
    expect((await reminderRow(visible.id)).status).toBe(TaskReminderStatus.SENT);

    const hidden = await createReminder(taskId, BASE_NOW, { recipientUserId: scopedUserId });
    await prisma.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        status: TaskAssignmentStatus.REMOVED,
        removedAt: BASE_NOW,
        removedByUserId: managerUserId,
      },
    });
    const tick = await schedulerTick(service, BASE_NOW);
    expect(tick.canceledRecipientIneligible).toBe(1);
    const row = await reminderRow(hidden.id);
    expect(row.status).toBe(TaskReminderStatus.CANCELED);
    expect(row.canceledByUserId).toBeNull();
    expect(row.failureReason).toBeNull();
    expect(await notificationCount(hidden.id)).toBe(0);
  });

  it('11. a manual reschedule from FAILED resets the retry state, then delivers', async () => {
    const reminder = await dueReminder('reschedule failed');
    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: {
        status: TaskReminderStatus.FAILED,
        attemptCount: 5,
        claimedAt: at(-MINUTE),
        failureReason: 'DB_UNAVAILABLE',
      },
    });
    const newRemindAt = at(30 * MINUTE);
    const response = await fetch(
      `${baseUrl}/v1/tasks/${reminder.taskId}/reminders/${reminder.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(managerToken),
        body: JSON.stringify({ remindAt: newRemindAt.toISOString() }),
      },
    );
    expect(response.status).toBe(200);
    const body = TaskReminderDetailResponseSchema.parse(await response.json());
    expect(body.reminder.status).toBe('PENDING');
    const row = await reminderRow(reminder.id);
    expect(row.status).toBe(TaskReminderStatus.PENDING);
    expect(row.attemptCount).toBe(0);
    expect(row.claimedAt).toBeNull();
    expect(row.failureReason).toBeNull();
    const { service } = engine();
    expect((await schedulerTick(service, newRemindAt)).delivered).toBe(1);
    expect(await notificationCount(reminder.id)).toBe(1);
  });

  it('12. cancels reminders on terminal or archived Tasks with a distinct event', async () => {
    const completedTask = await createTask('completed', { status: TaskStatus.COMPLETED });
    const archivedTask = await createTask('archived', { archivedAt: at(-MINUTE) });
    const onCompleted = await createReminder(completedTask, BASE_NOW);
    const onArchived = await createReminder(archivedTask, BASE_NOW);
    const { service } = engine();
    const tick = await schedulerTick(service, BASE_NOW);
    expect(tick.canceledTaskClosed).toBe(2);
    for (const reminder of [onCompleted, onArchived]) {
      const row = await reminderRow(reminder.id);
      expect(row.status).toBe(TaskReminderStatus.CANCELED);
      expect(row.canceledByUserId).toBeNull();
      expect(await notificationCount(reminder.id)).toBe(0);
      const canceled = await events(reminder.taskId, TaskEventAction.REMINDER_CANCELED);
      expect(canceled.map((event) => event.safeSummary)).toEqual([
        TASK_REMINDER_EVENT_SUMMARIES.CANCELED_TASK_CLOSED,
      ]);
    }
  });

  it('13. the manual processor and a scheduler-domain tick cannot duplicate a delivery', async () => {
    const reminder = await dueReminder('manual vs scheduler');
    const { service } = engine();
    const gate = createGate();
    service.gates.set(reminder.id, gate);
    const schedulerPromise = schedulerTick(service, BASE_NOW);
    await gate.entered;
    const manual = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: authHeaders(managerToken),
      body: JSON.stringify({ limit: 100 }),
    });
    expect(manual.status).toBe(201);
    expect(await notificationCount(reminder.id)).toBe(0);
    gate.release();
    expect((await schedulerPromise).delivered).toBe(1);

    const again = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: authHeaders(managerToken),
      body: JSON.stringify({ limit: 100 }),
    });
    expect(again.status).toBe(201);
    expect(await notificationCount(reminder.id)).toBe(1);
    expect(await events(reminder.taskId, TaskEventAction.REMINDER_DELIVERED)).toHaveLength(1);
    const delivered = await events(reminder.taskId, TaskEventAction.REMINDER_DELIVERED);
    expect(delivered[0]!.actorUserId).toBeNull();

    // Reverse order: both started together over a fresh reminder.
    const both = await dueReminder('manual and scheduler together');
    await Promise.all([
      schedulerTick(engine().service, BASE_NOW),
      fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
        method: 'POST',
        headers: authHeaders(managerToken),
        body: JSON.stringify({ limit: 100 }),
      }),
    ]);
    expect(await notificationCount(both.id)).toBe(1);
    expect(await events(both.taskId, TaskEventAction.REMINDER_DELIVERED)).toHaveLength(1);
  });

  it('14. a concurrent reschedule or cancel beats a stale failure recorder', async () => {
    const rescheduled = await dueReminder('stale recorder reschedule');
    const rescheduledTo = at(2 * 24 * 60 * MINUTE);
    const { service } = engine();
    service.faults.set(rescheduled.id, 1);
    service.beforeRecord = async (candidate) => {
      const response = await fetch(
        `${baseUrl}/v1/tasks/${candidate.taskId}/reminders/${candidate.id}`,
        {
          method: 'PATCH',
          headers: authHeaders(managerToken),
          body: JSON.stringify({ remindAt: rescheduledTo.toISOString() }),
        },
      );
      expect(response.status).toBe(200);
    };
    const first = await schedulerTick(service, BASE_NOW);
    expect(service.recorderOutcomes).toEqual(['stale']);
    expect(first.failedTransient).toBe(0);
    let row = await reminderRow(rescheduled.id);
    expect(row.status).toBe(TaskReminderStatus.PENDING);
    expect(row.remindAt.toISOString()).toBe(rescheduledTo.toISOString());
    expect(row.attemptCount).toBe(0);
    expect(row.claimedAt).toBeNull();
    expect(row.failureReason).toBeNull();

    const canceled = await dueReminder('stale recorder cancel');
    service.faults.set(canceled.id, 1);
    service.beforeRecord = async (candidate) => {
      const response = await fetch(
        `${baseUrl}/v1/tasks/${candidate.taskId}/reminders/${candidate.id}/cancel`,
        { method: 'POST', headers: authHeaders(managerToken) },
      );
      expect(response.status).toBe(201);
    };
    await schedulerTick(service, BASE_NOW);
    expect(service.recorderOutcomes).toEqual(['stale', 'stale']);
    row = await reminderRow(canceled.id);
    expect(row.status).toBe(TaskReminderStatus.CANCELED);
    expect(row.canceledByUserId).toBe(managerUserId);
    expect(row.attemptCount).toBe(0);
    expect(row.failureReason).toBeNull();
  });

  it('15. a poison reminder never blocks or rolls back healthy deliveries', async () => {
    const poison = await dueReminder('poison', at(-10 * MINUTE));
    const healthy = [];
    for (let index = 0; index < 5; index += 1) {
      healthy.push(await dueReminder(`healthy ${index}`, at(-(5 - index) * MINUTE)));
    }
    const { service } = engine();
    service.faults.set(poison.id, Number.POSITIVE_INFINITY);
    const tick = await schedulerTick(service, BASE_NOW);
    expect(tick.delivered).toBe(5);
    expect(tick.failedTransient).toBe(1);
    for (const reminder of healthy) {
      expect(await notificationCount(reminder.id)).toBe(1);
    }
    expect(await notificationCount(poison.id)).toBe(0);

    // Batch size 1: the poison row sits first, fails, then is held back by its
    // backoff in the query, so the next tick at the same instant reaches the rest.
    const poisonTwo = await dueReminder('poison batch one', at(-20 * MINUTE));
    const next = await dueReminder('healthy batch one', at(-19 * MINUTE));
    service.faults.set(poisonTwo.id, Number.POSITIVE_INFINITY);
    const firstSingle = await schedulerTick(service, BASE_NOW, { limit: 1 });
    expect(firstSingle.failedTransient).toBe(1);
    const secondSingle = await schedulerTick(service, BASE_NOW, { limit: 1 });
    expect(secondSingle.delivered).toBe(1);
    expect(await notificationCount(next.id)).toBe(1);
  });

  it('16. gives identical due results with PostgreSQL session time zones UTC and Africa/Casablanca', async () => {
    const offsets = [-30 * MINUTE, -1, 0, 1, 30 * MINUTE];
    const runIn = async (timeZone: string) => {
      const client = new PrismaClient({
        datasourceUrl: singleConnection(process.env.DATABASE_URL!),
      });
      try {
        await client.$executeRawUnsafe(`SET TIME ZONE '${timeZone}'`);
        const zone = await client.$queryRaw<{ TimeZone: string }[]>`SHOW TIME ZONE`;
        expect(zone[0]!.TimeZone).toBe(timeZone);
        const reminders = [];
        for (const offset of offsets) {
          reminders.push(await dueReminder(`tz ${timeZone} ${offset}`, at(offset)));
        }
        const overdueDue = await createTask(`tz ${timeZone} overdue`, { dueAt: at(-30 * MINUTE) });
        const overdueLater = await createTask(`tz ${timeZone} not overdue`, {
          dueAt: at(30 * MINUTE),
        });
        // The pre-fix comparison against a timestamptz depends on the session zone.
        const legacyDue = await client.$queryRaw<{ due: boolean }[]>`
          SELECT ("remindAt" <= ${BASE_NOW.toISOString()}::timestamptz) AS due
          FROM "TaskReminder" WHERE id = ${reminders[4]!.id}::uuid
        `;
        const tick = await schedulerTick(engine(client).service, BASE_NOW);
        const delivered = [];
        for (const [index, reminder] of reminders.entries()) {
          if ((await reminderRow(reminder.id)).status === TaskReminderStatus.SENT) {
            delivered.push(offsets[index]);
          }
        }
        const overdueNotified = await prisma.notification.findMany({
          where: { taskId: { in: [overdueDue, overdueLater] }, type: 'tasks.overdue' },
          select: { taskId: true },
        });
        return {
          delivered,
          tickDelivered: tick.delivered,
          overdueNotified: overdueNotified.map((n) => (n.taskId === overdueDue ? 'due' : 'later')),
          legacyDue: legacyDue[0]!.due,
        };
      } finally {
        await client.$disconnect();
      }
    };

    const utc = await runIn('UTC');
    const casablanca = await runIn('Africa/Casablanca');
    expect(utc.delivered).toEqual([-30 * MINUTE, -1, 0]);
    expect(casablanca.delivered).toEqual(utc.delivered);
    expect(casablanca.tickDelivered).toBe(utc.tickDelivered);
    expect(utc.overdueNotified).toEqual(['due']);
    expect(casablanca.overdueNotified).toEqual(['due']);
    // Evidence of F4: the old NOW()-style comparison fires the +30 min reminder early
    // under Africa/Casablanca (UTC+01:00 in January 2025) but not under UTC.
    expect(utc.legacyDue).toBe(false);
    expect(casablanca.legacyDue).toBe(true);
  });

  it('17. reaches every one of 150 overdue Tasks across bounded ticks without starvation', async () => {
    const taskIds: string[] = [];
    for (let index = 0; index < 150; index += 1) {
      taskIds.push(
        await createTask(`starvation ${String(index).padStart(3, '0')}`, {
          dueAt: at(-(150 - index) * MINUTE),
        }),
      );
    }
    const { service } = engine();
    const notified = async () =>
      new Set(
        (
          await prisma.notification.findMany({
            where: { taskId: { in: taskIds }, type: 'tasks.overdue' },
            select: { taskId: true },
          })
        ).map((n) => n.taskId),
      );

    const first = await schedulerTick(service, BASE_NOW, { overdueLimit: 100 });
    expect(first.overdueCandidates).toBe(100);
    expect(first.overdueNotificationsCreated).toBe(100);
    expect([...(await notified())].sort()).toEqual(taskIds.slice(0, 100).sort());

    // The first 100 already have notifications; they no longer occupy the page.
    const second = await schedulerTick(service, BASE_NOW, { overdueLimit: 100 });
    expect(second.overdueCandidates).toBe(50);
    expect(second.overdueNotificationsCreated).toBe(50);
    expect((await notified()).size).toBe(150);

    const third = await schedulerTick(service, BASE_NOW, { overdueLimit: 100 });
    expect(third.overdueCandidates).toBe(0);
    expect(
      await prisma.notification.count({
        where: { taskId: { in: taskIds }, type: 'tasks.overdue' },
      }),
    ).toBe(150);
    const overdueEvents = await prisma.taskEvent.findMany({
      where: { taskId: { in: taskIds }, action: TaskEventAction.OVERDUE_NOTIFICATION_SENT },
    });
    expect(overdueEvents).toHaveLength(150);
    expect(overdueEvents.every((event) => event.actorUserId === null)).toBe(true);
  }, 60_000);

  it('18. the manual endpoint requires tasks:reminders:manage and tasks:view_all', async () => {
    const reminder = await dueReminder('endpoint gate', at(-MINUTE));
    for (const token of [manageOnlyToken, guestToken]) {
      const denied = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ limit: 100 }),
      });
      expect(denied.status).toBe(403);
    }
    expect((await reminderRow(reminder.id)).status).toBe(TaskReminderStatus.PENDING);
    const unauthenticated = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    });
    expect(unauthenticated.status).toBe(401);
    const allowed = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: authHeaders(managerToken),
      body: JSON.stringify({ limit: 100 }),
    });
    expect(allowed.status).toBe(201);
    expect(
      TaskReminderProcessResponseSchema.parse(await allowed.json()).remindersDelivered,
    ).toBeGreaterThanOrEqual(1);
    expect((await reminderRow(reminder.id)).status).toBe(TaskReminderStatus.SENT);
  });

  it('19. a manual trigger acts as the manager while scheduler ticks act as the system', async () => {
    const manualDelivered = await dueReminder('manual actor delivered', at(-MINUTE));
    const closedTask = await createTask('manual actor closed', { status: TaskStatus.CANCELED });
    const manualCanceled = await createReminder(closedTask, at(-MINUTE));
    const hiddenTask = await createTask('manual actor ineligible');
    const ineligible = await createReminder(hiddenTask, at(-MINUTE), {
      recipientUserId: scopedUserId,
    });
    const response = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: authHeaders(managerToken),
      body: JSON.stringify({ limit: 100 }),
    });
    expect(response.status).toBe(201);
    const delivered = await events(manualDelivered.taskId, TaskEventAction.REMINDER_DELIVERED);
    expect(delivered.map((event) => event.actorUserId)).toEqual([managerUserId]);
    const canceledRow = await reminderRow(manualCanceled.id);
    expect(canceledRow.status).toBe(TaskReminderStatus.CANCELED);
    expect(canceledRow.canceledByUserId).toBe(managerUserId);
    // Lost eligibility is always a system cancellation, even under a manual trigger.
    const ineligibleRow = await reminderRow(ineligible.id);
    expect(ineligibleRow.status).toBe(TaskReminderStatus.CANCELED);
    expect(ineligibleRow.canceledByUserId).toBeNull();
    expect(
      (await events(hiddenTask, TaskEventAction.REMINDER_CANCELED)).map((e) => e.actorUserId),
    ).toEqual([null]);

    const schedulerReminder = await dueReminder('scheduler actor');
    await schedulerTick(engine().service, BASE_NOW);
    expect(
      (await events(schedulerReminder.taskId, TaskEventAction.REMINDER_DELIVERED)).map(
        (event) => event.actorUserId,
      ),
    ).toEqual([null]);
  });
});
