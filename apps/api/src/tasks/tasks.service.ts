import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  NotificationDetailResponse,
  NotificationListResponse,
  TaskAssignmentCreateRequest,
  TaskAssignmentRemoveRequest,
  TaskCommentCreateRequest,
  TaskCommentDetailResponse,
  TaskCommentUpdateRequest,
  TaskCreateRequest,
  TaskDetailResponse,
  TaskListResponse,
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

type TaskAccess = {
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
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listTasks(actorUserId: string): Promise<TaskListResponse> {
    const access = await this.resolveAccess(actorUserId);
    const tasks = await this.prisma.task.findMany({
      where: this.visibleTaskWhere(actorUserId, access),
      include: taskSummaryInclude,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return { tasks: tasks.map((task) => this.toTaskSummary(task)) };
  }

  async getTask(taskId: string, actorUserId: string): Promise<TaskDetailResponse> {
    const task = await this.requireVisibleTask(taskId, actorUserId);
    return { task: this.toTaskDetail(task) };
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
    if (input.ownerUserId !== actorUserId) {
      this.assertAccess(access.assign, 'TASKS_ASSIGN_REQUIRED', 'Assign permission is required.');
    }
    const normalizedContext = await this.normalizeContext(input.context ?? {});
    const assigneeUserIds = [...new Set(input.assigneeUserIds)];
    await this.assertActiveInternalUser(input.ownerUserId, 'TASK_OWNER_NOT_ACTIVE');
    for (const userId of assigneeUserIds) {
      await this.assertActiveInternalUser(userId, 'TASK_ASSIGNEE_NOT_ACTIVE');
    }

    const task = await this.prisma.$transaction(async (tx) => {
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
      if (assigneeUserIds.length > 0) {
        await tx.taskAssignment.createMany({
          data: assigneeUserIds.map((userId) => ({
            taskId: created.id,
            userId,
            assignedByUserId: actorUserId,
          })),
          skipDuplicates: true,
        });
      }
      await this.createTaskEvent(tx, {
        taskId: created.id,
        actorUserId,
        action: TaskEventAction.CREATED,
        nextStatus: TaskStatus.OPEN,
        safeSummary: 'Task created.',
      });
      for (const userId of assigneeUserIds.filter((id) => id !== actorUserId)) {
        await this.createNotification(tx, {
          idempotencyKey: `task:${created.id}:assignment:${userId}`,
          recipientUserId: userId,
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
    return { task: this.toTaskDetail(task) };
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
          },
        });
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
    return { task: this.toTaskDetail(task) };
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
    await this.assertActiveInternalUser(input.userId, 'TASK_ASSIGNEE_NOT_ACTIVE');
    const task = await this.withLockedVisibleTask(
      taskId,
      actorUserId,
      access,
      async (tx, current) => {
        this.assertTaskWritable(current.status);
        try {
          await tx.taskAssignment.create({
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
            idempotencyKey: `task:${taskId}:assignment:${input.userId}`,
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
    return { task: this.toTaskDetail(task) };
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
    return { task: this.toTaskDetail(task) };
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
    return { task: this.toTaskDetail(task) };
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
    return { task: this.toTaskDetail(task) };
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
    return { task: this.toTaskDetail(task) };
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
    return { task: this.toTaskDetail(task) };
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
    const task = await this.requireVisibleTask(taskId, actorUserId, access);
    this.assertTaskWritable(task.status);
    const mentionIds = [...new Set(input.mentionedUserIds)];
    for (const mentionedUserId of mentionIds) {
      await this.assertActiveInternalUser(mentionedUserId, 'TASK_MENTION_USER_NOT_ACTIVE');
      const mentionCanSeeTask = await this.canViewTask(taskId, mentionedUserId);
      if (!mentionCanSeeTask) {
        throw forbidden('TASK_MENTION_USER_NO_ACCESS', 'Mentioned user cannot access this task.');
      }
    }
    const comment = await this.prisma.$transaction(async (tx) => {
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
    await this.requireVisibleTask(taskId, actorUserId, access);
    const existing = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId, archivedAt: null },
    });
    if (!existing) {
      throw notFound('TASK_COMMENT_NOT_FOUND', 'Task comment was not found.');
    }
    if (existing.authorUserId !== actorUserId && !access.viewAll) {
      throw forbidden('TASK_COMMENT_AUTHOR_REQUIRED', 'Only the author can edit this comment.');
    }
    const comment = await this.prisma.$transaction(async (tx) => {
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
    await this.requireVisibleTask(taskId, actorUserId, access);
    const existing = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId },
      include: { author: true, mentions: true },
    });
    if (!existing) {
      throw notFound('TASK_COMMENT_NOT_FOUND', 'Task comment was not found.');
    }
    if (existing.authorUserId !== actorUserId && !access.viewAll) {
      throw forbidden('TASK_COMMENT_AUTHOR_REQUIRED', 'Only the author can archive this comment.');
    }
    if (existing.status === TaskCommentStatus.ARCHIVED) {
      return { comment: this.toTaskComment(existing) };
    }
    const comment = await this.prisma.$transaction(async (tx) => {
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
    await this.requireVisibleTask(taskId, actorUserId, access);
    const recipientCanSeeTask = await this.canViewTask(taskId, input.recipientUserId);
    if (!recipientCanSeeTask) {
      throw forbidden(
        'TASK_REMINDER_RECIPIENT_NO_ACCESS',
        'Reminder recipient cannot access this task.',
      );
    }
    const idempotencyKey =
      input.idempotencyKey ?? `task:${taskId}:reminder:${input.recipientUserId}:${input.remindAt}`;
    const reminder = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.taskReminder.upsert({
        where: { idempotencyKey },
        update: {
          remindAt: new Date(input.remindAt),
          status: TaskReminderStatus.PENDING,
          canceledAt: null,
          canceledByUserId: null,
          failureReason: null,
        },
        create: {
          taskId,
          recipientUserId: input.recipientUserId,
          creatorUserId: actorUserId,
          remindAt: new Date(input.remindAt),
          idempotencyKey,
        },
      });
      await this.createTaskEvent(tx, {
        taskId,
        actorUserId,
        action: TaskEventAction.REMINDER_CREATED,
        safeSummary: 'Task reminder created.',
      });
      return this.requireReminder(tx, upserted.id);
    });
    await this.audit.record('tasks.reminder_created', context, {
      actorUserId,
      entityType: 'TaskReminder',
      entityId: reminder.id,
      metadataSummary: 'Task reminder created.',
    });
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
    await this.requireVisibleTask(taskId, actorUserId, access);
    const reminder = await this.prisma.taskReminder.findFirst({
      where: { id: reminderId, taskId },
    });
    if (!reminder) {
      throw notFound('TASK_REMINDER_NOT_FOUND', 'Task reminder was not found.');
    }
    if (reminder.status === TaskReminderStatus.SENT) {
      throw conflict('TASK_REMINDER_ALREADY_SENT', 'Sent reminders cannot be rescheduled.');
    }
    const updated = await this.prisma.taskReminder.update({
      where: { id: reminderId },
      data: { remindAt: new Date(input.remindAt), status: TaskReminderStatus.PENDING },
      include: { recipient: true },
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
    await this.requireVisibleTask(taskId, actorUserId, access);
    const reminder = await this.prisma.taskReminder.findFirst({
      where: { id: reminderId, taskId },
      include: { recipient: true },
    });
    if (!reminder) {
      throw notFound('TASK_REMINDER_NOT_FOUND', 'Task reminder was not found.');
    }
    if (reminder.status === TaskReminderStatus.CANCELED) {
      return { reminder: this.toTaskReminder(reminder) };
    }
    const updated = await this.prisma.taskReminder.update({
      where: { id: reminderId },
      data: {
        status: TaskReminderStatus.CANCELED,
        canceledAt: new Date(),
        canceledByUserId: actorUserId,
      },
      include: { recipient: true },
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
      const dueRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "TaskReminder"
        WHERE "status" IN ('pending', 'failed')
          AND "remindAt" <= NOW()
          AND "archivedAt" IS NULL
        ORDER BY "remindAt" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `;
      let remindersDelivered = 0;
      const remindersFailed = 0;
      for (const row of dueRows) {
        const reminder = await tx.taskReminder.findUniqueOrThrow({
          where: { id: row.id },
          include: { task: true },
        });
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

  async listNotifications(actorUserId: string): Promise<NotificationListResponse> {
    const notifications = await this.prisma.notification.findMany({
      where: { recipientUserId: actorUserId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      notifications: notifications.map((notification) => this.toNotification(notification)),
    };
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
    return { notification: this.toNotification(updated) };
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
    return { notification: this.toNotification(updated) };
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
      for (const recipientUserId of recipientIds) {
        const notification = await this.createNotification(tx, {
          idempotencyKey: `task-overdue:${task.id}:${recipientUserId}`,
          recipientUserId,
          actorUserId,
          type: 'tasks.overdue',
          title: 'Task overdue',
          bodySummary: 'A task is overdue.',
          taskId: task.id,
          recruitmentMissionId: task.recruitmentMissionId,
          missionCandidateId: task.missionCandidateId,
        });
        if (notification.createdAt.getTime() === notification.updatedAt.getTime()) {
          created += 1;
        }
      }
      if (recipientIds.length > 0) {
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

    if (normalized.clientContactId && normalized.clientId) {
      const contact = await this.prisma.clientContact.findFirst({
        where: { id: normalized.clientContactId, clientId: normalized.clientId },
      });
      if (!contact) {
        throw conflict(
          'TASK_CONTEXT_CLIENT_CONTACT_MISMATCH',
          'Client contact does not belong to the client.',
        );
      }
    }

    if (normalized.missionCandidateId) {
      const process = await this.prisma.missionCandidate.findUnique({
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
    }

    if (normalized.interviewId) {
      const interview = await this.prisma.interview.findUnique({
        where: { id: normalized.interviewId },
        include: { missionCandidate: true },
      });
      if (!interview) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked interview was not found.');
      }
      normalized.missionCandidateId ??= interview.missionCandidateId;
      normalized.recruitmentMissionId ??= interview.missionCandidate.missionId;
    }

    if (normalized.recruitmentOfferId) {
      const offer = await this.prisma.recruitmentOffer.findUnique({
        where: { id: normalized.recruitmentOfferId },
      });
      if (!offer) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked offer was not found.');
      }
      normalized.recruitmentMissionId ??= offer.missionId;
      normalized.missionCandidateId ??= offer.missionCandidateId;
    }

    if (normalized.recruitmentOfferVersionId) {
      const version = await this.prisma.recruitmentOfferVersion.findUnique({
        where: { id: normalized.recruitmentOfferVersionId },
      });
      if (!version) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked offer version was not found.');
      }
      normalized.recruitmentMissionId ??= version.missionId;
      normalized.missionCandidateId ??= version.missionCandidateId;
      normalized.recruitmentOfferId ??= version.offerId;
    }

    if (normalized.missionPlacementId) {
      const placement = await this.prisma.missionPlacement.findUnique({
        where: { id: normalized.missionPlacementId },
      });
      if (!placement) {
        throw notFound('TASK_CONTEXT_NOT_FOUND', 'Linked placement was not found.');
      }
      normalized.recruitmentMissionId ??= placement.missionId;
      normalized.missionCandidateId ??= placement.missionCandidateId;
      normalized.recruitmentOfferVersionId ??= placement.offerVersionId;
    }

    return normalized;
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

  private async requireReminder(tx: PrismaTransaction, reminderId: string) {
    return tx.taskReminder.findUniqueOrThrow({
      where: { id: reminderId },
      include: { recipient: true },
    });
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
      await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${taskId}::uuid FOR UPDATE`;
      const task = await tx.task.findFirst({
        where: { id: taskId, ...this.visibleTaskWhere(actorUserId, access) },
        include: taskInclude,
      });
      if (!task) {
        throw notFound('TASK_NOT_FOUND', 'Task was not found.');
      }
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

  private visibleTaskWhere(actorUserId: string, access: TaskAccess): Prisma.TaskWhereInput {
    if (access.viewAll) {
      return {};
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
    return {
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

  private async assertActiveInternalUser(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
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
    },
  ): Promise<void> {
    await tx.taskEvent.create({
      data: {
        taskId: input.taskId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        previousStatus: input.previousStatus ?? null,
        nextStatus: input.nextStatus ?? null,
        reason: input.reason ?? null,
        safeSummary: input.safeSummary ?? null,
      },
    });
  }

  private toTaskSummary(task: TaskSummaryRecord) {
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
        documentId: task.documentId,
      },
      completedAt: task.completedAt?.toISOString() ?? null,
      canceledAt: task.canceledAt?.toISOString() ?? null,
      archivedAt: task.archivedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toTaskDetail(task: TaskRecord) {
    return {
      ...this.toTaskSummary(task),
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

  private toNotification(notification: NotificationRecord) {
    return {
      id: notification.id,
      recipientUserId: notification.recipientUserId,
      actorUserId: notification.actorUserId,
      type: notification.type,
      title: notification.title,
      bodySummary: notification.bodySummary,
      status: notification.status,
      taskId: notification.taskId,
      documentId: notification.documentId,
      interviewId: notification.interviewId,
      recruitmentMissionId: notification.recruitmentMissionId,
      missionCandidateId: notification.missionCandidateId,
      trainingSessionId: notification.trainingSessionId,
      trainingEnrollmentId: notification.trainingEnrollmentId,
      readAt: notification.readAt?.toISOString() ?? null,
      archivedAt: notification.archivedAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  }
}
