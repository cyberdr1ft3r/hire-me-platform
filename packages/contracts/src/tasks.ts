import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'COMPLETED',
  'CANCELED',
  'ARCHIVED',
]);

export const TaskPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const TaskAssignmentStatusSchema = z.enum(['ACTIVE', 'REMOVED', 'ARCHIVED']);
export const TaskCommentStatusSchema = z.enum(['ACTIVE', 'EDITED', 'ARCHIVED']);
export const TaskReminderStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SENT',
  'CANCELED',
  'FAILED',
]);
export const NotificationStatusSchema = z.enum(['UNREAD', 'READ', 'ARCHIVED']);

export const TaskContextSchema = z.object({
  candidateId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  clientContactId: z.string().uuid().nullable(),
  recruitmentMissionId: z.string().uuid().nullable(),
  missionRecruiterId: z.string().uuid().nullable(),
  missionCandidateId: z.string().uuid().nullable(),
  interviewId: z.string().uuid().nullable(),
  recruitmentOfferId: z.string().uuid().nullable(),
  recruitmentOfferVersionId: z.string().uuid().nullable(),
  missionPlacementId: z.string().uuid().nullable(),
  trainingProgramId: z.string().uuid().nullable(),
  trainingSessionId: z.string().uuid().nullable(),
  trainingEnrollmentId: z.string().uuid().nullable(),
  trainingSessionParticipationId: z.string().uuid().nullable(),
  documentId: z.string().uuid().nullable(),
});

export const TaskAssignmentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
  userDisplayName: z.string(),
  status: TaskAssignmentStatusSchema,
  assignedAt: z.string().datetime(),
  removedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
});

export const TaskCommentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  authorUserId: z.string().uuid(),
  authorDisplayName: z.string(),
  body: z.string(),
  status: TaskCommentStatusSchema,
  mentionedUserIds: z.array(z.string().uuid()),
  editedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TaskReminderSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  recipientDisplayName: z.string(),
  remindAt: z.string().datetime(),
  status: TaskReminderStatusSchema,
  deliveredAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  failureReason: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TaskEventSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: z.string(),
  previousStatus: TaskStatusSchema.nullable(),
  nextStatus: TaskStatusSchema.nullable(),
  reason: z.string().nullable(),
  safeSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const TaskSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  startAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
  timezone: z.string().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  ownerDisplayName: z.string().nullable(),
  assigneeUserIds: z.array(z.string().uuid()),
  context: TaskContextSchema,
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TaskDetailSchema = TaskSummarySchema.extend({
  assignments: z.array(TaskAssignmentSchema),
  comments: z.array(TaskCommentSchema),
  reminders: z.array(TaskReminderSchema),
  history: z.array(TaskEventSchema),
});

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  type: z.string(),
  title: z.string(),
  bodySummary: z.string().nullable(),
  status: NotificationStatusSchema,
  taskId: z.string().uuid().nullable(),
  documentId: z.string().uuid().nullable(),
  interviewId: z.string().uuid().nullable(),
  recruitmentMissionId: z.string().uuid().nullable(),
  missionCandidateId: z.string().uuid().nullable(),
  trainingSessionId: z.string().uuid().nullable(),
  trainingEnrollmentId: z.string().uuid().nullable(),
  readAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TaskCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  priority: TaskPrioritySchema.default('NORMAL'),
  startAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  ownerUserId: z.string().uuid(),
  assigneeUserIds: z.array(z.string().uuid()).default([]),
  context: TaskContextSchema.partial().optional(),
});

export const TaskUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  priority: TaskPrioritySchema.optional(),
  startAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  blockingReason: z.string().trim().max(1000).nullable().optional(),
});

export const TaskAssignmentCreateRequestSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const TaskAssignmentRemoveRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const TaskStatusChangeRequestSchema = z.object({
  status: TaskStatusSchema,
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const TaskCommentCreateRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  mentionedUserIds: z.array(z.string().uuid()).default([]),
});

export const TaskCommentUpdateRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const TaskReminderCreateRequestSchema = z.object({
  recipientUserId: z.string().uuid(),
  remindAt: z.string().datetime(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
});

export const TaskReminderUpdateRequestSchema = z.object({
  remindAt: z.string().datetime(),
});

export const TaskReminderProcessRequestSchema = z.object({
  limit: z.number().int().positive().max(100).default(25),
});

export const TaskReminderProcessResponseSchema = z.object({
  remindersDelivered: z.number().int().nonnegative(),
  remindersFailed: z.number().int().nonnegative(),
  overdueNotificationsCreated: z.number().int().nonnegative(),
});

export const TaskListResponseSchema = z.object({ tasks: z.array(TaskSummarySchema) });
export const TaskDetailResponseSchema = z.object({ task: TaskDetailSchema });
export const TaskCommentDetailResponseSchema = z.object({ comment: TaskCommentSchema });
export const TaskReminderDetailResponseSchema = z.object({ reminder: TaskReminderSchema });
export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationSchema),
});
export const NotificationDetailResponseSchema = z.object({ notification: NotificationSchema });

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type TaskSummary = z.infer<typeof TaskSummarySchema>;
export type TaskDetail = z.infer<typeof TaskDetailSchema>;
export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>;
export type TaskComment = z.infer<typeof TaskCommentSchema>;
export type TaskReminder = z.infer<typeof TaskReminderSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type TaskCreateRequest = z.infer<typeof TaskCreateRequestSchema>;
export type TaskUpdateRequest = z.infer<typeof TaskUpdateRequestSchema>;
export type TaskAssignmentCreateRequest = z.infer<typeof TaskAssignmentCreateRequestSchema>;
export type TaskAssignmentRemoveRequest = z.infer<typeof TaskAssignmentRemoveRequestSchema>;
export type TaskStatusChangeRequest = z.infer<typeof TaskStatusChangeRequestSchema>;
export type TaskCommentCreateRequest = z.infer<typeof TaskCommentCreateRequestSchema>;
export type TaskCommentUpdateRequest = z.infer<typeof TaskCommentUpdateRequestSchema>;
export type TaskReminderCreateRequest = z.infer<typeof TaskReminderCreateRequestSchema>;
export type TaskReminderUpdateRequest = z.infer<typeof TaskReminderUpdateRequestSchema>;
export type TaskReminderProcessRequest = z.infer<typeof TaskReminderProcessRequestSchema>;
export type TaskReminderProcessResponse = z.infer<typeof TaskReminderProcessResponseSchema>;
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
export type TaskDetailResponse = z.infer<typeof TaskDetailResponseSchema>;
export type TaskCommentDetailResponse = z.infer<typeof TaskCommentDetailResponseSchema>;
export type TaskReminderDetailResponse = z.infer<typeof TaskReminderDetailResponseSchema>;
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
export type NotificationDetailResponse = z.infer<typeof NotificationDetailResponseSchema>;
