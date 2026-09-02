import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  NotificationDetailResponse,
  NotificationListResponse,
  NotificationListQuery,
  NotificationReadAllRequest,
  NotificationReadAllResponse,
  TaskAssignmentCreateRequest,
  TaskAssignmentRemoveRequest,
  TaskCommentCreateRequest,
  TaskCommentDetailResponse,
  TaskCommentUpdateRequest,
  TaskCreateRequest,
  TaskDetailResponse,
  TaskListQuery,
  TaskListResponse,
  TaskOwnerChangeRequest,
  TaskReminderCreateRequest,
  TaskReminderDetailResponse,
  TaskReminderProcessRequest,
  TaskReminderProcessResponse,
  TaskReminderUpdateRequest,
  TaskStatusChangeRequest,
  TaskUpdateRequest,
} from '@hire-me/contracts';

import { TaskAuditService } from './task-audit.service.js';
import { TASK_PERMISSIONS } from './task-permissions.js';
import { conflict, forbidden, notFound } from './task.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import {
  NotificationStatus,
  Prisma,
  TaskAssignmentStatus,
  TaskCommentStatus,
  TaskEventAction,
  TaskReminderStatus,
  TaskStatus,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type TaskRecord = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type TaskSummaryRecord = Prisma.TaskGetPayload<{ include: typeof taskSummaryInclude }>;
type NotificationRecord = Prisma.NotificationGetPayload<Record<string, never>>;
type NormalizedTaskContext = {
  candidateId: string | null;
  clientId: string | null;
  clientContactId: string | null;
  recruitmentMissionId: string | null;
  missionRecruiterId: string | null;
  missionCandidateId: string | null;
  interviewId: string | null;
  recruitmentOfferId: string | null;
  recruitmentOfferVersionId: string | null;
  missionPlacementId: string | null;
  trainingProgramId: string | null;
  trainingSessionId: string | null;
  trainingEnrollmentId: string | null;
  trainingSessionParticipationId: string | null;
  documentId: string | null;
};

type TaskAccess = {
  view: boolean;
  viewAll: boolean;
  create: boolean;
  update: boolean;
  assign: boolean;
  transition: boolean;
  comment: boolean;
  remindersManage: boolean;
  archive: boolean;
};

const terminalStatuses = new Set<TaskStatus>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELED,
  TaskStatus.ARCHIVED,
]);

const reminderRescheduleSourceStatuses = new Set<TaskReminderStatus>([
  TaskReminderStatus.PENDING,
  TaskReminderStatus.FAILED,
]);

const reminderCancelSourceStatuses = new Set<TaskReminderStatus>([
  TaskReminderStatus.PENDING,
  TaskReminderStatus.FAILED,
]);

const allowedTransitions = new Map<TaskStatus, Set<TaskStatus>>([
  [
    TaskStatus.OPEN,
    new Set([
      TaskStatus.IN_PROGRESS,
      TaskStatus.WAITING,
      TaskStatus.BLOCKED,
      TaskStatus.COMPLETED,
      TaskStatus.CANCELED,
    ]),
  ],
  [
    TaskStatus.IN_PROGRESS,
    new Set([TaskStatus.WAITING, TaskStatus.BLOCKED, TaskStatus.COMPLETED, TaskStatus.CANCELED]),
  ],
  [
    TaskStatus.WAITING,
    new Set([TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELED]),
  ],
  [
    TaskStatus.BLOCKED,
    new Set([TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.WAITING, TaskStatus.CANCELED]),
  ],
  [TaskStatus.COMPLETED, new Set([TaskStatus.OPEN])],
  [TaskStatus.CANCELED, new Set([TaskStatus.OPEN])],
]);

const taskSummaryInclude = {
  owner: true,
  assignments: {
    where: { archivedAt: null },
    include: { user: true },
    orderBy: { assignedAt: 'asc' as const },
  },
} satisfies Prisma.TaskInclude;

const taskInclude = {
  ...taskSummaryInclude,
  comments: {
    where: { archivedAt: null },
    include: { author: true, mentions: true },
    orderBy: { createdAt: 'asc' as const },
  },
  reminders: {
    where: { archivedAt: null },
    include: { recipient: true },
    orderBy: { remindAt: 'asc' as const },
  },
  events: {
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    @Inject(TaskAuditService) private readonly audit: TaskAuditService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listTasks(actorUserId: string, query: TaskListQuery): Promise<TaskListResponse> {
    const access = await this.resolveAccess(actorUserId);
    const where = {
      AND: [this.visibleTaskWhere(actorUserId, access), this.taskFilterWhere(query)],
    };
    const pageSize = query.pageSize;
    const skip = (query.page - 1) * pageSize;
    const orderBy = this.taskOrderBy(query);
    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: taskSummaryInclude,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      tasks: await Promise.all(tasks.map((task) => this.toTaskSummary(task, actorUserId))),
      pageInfo: {
        page: query.page,
        pageSize,
        total,
        hasNextPage: skip + tasks.length < total,
      },
    };
  }

  async getTask(taskId: string, actorUserId: string): Promise<TaskDetailResponse> {
    const task = await this.requireVisibleTask(taskId, actorUserId);
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async createTask(
    input: TaskCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.create,
      'TASKS_CREATE_REQUIRED',
      'Task creation permission is required.',
    );
    const assigneeUserIds = [...new Set(input.assigneeUserIds)];
    if (input.ownerUserId !== actorUserId || assigneeUserIds.length > 0) {
      this.assertAccess(access.assign, 'TASKS_ASSIGN_REQUIRED', 'Assign permission is required.');
    }
    const task = await this.prisma.$transaction(async (tx) => {
      const normalizedContext = await this.normalizeContext(input.context ?? {}, tx);
      await this.assertContextAccessible(normalizedContext, actorUserId, access, tx);
      await this.assertActiveInternalUserInTransaction(
        tx,
        input.ownerUserId,
        'TASK_OWNER_NOT_ACTIVE',
      );
      for (const userId of assigneeUserIds) {
        await this.assertActiveInternalUserInTransaction(tx, userId, 'TASK_ASSIGNEE_NOT_ACTIVE');
      }
      const created = await tx.task.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
          startAt: input.startAt ? new Date(input.startAt) : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          timezone: input.timezone ?? null,
          ownerUserId: input.ownerUserId,
          assigneeUserId: assigneeUserIds[0] ?? null,
          createdByUserId: actorUserId,
          ...normalizedContext,
        },
      });
      const assignments = [];
      for (const userId of assigneeUserIds) {
        assignments.push(
          await tx.taskAssignment.create({
            data: {
              taskId: created.id,
              userId,
              assignedByUserId: actorUserId,
            },
          }),
        );
      }
      await this.createTaskEvent(tx, {
        taskId: created.id,
        actorUserId,
        action: TaskEventAction.CREATED,
        nextStatus: TaskStatus.OPEN,
        safeSummary: 'Task created.',
      });
      for (const assignment of assignments.filter((item) => item.userId !== actorUserId)) {
        await this.createNotification(tx, {
          idempotencyKey: `task-assignment:${assignment.id}`,
          recipientUserId: assignment.userId,
          actorUserId,
          type: 'tasks.assignment.created',
          title: 'Task assigned',
          bodySummary: 'A task was assigned to you.',
          taskId: created.id,
          recruitmentMissionId: normalizedContext.recruitmentMissionId ?? null,
          missionCandidateId: normalizedContext.missionCandidateId ?? null,
        });
      }
      return this.requireTask(tx, created.id);
    });
    await this.audit.record('tasks.created', context, {
      actorUserId,
      entityType: 'Task',
      entityId: task.id,
      metadataSummary: 'Task created with safe operational metadata.',
    });
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async updateTask(
    taskId: string,
    input: TaskUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.update,
      'TASKS_UPDATE_REQUIRED',
      'Task update permission is required.',
    );
    const task = await this.withLockedVisibleTask(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        this.assertTaskWritable(current.status);
        await tx.task.update({
          where: { id: taskId },
          data: {
            title: input.title,
            description: input.description,
            priority: input.priority,
            startAt:
              input.startAt === undefined
                ? undefined
                : input.startAt
                  ? new Date(input.startAt)
                  : null,
            dueAt:
              input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
            timezone: input.timezone,
            blockingReason: input.blockingReason,
            ...(input.context
              ? this.contextUpdateData(
                  await this.normalizeAndAuthorizeContext(input.context, actorUserId, access, tx),
                  input.context,
                )
              : {}),
          },
        });
        if (input.dueAt !== undefined) {
          await this.cancelRemindersAfterDueDate(tx, taskId, actorUserId, input.dueAt);
        }
        await this.createTaskEvent(tx, {
          taskId,
          actorUserId,
          action: TaskEventAction.UPDATED,
          safeSummary: 'Task operational fields updated.',
        });
        return this.requireTask(tx, taskId);
      },
    );
    await this.audit.record('tasks.updated', context, {
      actorUserId,
      entityType: 'Task',
      entityId: task.id,
      metadataSummary: 'Task operational fields updated.',
    });
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async changeOwner(
    taskId: string,
    input: TaskOwnerChangeRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.assign,
      'TASKS_ASSIGN_REQUIRED',
      'Task assignment permission is required.',
    );
    const { task, changed } = await this.withLockedVisibleTaskResult(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        this.assertTaskWritable(current.status);
        await this.assertActiveInternalUserInTransaction(
          tx,
          input.ownerUserId,
          'TASK_OWNER_NOT_ACTIVE',
        );
        if (current.ownerUserId === input.ownerUserId) {
          return { task: await this.requireTask(tx, taskId), changed: false };
        }
        await tx.task.update({
          where: { id: taskId },
          data: { ownerUserId: input.ownerUserId },
        });
        const event = await this.createTaskEvent(tx, {
          taskId,
          actorUserId,
          action: TaskEventAction.OWNER_CHANGED,
          reason: input.reason ?? null,
          safeSummary: 'Task owner changed.',
          previousOwnerUserId: current.ownerUserId,
          nextOwnerUserId: input.ownerUserId,
        });
        if (input.ownerUserId !== actorUserId) {
          await this.createNotification(tx, {
            idempotencyKey: `task-owner-change:${event.id}`,
            recipientUserId: input.ownerUserId,
            actorUserId,
            type: 'tasks.owner.changed',
            title: 'Task ownership changed',
            bodySummary: 'A task was assigned to you as owner.',
            taskId,
            recruitmentMissionId: current.recruitmentMissionId,
            missionCandidateId: current.missionCandidateId,
          });
        }
        return { task: await this.requireTask(tx, taskId), changed: true };
      },
    );
    if (changed) {
      await this.audit.record('tasks.owner_changed', context, {
        actorUserId,
        entityType: 'Task',
        entityId: taskId,
        metadataSummary: 'Task owner changed.',
      });
    }
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async addAssignment(
    taskId: string,
    input: TaskAssignmentCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.assign,
      'TASKS_ASSIGN_REQUIRED',
      'Task assignment permission is required.',
    );
    const task = await this.withLockedVisibleTask(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        this.assertTaskWritable(current.status);
        await this.assertActiveInternalUserInTransaction(
          tx,
          input.userId,
          'TASK_ASSIGNEE_NOT_ACTIVE',
        );
        let assignment: Prisma.TaskAssignmentGetPayload<Record<string, never>>;
        try {
          assignment = await tx.taskAssignment.create({
            data: {
              taskId,
              userId: input.userId,
              assignedByUserId: actorUserId,
              reason: input.reason ?? null,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw conflict('TASK_ASSIGNMENT_ALREADY_ACTIVE', 'This user is already assigned.');
          }
          throw error;
        }
        if (!current.assigneeUserId) {
          await tx.task.update({ where: { id: taskId }, data: { assigneeUserId: input.userId } });
        }
        await this.createTaskEvent(tx, {
          taskId,
          actorUserId,
          action: TaskEventAction.ASSIGNEE_ADDED,
          safeSummary: 'Task assignee added.',
        });
        if (input.userId !== actorUserId) {
          await this.createNotification(tx, {
            idempotencyKey: `task-assignment:${assignment.id}`,
            recipientUserId: input.userId,
            actorUserId,
            type: 'tasks.assignment.created',
            title: 'Task assigned',
            bodySummary: 'A task was assigned to you.',
            taskId,
            recruitmentMissionId: current.recruitmentMissionId,
            missionCandidateId: current.missionCandidateId,
          });
        }
        return this.requireTask(tx, taskId);
      },
    );
    await this.audit.record('tasks.assignment_added', context, {
      actorUserId,
      entityType: 'Task',
      entityId: taskId,
      metadataSummary: 'Task assignment added.',
    });
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async removeAssignment(
    taskId: string,
    assignmentId: string,
    input: TaskAssignmentRemoveRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.assign,
      'TASKS_ASSIGN_REQUIRED',
      'Task assignment permission is required.',
    );
    const task = await this.withLockedVisibleTask(taskId, actorUserId, access, async (tx) => {
      const assignment = await tx.taskAssignment.findFirst({
        where: { id: assignmentId, taskId, archivedAt: null },
      });
      if (!assignment) {
        throw notFound('TASK_ASSIGNMENT_NOT_FOUND', 'Task assignment was not found.');
      }
      if (assignment.status === TaskAssignmentStatus.REMOVED) {
        return this.requireTask(tx, taskId);
      }
      await tx.taskAssignment.update({
        where: { id: assignment.id },
        data: {
          status: TaskAssignmentStatus.REMOVED,
          removedByUserId: actorUserId,
          removedAt: new Date(),
          reason: input.reason,
        },
      });
      await tx.task.updateMany({
        where: { id: taskId, assigneeUserId: assignment.userId },
        data: { assigneeUserId: null },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.ASSIGNEE_REMOVED,
        reason: input.reason,
        safeSummary: 'Task assignee removed.',
      });
      return this.requireTask(tx, taskId);
    });
    await this.audit.record('tasks.assignment_removed', context, {
      actorUserId,
      entityType: 'Task',
      entityId: taskId,
      metadataSummary: 'Task assignment removed.',
    });
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async transitionTask(
    taskId: string,
    input: TaskStatusChangeRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.transition,
      'TASKS_TRANSITION_REQUIRED',
      'Task transition permission is required.',
    );
    const task = await this.withLockedVisibleTask(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        if (current.status === input.status) {
          return this.requireTask(tx, taskId);
        }
        if (input.status === TaskStatus.ARCHIVED) {
          throw conflict('TASK_ARCHIVE_ACTION_REQUIRED', 'Use the dedicated archive action.');
        }
        if (input.status === TaskStatus.COMPLETED) {
          return this.completeLockedTask(
            tx,
            taskId,
            current.status,
            actorUserId,
            input.reason ?? null,
          );
        }
        if (input.status === TaskStatus.CANCELED) {
          return this.cancelLockedTask(
            tx,
            taskId,
            current.status,
            actorUserId,
            input.reason ?? null,
          );
        }
        if (
          terminalStatuses.has(current.status) &&
          current.status !== TaskStatus.COMPLETED &&
          current.status !== TaskStatus.CANCELED
        ) {
          throw conflict('TASK_TERMINAL', 'Archived tasks cannot transition.');
        }
        if (!allowedTransitions.get(current.status)?.has(input.status)) {
          throw conflict('TASK_INVALID_TRANSITION', 'Task transition is not allowed.');
        }
        if (input.status === TaskStatus.IN_PROGRESS) {
          this.assertHasActiveAssignee(current);
        }
        if (input.status === TaskStatus.BLOCKED && !input.reason) {
          throw conflict('TASK_BLOCK_REASON_REQUIRED', 'Blocking a task requires a reason.');
        }
        if (
          (current.status === TaskStatus.COMPLETED || current.status === TaskStatus.CANCELED) &&
          input.status === TaskStatus.OPEN &&
          !input.reason
        ) {
          throw conflict('TASK_REOPEN_REASON_REQUIRED', 'Reopening a task requires a reason.');
        }
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: input.status,
            blockingReason: input.status === TaskStatus.BLOCKED ? input.reason : null,
            reopenedAt:
              current.status === TaskStatus.COMPLETED || current.status === TaskStatus.CANCELED
                ? new Date()
                : undefined,
            reopenedByUserId:
              current.status === TaskStatus.COMPLETED || current.status === TaskStatus.CANCELED
                ? actorUserId
                : undefined,
            reopenReason:
              current.status === TaskStatus.COMPLETED || current.status === TaskStatus.CANCELED
                ? input.reason
                : undefined,
          },
        });
        await this.createTaskEvent(tx, {
          taskId,
          actorUserId,
          action:
            current.status === TaskStatus.COMPLETED || current.status === TaskStatus.CANCELED
              ? TaskEventAction.REOPENED
              : TaskEventAction.STATUS_CHANGED,
          previousStatus: current.status,
          nextStatus: input.status,
          reason: input.reason ?? null,
          safeSummary: 'Task status changed.',
        });
        return this.requireTask(tx, taskId);
      },
    );
    await this.audit.record('tasks.status_changed', context, {
      actorUserId,
      entityType: 'Task',
      entityId: taskId,
      metadataSummary: 'Task status changed.',
    });
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async completeTask(
    taskId: string,
    input: TaskStatusChangeRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.transition,
      'TASKS_TRANSITION_REQUIRED',
      'Task transition permission is required.',
    );
    const { task, changed } = await this.withLockedVisibleTaskResult(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        if (current.status === TaskStatus.COMPLETED) {
          return { task: await this.requireTask(tx, taskId), changed: false };
        }
        return {
          task: await this.completeLockedTask(
            tx,
            taskId,
            current.status,
            actorUserId,
            input.reason ?? null,
          ),
          changed: true,
        };
      },
    );
    if (changed) {
      await this.audit.record('tasks.completed', context, {
        actorUserId,
        entityType: 'Task',
        entityId: taskId,
        metadataSummary: 'Task completed.',
      });
    }
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async cancelTask(
    taskId: string,
    input: TaskStatusChangeRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.transition,
      'TASKS_TRANSITION_REQUIRED',
      'Task transition permission is required.',
    );
    const { task, changed } = await this.withLockedVisibleTaskResult(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        if (current.status === TaskStatus.CANCELED) {
          return { task: await this.requireTask(tx, taskId), changed: false };
        }
        return {
          task: await this.cancelLockedTask(
            tx,
            taskId,
            current.status,
            actorUserId,
            input.reason ?? null,
          ),
          changed: true,
        };
      },
    );
    if (changed) {
      await this.audit.record('tasks.canceled', context, {
        actorUserId,
        entityType: 'Task',
        entityId: taskId,
        metadataSummary: 'Task canceled.',
      });
    }
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async archiveTask(
    taskId: string,
    input: TaskStatusChangeRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.archive,
      'TASKS_ARCHIVE_REQUIRED',
      'Task archive permission is required.',
    );
    if (!input.reason) {
      throw conflict('TASK_ARCHIVE_REASON_REQUIRED', 'Archiving a task requires a reason.');
    }
    const { task, changed } = await this.withLockedVisibleTaskResult(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        if (current.status === TaskStatus.ARCHIVED) {
          return { task: await this.requireTask(tx, taskId), changed: false };
        }
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.ARCHIVED,
            archivedAt: new Date(),
            archivedByUserId: actorUserId,
            archiveReason: input.reason,
          },
        });
        await this.cancelPendingReminders(tx, taskId, actorUserId);
        await this.createTaskEvent(tx, {
          taskId,
          actorUserId,
          action: TaskEventAction.ARCHIVED,
          previousStatus: current.status,
          nextStatus: TaskStatus.ARCHIVED,
          reason: input.reason,
          safeSummary: 'Task archived.',
        });
        return { task: await this.requireTask(tx, taskId), changed: true };
      },
    );
    if (changed) {
      await this.audit.record('tasks.archived', context, {
        actorUserId,
        entityType: 'Task',
        entityId: taskId,
        metadataSummary: 'Task archived.',
      });
    }
    return { task: await this.toTaskDetail(task, actorUserId) };
  }

  async createComment(
    taskId: string,
    input: TaskCommentCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskCommentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.comment,
      'TASKS_COMMENT_REQUIRED',
      'Task comment permission is required.',
    );
    const mentionIds = [...new Set(input.mentionedUserIds)];
    const comment = await this.prisma.$transaction(async (tx) => {
      const { task, access: lockedAccess } = await this.lockVisibleTaskWithFreshAccess(
        tx,
        taskId,
        actorUserId,
      );
      this.assertAccess(
        lockedAccess.comment,
        'TASKS_COMMENT_REQUIRED',
        'Task comment permission is required.',
      );
      this.assertTaskWritable(task.status);
      for (const mentionedUserId of mentionIds) {
        await this.assertActiveInternalUserInTransaction(
          tx,
          mentionedUserId,
          'TASK_MENTION_USER_NOT_ACTIVE',
        );
        const mentionCanSeeTask = await this.canViewTaskInTransaction(tx, taskId, mentionedUserId);
        if (!mentionCanSeeTask) {
          throw forbidden('TASK_MENTION_USER_NO_ACCESS', 'Mentioned user cannot access this task.');
        }
      }
      const created = await tx.taskComment.create({
        data: { taskId, authorUserId: actorUserId, body: input.body },
      });
      for (const mentionedUserId of mentionIds) {
        let notificationId: string | null = null;
        if (mentionedUserId !== actorUserId) {
          const notification = await this.createNotification(tx, {
            idempotencyKey: `task:${taskId}:comment:${created.id}:mention:${mentionedUserId}`,
            recipientUserId: mentionedUserId,
            actorUserId,
            type: 'tasks.comment.mention',
            title: 'Task mention',
            bodySummary: 'You were mentioned in a task comment.',
            taskId,
            recruitmentMissionId: task.recruitmentMissionId,
            missionCandidateId: task.missionCandidateId,
          });
          notificationId = notification.id;
        }
        await tx.taskMention.create({
          data: {
            taskId,
            commentId: created.id,
            mentionedUserId,
            createdByUserId: actorUserId,
            notificationId,
          },
        });
      }
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.COMMENT_CREATED,
        safeSummary: 'Task comment created.',
      });
      return tx.taskComment.findUniqueOrThrow({
        where: { id: created.id },
        include: { author: true, mentions: true },
      });
    });
    await this.audit.record('tasks.comment_created', context, {
      actorUserId,
      entityType: 'TaskComment',
      entityId: comment.id,
      metadataSummary: 'Task comment created.',
    });
    return { comment: this.toTaskComment(comment) };
  }

  async updateComment(
    taskId: string,
    commentId: string,
    input: TaskCommentUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskCommentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.comment,
      'TASKS_COMMENT_REQUIRED',
      'Task comment permission is required.',
    );
    const comment = await this.prisma.$transaction(async (tx) => {
      const { task, access: lockedAccess } = await this.lockVisibleTaskWithFreshAccess(
        tx,
        taskId,
        actorUserId,
      );
      this.assertAccess(
        lockedAccess.comment,
        'TASKS_COMMENT_REQUIRED',
        'Task comment permission is required.',
      );
      this.assertTaskWritable(task.status);
      const existing = await tx.taskComment.findFirst({
        where: { id: commentId, taskId, archivedAt: null },
      });
      if (!existing) {
        throw notFound('TASK_COMMENT_NOT_FOUND', 'Task comment was not found.');
      }
      if (existing.authorUserId !== actorUserId && !lockedAccess.viewAll) {
        throw forbidden('TASK_COMMENT_AUTHOR_REQUIRED', 'Only the author can edit this comment.');
      }
      await tx.taskComment.update({
        where: { id: commentId },
        data: {
          body: input.body,
          status: TaskCommentStatus.EDITED,
          editedAt: new Date(),
          editedByUserId: actorUserId,
        },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.COMMENT_EDITED,
        safeSummary: 'Task comment edited.',
      });
      return tx.taskComment.findUniqueOrThrow({
        where: { id: commentId },
        include: { author: true, mentions: true },
      });
    });
    await this.audit.record('tasks.comment_edited', context, {
      actorUserId,
      entityType: 'TaskComment',
      entityId: commentId,
      metadataSummary: 'Task comment edited.',
    });
    return { comment: this.toTaskComment(comment) };
  }

  async archiveComment(
    taskId: string,
    commentId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskCommentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.comment,
      'TASKS_COMMENT_REQUIRED',
      'Task comment permission is required.',
    );
    const comment = await this.prisma.$transaction(async (tx) => {
      const { task, access: lockedAccess } = await this.lockVisibleTaskWithFreshAccess(
        tx,
        taskId,
        actorUserId,
      );
      this.assertAccess(
        lockedAccess.comment,
        'TASKS_COMMENT_REQUIRED',
        'Task comment permission is required.',
      );
      this.assertTaskWritable(task.status);
      const existing = await tx.taskComment.findFirst({
        where: { id: commentId, taskId },
        include: { author: true, mentions: true },
      });
      if (!existing) {
        throw notFound('TASK_COMMENT_NOT_FOUND', 'Task comment was not found.');
      }
      if (existing.authorUserId !== actorUserId && !lockedAccess.viewAll) {
        throw forbidden(
          'TASK_COMMENT_AUTHOR_REQUIRED',
          'Only the author can archive this comment.',
        );
      }
      if (existing.status === TaskCommentStatus.ARCHIVED) {
        return existing;
      }
      await tx.taskComment.update({
        where: { id: commentId },
        data: {
          status: TaskCommentStatus.ARCHIVED,
          archivedAt: new Date(),
          archivedByUserId: actorUserId,
        },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.COMMENT_ARCHIVED,
        safeSummary: 'Task comment archived.',
      });
      return tx.taskComment.findUniqueOrThrow({
        where: { id: commentId },
        include: { author: true, mentions: true },
      });
    });
    await this.audit.record('tasks.comment_archived', context, {
      actorUserId,
      entityType: 'TaskComment',
      entityId: commentId,
      metadataSummary: 'Task comment archived.',
    });
    return { comment: this.toTaskComment(comment) };
  }

  async createReminder(
    taskId: string,
    input: TaskReminderCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskReminderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.remindersManage,
      'TASKS_REMINDERS_MANAGE_REQUIRED',
      'Task reminder permission is required.',
    );
    const idempotencyKey =
      input.idempotencyKey ?? `task:${taskId}:reminder:${input.recipientUserId}:${input.remindAt}`;
    const { reminder, changed } = await this.prisma.$transaction(async (tx) => {
      const { access: lockedAccess } = await this.lockVisibleTaskWithFreshAccess(
        tx,
        taskId,
        actorUserId,
      );
      this.assertAccess(
        lockedAccess.remindersManage,
        'TASKS_REMINDERS_MANAGE_REQUIRED',
        'Task reminder permission is required.',
      );
      await this.assertActiveInternalUserInTransaction(
        tx,
        input.recipientUserId,
        'TASK_REMINDER_RECIPIENT_NOT_ACTIVE',
      );
      const recipientCanSeeTask = await this.canViewTaskInTransaction(
        tx,
        taskId,
        input.recipientUserId,
      );
      if (!recipientCanSeeTask) {
        throw forbidden(
          'TASK_REMINDER_RECIPIENT_NO_ACCESS',
          'Reminder recipient cannot access this task.',
        );
      }
      const existing = await tx.taskReminder.findUnique({
        where: {
          taskId_recipientUserId_idempotencyKey: {
            taskId,
            recipientUserId: input.recipientUserId,
            idempotencyKey,
          },
        },
        include: { recipient: true },
      });
      if (existing) {
        return { reminder: existing, changed: false };
      }
      const created = await tx.taskReminder.create({
        data: {
          taskId,
          recipientUserId: input.recipientUserId,
          creatorUserId: actorUserId,
          remindAt: new Date(input.remindAt),
          idempotencyKey,
        },
        include: { recipient: true },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.REMINDER_CREATED,
        safeSummary: 'Task reminder created.',
      });
      return { reminder: created, changed: true };
    });
    if (changed) {
      await this.audit.record('tasks.reminder_created', context, {
        actorUserId,
        entityType: 'TaskReminder',
        entityId: reminder.id,
        metadataSummary: 'Task reminder created.',
      });
    }
    return { reminder: this.toTaskReminder(reminder) };
  }

  async updateReminder(
    taskId: string,
    reminderId: string,
    input: TaskReminderUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskReminderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.remindersManage,
      'TASKS_REMINDERS_MANAGE_REQUIRED',
      'Task reminder permission is required.',
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockVisibleTask(tx, taskId, actorUserId, access);
      const reminder = await this.lockTaskReminder(tx, taskId, reminderId);
      if (!reminderRescheduleSourceStatuses.has(reminder.status)) {
        throw conflict(
          'TASK_REMINDER_NOT_RESCHEDULABLE',
          'Only pending or failed reminders can be rescheduled.',
        );
      }
      const updatedReminder = await tx.taskReminder.update({
        where: { id: reminderId },
        data: {
          remindAt: new Date(input.remindAt),
          status: TaskReminderStatus.PENDING,
          canceledAt: null,
          canceledByUserId: null,
          failureReason: null,
        },
        include: { recipient: true },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.REMINDER_UPDATED,
        safeSummary: 'Task reminder rescheduled.',
      });
      return updatedReminder;
    });
    await this.audit.record('tasks.reminder_updated', context, {
      actorUserId,
      entityType: 'TaskReminder',
      entityId: reminderId,
      metadataSummary: 'Task reminder rescheduled.',
    });
    return { reminder: this.toTaskReminder(updated) };
  }

  async cancelReminder(
    taskId: string,
    reminderId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TaskReminderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.remindersManage,
      'TASKS_REMINDERS_MANAGE_REQUIRED',
      'Task reminder permission is required.',
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockVisibleTask(tx, taskId, actorUserId, access);
      const reminder = await this.lockTaskReminder(tx, taskId, reminderId);
      if (reminder.status === TaskReminderStatus.CANCELED) {
        return reminder;
      }
      if (!reminderCancelSourceStatuses.has(reminder.status)) {
        throw conflict(
          'TASK_REMINDER_NOT_CANCELABLE',
          'Only pending or failed reminders can be canceled.',
        );
      }
      const updatedReminder = await tx.taskReminder.update({
        where: { id: reminderId },
        data: {
          status: TaskReminderStatus.CANCELED,
          canceledAt: new Date(),
          canceledByUserId: actorUserId,
        },
        include: { recipient: true },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.REMINDER_CANCELED,
        safeSummary: 'Task reminder canceled.',
      });
      return updatedReminder;
    });
    await this.audit.record('tasks.reminder_canceled', context, {
      actorUserId,
      entityType: 'TaskReminder',
      entityId: reminderId,
      metadataSummary: 'Task reminder canceled.',
    });
    return { reminder: this.toTaskReminder(updated) };
  }

  async processDueReminders(
    input: TaskReminderProcessRequest,
    actorUserId: string,
  ): Promise<TaskReminderProcessResponse> {
    return this.prisma.$transaction(async (tx) => {
      const dueRows = await tx.$queryRaw<{ id: string; taskId: string }[]>`
        SELECT "id"
             , "taskId"
        FROM "TaskReminder"
        WHERE "status" IN ('pending', 'failed')
          AND "remindAt" <= NOW()
          AND "archivedAt" IS NULL
        ORDER BY "remindAt" ASC
        LIMIT ${input.limit}
      `;
      let remindersDelivered = 0;
      const remindersFailed = 0;
      for (const row of dueRows) {
        await this.lockTask(tx, row.taskId);
        const reminder = await this.lockTaskReminder(tx, row.taskId, row.id);
        if (
          !reminderRescheduleSourceStatuses.has(reminder.status) ||
          reminder.remindAt > new Date() ||
          reminder.archivedAt
        ) {
          continue;
        }
        if (terminalStatuses.has(reminder.task.status) || reminder.task.archivedAt) {
          await tx.taskReminder.update({
            where: { id: reminder.id },
            data: {
              status: TaskReminderStatus.CANCELED,
              canceledAt: new Date(),
              canceledByUserId: actorUserId,
            },
          });
          continue;
        }
        const token = randomUUID();
        await tx.taskReminder.update({
          where: { id: reminder.id },
          data: {
            status: TaskReminderStatus.PROCESSING,
            processingToken: token,
            claimedAt: new Date(),
            attemptCount: { increment: 1 },
          },
        });
        await this.createNotification(tx, {
          idempotencyKey: `task-reminder:${reminder.id}`,
          recipientUserId: reminder.recipientUserId,
          actorUserId: reminder.creatorUserId,
          type: 'tasks.reminder.due',
          title: 'Task reminder',
          bodySummary: 'A task reminder is due.',
          taskId: reminder.taskId,
          recruitmentMissionId: reminder.task.recruitmentMissionId,
          missionCandidateId: reminder.task.missionCandidateId,
        });
        await tx.taskReminder.update({
          where: { id: reminder.id },
          data: {
            status: TaskReminderStatus.SENT,
            deliveredAt: new Date(),
            processingToken: null,
            failureReason: null,
          },
        });
        await this.createTaskEvent(tx, {
          taskId: reminder.taskId,
          actorUserId,
          action: TaskEventAction.REMINDER_DELIVERED,
          safeSummary: 'Task reminder delivered.',
        });
        remindersDelivered += 1;
      }

      const overdueNotificationsCreated = await this.processOverdueTasks(tx, actorUserId);
      return { remindersDelivered, remindersFailed, overdueNotificationsCreated };
    });
  }

  async listNotifications(
    actorUserId: string,
    query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    const access = await this.resolveAccess(actorUserId);
    const where = this.visibleNotificationWhere(actorUserId, access, query);
    const pageSize = query.pageSize;
    const skip = (query.page - 1) * pageSize;
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      notifications: await Promise.all(
        notifications.map((notification) => this.toNotificationForActor(notification, actorUserId)),
      ),
      pageInfo: {
        page: query.page,
        pageSize,
        total,
        hasNextPage: skip + notifications.length < total,
      },
    };
  }

  async markVisibleNotificationsRead(
    input: NotificationReadAllRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<NotificationReadAllResponse> {
    void input;
    const access = await this.resolveAccess(actorUserId);
    const where = this.visibleNotificationWhere(actorUserId, access, {
      status: NotificationStatus.UNREAD,
      page: 1,
      pageSize: 100,
    });
    const result = await this.prisma.notification.updateMany({
      where: { ...where, status: NotificationStatus.UNREAD },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    if (result.count > 0) {
      await this.audit.record('notifications.read_all', context, {
        actorUserId,
        entityType: 'Notification',
        entityId: actorUserId,
        metadataSummary: 'Visible notifications marked read.',
      });
    }
    return { updatedCount: result.count };
  }

  async markNotificationRead(
    notificationId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<NotificationDetailResponse> {
    const notification = await this.requireOwnNotification(notificationId, actorUserId);
    const updated =
      notification.status === NotificationStatus.READ
        ? notification
        : await this.prisma.notification.update({
            where: { id: notificationId },
            data: { status: NotificationStatus.READ, readAt: new Date() },
          });
    if (notification.status !== NotificationStatus.READ) {
      await this.audit.record('notifications.read', context, {
        actorUserId,
        entityType: 'Notification',
        entityId: notificationId,
        metadataSummary: 'Notification marked read.',
      });
    }
    return { notification: await this.toNotificationForActor(updated, actorUserId) };
  }

  async archiveNotification(
    notificationId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<NotificationDetailResponse> {
    const notification = await this.requireOwnNotification(notificationId, actorUserId);
    const updated =
      notification.status === NotificationStatus.ARCHIVED
        ? notification
        : await this.prisma.notification.update({
            where: { id: notificationId },
            data: {
              status: NotificationStatus.ARCHIVED,
              archivedAt: new Date(),
              archivedByUserId: actorUserId,
            },
          });
    if (notification.status !== NotificationStatus.ARCHIVED) {
      await this.audit.record('notifications.archived', context, {
        actorUserId,
        entityType: 'Notification',
        entityId: notificationId,
        metadataSummary: 'Notification archived.',
      });
    }
    return { notification: await this.toNotificationForActor(updated, actorUserId) };
  }

  private async completeLockedTask(
    tx: PrismaTransaction,
    taskId: string,
    previousStatus: TaskStatus,
    actorUserId: string,
    note: string | null,
  ): Promise<TaskRecord> {
    if (!allowedTransitions.get(previousStatus)?.has(TaskStatus.COMPLETED)) {
      throw conflict(
        'TASK_INVALID_TRANSITION',
        'Task cannot be completed from its current status.',
      );
    }
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        completedByUserId: actorUserId,
        completionNote: note,
      },
    });
    await this.cancelPendingReminders(tx, taskId, actorUserId);
    await this.createTaskEvent(tx, {
      taskId,
      actorUserId,
      action: TaskEventAction.COMPLETED,
      previousStatus,
      nextStatus: TaskStatus.COMPLETED,
      reason: note,
      safeSummary: 'Task completed.',
    });
    return this.requireTask(tx, taskId);
  }

  private async cancelLockedTask(
    tx: PrismaTransaction,
    taskId: string,
    previousStatus: TaskStatus,
    actorUserId: string,
    reason: string | null,
  ): Promise<TaskRecord> {
    if (!reason) {
      throw conflict('TASK_CANCEL_REASON_REQUIRED', 'Canceling a task requires a reason.');
    }
    if (!allowedTransitions.get(previousStatus)?.has(TaskStatus.CANCELED)) {
      throw conflict('TASK_INVALID_TRANSITION', 'Task cannot be canceled from its current status.');
    }
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.CANCELED,
        canceledAt: new Date(),
        canceledByUserId: actorUserId,
        cancellationReason: reason,
      },
    });
    await this.cancelPendingReminders(tx, taskId, actorUserId);
    await this.createTaskEvent(tx, {
      taskId,
      actorUserId,
      action: TaskEventAction.CANCELED,
      previousStatus,
      nextStatus: TaskStatus.CANCELED,
      reason,
      safeSummary: 'Task canceled.',
    });
    return this.requireTask(tx, taskId);
  }

  private async cancelPendingReminders(
    tx: PrismaTransaction,
    taskId: string,
    actorUserId: string,
  ): Promise<void> {
    await tx.taskReminder.updateMany({
      where: {
        taskId,
        status: { in: [TaskReminderStatus.PENDING, TaskReminderStatus.FAILED] },
        archivedAt: null,
      },
      data: {
        status: TaskReminderStatus.CANCELED,
        canceledAt: new Date(),
        canceledByUserId: actorUserId,
      },
    });
  }

  private async cancelRemindersAfterDueDate(
    tx: PrismaTransaction,
    taskId: string,
    actorUserId: string,
    dueAt: string | null,
  ): Promise<void> {
    await tx.taskReminder.updateMany({
      where: {
        taskId,
        status: { in: [TaskReminderStatus.PENDING, TaskReminderStatus.FAILED] },
        archivedAt: null,
        ...(dueAt ? { remindAt: { gt: new Date(dueAt) } } : {}),
      },
      data: {
        status: TaskReminderStatus.CANCELED,
        canceledAt: new Date(),
        canceledByUserId: actorUserId,
      },
    });
  }

  private async processOverdueTasks(tx: PrismaTransaction, actorUserId: string): Promise<number> {
    const tasks = await tx.task.findMany({
      where: {
        dueAt: { lt: new Date() },
        status: {
          in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.WAITING, TaskStatus.BLOCKED],
        },
        archivedAt: null,
      },
      include: {
        assignments: { where: { status: TaskAssignmentStatus.ACTIVE, archivedAt: null } },
      },
      take: 100,
    });
    let created = 0;
    for (const task of tasks) {
      const recipientIds = [
        ...new Set(
          [task.ownerUserId, ...task.assignments.map((assignment) => assignment.userId)].filter(
            Boolean,
          ),
        ),
      ] as string[];
      let taskNotificationsCreated = 0;
      for (const recipientUserId of recipientIds) {
        const idempotencyKey = `task-overdue:${task.id}:${recipientUserId}`;
        const existed = await tx.notification.count({ where: { idempotencyKey } });
        await this.createNotification(tx, {
          idempotencyKey,
          recipientUserId,
          actorUserId,
          type: 'tasks.overdue',
          title: 'Task overdue',
          bodySummary: 'A task is overdue.',
          taskId: task.id,
          recruitmentMissionId: task.recruitmentMissionId,
          missionCandidateId: task.missionCandidateId,
        });
        if (existed === 0) {
          created += 1;
          taskNotificationsCreated += 1;
        }
      }
      if (taskNotificationsCreated > 0) {
        await this.createTaskEvent(tx, {
          taskId: task.id,
          actorUserId,
          action: TaskEventAction.OVERDUE_NOTIFICATION_SENT,
          safeSummary: 'Task overdue notification processed.',
        });
      }
    }
    return created;
  }

  private async normalizeAndAuthorizeContext(
    context: Partial<NormalizedTaskContext>,
    actorUserId: string,
    access: TaskAccess,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<NormalizedTaskContext> {
    const normalized = await this.normalizeContext(context, transaction);
    await this.assertContextAccessible(normalized, actorUserId, access, transaction);
    return normalized;
  }

  private contextUpdateData(
    context: NormalizedTaskContext,
    requestedContext: Partial<NormalizedTaskContext>,
  ): Prisma.TaskUpdateInput {
    const relationUpdate = <T extends keyof NormalizedTaskContext>(field: T, id: string | null) => {
      if (id) {
        return { connect: { id } };
      }
      return Object.hasOwn(requestedContext, field) ? { disconnect: true } : undefined;
    };
    return {
      candidate: relationUpdate('candidateId', context.candidateId),
      client: relationUpdate('clientId', context.clientId),
      clientContact: relationUpdate('clientContactId', context.clientContactId),
      recruitmentMission: relationUpdate('recruitmentMissionId', context.recruitmentMissionId),
      missionRecruiter: relationUpdate('missionRecruiterId', context.missionRecruiterId),
      missionCandidate: relationUpdate('missionCandidateId', context.missionCandidateId),
      interview: relationUpdate('interviewId', context.interviewId),
      recruitmentOffer: relationUpdate('recruitmentOfferId', context.recruitmentOfferId),
      recruitmentOfferVersion: relationUpdate(
        'recruitmentOfferVersionId',
        context.recruitmentOfferVersionId,
      ),
      missionPlacement: relationUpdate('missionPlacementId', context.missionPlacementId),
      document: relationUpdate('documentId', context.documentId),
    };
  }

  private async normalizeContext(
    context: Partial<{
      candidateId: string | null;
      clientId: string | null;
      clientContactId: string | null;
      recruitmentMissionId: string | null;
      missionRecruiterId: string | null;
      missionCandidateId: string | null;
      interviewId: string | null;
      recruitmentOfferId: string | null;
      recruitmentOfferVersionId: string | null;
      missionPlacementId: string | null;
      trainingProgramId: string | null;
      trainingSessionId: string | null;
      trainingEnrollmentId: string | null;
      trainingSessionParticipationId: string | null;
      documentId: string | null;
    }>,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ) {
    const normalized = {
      candidateId: context.candidateId ?? null,
      clientId: context.clientId ?? null,
      clientContactId: context.clientContactId ?? null,
      recruitmentMissionId: context.recruitmentMissionId ?? null,
      missionRecruiterId: context.missionRecruiterId ?? null,
      missionCandidateId: context.missionCandidateId ?? null,
      interviewId: context.interviewId ?? null,
      recruitmentOfferId: context.recruitmentOfferId ?? null,
      recruitmentOfferVersionId: context.recruitmentOfferVersionId ?? null,
      missionPlacementId: context.missionPlacementId ?? null,
      trainingProgramId: context.trainingProgramId ?? null,
      trainingSessionId: context.trainingSessionId ?? null,
      trainingEnrollmentId: context.trainingEnrollmentId ?? null,
      trainingSessionParticipationId: context.trainingSessionParticipationId ?? null,
      documentId: context.documentId ?? null,
    };

    if (normalized.clientId) {
      const client = await transaction.client.findUnique({ where: { id: normalized.clientId } });
      if (!client || client.archivedAt) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked client was not found.');
      }
    }

    if (normalized.candidateId) {
      const candidate = await transaction.candidate.findUnique({
        where: { id: normalized.candidateId },
      });
      if (!candidate || candidate.archivedAt) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked candidate was not found.');
      }
    }

    if (normalized.clientContactId) {
      const contact = await transaction.clientContact.findFirst({
        where: { id: normalized.clientContactId },
      });
      if (!contact || contact.archivedAt) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked client contact was not found.');
      }
      normalized.clientId ??= contact.clientId;
      if (normalized.clientId !== contact.clientId) {
        throw conflict(
          'TASK_CONTEXT_CLIENT_CONTACT_MISMATCH',
          'Client contact does not belong to the client.',
        );
      }
    }

    if (normalized.missionCandidateId) {
      const process = await transaction.missionCandidate.findUnique({
        where: { id: normalized.missionCandidateId },
      });
      if (!process) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked mission candidate was not found.');
      }
      normalized.recruitmentMissionId ??= process.missionId;
      normalized.candidateId ??= process.candidateId;
      if (normalized.recruitmentMissionId !== process.missionId) {
        throw conflict(
          'TASK_CONTEXT_MISSION_MISMATCH',
          'Task context records do not belong together.',
        );
      }
      if (normalized.candidateId !== process.candidateId) {
        throw conflict(
          'TASK_CONTEXT_CANDIDATE_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.interviewId) {
      const interview = await transaction.interview.findUnique({
        where: { id: normalized.interviewId },
        include: { missionCandidate: true },
      });
      if (!interview) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked interview was not found.');
      }
      normalized.missionCandidateId ??= interview.missionCandidateId;
      normalized.recruitmentMissionId ??= interview.missionCandidate.missionId;
      if (normalized.missionCandidateId !== interview.missionCandidateId) {
        throw conflict(
          'TASK_CONTEXT_INTERVIEW_MISMATCH',
          'Task context records do not belong together.',
        );
      }
      if (normalized.recruitmentMissionId !== interview.missionCandidate.missionId) {
        throw conflict(
          'TASK_CONTEXT_MISSION_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.recruitmentMissionId) {
      const mission = await transaction.recruitmentMission.findUnique({
        where: { id: normalized.recruitmentMissionId },
      });
      if (!mission || mission.archivedAt) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked recruitment mission was not found.');
      }
      normalized.clientId ??= mission.clientId;
      if (normalized.clientId !== mission.clientId) {
        throw conflict(
          'TASK_CONTEXT_CLIENT_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.missionRecruiterId) {
      const assignment = await transaction.missionRecruiter.findUnique({
        where: { id: normalized.missionRecruiterId },
      });
      if (!assignment || assignment.archivedAt) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked mission assignment was not found.');
      }
      normalized.recruitmentMissionId ??= assignment.missionId;
      if (normalized.recruitmentMissionId !== assignment.missionId) {
        throw conflict(
          'TASK_CONTEXT_MISSION_ASSIGNMENT_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.recruitmentOfferId) {
      const offer = await transaction.recruitmentOffer.findUnique({
        where: { id: normalized.recruitmentOfferId },
      });
      if (!offer) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked offer was not found.');
      }
      normalized.recruitmentMissionId ??= offer.missionId;
      normalized.missionCandidateId ??= offer.missionCandidateId;
      if (
        normalized.recruitmentMissionId !== offer.missionId ||
        normalized.missionCandidateId !== offer.missionCandidateId
      ) {
        throw conflict(
          'TASK_CONTEXT_OFFER_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.recruitmentOfferVersionId) {
      const version = await transaction.recruitmentOfferVersion.findUnique({
        where: { id: normalized.recruitmentOfferVersionId },
      });
      if (!version) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked offer version was not found.');
      }
      normalized.recruitmentMissionId ??= version.missionId;
      normalized.missionCandidateId ??= version.missionCandidateId;
      normalized.recruitmentOfferId ??= version.offerId;
      if (
        normalized.recruitmentMissionId !== version.missionId ||
        normalized.missionCandidateId !== version.missionCandidateId ||
        normalized.recruitmentOfferId !== version.offerId
      ) {
        throw conflict(
          'TASK_CONTEXT_OFFER_VERSION_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.missionPlacementId) {
      const placement = await transaction.missionPlacement.findUnique({
        where: { id: normalized.missionPlacementId },
      });
      if (!placement) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked placement was not found.');
      }
      normalized.recruitmentMissionId ??= placement.missionId;
      normalized.missionCandidateId ??= placement.missionCandidateId;
      normalized.recruitmentOfferVersionId ??= placement.offerVersionId;
      if (
        normalized.recruitmentMissionId !== placement.missionId ||
        normalized.missionCandidateId !== placement.missionCandidateId ||
        normalized.recruitmentOfferVersionId !== placement.offerVersionId
      ) {
        throw conflict(
          'TASK_CONTEXT_PLACEMENT_MISMATCH',
          'Task context records do not belong together.',
        );
      }
    }

    if (normalized.documentId) {
      const document = await transaction.document.findUnique({
        where: { id: normalized.documentId },
      });
      if (!document || document.archivedAt) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked document was not found.');
      }
    }

    return normalized;
  }

  private async assertContextAccessible(
    context: NormalizedTaskContext,
    actorUserId: string,
    access: TaskAccess,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<void> {
    const permissions = new Set(await this.permissions.getEffectivePermissionCodes(actorUserId));
    const requirePermission = (permission: string, code: string) => {
      if (!access.viewAll && !permissions.has(permission)) {
        throw forbidden(code, 'Linked task context is not accessible to the actor.');
      }
    };

    if (context.clientId) {
      requirePermission('clients:view', 'TASK_CONTEXT_CLIENT_FORBIDDEN');
    }
    if (context.clientContactId) {
      requirePermission('client_contacts:view', 'TASK_CONTEXT_CLIENT_CONTACT_FORBIDDEN');
    }
    if (context.candidateId) {
      requirePermission('candidates:view', 'TASK_CONTEXT_CANDIDATE_FORBIDDEN');
    }
    if (context.recruitmentMissionId) {
      if (!access.viewAll && !permissions.has('missions:view')) {
        const assigned = await this.hasActiveMissionScope(
          context.recruitmentMissionId,
          actorUserId,
        );
        if (!assigned) {
          throw forbidden(
            'TASK_CONTEXT_MISSION_FORBIDDEN',
            'Linked task context is not accessible.',
          );
        }
      }
    }
    if (context.missionRecruiterId) {
      requirePermission('mission_assignments:view', 'TASK_CONTEXT_MISSION_ASSIGNMENT_FORBIDDEN');
    }
    if (context.missionCandidateId) {
      if (!access.viewAll && !permissions.has('mission_candidates:view')) {
        throw forbidden(
          'TASK_CONTEXT_MISSION_CANDIDATE_FORBIDDEN',
          'Linked task context is not accessible.',
        );
      }
    }
    if (context.interviewId) {
      requirePermission('interviews:view', 'TASK_CONTEXT_INTERVIEW_FORBIDDEN');
    }
    if (context.recruitmentOfferId || context.recruitmentOfferVersionId) {
      requirePermission('offers:view', 'TASK_CONTEXT_OFFER_FORBIDDEN');
    }
    if (context.missionPlacementId) {
      requirePermission('placements:view', 'TASK_CONTEXT_PLACEMENT_FORBIDDEN');
    }
    if (context.documentId) {
      if (
        !(await this.documents.canViewDocumentReference(
          context.documentId,
          actorUserId,
          transaction,
        ))
      ) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked document was not found.');
      }
    }
  }

  private async requireVisibleTask(
    taskId: string,
    actorUserId: string,
    access?: TaskAccess,
  ): Promise<TaskRecord> {
    const resolved = access ?? (await this.resolveAccess(actorUserId));
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ...this.visibleTaskWhere(actorUserId, resolved) },
      include: taskInclude,
    });
    if (!task) {
      throw notFound('TASK_NOT_FOUND', 'Task was not found.');
    }
    return task;
  }

  private async requireTask(tx: PrismaTransaction, taskId: string): Promise<TaskRecord> {
    return tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
  }

  private async lockTask(tx: PrismaTransaction, taskId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${taskId}::uuid FOR UPDATE`;
  }

  private async lockVisibleTask(
    tx: PrismaTransaction,
    taskId: string,
    actorUserId: string,
    access: TaskAccess,
  ): Promise<TaskRecord> {
    await this.lockTask(tx, taskId);
    const task = await tx.task.findFirst({
      where: { id: taskId, ...this.visibleTaskWhere(actorUserId, access) },
      include: taskInclude,
    });
    if (!task) {
      throw notFound('TASK_NOT_FOUND', 'Task was not found.');
    }
    return task;
  }

  private async lockVisibleTaskWithFreshAccess(
    tx: PrismaTransaction,
    taskId: string,
    actorUserId: string,
  ): Promise<{ task: TaskRecord; access: TaskAccess }> {
    await this.lockTask(tx, taskId);
    const access = await this.resolveAccessInTransaction(tx, actorUserId);
    const task = await tx.task.findFirst({
      where: { id: taskId, ...this.visibleTaskWhere(actorUserId, access) },
      include: taskInclude,
    });
    if (!task) {
      throw notFound('TASK_NOT_FOUND', 'Task was not found.');
    }
    return { task, access };
  }

  private async lockTaskReminder(
    tx: PrismaTransaction,
    taskId: string,
    reminderId: string,
  ): Promise<Prisma.TaskReminderGetPayload<{ include: { recipient: true; task: true } }>> {
    await tx.$queryRaw`
      SELECT id
      FROM "TaskReminder"
      WHERE id = ${reminderId}::uuid
        AND "taskId" = ${taskId}::uuid
      FOR UPDATE
    `;
    const reminder = await tx.taskReminder.findFirst({
      where: { id: reminderId, taskId },
      include: { recipient: true, task: true },
    });
    if (!reminder) {
      throw notFound('TASK_REMINDER_NOT_FOUND', 'Task reminder was not found.');
    }
    return reminder;
  }

  private async requireOwnNotification(
    notificationId: string,
    actorUserId: string,
  ): Promise<NotificationRecord> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, recipientUserId: actorUserId },
    });
    if (!notification) {
      throw notFound('NOTIFICATION_NOT_FOUND', 'Notification was not found.');
    }
    return notification;
  }

  private async withLockedVisibleTask<T>(
    taskId: string,
    actorUserId: string,
    access: TaskAccess,
    callback: (tx: PrismaTransaction, task: TaskRecord) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockVisibleTask(tx, taskId, actorUserId, access);
      return callback(tx, task);
    });
  }

  private async withLockedVisibleTaskResult<T>(
    taskId: string,
    actorUserId: string,
    access: TaskAccess,
    callback: (tx: PrismaTransaction, task: TaskRecord) => Promise<T>,
  ): Promise<T> {
    return this.withLockedVisibleTask(taskId, actorUserId, access, callback);
  }

  private async canViewTask(taskId: string, actorUserId: string): Promise<boolean> {
    const access = await this.resolveAccess(actorUserId);
    const count = await this.prisma.task.count({
      where: { id: taskId, ...this.visibleTaskWhere(actorUserId, access) },
    });
    return count > 0;
  }

  private async canViewTaskInTransaction(
    tx: PrismaTransaction,
    taskId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const access = await this.resolveAccessInTransaction(tx, actorUserId);
    const count = await tx.task.count({
      where: { id: taskId, ...this.visibleTaskWhere(actorUserId, access) },
    });
    return count > 0;
  }

  private taskFilterWhere(query: TaskListQuery): Prisma.TaskWhereInput {
    const filters: Prisma.TaskWhereInput[] = [];
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.priority) {
      filters.push({ priority: query.priority });
    }
    if (query.ownerUserId) {
      filters.push({ ownerUserId: query.ownerUserId });
    }
    if (query.assigneeUserId) {
      filters.push({
        assignments: {
          some: {
            userId: query.assigneeUserId,
            status: TaskAssignmentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      });
    }
    if (query.dueFrom || query.dueTo) {
      filters.push({
        dueAt: {
          ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
        },
      });
    }
    const now = new Date();
    if (query.overdue) {
      filters.push({
        dueAt: { lt: now },
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.ARCHIVED] },
        archivedAt: null,
      });
    }
    if (query.dueSoon) {
      filters.push({
        dueAt: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.ARCHIVED] },
        archivedAt: null,
      });
    }
    if (query.search) {
      filters.push({
        OR: [
          { title: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }
    for (const field of [
      'candidateId',
      'clientId',
      'clientContactId',
      'recruitmentMissionId',
      'missionRecruiterId',
      'missionCandidateId',
      'interviewId',
      'recruitmentOfferId',
      'recruitmentOfferVersionId',
      'missionPlacementId',
      'documentId',
    ] as const) {
      const value = query[field];
      if (value) {
        filters.push({ [field]: value });
      }
    }
    return filters.length > 0 ? { AND: filters } : {};
  }

  private taskOrderBy(query: TaskListQuery): Prisma.TaskOrderByWithRelationInput[] {
    return [
      { [query.sortBy]: query.sortDirection },
      { id: query.sortDirection },
    ] as Prisma.TaskOrderByWithRelationInput[];
  }

  private visibleNotificationWhere(
    actorUserId: string,
    access: TaskAccess,
    query: NotificationListQuery,
  ): Prisma.NotificationWhereInput {
    return {
      recipientUserId: actorUserId,
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
      OR: [{ taskId: null }, { task: { is: this.visibleTaskWhere(actorUserId, access) } }],
    };
  }

  private visibleTaskWhere(actorUserId: string, access: TaskAccess): Prisma.TaskWhereInput {
    if (access.viewAll) {
      return {};
    }
    if (!access.view) {
      return { id: '00000000-0000-0000-0000-000000000000' };
    }
    return {
      archivedAt: null,
      OR: [
        { ownerUserId: actorUserId },
        { createdByUserId: actorUserId },
        {
          assignments: {
            some: { userId: actorUserId, status: TaskAssignmentStatus.ACTIVE, archivedAt: null },
          },
        },
        {
          recruitmentMission: {
            recruiters: {
              some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
            },
          },
        },
        {
          missionCandidate: {
            mission: {
              recruiters: {
                some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
              },
            },
          },
        },
        {
          interview: {
            missionCandidate: {
              mission: {
                recruiters: {
                  some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
                },
              },
            },
          },
        },
        {
          recruitmentOffer: {
            mission: {
              recruiters: {
                some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
              },
            },
          },
        },
        {
          recruitmentOfferVersion: {
            mission: {
              recruiters: {
                some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
              },
            },
          },
        },
        {
          missionPlacement: {
            mission: {
              recruiters: {
                some: { userId: actorUserId, status: 'ACTIVE', archivedAt: null },
              },
            },
          },
        },
      ],
    };
  }

  private async resolveAccess(userId: string): Promise<TaskAccess> {
    const permissions = new Set(await this.permissions.getEffectivePermissionCodes(userId));
    return this.accessFromPermissions(permissions);
  }

  private async resolveAccessInTransaction(
    tx: PrismaTransaction,
    userId: string,
  ): Promise<TaskAccess> {
    const userRoles = await tx.userRole.findMany({
      where: {
        userId,
        archivedAt: null,
        role: { status: 'ACTIVE' },
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                archivedAt: null,
                permission: { status: 'ACTIVE' },
              },
              include: { permission: true },
            },
          },
        },
      },
    });
    const permissions = new Set(
      userRoles.flatMap((userRole) =>
        userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
      ),
    );
    return this.accessFromPermissions(permissions);
  }

  private accessFromPermissions(permissions: ReadonlySet<string>): TaskAccess {
    return {
      view: permissions.has(TASK_PERMISSIONS.TASKS_VIEW),
      viewAll: permissions.has(TASK_PERMISSIONS.TASKS_VIEW_ALL),
      create: permissions.has(TASK_PERMISSIONS.TASKS_CREATE),
      update: permissions.has(TASK_PERMISSIONS.TASKS_UPDATE),
      assign: permissions.has(TASK_PERMISSIONS.TASKS_ASSIGN),
      transition: permissions.has(TASK_PERMISSIONS.TASKS_TRANSITION),
      comment: permissions.has(TASK_PERMISSIONS.TASKS_COMMENT),
      remindersManage: permissions.has(TASK_PERMISSIONS.TASKS_REMINDERS_MANAGE),
      archive: permissions.has(TASK_PERMISSIONS.TASKS_ARCHIVE),
    };
  }

  private assertAccess(granted: boolean, code: string, message: string): void {
    if (!granted) {
      throw forbidden(code, message);
    }
  }

  private assertTaskWritable(status: TaskStatus): void {
    if (terminalStatuses.has(status)) {
      throw conflict('TASK_NOT_WRITABLE', 'Terminal tasks cannot be mutated.');
    }
  }

  private assertHasActiveAssignee(task: TaskRecord): void {
    if (
      !task.assignments.some(
        (assignment) => assignment.status === TaskAssignmentStatus.ACTIVE && !assignment.archivedAt,
      )
    ) {
      throw conflict(
        'TASK_ACTIVE_ASSIGNEE_REQUIRED',
        'An active task assignment is required before work can start.',
      );
    }
  }

  private async hasActiveMissionScope(missionId: string, actorUserId: string): Promise<boolean> {
    const count = await this.prisma.missionRecruiter.count({
      where: { missionId, userId: actorUserId, status: 'ACTIVE', archivedAt: null },
    });
    return count > 0;
  }

  private async assertActiveInternalUserInTransaction(
    tx: PrismaTransaction,
    userId: string,
    code: string,
  ): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.userType !== UserType.INTERNAL ||
      user.archivedAt
    ) {
      throw conflict(code, 'User must be active, internal, and non-archived.');
    }
  }

  private async createNotification(
    tx: PrismaTransaction,
    input: {
      idempotencyKey: string;
      recipientUserId: string;
      actorUserId?: string | null;
      type: string;
      title: string;
      bodySummary: string;
      taskId?: string | null;
      recruitmentMissionId?: string | null;
      missionCandidateId?: string | null;
    },
  ) {
    return tx.notification.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        idempotencyKey: input.idempotencyKey,
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId ?? null,
        type: input.type,
        title: input.title,
        bodySummary: input.bodySummary,
        taskId: input.taskId ?? null,
        recruitmentMissionId: input.recruitmentMissionId ?? null,
        missionCandidateId: input.missionCandidateId ?? null,
      },
    });
  }

  private async createTaskEvent(
    tx: PrismaTransaction,
    input: {
      taskId: string;
      actorUserId?: string | null;
      action: TaskEventAction;
      previousStatus?: TaskStatus | null;
      nextStatus?: TaskStatus | null;
      reason?: string | null;
      safeSummary?: string | null;
      previousOwnerUserId?: string | null;
      nextOwnerUserId?: string | null;
    },
  ): Promise<Prisma.TaskEventGetPayload<Record<string, never>>> {
    return tx.taskEvent.create({
      data: {
        taskId: input.taskId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        previousStatus: input.previousStatus ?? null,
        nextStatus: input.nextStatus ?? null,
        reason: input.reason ?? null,
        safeSummary: input.safeSummary ?? null,
        previousOwnerUserId: input.previousOwnerUserId ?? null,
        nextOwnerUserId: input.nextOwnerUserId ?? null,
      },
    });
  }

  private async toTaskSummary(task: TaskSummaryRecord, actorUserId: string) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      startAt: task.startAt?.toISOString() ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      timezone: task.timezone,
      ownerUserId: task.ownerUserId,
      ownerDisplayName: task.owner?.displayName ?? null,
      assigneeUserIds: task.assignments
        .filter(
          (assignment) =>
            assignment.status === TaskAssignmentStatus.ACTIVE && !assignment.archivedAt,
        )
        .map((assignment) => assignment.userId),
      context: {
        candidateId: task.candidateId,
        clientId: task.clientId,
        clientContactId: task.clientContactId,
        recruitmentMissionId: task.recruitmentMissionId,
        missionRecruiterId: task.missionRecruiterId,
        missionCandidateId: task.missionCandidateId,
        interviewId: task.interviewId,
        recruitmentOfferId: task.recruitmentOfferId,
        recruitmentOfferVersionId: task.recruitmentOfferVersionId,
        missionPlacementId: task.missionPlacementId,
        trainingProgramId: task.trainingProgramId,
        trainingSessionId: task.trainingSessionId,
        trainingEnrollmentId: task.trainingEnrollmentId,
        trainingSessionParticipationId: task.trainingSessionParticipationId,
        documentId: await this.visibleDocumentIdForActor(task.documentId, actorUserId),
      },
      completedAt: task.completedAt?.toISOString() ?? null,
      canceledAt: task.canceledAt?.toISOString() ?? null,
      archivedAt: task.archivedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private async toTaskDetail(task: TaskRecord, actorUserId: string) {
    return {
      ...(await this.toTaskSummary(task, actorUserId)),
      assignments: task.assignments.map((assignment) => ({
        id: assignment.id,
        taskId: assignment.taskId,
        userId: assignment.userId,
        userDisplayName: assignment.user.displayName,
        status: assignment.status,
        assignedAt: assignment.assignedAt.toISOString(),
        removedAt: assignment.removedAt?.toISOString() ?? null,
        archivedAt: assignment.archivedAt?.toISOString() ?? null,
      })),
      comments: task.comments.map((comment) => this.toTaskComment(comment)),
      reminders: task.reminders.map((reminder) => this.toTaskReminder(reminder)),
      history: task.events.map((event) => ({
        id: event.id,
        taskId: event.taskId,
        actorUserId: event.actorUserId,
        action: event.action,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        reason: event.reason,
        safeSummary: event.safeSummary,
        previousOwnerUserId: event.previousOwnerUserId,
        nextOwnerUserId: event.nextOwnerUserId,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private toTaskComment(
    comment: Prisma.TaskCommentGetPayload<{ include: { author: true; mentions: true } }>,
  ) {
    return {
      id: comment.id,
      taskId: comment.taskId,
      authorUserId: comment.authorUserId,
      authorDisplayName: comment.author.displayName,
      body: comment.body,
      status: comment.status,
      mentionedUserIds: comment.mentions.map((mention) => mention.mentionedUserId),
      editedAt: comment.editedAt?.toISOString() ?? null,
      archivedAt: comment.archivedAt?.toISOString() ?? null,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  private toTaskReminder(
    reminder: Prisma.TaskReminderGetPayload<{ include: { recipient: true } }>,
  ) {
    return {
      id: reminder.id,
      taskId: reminder.taskId,
      recipientUserId: reminder.recipientUserId,
      recipientDisplayName: reminder.recipient.displayName,
      remindAt: reminder.remindAt.toISOString(),
      status: reminder.status,
      deliveredAt: reminder.deliveredAt?.toISOString() ?? null,
      canceledAt: reminder.canceledAt?.toISOString() ?? null,
      failureReason: reminder.failureReason,
      attemptCount: reminder.attemptCount,
      createdAt: reminder.createdAt.toISOString(),
      updatedAt: reminder.updatedAt.toISOString(),
    };
  }

  private async toNotificationForActor(notification: NotificationRecord, actorUserId: string) {
    const taskVisible = notification.taskId
      ? await this.canViewTask(notification.taskId, actorUserId)
      : false;
    const documentVisible =
      taskVisible && notification.documentId
        ? await this.documents.canViewDocumentReference(notification.documentId, actorUserId)
        : false;
    return {
      id: notification.id,
      recipientUserId: notification.recipientUserId,
      actorUserId: notification.actorUserId,
      type: notification.type,
      title: notification.title,
      bodySummary: notification.bodySummary,
      status: notification.status,
      taskId: taskVisible ? notification.taskId : null,
      documentId: documentVisible ? notification.documentId : null,
      interviewId: taskVisible ? notification.interviewId : null,
      recruitmentMissionId: taskVisible ? notification.recruitmentMissionId : null,
      missionCandidateId: taskVisible ? notification.missionCandidateId : null,
      trainingSessionId: notification.trainingSessionId,
      trainingEnrollmentId: notification.trainingEnrollmentId,
      readAt: notification.readAt?.toISOString() ?? null,
      archivedAt: notification.archivedAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  }

  private async visibleDocumentIdForActor(
    documentId: string | null,
    actorUserId: string,
  ): Promise<string | null> {
    if (!documentId) {
      return null;
    }
    return (await this.documents.canViewDocumentReference(documentId, actorUserId))
      ? documentId
      : null;
  }
}
