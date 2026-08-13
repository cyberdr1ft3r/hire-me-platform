import { z } from 'zod';

import { CandidateSummarySchema } from './candidates.js';

export const MissionLifecycleStateSchema = z.enum([
  'DRAFT',
  'INTERNAL_VALIDATION',
  'ACTIVE',
  'JOB_DESCRIPTION_APPROVED',
  'CANDIDATE_SOURCING',
  'HR_PRESELECTION',
  'HR_INTERVIEWS',
  'TECHNICAL_TESTS',
  'CANDIDATE_PRESENTATION',
  'CLIENT_INTERVIEWS',
  'FINAL_SELECTION',
  'OFFER_SENT',
  'CANDIDATE_INTEGRATED',
  'PROBATION_MONITORING',
  'CLOSED_WITH_RECRUITMENT',
  'CLOSED_WITHOUT_RECRUITMENT',
  'WAITING_FOR_CLIENT_INFORMATION',
  'PAUSED',
  'CANCELED',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
  'ARCHIVED',
]);

export const MissionClosureReasonSchema = z.enum([
  'CLIENT_CLOSED_OR_CANCELED',
  'CLOSED_WITHOUT_RECRUITMENT',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
  'POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED',
]);

export const MissionPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const MissionAssignmentRoleSchema = z.enum([
  'LEAD_RECRUITER',
  'RECRUITER',
  'SOURCER',
  'CONTRIBUTOR',
]);
export const MissionAssignmentStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const MissionCandidateStateSchema = z.enum([
  'NEW',
  'CV_TO_REVIEW',
  'HR_PRESELECTION',
  'HR_INTERVIEW_SCHEDULED',
  'HR_INTERVIEW_COMPLETED',
  'TECHNICAL_TEST',
  'INTERNAL_VALIDATION',
  'PRESENTED_TO_CLIENT',
  'CLIENT_INTERVIEW_1',
  'CLIENT_INTERVIEW_2',
  'CLIENT_OFFER',
  'ACCEPTED',
  'INTEGRATED',
  'PROBATION_COMPLETED',
  'PROCESS_COMPLETED',
  'WAITING',
  'POSTPONED',
  'CANDIDATE_REJECTED',
  'CLIENT_REJECTED',
  'WITHDRAWN',
  'TALENT_POOL',
]);
export const MissionCandidateEventActionSchema = z.enum([
  'CREATED',
  'TRANSITIONED',
  'OPTIONAL_STAGE_SKIPPED',
  'RESPONSIBLE_RECRUITER_ASSIGNED',
  'RESPONSIBLE_RECRUITER_TRANSFERRED',
  'PRESENTED_TO_CLIENT',
  'INTEGRATION_CONFIRMED',
  'OUTCOME_RECORDED',
]);
export const OfferStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'NEGOTIATING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'WITHDRAWN',
  'ARCHIVED',
]);
export const OfferEventActionSchema = z.enum([
  'CREATED',
  'REVISED',
  'MARKED_SENT',
  'RESPONSE_RECORDED',
  'WITHDRAWN',
  'EXPIRED',
  'ARCHIVED',
]);
export const PlacementStatusSchema = z.enum(['CONFIRMED', 'CORRECTED']);
export const PlacementEventActionSchema = z.enum([
  'CONFIRMED',
  'CORRECTED',
  'COMMERCIAL_ELIGIBILITY_CREATED',
  'COMMERCIAL_ELIGIBILITY_REMOVED',
]);
export const PlacementCorrectionReasonSchema = z.enum([
  'PROBATION_FAILED',
  'ADMINISTRATIVE_ERROR',
  'CANCELED_INTEGRATION',
  'OTHER',
]);

export const MissionCommercialFieldsSchema = z.object({
  salaryMinCents: z.number().int().nonnegative().nullable(),
  salaryMaxCents: z.number().int().nonnegative().nullable(),
  salaryCurrency: z.string().nullable(),
  commercialSummary: z.string().nullable(),
});

export const MissionSummarySchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  requirements: z.string().nullable(),
  state: MissionLifecycleStateSchema,
  priority: MissionPrioritySchema,
  numberOfPositions: z.number().int().positive(),
  filledPlacementCount: z.number().int().nonnegative(),
  location: z.string().nullable(),
  workArrangement: z.string().nullable(),
  engagementType: z.string().nullable(),
  targetStartDate: z.string().datetime().nullable(),
  applicationDeadline: z.string().datetime().nullable(),
  commercial: MissionCommercialFieldsSchema.nullable(),
  closureReason: MissionClosureReasonSchema.nullable(),
  closedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MissionAssignmentSummarySchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  userId: z.string().uuid(),
  userDisplayName: z.string(),
  role: MissionAssignmentRoleSchema,
  status: MissionAssignmentStatusSchema,
  isLead: z.boolean(),
  assignedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MissionCandidateEventSchema = z.object({
  id: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: MissionCandidateEventActionSchema,
  previousState: MissionCandidateStateSchema.nullable(),
  nextState: MissionCandidateStateSchema.nullable(),
  previousRecruiterId: z.string().uuid().nullable(),
  nextRecruiterId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  safeComment: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const MissionCandidateSummarySchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  candidate: CandidateSummarySchema,
  responsibleRecruiterUserId: z.string().uuid(),
  responsibleRecruiterDisplayName: z.string(),
  state: MissionCandidateStateSchema,
  rank: z.number().int().nullable(),
  source: z.string().nullable(),
  sourceContext: z.string().nullable(),
  priority: MissionPrioritySchema,
  internalNotes: z.string().nullable(),
  outcomeReason: z.string().nullable(),
  clientVisible: z.boolean(),
  presentedAt: z.string().datetime().nullable(),
  placementConfirmedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MissionCandidateDetailSchema = MissionCandidateSummarySchema.extend({
  history: z.array(MissionCandidateEventSchema),
});

export const OfferVersionSchema = z.object({
  id: z.string().uuid(),
  offerId: z.string().uuid(),
  missionId: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: OfferStatusSchema,
  isCurrent: z.boolean(),
  offeredSalaryAmountCents: z.number().int().nonnegative().nullable(),
  offeredSalaryCurrency: z.string().nullable(),
  contractType: z.string().nullable(),
  proposedStartDate: z.string().datetime().nullable(),
  probationPeriod: z.string().nullable(),
  bonuses: z.string().nullable(),
  benefits: z.string().nullable(),
  allowances: z.string().nullable(),
  compensationNotes: z.string().nullable(),
  clientFacingRemarks: z.string().nullable(),
  internalRecruiterRemarks: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  responseRecordedAt: z.string().datetime().nullable(),
  responseReason: z.string().nullable(),
  withdrawnAt: z.string().datetime().nullable(),
  withdrawalReason: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  expiredAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OfferEventSchema = z.object({
  id: z.string().uuid(),
  offerId: z.string().uuid(),
  offerVersionId: z.string().uuid().nullable(),
  actorUserId: z.string().uuid().nullable(),
  action: OfferEventActionSchema,
  previousStatus: OfferStatusSchema.nullable(),
  nextStatus: OfferStatusSchema.nullable(),
  previousVersionId: z.string().uuid().nullable(),
  nextVersionId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  safeComment: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const OfferAggregateSchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  currentVersionId: z.string().uuid().nullable(),
  versions: z.array(OfferVersionSchema),
  history: z.array(OfferEventSchema),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PlacementEventSchema = z.object({
  id: z.string().uuid(),
  placementId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: PlacementEventActionSchema,
  previousStatus: PlacementStatusSchema.nullable(),
  nextStatus: PlacementStatusSchema.nullable(),
  reason: z.string().nullable(),
  safeComment: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const MissionPlacementSchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  offerVersionId: z.string().uuid(),
  status: PlacementStatusSchema,
  integrationStartDate: z.string().datetime(),
  confirmedAt: z.string().datetime(),
  confirmedByUserId: z.string().uuid().nullable(),
  operationalNote: z.string().nullable(),
  eligibleForInvoicing: z.boolean(),
  invoicingEligibleAt: z.string().datetime().nullable(),
  correctedAt: z.string().datetime().nullable(),
  correctedByUserId: z.string().uuid().nullable(),
  correctionReason: PlacementCorrectionReasonSchema.nullable(),
  correctionComment: z.string().nullable(),
  closureEligible: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  history: z.array(PlacementEventSchema),
});

export const InterviewTypeSchema = z.enum([
  'HR',
  'TECHNICAL',
  'INTERNAL_VALIDATION',
  'CLIENT_INTERVIEW_1',
  'CLIENT_INTERVIEW_2',
]);
export const InterviewStatusSchema = z.enum([
  'SCHEDULED',
  'POSTPONED',
  'COMPLETED',
  'CANCELED',
  'ARCHIVED',
]);
export const InterviewFormatSchema = z.enum(['ONSITE', 'PHONE', 'VIDEO', 'OTHER']);
export const InterviewParticipantKindSchema = z.enum([
  'INTERNAL_USER',
  'CLIENT_CONTACT',
  'EXTERNAL',
]);
export const InterviewParticipantStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const InterviewEventActionSchema = z.enum([
  'SCHEDULED',
  'RESCHEDULED',
  'POSTPONED',
  'COMPLETED',
  'CANCELED',
  'ARCHIVED',
  'PARTICIPANT_ADDED',
  'PARTICIPANT_REMOVED',
]);
export const EvaluationTypeSchema = z.enum(['INTERNAL_HR', 'INTERNAL_TECHNICAL', 'CLIENT']);
export const EvaluationStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'ARCHIVED']);
export const EvaluationRecommendationSchema = z.enum([
  'STRONG_YES',
  'YES',
  'NEUTRAL',
  'NO',
  'STRONG_NO',
]);

export const InterviewParticipantSchema = z.object({
  id: z.string().uuid(),
  interviewId: z.string().uuid(),
  kind: InterviewParticipantKindSchema,
  userId: z.string().uuid().nullable(),
  userDisplayName: z.string().nullable(),
  clientContactId: z.string().uuid().nullable(),
  clientContactDisplayName: z.string().nullable(),
  externalName: z.string().nullable(),
  externalRole: z.string().nullable(),
  status: InterviewParticipantStatusSchema,
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const InterviewEventSchema = z.object({
  id: z.string().uuid(),
  interviewId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: InterviewEventActionSchema,
  previousStatus: InterviewStatusSchema.nullable(),
  nextStatus: InterviewStatusSchema.nullable(),
  previousStartAt: z.string().datetime().nullable(),
  nextStartAt: z.string().datetime().nullable(),
  previousEndAt: z.string().datetime().nullable(),
  nextEndAt: z.string().datetime().nullable(),
  previousTimezone: z.string().nullable(),
  nextTimezone: z.string().nullable(),
  participantId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  safeComment: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const CandidateEvaluationSchema = z.object({
  id: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  interviewId: z.string().uuid(),
  authorUserId: z.string().uuid(),
  authorDisplayName: z.string(),
  evaluationType: EvaluationTypeSchema,
  recommendation: EvaluationRecommendationSchema.nullable(),
  recommended: z.boolean().nullable(),
  scores: z.object({
    overall: z.number().int().min(1).max(5).nullable(),
    communication: z.number().int().min(1).max(5).nullable(),
    technical: z.number().int().min(1).max(5).nullable(),
    roleFit: z.number().int().min(1).max(5).nullable(),
    cultureFit: z.number().int().min(1).max(5).nullable(),
    motivation: z.number().int().min(1).max(5).nullable(),
    salaryAlignment: z.number().int().min(1).max(5).nullable(),
  }),
  strengths: z.string().nullable(),
  weaknesses: z.string().nullable(),
  risks: z.string().nullable(),
  comment: z.string().nullable(),
  finalOpinion: z.boolean(),
  internalOnly: z.boolean(),
  clientVisible: z.boolean(),
  redacted: z.boolean(),
  status: EvaluationStatusSchema,
  submittedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const InterviewSummarySchema = z.object({
  id: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  type: InterviewTypeSchema,
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime().nullable(),
  timezone: z.string(),
  format: InterviewFormatSchema,
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  organizerUserId: z.string().uuid(),
  organizerDisplayName: z.string(),
  status: InterviewStatusSchema,
  outcome: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  postponedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  participantCount: z.number().int().nonnegative(),
  evaluationCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const InterviewDetailSchema = InterviewSummarySchema.extend({
  participants: z.array(InterviewParticipantSchema),
  evaluations: z.array(CandidateEvaluationSchema),
  history: z.array(InterviewEventSchema),
});

export const MissionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  clientId: z.string().uuid().optional(),
  state: MissionLifecycleStateSchema.optional(),
  priority: MissionPrioritySchema.optional(),
  assigneeUserId: z.string().uuid().optional(),
  deadlineFrom: z.string().datetime().optional(),
  deadlineTo: z.string().datetime().optional(),
});

export const MissionCreateRequestSchema = z
  .object({
    clientId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(4000).optional(),
    requirements: z.string().trim().min(1).max(4000).optional(),
    state: MissionLifecycleStateSchema.exclude(['ARCHIVED']).optional(),
    priority: MissionPrioritySchema.optional(),
    numberOfPositions: z.number().int().positive().max(500).optional(),
    filledPlacementCount: z.number().int().nonnegative().max(500).optional(),
    location: z.string().trim().min(1).max(160).optional(),
    workArrangement: z.string().trim().min(1).max(80).optional(),
    engagementType: z.string().trim().min(1).max(80).optional(),
    targetStartDate: z.string().datetime().optional(),
    applicationDeadline: z.string().datetime().optional(),
    salaryMinCents: z.number().int().nonnegative().optional(),
    salaryMaxCents: z.number().int().nonnegative().optional(),
    salaryCurrency: z.string().trim().length(3).optional(),
    commercialSummary: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((value) => placementCountsValid(value.numberOfPositions, value.filledPlacementCount), {
    message: 'Filled placements must not exceed planned positions.',
  })
  .refine((value) => salaryRangeValid(value.salaryMinCents, value.salaryMaxCents), {
    message: 'Salary minimum must not exceed salary maximum.',
  });

export const MissionUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().min(1).max(4000).nullable().optional(),
    requirements: z.string().trim().min(1).max(4000).nullable().optional(),
    priority: MissionPrioritySchema.optional(),
    numberOfPositions: z.number().int().positive().max(500).optional(),
    filledPlacementCount: z.number().int().nonnegative().max(500).optional(),
    location: z.string().trim().min(1).max(160).nullable().optional(),
    workArrangement: z.string().trim().min(1).max(80).nullable().optional(),
    engagementType: z.string().trim().min(1).max(80).nullable().optional(),
    targetStartDate: z.string().datetime().nullable().optional(),
    applicationDeadline: z.string().datetime().nullable().optional(),
    salaryMinCents: z.number().int().nonnegative().nullable().optional(),
    salaryMaxCents: z.number().int().nonnegative().nullable().optional(),
    salaryCurrency: z.string().trim().length(3).nullable().optional(),
    commercialSummary: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable mission field is required.',
  })
  .refine((value) => salaryRangeValid(value.salaryMinCents, value.salaryMaxCents), {
    message: 'Salary minimum must not exceed salary maximum.',
  });

export const MissionStatusUpdateRequestSchema = z.object({
  state: MissionLifecycleStateSchema,
});

export const MissionClosureRequestSchema = z.object({
  state: MissionLifecycleStateSchema.extract([
    'CLOSED_WITH_RECRUITMENT',
    'CLOSED_WITHOUT_RECRUITMENT',
    'CANCELED',
    'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
  ]),
  closureReason: MissionClosureReasonSchema,
  filledPlacementCount: z.number().int().nonnegative().max(500).optional(),
});

export const MissionAssignmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: MissionAssignmentStatusSchema.optional(),
  role: MissionAssignmentRoleSchema.optional(),
});

export const MissionCandidateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  state: MissionCandidateStateSchema.optional(),
  responsibleRecruiterUserId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  clientVisible: z.coerce.boolean().optional(),
  search: z.string().trim().max(120).optional(),
});

export const MissionCandidateCreateRequestSchema = z.object({
  candidateId: z.string().uuid(),
  responsibleRecruiterUserId: z.string().uuid(),
  source: z.string().trim().min(1).max(120).optional(),
  sourceContext: z.string().trim().min(1).max(1000).optional(),
  priority: MissionPrioritySchema.optional(),
  internalNotes: z.string().trim().min(1).max(2000).optional(),
});

export const MissionCandidateTransitionRequestSchema = z
  .object({
    state: MissionCandidateStateSchema,
    reason: z.string().trim().min(1).max(1000).optional(),
    comment: z.string().trim().min(1).max(1000).optional(),
    skip: z.boolean().default(false),
  })
  .refine((value) => !value.skip || Boolean(value.reason), {
    message: 'A reason is required when an optional stage is skipped.',
  });

export const MissionCandidateTransferRequestSchema = z.object({
  responsibleRecruiterUserId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export const MissionCandidatePresentationRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
  comment: z.string().trim().min(1).max(1000).optional(),
});

/**
 * @deprecated Legacy compatibility shape for the retired integration-confirmation route.
 * New placement confirmation must use PlacementConfirmRequestSchema with an accepted offer version.
 */
export const MissionCandidateIntegrationConfirmationRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const OfferCreateRequestSchema = z.object({
  offeredSalaryAmountCents: z.number().int().nonnegative().optional(),
  offeredSalaryCurrency: z.string().trim().length(3).optional(),
  contractType: z.string().trim().min(1).max(120).optional(),
  proposedStartDate: z.string().datetime().optional(),
  probationPeriod: z.string().trim().min(1).max(240).optional(),
  bonuses: z.string().trim().min(1).max(1000).optional(),
  benefits: z.string().trim().min(1).max(1000).optional(),
  allowances: z.string().trim().min(1).max(1000).optional(),
  compensationNotes: z.string().trim().min(1).max(1500).optional(),
  clientFacingRemarks: z.string().trim().min(1).max(1500).optional(),
  internalRecruiterRemarks: z.string().trim().min(1).max(1500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const OfferReviseRequestSchema = OfferCreateRequestSchema.extend({
  reason: z.string().trim().min(1).max(1000),
});

export const OfferMarkSentRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
});

export const OfferResponseRequestSchema = z
  .object({
    status: OfferStatusSchema.extract(['NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
    reason: z.string().trim().min(1).max(1000).optional(),
    comment: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((value) => value.status !== 'REJECTED' || Boolean(value.reason), {
    message: 'A reason is required when an offer is rejected.',
  });

export const OfferWithdrawRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const PlacementConfirmRequestSchema = z.object({
  integrationStartDate: z.string().datetime(),
  operationalNote: z.string().trim().min(1).max(1000).optional(),
  eligibleForInvoicing: z.boolean().default(false),
});

export const PlacementCorrectRequestSchema = z.object({
  reason: PlacementCorrectionReasonSchema,
  comment: z.string().trim().min(1).max(1000),
});

export const InterviewListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  type: InterviewTypeSchema.optional(),
  status: InterviewStatusSchema.optional(),
});

export const InterviewScheduleRequestSchema = z
  .object({
    type: InterviewTypeSchema,
    scheduledStartAt: z.string().datetime(),
    scheduledEndAt: z.string().datetime().optional(),
    timezone: z.string().trim().min(1).max(80).default('UTC'),
    format: InterviewFormatSchema,
    location: z.string().trim().min(1).max(240).optional(),
    meetingUrl: z.string().trim().url().max(500).optional(),
    organizerUserId: z.string().uuid(),
    internalUserParticipantIds: z.array(z.string().uuid()).max(30).default([]),
    clientContactParticipantIds: z.array(z.string().uuid()).max(30).default([]),
    externalParticipants: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(160),
          role: z.string().trim().min(1).max(160).optional(),
        }),
      )
      .max(10)
      .default([]),
  })
  .refine((value) => !value.scheduledEndAt || value.scheduledEndAt > value.scheduledStartAt, {
    message: 'Interview end time must be after start time.',
  });

export const InterviewRescheduleRequestSchema = z
  .object({
    scheduledStartAt: z.string().datetime(),
    scheduledEndAt: z.string().datetime().optional(),
    timezone: z.string().trim().min(1).max(80).default('UTC'),
    reason: z.string().trim().min(1).max(1000),
  })
  .refine((value) => !value.scheduledEndAt || value.scheduledEndAt > value.scheduledStartAt, {
    message: 'Interview end time must be after start time.',
  });

export const InterviewPostponeRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const InterviewCompletionRequestSchema = z.object({
  outcome: z.string().trim().min(1).max(1000).optional(),
});

export const InterviewCancellationRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const InterviewParticipantCreateRequestSchema = z.object({
  kind: InterviewParticipantKindSchema,
  userId: z.string().uuid().optional(),
  clientContactId: z.string().uuid().optional(),
  externalName: z.string().trim().min(1).max(160).optional(),
  externalRole: z.string().trim().min(1).max(160).optional(),
});

export const EvaluationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  evaluationType: EvaluationTypeSchema.optional(),
  status: EvaluationStatusSchema.optional(),
});

const optionalScoreSchema = z.number().int().min(1).max(5).nullable().optional();

export const EvaluationCreateRequestSchema = z.object({
  evaluationType: EvaluationTypeSchema,
  recommendation: EvaluationRecommendationSchema.optional(),
  recommended: z.boolean().optional(),
  overallScore: optionalScoreSchema,
  communicationScore: optionalScoreSchema,
  technicalScore: optionalScoreSchema,
  roleFitScore: optionalScoreSchema,
  cultureFitScore: optionalScoreSchema,
  motivationScore: optionalScoreSchema,
  salaryAlignmentScore: optionalScoreSchema,
  strengths: z.string().trim().min(1).max(2000).optional(),
  weaknesses: z.string().trim().min(1).max(2000).optional(),
  risks: z.string().trim().min(1).max(2000).optional(),
  comment: z.string().trim().min(1).max(3000).optional(),
  finalOpinion: z.boolean().default(false),
  clientVisible: z.boolean().default(false),
});

export const EvaluationUpdateRequestSchema = EvaluationCreateRequestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one evaluation field is required.' },
);

export const MissionAssignmentCreateRequestSchema = z.object({
  userId: z.string().uuid(),
  role: MissionAssignmentRoleSchema.default('RECRUITER'),
  isLead: z.boolean().default(false),
});

export const MissionAssignmentUpdateRequestSchema = z
  .object({
    role: MissionAssignmentRoleSchema.optional(),
    status: MissionAssignmentStatusSchema.exclude(['ARCHIVED']).optional(),
    isLead: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable assignment field is required.',
  });

export const MissionLeadRecruiterRequestSchema = z.object({
  assignmentId: z.string().uuid(),
});

export const MissionListResponseSchema = z.object({
  missions: z.array(MissionSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const MissionDetailResponseSchema = z.object({
  mission: MissionSummarySchema,
});

export const MissionAssignmentListResponseSchema = z.object({
  assignments: z.array(MissionAssignmentSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const MissionCandidateListResponseSchema = z.object({
  candidates: z.array(MissionCandidateSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const MissionCandidateDetailResponseSchema = z.object({
  candidateProcess: MissionCandidateDetailSchema,
});

export const OfferListResponseSchema = z.object({
  offer: OfferAggregateSchema.nullable(),
});

export const OfferDetailResponseSchema = z.object({
  offer: OfferAggregateSchema,
});

export const PlacementDetailResponseSchema = z.object({
  placement: MissionPlacementSchema.nullable(),
});

export const InterviewListResponseSchema = z.object({
  interviews: z.array(InterviewSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const InterviewDetailResponseSchema = z.object({
  interview: InterviewDetailSchema,
});

export const EvaluationListResponseSchema = z.object({
  evaluations: z.array(CandidateEvaluationSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const EvaluationDetailResponseSchema = z.object({
  evaluation: CandidateEvaluationSchema,
});

export const MissionAssignmentDetailResponseSchema = z.object({
  assignment: MissionAssignmentSummarySchema,
});

function placementCountsValid(
  numberOfPositions: number | undefined,
  filledPlacementCount: number | undefined,
): boolean {
  return (
    numberOfPositions === undefined ||
    filledPlacementCount === undefined ||
    filledPlacementCount <= numberOfPositions
  );
}

function salaryRangeValid(
  salaryMinCents: number | null | undefined,
  salaryMaxCents: number | null | undefined,
): boolean {
  return (
    salaryMinCents === undefined ||
    salaryMinCents === null ||
    salaryMaxCents === undefined ||
    salaryMaxCents === null ||
    salaryMinCents <= salaryMaxCents
  );
}

export type MissionLifecycleState = z.infer<typeof MissionLifecycleStateSchema>;
export type MissionClosureReason = z.infer<typeof MissionClosureReasonSchema>;
export type MissionPriority = z.infer<typeof MissionPrioritySchema>;
export type MissionAssignmentRole = z.infer<typeof MissionAssignmentRoleSchema>;
export type MissionAssignmentStatus = z.infer<typeof MissionAssignmentStatusSchema>;
export type MissionCandidateState = z.infer<typeof MissionCandidateStateSchema>;
export type MissionCandidateEventAction = z.infer<typeof MissionCandidateEventActionSchema>;
export type OfferStatus = z.infer<typeof OfferStatusSchema>;
export type OfferEventAction = z.infer<typeof OfferEventActionSchema>;
export type PlacementStatus = z.infer<typeof PlacementStatusSchema>;
export type PlacementEventAction = z.infer<typeof PlacementEventActionSchema>;
export type PlacementCorrectionReason = z.infer<typeof PlacementCorrectionReasonSchema>;
export type InterviewType = z.infer<typeof InterviewTypeSchema>;
export type InterviewStatus = z.infer<typeof InterviewStatusSchema>;
export type InterviewFormat = z.infer<typeof InterviewFormatSchema>;
export type InterviewParticipantKind = z.infer<typeof InterviewParticipantKindSchema>;
export type InterviewParticipantStatus = z.infer<typeof InterviewParticipantStatusSchema>;
export type InterviewEventAction = z.infer<typeof InterviewEventActionSchema>;
export type EvaluationType = z.infer<typeof EvaluationTypeSchema>;
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;
export type EvaluationRecommendation = z.infer<typeof EvaluationRecommendationSchema>;
export type MissionSummary = z.infer<typeof MissionSummarySchema>;
export type MissionAssignmentSummary = z.infer<typeof MissionAssignmentSummarySchema>;
export type MissionCandidateEvent = z.infer<typeof MissionCandidateEventSchema>;
export type MissionCandidateSummary = z.infer<typeof MissionCandidateSummarySchema>;
export type MissionCandidateDetail = z.infer<typeof MissionCandidateDetailSchema>;
export type OfferVersion = z.infer<typeof OfferVersionSchema>;
export type OfferEvent = z.infer<typeof OfferEventSchema>;
export type OfferAggregate = z.infer<typeof OfferAggregateSchema>;
export type PlacementEvent = z.infer<typeof PlacementEventSchema>;
export type MissionPlacement = z.infer<typeof MissionPlacementSchema>;
export type InterviewParticipant = z.infer<typeof InterviewParticipantSchema>;
export type InterviewEvent = z.infer<typeof InterviewEventSchema>;
export type CandidateEvaluation = z.infer<typeof CandidateEvaluationSchema>;
export type InterviewSummary = z.infer<typeof InterviewSummarySchema>;
export type InterviewDetail = z.infer<typeof InterviewDetailSchema>;
export type MissionListQuery = z.infer<typeof MissionListQuerySchema>;
export type MissionCreateRequest = z.infer<typeof MissionCreateRequestSchema>;
export type MissionUpdateRequest = z.infer<typeof MissionUpdateRequestSchema>;
export type MissionStatusUpdateRequest = z.infer<typeof MissionStatusUpdateRequestSchema>;
export type MissionClosureRequest = z.infer<typeof MissionClosureRequestSchema>;
export type MissionAssignmentListQuery = z.infer<typeof MissionAssignmentListQuerySchema>;
export type MissionCandidateListQuery = z.infer<typeof MissionCandidateListQuerySchema>;
export type MissionAssignmentCreateRequest = z.infer<typeof MissionAssignmentCreateRequestSchema>;
export type MissionAssignmentUpdateRequest = z.infer<typeof MissionAssignmentUpdateRequestSchema>;
export type MissionLeadRecruiterRequest = z.infer<typeof MissionLeadRecruiterRequestSchema>;
export type MissionCandidateCreateRequest = z.infer<typeof MissionCandidateCreateRequestSchema>;
export type MissionCandidateTransitionRequest = z.infer<
  typeof MissionCandidateTransitionRequestSchema
>;
export type MissionCandidateTransferRequest = z.infer<typeof MissionCandidateTransferRequestSchema>;
export type MissionCandidatePresentationRequest = z.infer<
  typeof MissionCandidatePresentationRequestSchema
>;
export type MissionCandidateIntegrationConfirmationRequest = z.infer<
  typeof MissionCandidateIntegrationConfirmationRequestSchema
>;
export type OfferCreateRequest = z.infer<typeof OfferCreateRequestSchema>;
export type OfferReviseRequest = z.infer<typeof OfferReviseRequestSchema>;
export type OfferMarkSentRequest = z.infer<typeof OfferMarkSentRequestSchema>;
export type OfferResponseRequest = z.infer<typeof OfferResponseRequestSchema>;
export type OfferWithdrawRequest = z.infer<typeof OfferWithdrawRequestSchema>;
export type PlacementConfirmRequest = z.infer<typeof PlacementConfirmRequestSchema>;
export type PlacementCorrectRequest = z.infer<typeof PlacementCorrectRequestSchema>;
export type InterviewListQuery = z.infer<typeof InterviewListQuerySchema>;
export type InterviewScheduleRequest = z.infer<typeof InterviewScheduleRequestSchema>;
export type InterviewRescheduleRequest = z.infer<typeof InterviewRescheduleRequestSchema>;
export type InterviewPostponeRequest = z.infer<typeof InterviewPostponeRequestSchema>;
export type InterviewCompletionRequest = z.infer<typeof InterviewCompletionRequestSchema>;
export type InterviewCancellationRequest = z.infer<typeof InterviewCancellationRequestSchema>;
export type InterviewParticipantCreateRequest = z.infer<
  typeof InterviewParticipantCreateRequestSchema
>;
export type EvaluationListQuery = z.infer<typeof EvaluationListQuerySchema>;
export type EvaluationCreateRequest = z.infer<typeof EvaluationCreateRequestSchema>;
export type EvaluationUpdateRequest = z.infer<typeof EvaluationUpdateRequestSchema>;
export type MissionListResponse = z.infer<typeof MissionListResponseSchema>;
export type MissionDetailResponse = z.infer<typeof MissionDetailResponseSchema>;
export type MissionAssignmentListResponse = z.infer<typeof MissionAssignmentListResponseSchema>;
export type MissionAssignmentDetailResponse = z.infer<typeof MissionAssignmentDetailResponseSchema>;
export type MissionCandidateListResponse = z.infer<typeof MissionCandidateListResponseSchema>;
export type MissionCandidateDetailResponse = z.infer<typeof MissionCandidateDetailResponseSchema>;
export type OfferListResponse = z.infer<typeof OfferListResponseSchema>;
export type OfferDetailResponse = z.infer<typeof OfferDetailResponseSchema>;
export type PlacementDetailResponse = z.infer<typeof PlacementDetailResponseSchema>;
export type InterviewListResponse = z.infer<typeof InterviewListResponseSchema>;
export type InterviewDetailResponse = z.infer<typeof InterviewDetailResponseSchema>;
export type EvaluationListResponse = z.infer<typeof EvaluationListResponseSchema>;
export type EvaluationDetailResponse = z.infer<typeof EvaluationDetailResponseSchema>;
