import { z } from 'zod';

/**
 * Issue #37 training operations contracts.
 *
 * These schemas are intentionally Prisma-independent. They describe the internal
 * training-operations API surface only: programs, sessions, enrollment, and
 * per-session attendance.
 *
 * Deliberately not represented here:
 * - training pricing, quotations, invoicing, payments, revenue, or profitability
 *   (commercial scope, Issue #38);
 * - certificate or contract file generation (document-generation scope);
 * - learner/client portal identities.
 */

export const TrainingProgramStatusSchema = z.enum([
  'PROGRAM_DRAFT',
  'PROGRAM_ACTIVE',
  'PROGRAM_CLOSED',
  'PROGRAM_ARCHIVED',
]);

export const TrainingSessionStatusSchema = z.enum([
  'SESSION_PLANNED',
  'SESSION_SCHEDULED',
  'SESSION_IN_PROGRESS',
  'SESSION_COMPLETED',
  'SESSION_POSTPONED',
  'SESSION_CANCELED',
  'SESSION_ARCHIVED',
]);

export const TrainingDeliveryModeSchema = z.enum(['ONSITE', 'REMOTE', 'HYBRID']);

export const TrainingEnrollmentStatusSchema = z.enum([
  'REGISTERED',
  'APPROVAL_PENDING',
  'APPROVED',
  'PAYMENT_PENDING',
  'ENROLLED',
  'EVALUATED',
  'INDIVIDUAL_COACHING',
  'CERTIFICATE_ISSUED',
  'SATISFACTION_RECORDED',
  'FOLLOW_UP',
  'CLOSED',
  'REJECTED',
  'CANCELED',
]);

export const TrainingParticipantTypeSchema = z.enum([
  'CANDIDATE',
  'USER',
  'CLIENT_CONTACT',
  'EXTERNAL',
]);

export const TrainingSessionParticipationStatusSchema = z.enum([
  'EXPECTED',
  'ATTENDED',
  'ABSENT',
  'EXCUSED',
  'SESSION_OUTCOME_RECORDED',
  'PARTICIPATION_ARCHIVED',
]);

export const TrainingCertificateStatusSchema = z.enum(['NOT_APPLICABLE', 'PENDING', 'ISSUED']);

export const TrainingSortDirectionSchema = z.enum(['asc', 'desc']);

export const TrainingProgramSortBySchema = z.enum([
  'createdAt',
  'name',
  'reference',
  'plannedStartDate',
]);

export const TrainingSessionSortBySchema = z.enum(['scheduledAt', 'sequence', 'createdAt']);

export const TrainingEnrollmentSortBySchema = z.enum(['createdAt', 'status']);

export const TrainingParticipationSortBySchema = z.enum(['createdAt', 'status']);

export const TrainingPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

/**
 * `clientId` is null when the program has no client context, and also when the
 * acting user is not authorized to read client context. A training identifier
 * must never become a path to unrelated client records.
 */
export const TrainingProgramSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  targetAudience: z.string().nullable(),
  status: TrainingProgramStatusSchema,
  ownerUserId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  plannedStartDate: z.string().datetime().nullable(),
  plannedEndDate: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TrainingSessionSummarySchema = z.object({
  id: z.string().uuid(),
  trainingProgramId: z.string().uuid(),
  title: z.string(),
  sequence: z.number().int().nullable(),
  scheduledAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  deliveryMode: TrainingDeliveryModeSchema,
  trainerUserId: z.string().uuid().nullable(),
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  status: TrainingSessionStatusSchema,
  outcome: z.string().nullable(),
  rescheduleCount: z.number().int().nonnegative(),
  previousScheduledAt: z.string().datetime().nullable(),
  lastRescheduledAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TrainingEnrollmentParticipantSchema = z.object({
  candidateId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  clientContactId: z.string().uuid().nullable(),
  externalTrainingParticipantId: z.string().uuid().nullable(),
});

/**
 * `certificateReady` is the durable completion boundary a later document-generation
 * feature can consume. It is derived server-side and is never a client input.
 * This module records readiness only; it does not render or distribute certificates.
 */
export const TrainingEnrollmentSummarySchema = z.object({
  id: z.string().uuid(),
  trainingProgramId: z.string().uuid(),
  participantType: TrainingParticipantTypeSchema,
  participant: TrainingEnrollmentParticipantSchema,
  status: TrainingEnrollmentStatusSchema,
  enrolledAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(),
  withdrawalReason: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  certificateStatus: TrainingCertificateStatusSchema,
  certificateReady: z.boolean(),
  createdByUserId: z.string().uuid().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * `trainerNotes` is bounded internal training context. It is redacted to null for
 * actors who may read attendance but may not manage participation.
 */
export const TrainingParticipationSummarySchema = z.object({
  id: z.string().uuid(),
  trainingSessionId: z.string().uuid(),
  trainingEnrollmentId: z.string().uuid(),
  status: TrainingSessionParticipationStatusSchema,
  attendanceRecordedAt: z.string().datetime().nullable(),
  recordedByUserId: z.string().uuid().nullable(),
  sessionOutcome: z.string().nullable(),
  completionStatus: z.string().nullable(),
  trainerNotes: z.string().nullable(),
  correctionCount: z.number().int().nonnegative(),
  lastCorrectedAt: z.string().datetime().nullable(),
  lastCorrectionReason: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TrainingProgramListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: TrainingProgramStatusSchema.optional(),
  clientId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  includeArchived: z.coerce.boolean().default(false),
  sortBy: TrainingProgramSortBySchema.default('createdAt'),
  sortDirection: TrainingSortDirectionSchema.default('desc'),
});

export const TrainingProgramCreateRequestSchema = z
  .object({
    reference: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(4000).optional(),
    targetAudience: z.string().trim().min(1).max(500).optional(),
    ownerUserId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    plannedStartDate: z.string().datetime({ offset: true }).optional(),
    plannedEndDate: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (value) =>
      value.plannedStartDate === undefined ||
      value.plannedEndDate === undefined ||
      Date.parse(value.plannedEndDate) > Date.parse(value.plannedStartDate),
    { message: 'Planned end date must be after the planned start date.' },
  );

export const TrainingProgramUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().min(1).max(4000).nullable().optional(),
    targetAudience: z.string().trim().min(1).max(500).nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    plannedStartDate: z.string().datetime({ offset: true }).nullable().optional(),
    plannedEndDate: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable training program field is required.',
  });

export const TrainingProgramStatusUpdateRequestSchema = z.object({
  status: TrainingProgramStatusSchema.exclude(['PROGRAM_ARCHIVED']),
});

export const TrainingSessionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: TrainingSessionStatusSchema.optional(),
  trainerUserId: z.string().uuid().optional(),
  deliveryMode: TrainingDeliveryModeSchema.optional(),
  scheduledFrom: z.string().datetime({ offset: true }).optional(),
  scheduledTo: z.string().datetime({ offset: true }).optional(),
  includeArchived: z.coerce.boolean().default(false),
  sortBy: TrainingSessionSortBySchema.default('scheduledAt'),
  sortDirection: TrainingSortDirectionSchema.default('asc'),
});

export const TrainingSessionCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    sequence: z.number().int().positive().max(10000).optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    scheduledEndAt: z.string().datetime({ offset: true }),
    deliveryMode: TrainingDeliveryModeSchema.optional(),
    trainerUserId: z.string().uuid().optional(),
    location: z.string().trim().min(1).max(240).optional(),
    meetingUrl: z.string().trim().min(1).max(2048).optional(),
  })
  .refine((value) => Date.parse(value.scheduledEndAt) > Date.parse(value.scheduledAt), {
    message: 'Session end must be after session start.',
  });

export const TrainingSessionUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    sequence: z.number().int().positive().max(10000).nullable().optional(),
    deliveryMode: TrainingDeliveryModeSchema.optional(),
    trainerUserId: z.string().uuid().nullable().optional(),
    location: z.string().trim().min(1).max(240).nullable().optional(),
    meetingUrl: z.string().trim().min(1).max(2048).nullable().optional(),
    outcome: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable training session field is required.',
  });

export const TrainingSessionRescheduleRequestSchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }),
    scheduledEndAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => Date.parse(value.scheduledEndAt) > Date.parse(value.scheduledAt), {
    message: 'Session end must be after session start.',
  });

export const TrainingSessionStatusUpdateRequestSchema = z.object({
  status: TrainingSessionStatusSchema.exclude(['SESSION_CANCELED', 'SESSION_ARCHIVED']),
});

export const TrainingSessionCancelRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const TrainingEnrollmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: TrainingEnrollmentStatusSchema.optional(),
  participantType: TrainingParticipantTypeSchema.optional(),
  certificateReadyOnly: z.coerce.boolean().default(false),
  includeArchived: z.coerce.boolean().default(false),
  sortBy: TrainingEnrollmentSortBySchema.default('createdAt'),
  sortDirection: TrainingSortDirectionSchema.default('desc'),
});

/**
 * Participant identity is limited to the participant types already approved in the
 * repository domain model. Exactly one participant identifier must match the
 * declared participant type. No candidate, client, or learner account is created.
 */
export const TrainingEnrollmentCreateRequestSchema = z
  .object({
    participantType: TrainingParticipantTypeSchema,
    candidateId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    clientContactId: z.string().uuid().optional(),
    externalTrainingParticipantId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    const provided = [
      value.candidateId,
      value.userId,
      value.clientContactId,
      value.externalTrainingParticipantId,
    ].filter((identifier) => identifier !== undefined);

    if (provided.length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Exactly one participant identifier is required.',
      });
      return;
    }

    const expected: Record<string, string | undefined> = {
      CANDIDATE: value.candidateId,
      USER: value.userId,
      CLIENT_CONTACT: value.clientContactId,
      EXTERNAL: value.externalTrainingParticipantId,
    };

    if (expected[value.participantType] === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Participant identifier must match the declared participant type.',
      });
    }
  });

export const TrainingEnrollmentStatusUpdateRequestSchema = z.object({
  status: TrainingEnrollmentStatusSchema.exclude(['CANCELED']),
});

export const TrainingEnrollmentWithdrawRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const TrainingParticipationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: TrainingSessionParticipationStatusSchema.optional(),
  includeArchived: z.coerce.boolean().default(false),
  sortBy: TrainingParticipationSortBySchema.default('createdAt'),
  sortDirection: TrainingSortDirectionSchema.default('asc'),
});

export const TrainingParticipationCreateRequestSchema = z.object({
  trainingEnrollmentId: z.string().uuid(),
});

export const TrainingAttendanceUpdateRequestSchema = z.object({
  status: TrainingSessionParticipationStatusSchema.exclude(['PARTICIPATION_ARCHIVED']),
  sessionOutcome: z.string().trim().min(1).max(2000).nullable().optional(),
  completionStatus: z.string().trim().min(1).max(120).nullable().optional(),
  trainerNotes: z.string().trim().min(1).max(2000).nullable().optional(),
});

/**
 * Attendance corrections are explicit and always carry a reason so that history
 * stays auditable. They are a separate action from the first attendance record.
 */
export const TrainingAttendanceCorrectionRequestSchema = z.object({
  status: TrainingSessionParticipationStatusSchema.exclude(['PARTICIPATION_ARCHIVED']),
  correctionReason: z.string().trim().min(1).max(500),
  sessionOutcome: z.string().trim().min(1).max(2000).nullable().optional(),
  completionStatus: z.string().trim().min(1).max(120).nullable().optional(),
  trainerNotes: z.string().trim().min(1).max(2000).nullable().optional(),
});

export const TrainingProgramListResponseSchema = z.object({
  programs: z.array(TrainingProgramSummarySchema),
  pagination: TrainingPaginationSchema,
});

export const TrainingProgramDetailResponseSchema = z.object({
  program: TrainingProgramSummarySchema,
});

export const TrainingSessionListResponseSchema = z.object({
  sessions: z.array(TrainingSessionSummarySchema),
  pagination: TrainingPaginationSchema,
});

export const TrainingSessionDetailResponseSchema = z.object({
  session: TrainingSessionSummarySchema,
});

export const TrainingEnrollmentListResponseSchema = z.object({
  enrollments: z.array(TrainingEnrollmentSummarySchema),
  pagination: TrainingPaginationSchema,
});

export const TrainingEnrollmentDetailResponseSchema = z.object({
  enrollment: TrainingEnrollmentSummarySchema,
});

export const TrainingParticipationListResponseSchema = z.object({
  participations: z.array(TrainingParticipationSummarySchema),
  pagination: TrainingPaginationSchema,
});

export const TrainingParticipationDetailResponseSchema = z.object({
  participation: TrainingParticipationSummarySchema,
});

export type TrainingProgramStatus = z.infer<typeof TrainingProgramStatusSchema>;
export type TrainingSessionStatus = z.infer<typeof TrainingSessionStatusSchema>;
export type TrainingDeliveryMode = z.infer<typeof TrainingDeliveryModeSchema>;
export type TrainingEnrollmentStatus = z.infer<typeof TrainingEnrollmentStatusSchema>;
export type TrainingParticipantType = z.infer<typeof TrainingParticipantTypeSchema>;
export type TrainingSessionParticipationStatus = z.infer<
  typeof TrainingSessionParticipationStatusSchema
>;
export type TrainingCertificateStatus = z.infer<typeof TrainingCertificateStatusSchema>;
export type TrainingProgramSummary = z.infer<typeof TrainingProgramSummarySchema>;
export type TrainingSessionSummary = z.infer<typeof TrainingSessionSummarySchema>;
export type TrainingEnrollmentSummary = z.infer<typeof TrainingEnrollmentSummarySchema>;
export type TrainingParticipationSummary = z.infer<typeof TrainingParticipationSummarySchema>;
export type TrainingProgramListQuery = z.infer<typeof TrainingProgramListQuerySchema>;
export type TrainingProgramCreateRequest = z.infer<typeof TrainingProgramCreateRequestSchema>;
export type TrainingProgramUpdateRequest = z.infer<typeof TrainingProgramUpdateRequestSchema>;
export type TrainingProgramStatusUpdateRequest = z.infer<
  typeof TrainingProgramStatusUpdateRequestSchema
>;
export type TrainingSessionListQuery = z.infer<typeof TrainingSessionListQuerySchema>;
export type TrainingSessionCreateRequest = z.infer<typeof TrainingSessionCreateRequestSchema>;
export type TrainingSessionUpdateRequest = z.infer<typeof TrainingSessionUpdateRequestSchema>;
export type TrainingSessionRescheduleRequest = z.infer<
  typeof TrainingSessionRescheduleRequestSchema
>;
export type TrainingSessionStatusUpdateRequest = z.infer<
  typeof TrainingSessionStatusUpdateRequestSchema
>;
export type TrainingSessionCancelRequest = z.infer<typeof TrainingSessionCancelRequestSchema>;
export type TrainingEnrollmentListQuery = z.infer<typeof TrainingEnrollmentListQuerySchema>;
export type TrainingEnrollmentCreateRequest = z.infer<typeof TrainingEnrollmentCreateRequestSchema>;
export type TrainingEnrollmentStatusUpdateRequest = z.infer<
  typeof TrainingEnrollmentStatusUpdateRequestSchema
>;
export type TrainingEnrollmentWithdrawRequest = z.infer<
  typeof TrainingEnrollmentWithdrawRequestSchema
>;
export type TrainingParticipationListQuery = z.infer<typeof TrainingParticipationListQuerySchema>;
export type TrainingParticipationCreateRequest = z.infer<
  typeof TrainingParticipationCreateRequestSchema
>;
export type TrainingAttendanceUpdateRequest = z.infer<typeof TrainingAttendanceUpdateRequestSchema>;
export type TrainingAttendanceCorrectionRequest = z.infer<
  typeof TrainingAttendanceCorrectionRequestSchema
>;
export type TrainingProgramListResponse = z.infer<typeof TrainingProgramListResponseSchema>;
export type TrainingProgramDetailResponse = z.infer<typeof TrainingProgramDetailResponseSchema>;
export type TrainingSessionListResponse = z.infer<typeof TrainingSessionListResponseSchema>;
export type TrainingSessionDetailResponse = z.infer<typeof TrainingSessionDetailResponseSchema>;
export type TrainingEnrollmentListResponse = z.infer<typeof TrainingEnrollmentListResponseSchema>;
export type TrainingEnrollmentDetailResponse = z.infer<
  typeof TrainingEnrollmentDetailResponseSchema
>;
export type TrainingParticipationListResponse = z.infer<
  typeof TrainingParticipationListResponseSchema
>;
export type TrainingParticipationDetailResponse = z.infer<
  typeof TrainingParticipationDetailResponseSchema
>;
