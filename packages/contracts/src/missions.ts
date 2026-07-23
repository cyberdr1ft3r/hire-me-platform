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

export const MissionCandidateIntegrationConfirmationRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

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
export type MissionSummary = z.infer<typeof MissionSummarySchema>;
export type MissionAssignmentSummary = z.infer<typeof MissionAssignmentSummarySchema>;
export type MissionCandidateEvent = z.infer<typeof MissionCandidateEventSchema>;
export type MissionCandidateSummary = z.infer<typeof MissionCandidateSummarySchema>;
export type MissionCandidateDetail = z.infer<typeof MissionCandidateDetailSchema>;
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
export type MissionListResponse = z.infer<typeof MissionListResponseSchema>;
export type MissionDetailResponse = z.infer<typeof MissionDetailResponseSchema>;
export type MissionAssignmentListResponse = z.infer<typeof MissionAssignmentListResponseSchema>;
export type MissionAssignmentDetailResponse = z.infer<typeof MissionAssignmentDetailResponseSchema>;
export type MissionCandidateListResponse = z.infer<typeof MissionCandidateListResponseSchema>;
export type MissionCandidateDetailResponse = z.infer<typeof MissionCandidateDetailResponseSchema>;
