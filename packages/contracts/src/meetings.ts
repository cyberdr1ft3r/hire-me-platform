import { z } from 'zod';

import { SortDirectionSchema } from './tasks.js';

export const MeetingStatusSchema = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELED']);

export const MeetingParticipantStatusSchema = z.enum([
  'SCHEDULED',
  'ACCEPTED',
  'DECLINED',
  'ATTENDED',
  'MISSED',
  'CANCELLED',
]);

export const MeetingParticipantSchema = z.object({
  id: z.string().uuid(),
  meetingId: z.string().uuid(),
  userId: z.string().uuid(),
  userDisplayName: z.string(),
  status: MeetingParticipantStatusSchema,
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MeetingSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().nullable(),
  timezone: z.string(),
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  organizerUserId: z.string().uuid(),
  organizerDisplayName: z.string(),
  clientId: z.string().uuid().nullable(),
  status: MeetingStatusSchema,
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  participantCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MeetingDetailSchema = MeetingSummarySchema.extend({
  participants: z.array(MeetingParticipantSchema),
});

export const MeetingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: MeetingStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortDirection: SortDirectionSchema.default('asc'),
});

export const MeetingListResponseSchema = z.object({
  meetings: z.array(MeetingSummarySchema),
  pageInfo: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  }),
});

export const MeetingDetailResponseSchema = z.object({
  meeting: MeetingDetailSchema,
});

export const MeetingCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).optional(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().optional(),
  timezone: z.string().trim().min(1).max(100),
  location: z.string().trim().max(500).optional(),
  meetingUrl: z.string().trim().url().max(2000).optional(),
  clientId: z.string().uuid().optional(),
  participantUserIds: z.array(z.string().uuid()).max(50).default([]),
});

export const MeetingScheduleUpdateRequestSchema = z.object({
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().optional(),
  timezone: z.string().trim().min(1).max(100),
  location: z.string().trim().max(500).optional(),
  meetingUrl: z.string().trim().url().max(2000).optional(),
});

export const MeetingCancelRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const MeetingCompleteRequestSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const MeetingParticipantStatusUpdateRequestSchema = z.object({
  status: MeetingParticipantStatusSchema,
});

export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;
export type MeetingParticipantStatus = z.infer<typeof MeetingParticipantStatusSchema>;
export type MeetingParticipant = z.infer<typeof MeetingParticipantSchema>;
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;
export type MeetingDetail = z.infer<typeof MeetingDetailSchema>;
export type MeetingListQuery = z.infer<typeof MeetingListQuerySchema>;
export type MeetingListResponse = z.infer<typeof MeetingListResponseSchema>;
export type MeetingDetailResponse = z.infer<typeof MeetingDetailResponseSchema>;
export type MeetingCreateRequest = z.infer<typeof MeetingCreateRequestSchema>;
export type MeetingScheduleUpdateRequest = z.infer<typeof MeetingScheduleUpdateRequestSchema>;
export type MeetingCancelRequest = z.infer<typeof MeetingCancelRequestSchema>;
export type MeetingCompleteRequest = z.infer<typeof MeetingCompleteRequestSchema>;
export type MeetingParticipantStatusUpdateRequest = z.infer<
  typeof MeetingParticipantStatusUpdateRequestSchema
>;
