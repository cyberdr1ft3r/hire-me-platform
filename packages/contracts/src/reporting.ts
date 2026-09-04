import { z } from 'zod';

import {
  MissionCandidateStateSchema,
  MissionLifecycleStateSchema,
  OfferStatusSchema,
  PlacementStatusSchema,
} from './missions.js';

// Maximum reporting window, in days, accepted by any bounded reporting query.
export const ReportingMaxWindowDays = 366;
// Maximum number of drilldown/export rows returned by a single request.
export const ReportingMaxDrilldownPageSize = 200;
// Maximum number of rows a single CSV export may contain.
export const ReportingMaxExportRows = 5000;
// Maximum number of grouped entries returned in a breakdown dimension.
export const ReportingMaxBreakdownEntries = 50;
// Maximum number of buckets returned by a trends time-series.
export const ReportingMaxTrendBuckets = 366;

export const ReportingScopeKindSchema = z.enum(['broad', 'assigned']);

export const ReportingTrendIntervalSchema = z.enum(['day', 'week']);

export const ReportingDistributionEntrySchema = z.object({
  key: z.string(),
  count: z.number().int().nonnegative(),
});

export const ReportingWindowSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const ReportingScopeSchema = z.object({
  kind: ReportingScopeKindSchema,
  // Number of recruitment missions the current actor is authorized to report on.
  // For assigned scope this is the count of missions with an active assignment;
  // for broad scope it is the total number of missions in the platform.
  authorizedMissionCount: z.number().int().nonnegative(),
});

export const ReportingAppliedFiltersSchema = z.object({
  clientId: z.string().uuid().nullable(),
  missionId: z.string().uuid().nullable(),
  recruiterUserId: z.string().uuid().nullable(),
  pipelineState: MissionCandidateStateSchema.nullable(),
  offerStatus: OfferStatusSchema.nullable(),
  placementStatus: PlacementStatusSchema.nullable(),
  source: z.string().nullable(),
});

// Shared query accepted by every reporting read endpoint. All fields are optional
// and bounded. Malformed or over-large ranges are rejected server-side.
export const ReportingFilterQuerySchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  clientId: z.string().uuid().optional(),
  missionId: z.string().uuid().optional(),
  recruiterUserId: z.string().uuid().optional(),
  pipelineState: MissionCandidateStateSchema.optional(),
  offerStatus: OfferStatusSchema.optional(),
  placementStatus: PlacementStatusSchema.optional(),
  source: z.string().trim().min(1).max(120).optional(),
});

export const ReportingTrendsQuerySchema = ReportingFilterQuerySchema.extend({
  interval: ReportingTrendIntervalSchema.default('day'),
});

export const ReportingDrilldownQuerySchema = ReportingFilterQuerySchema.extend({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(ReportingMaxDrilldownPageSize).default(50),
});

export const ReportingMissionSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  closureEligible: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  requestedPositions: z.number().int().nonnegative(),
  byState: z.array(ReportingDistributionEntrySchema),
});

export const ReportingPipelineSummarySchema = z.object({
  totalProcesses: z.number().int().nonnegative(),
  presentedToClient: z.number().int().nonnegative(),
  byState: z.array(ReportingDistributionEntrySchema),
});

export const ReportingApplicationsSummarySchema = z.object({
  newInWindow: z.number().int().nonnegative(),
});

export const ReportingInterviewsSummarySchema = z.object({
  scheduled: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  canceled: z.number().int().nonnegative(),
  byStatus: z.array(ReportingDistributionEntrySchema),
  byType: z.array(ReportingDistributionEntrySchema),
});

export const ReportingOffersSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  withdrawn: z.number().int().nonnegative(),
  byCurrentStatus: z.array(ReportingDistributionEntrySchema),
});

export const ReportingPlacementsSummarySchema = z.object({
  confirmed: z.number().int().nonnegative(),
  corrected: z.number().int().nonnegative(),
  requestedPositions: z.number().int().nonnegative(),
  byStatus: z.array(ReportingDistributionEntrySchema),
});

export const ReportingAgingSummarySchema = z.object({
  overdueMissions: z.number().int().nonnegative(),
  stalePipelineProcesses: z.number().int().nonnegative(),
});

export const ReportingSummarySchema = z.object({
  window: ReportingWindowSchema,
  scope: ReportingScopeSchema,
  filters: ReportingAppliedFiltersSchema,
  missions: ReportingMissionSummarySchema,
  pipeline: ReportingPipelineSummarySchema,
  applications: ReportingApplicationsSummarySchema,
  interviews: ReportingInterviewsSummarySchema,
  offers: ReportingOffersSummarySchema,
  placements: ReportingPlacementsSummarySchema,
  aging: ReportingAgingSummarySchema,
});

export const ReportingSummaryResponseSchema = z.object({
  summary: ReportingSummarySchema,
});

export const ReportingPipelineResponseSchema = z.object({
  window: ReportingWindowSchema,
  scope: ReportingScopeSchema,
  filters: ReportingAppliedFiltersSchema,
  distributions: z.object({
    missionsByState: z.array(ReportingDistributionEntrySchema),
    processesByState: z.array(ReportingDistributionEntrySchema),
    interviewsByStatus: z.array(ReportingDistributionEntrySchema),
    interviewsByType: z.array(ReportingDistributionEntrySchema),
    offersByCurrentStatus: z.array(ReportingDistributionEntrySchema),
    placementsByStatus: z.array(ReportingDistributionEntrySchema),
  }),
});

export const ReportingTrendPointSchema = z.object({
  bucketStart: z.string().datetime(),
  count: z.number().int().nonnegative(),
});

export const ReportingTrendSeriesSchema = z.object({
  metric: z.enum([
    'processesCreated',
    'publicApplications',
    'interviewsScheduled',
    'offersCreated',
    'placementsConfirmed',
  ]),
  points: z.array(ReportingTrendPointSchema),
});

export const ReportingTrendsResponseSchema = z.object({
  window: ReportingWindowSchema,
  scope: ReportingScopeSchema,
  filters: ReportingAppliedFiltersSchema,
  interval: ReportingTrendIntervalSchema,
  series: z.array(ReportingTrendSeriesSchema),
});

export const ReportingClientBreakdownEntrySchema = z.object({
  clientId: z.string().uuid(),
  clientName: z.string(),
  openMissions: z.number().int().nonnegative(),
  totalProcesses: z.number().int().nonnegative(),
  confirmedPlacements: z.number().int().nonnegative(),
});

export const ReportingMissionBreakdownEntrySchema = z.object({
  missionId: z.string().uuid(),
  missionTitle: z.string(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  state: MissionLifecycleStateSchema,
  totalProcesses: z.number().int().nonnegative(),
  confirmedPlacements: z.number().int().nonnegative(),
  requestedPositions: z.number().int().nonnegative(),
});

export const ReportingRecruiterBreakdownEntrySchema = z.object({
  recruiterUserId: z.string().uuid(),
  recruiterDisplayName: z.string(),
  activeProcesses: z.number().int().nonnegative(),
  confirmedPlacements: z.number().int().nonnegative(),
});

export const ReportingBreakdownsResponseSchema = z.object({
  window: ReportingWindowSchema,
  scope: ReportingScopeSchema,
  filters: ReportingAppliedFiltersSchema,
  byClient: z.array(ReportingClientBreakdownEntrySchema),
  byMission: z.array(ReportingMissionBreakdownEntrySchema),
  byRecruiter: z.array(ReportingRecruiterBreakdownEntrySchema),
});

// A single drilldown row. It intentionally excludes candidate salary/compensation,
// client/placement commercial values, evaluation bodies, internal notes, document
// storage metadata, secrets, and tokens.
export const ReportingDrilldownRowSchema = z.object({
  processId: z.string().uuid(),
  missionId: z.string().uuid(),
  missionTitle: z.string(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  candidateId: z.string().uuid(),
  candidateDisplayName: z.string(),
  pipelineState: MissionCandidateStateSchema,
  responsibleRecruiterUserId: z.string().uuid(),
  responsibleRecruiterDisplayName: z.string(),
  source: z.string().nullable(),
  clientVisible: z.boolean(),
  presentedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ReportingDrilldownPageInfoSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
});

export const ReportingDrilldownResponseSchema = z.object({
  window: ReportingWindowSchema,
  scope: ReportingScopeSchema,
  filters: ReportingAppliedFiltersSchema,
  rows: z.array(ReportingDrilldownRowSchema),
  pageInfo: ReportingDrilldownPageInfoSchema,
});

export type ReportingScopeKind = z.infer<typeof ReportingScopeKindSchema>;
export type ReportingTrendInterval = z.infer<typeof ReportingTrendIntervalSchema>;
export type ReportingDistributionEntry = z.infer<typeof ReportingDistributionEntrySchema>;
export type ReportingWindow = z.infer<typeof ReportingWindowSchema>;
export type ReportingScope = z.infer<typeof ReportingScopeSchema>;
export type ReportingAppliedFilters = z.infer<typeof ReportingAppliedFiltersSchema>;
export type ReportingFilterQuery = z.infer<typeof ReportingFilterQuerySchema>;
export type ReportingTrendsQuery = z.infer<typeof ReportingTrendsQuerySchema>;
export type ReportingDrilldownQuery = z.infer<typeof ReportingDrilldownQuerySchema>;
export type ReportingSummary = z.infer<typeof ReportingSummarySchema>;
export type ReportingSummaryResponse = z.infer<typeof ReportingSummaryResponseSchema>;
export type ReportingPipelineResponse = z.infer<typeof ReportingPipelineResponseSchema>;
export type ReportingTrendSeries = z.infer<typeof ReportingTrendSeriesSchema>;
export type ReportingTrendsResponse = z.infer<typeof ReportingTrendsResponseSchema>;
export type ReportingClientBreakdownEntry = z.infer<typeof ReportingClientBreakdownEntrySchema>;
export type ReportingMissionBreakdownEntry = z.infer<typeof ReportingMissionBreakdownEntrySchema>;
export type ReportingRecruiterBreakdownEntry = z.infer<
  typeof ReportingRecruiterBreakdownEntrySchema
>;
export type ReportingBreakdownsResponse = z.infer<typeof ReportingBreakdownsResponseSchema>;
export type ReportingDrilldownRow = z.infer<typeof ReportingDrilldownRowSchema>;
export type ReportingDrilldownResponse = z.infer<typeof ReportingDrilldownResponseSchema>;
