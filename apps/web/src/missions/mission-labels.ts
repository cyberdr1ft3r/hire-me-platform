import type {
  CandidateEvaluation,
  InternalPublicOpportunity,
  InterviewSummary,
  MissionAssignmentSummary,
  MissionCandidateState,
  MissionLifecycleState,
  MissionPlacement,
  MissionSummary,
  OfferAggregate,
} from '@hire-me/contracts';

import type { PlainMessageKey } from '../i18n/index.js';
import type { StatusTone } from '../ui/index.js';

type MissionPriority = MissionSummary['priority'];
type ClosureReason = NonNullable<MissionSummary['closureReason']>;
type AssignmentRole = MissionAssignmentSummary['role'];
type AssignmentStatus = MissionAssignmentSummary['status'];
type InterviewType = InterviewSummary['type'];
type InterviewStatus = InterviewSummary['status'];
type InterviewFormat = InterviewSummary['format'];
type EvaluationType = CandidateEvaluation['evaluationType'];
type EvaluationStatus = CandidateEvaluation['status'];
type EvaluationRecommendation = NonNullable<CandidateEvaluation['recommendation']>;
export type OfferStatus = OfferAggregate['versions'][number]['status'];
type PlacementStatus = MissionPlacement['status'];
type PublicOpportunityStatus = InternalPublicOpportunity['status'];

/** Lifecycle states a mission list can be filtered by (non-terminal and terminal). */
export const MISSION_STATE_FILTER_OPTIONS: readonly MissionLifecycleState[] = [
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
  'WAITING_FOR_CLIENT_INFORMATION',
  'PAUSED',
  'CLOSED_WITH_RECRUITMENT',
  'CLOSED_WITHOUT_RECRUITMENT',
  'CANCELED',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
  'ARCHIVED',
];

export const MISSION_PRIORITIES: readonly MissionPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/**
 * States in which the API refuses every mission-scoped write (`MISSION_TERMINAL`).
 * Archiving is the one exception: it is allowed from a closed state.
 */
const TERMINAL_MISSION_STATES: ReadonlySet<MissionLifecycleState> = new Set([
  'CLOSED_WITH_RECRUITMENT',
  'CLOSED_WITHOUT_RECRUITMENT',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
  'CANCELED',
  'ARCHIVED',
]);

export function isMissionWritable(mission: Pick<MissionSummary, 'state' | 'archivedAt'>): boolean {
  return !TERMINAL_MISSION_STATES.has(mission.state) && mission.archivedAt === null;
}

/** The API archives only missions that are already closed or canceled. */
export function canArchiveMissionState(
  mission: Pick<MissionSummary, 'state' | 'archivedAt'>,
): boolean {
  return (
    mission.state !== 'ARCHIVED' &&
    mission.archivedAt === null &&
    TERMINAL_MISSION_STATES.has(mission.state)
  );
}

/** Ordinary status changes offered from each state (the closure endpoint handles the rest). */
export function nextMissionStates(state: MissionLifecycleState): MissionLifecycleState[] {
  const transitions: Partial<Record<MissionLifecycleState, MissionLifecycleState[]>> = {
    DRAFT: ['INTERNAL_VALIDATION', 'PAUSED'],
    INTERNAL_VALIDATION: ['ACTIVE', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    ACTIVE: ['JOB_DESCRIPTION_APPROVED', 'PAUSED'],
    JOB_DESCRIPTION_APPROVED: ['CANDIDATE_SOURCING', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    CANDIDATE_SOURCING: ['HR_PRESELECTION', 'PAUSED'],
    HR_PRESELECTION: ['HR_INTERVIEWS', 'PAUSED'],
    HR_INTERVIEWS: ['TECHNICAL_TESTS', 'PAUSED'],
    TECHNICAL_TESTS: ['CANDIDATE_PRESENTATION', 'PAUSED'],
    CANDIDATE_PRESENTATION: ['CLIENT_INTERVIEWS', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    CLIENT_INTERVIEWS: ['FINAL_SELECTION', 'PAUSED'],
    FINAL_SELECTION: ['OFFER_SENT', 'PAUSED'],
    OFFER_SENT: ['CANDIDATE_INTEGRATED', 'PAUSED'],
    CANDIDATE_INTEGRATED: ['PROBATION_MONITORING'],
    WAITING_FOR_CLIENT_INFORMATION: [
      'INTERNAL_VALIDATION',
      'JOB_DESCRIPTION_APPROVED',
      'CANDIDATE_PRESENTATION',
    ],
    PAUSED: ['INTERNAL_VALIDATION', 'ACTIVE', 'CANDIDATE_SOURCING', 'HR_PRESELECTION'],
  };
  return transitions[state] ?? [];
}

export type MissionClosureState =
  | 'CLOSED_WITH_RECRUITMENT'
  | 'CLOSED_WITHOUT_RECRUITMENT'
  | 'CANCELED'
  | 'DEADLINE_EXPIRED_WITHOUT_RENEWAL';

export const MISSION_CLOSURE_STATES: readonly MissionClosureState[] = [
  'CLOSED_WITH_RECRUITMENT',
  'CLOSED_WITHOUT_RECRUITMENT',
  'CANCELED',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
];

/**
 * The API accepts exactly one closure reason per closure state
 * (`MISSION_CLOSURE_REASON_MISMATCH` otherwise), so the reason is derived, never chosen.
 */
export const CLOSURE_REASON_BY_STATE: Readonly<Record<MissionClosureState, ClosureReason>> = {
  CANCELED: 'CLIENT_CLOSED_OR_CANCELED',
  CLOSED_WITHOUT_RECRUITMENT: 'CLOSED_WITHOUT_RECRUITMENT',
  CLOSED_WITH_RECRUITMENT: 'POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED',
  DEADLINE_EXPIRED_WITHOUT_RENEWAL: 'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
};

const TERMINAL_PROCESS_STATES: ReadonlySet<MissionCandidateState> = new Set([
  'CANDIDATE_REJECTED',
  'CLIENT_REJECTED',
  'WITHDRAWN',
  'TALENT_POOL',
  'PROCESS_COMPLETED',
]);

export function isProcessWritable(process: {
  state: MissionCandidateState;
  archivedAt: string | null;
}): boolean {
  return !TERMINAL_PROCESS_STATES.has(process.state) && process.archivedAt === null;
}

export function nextProcessStates(state: MissionCandidateState): MissionCandidateState[] {
  const transitions: Partial<Record<MissionCandidateState, MissionCandidateState[]>> = {
    NEW: ['CV_TO_REVIEW', 'WITHDRAWN'],
    CV_TO_REVIEW: ['HR_PRESELECTION', 'WAITING', 'CANDIDATE_REJECTED', 'TALENT_POOL'],
    HR_PRESELECTION: ['HR_INTERVIEW_SCHEDULED', 'WAITING', 'CANDIDATE_REJECTED', 'TALENT_POOL'],
    HR_INTERVIEW_SCHEDULED: ['HR_INTERVIEW_COMPLETED', 'POSTPONED'],
    HR_INTERVIEW_COMPLETED: ['TECHNICAL_TEST', 'INTERNAL_VALIDATION'],
    TECHNICAL_TEST: ['INTERNAL_VALIDATION'],
    INTERNAL_VALIDATION: ['PRESENTED_TO_CLIENT', 'WAITING', 'CANDIDATE_REJECTED'],
    PRESENTED_TO_CLIENT: ['CLIENT_INTERVIEW_1', 'CLIENT_REJECTED'],
    CLIENT_INTERVIEW_1: ['CLIENT_INTERVIEW_2', 'CLIENT_OFFER', 'CLIENT_REJECTED'],
    CLIENT_INTERVIEW_2: ['CLIENT_OFFER', 'CLIENT_REJECTED'],
    CLIENT_OFFER: ['ACCEPTED', 'CANDIDATE_REJECTED', 'WITHDRAWN'],
    ACCEPTED: [],
    INTEGRATED: ['PROBATION_COMPLETED'],
    PROBATION_COMPLETED: ['PROCESS_COMPLETED'],
    WAITING: ['CV_TO_REVIEW', 'HR_PRESELECTION', 'PRESENTED_TO_CLIENT', 'WITHDRAWN'],
    POSTPONED: ['HR_INTERVIEW_SCHEDULED', 'CLIENT_INTERVIEW_1', 'CLIENT_INTERVIEW_2'],
  };
  return transitions[state] ?? [];
}

export function isOptionalProcessSkip(
  currentState: MissionCandidateState,
  nextState: MissionCandidateState,
): boolean {
  return (
    (currentState === 'HR_INTERVIEW_COMPLETED' && nextState === 'INTERNAL_VALIDATION') ||
    (currentState === 'CLIENT_INTERVIEW_1' && nextState === 'CLIENT_OFFER')
  );
}

/** Process stages in which the API accepts a new offer (`OFFER_PROCESS_STATE_REQUIRED`). */
const OFFER_PROCESS_STATES: ReadonlySet<MissionCandidateState> = new Set([
  'CLIENT_OFFER',
  'ACCEPTED',
  'INTEGRATED',
  'PROBATION_COMPLETED',
]);

export function canCreateOfferInState(state: MissionCandidateState): boolean {
  return OFFER_PROCESS_STATES.has(state);
}

/** The API makes lead only an active assignment already in the lead recruiter role. */
export function canBecomeLead(
  assignment: Pick<MissionAssignmentSummary, 'isLead' | 'role' | 'status'>,
): boolean {
  return assignment.status === 'ACTIVE' && assignment.role === 'LEAD_RECRUITER' && !assignment.isLead;
}

/** Roles that may hold responsibility for a candidate process (API rule). */
export const RESPONSIBLE_RECRUITER_ROLES: ReadonlySet<AssignmentRole> = new Set([
  'LEAD_RECRUITER',
  'RECRUITER',
  'SOURCER',
]);

export const ASSIGNABLE_ROLES: readonly Exclude<AssignmentRole, 'LEAD_RECRUITER'>[] = [
  'RECRUITER',
  'SOURCER',
  'CONTRIBUTOR',
];

export const INTERVIEW_TYPES: readonly InterviewType[] = [
  'HR',
  'TECHNICAL',
  'INTERNAL_VALIDATION',
  'CLIENT_INTERVIEW_1',
  'CLIENT_INTERVIEW_2',
];
export const INTERVIEW_FORMATS: readonly InterviewFormat[] = ['VIDEO', 'PHONE', 'ONSITE', 'OTHER'];

const TERMINAL_INTERVIEW_STATUSES: ReadonlySet<InterviewStatus> = new Set([
  'COMPLETED',
  'CANCELED',
  'ARCHIVED',
]);

export function isInterviewOpen(interview: Pick<InterviewSummary, 'status'>): boolean {
  return !TERMINAL_INTERVIEW_STATUSES.has(interview.status);
}

export const EVALUATION_TYPES: readonly EvaluationType[] = [
  'INTERNAL_HR',
  'INTERNAL_TECHNICAL',
  'CLIENT',
];
export const EVALUATION_RECOMMENDATIONS: readonly EvaluationRecommendation[] = [
  'STRONG_YES',
  'YES',
  'NEUTRAL',
  'NO',
  'STRONG_NO',
];
export const EVALUATION_SCORES = [
  'overallScore',
  'communicationScore',
  'technicalScore',
  'roleFitScore',
  'cultureFitScore',
  'motivationScore',
  'salaryAlignmentScore',
] as const;
export type EvaluationScoreField = (typeof EVALUATION_SCORES)[number];

export type OfferResponseStatus = 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export const OFFER_RESPONSES: readonly OfferResponseStatus[] = [
  'NEGOTIATING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
];

/** Offer lifecycle transitions the API allows (`OFFER_INVALID_TRANSITION` otherwise). */
const OFFER_TRANSITIONS: Readonly<Record<OfferStatus, readonly OfferStatus[]>> = {
  DRAFT: ['SENT', 'WITHDRAWN', 'ARCHIVED'],
  SENT: ['NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  NEGOTIATING: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  REJECTED: ['ARCHIVED'],
  EXPIRED: ['ARCHIVED'],
  WITHDRAWN: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canOfferMoveTo(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

export function missionStateLabelKey(state: MissionLifecycleState): PlainMessageKey {
  return `missions.state.${state}`;
}

export function missionPriorityLabelKey(priority: MissionPriority): PlainMessageKey {
  return `missions.priority.${priority}`;
}

export function closureReasonLabelKey(reason: ClosureReason): PlainMessageKey {
  return `missions.closureReason.${reason}`;
}

export function assignmentRoleLabelKey(role: AssignmentRole): PlainMessageKey {
  return `missions.assignmentRole.${role}`;
}

export function assignmentStatusLabelKey(status: AssignmentStatus): PlainMessageKey {
  return `missions.assignmentStatus.${status}`;
}

export function processStateLabelKey(state: MissionCandidateState): PlainMessageKey {
  return `domain.pipelineState.${state}`;
}

export function interviewTypeLabelKey(type: InterviewType): PlainMessageKey {
  return `missions.interviewType.${type}`;
}

export function interviewStatusLabelKey(status: InterviewStatus): PlainMessageKey {
  return `missions.interviewStatus.${status}`;
}

export function interviewFormatLabelKey(format: InterviewFormat): PlainMessageKey {
  return `missions.interviewFormat.${format}`;
}

export function evaluationTypeLabelKey(type: EvaluationType): PlainMessageKey {
  return `missions.evaluationType.${type}`;
}

export function evaluationStatusLabelKey(status: EvaluationStatus): PlainMessageKey {
  return `missions.evaluationStatus.${status}`;
}

export function recommendationLabelKey(recommendation: EvaluationRecommendation): PlainMessageKey {
  return `missions.recommendation.${recommendation}`;
}

export function evaluationScoreLabelKey(score: EvaluationScoreField): PlainMessageKey {
  return `missions.evaluations.scores.${score}`;
}

export function offerStatusLabelKey(status: OfferStatus): PlainMessageKey {
  return `missions.offerStatus.${status}`;
}

export function placementStatusLabelKey(status: PlacementStatus): PlainMessageKey {
  return `missions.placementStatus.${status}`;
}

export function publicStatusLabelKey(status: PublicOpportunityStatus): PlainMessageKey {
  return `missions.publicStatus.${status}`;
}

export function missionStateTone(state: MissionLifecycleState): StatusTone {
  switch (state) {
    case 'DRAFT':
    case 'INTERNAL_VALIDATION':
      return 'neutral';
    case 'PAUSED':
    case 'WAITING_FOR_CLIENT_INFORMATION':
      return 'warning';
    case 'CLOSED_WITH_RECRUITMENT':
      return 'success';
    case 'CLOSED_WITHOUT_RECRUITMENT':
    case 'CANCELED':
    case 'DEADLINE_EXPIRED_WITHOUT_RENEWAL':
      return 'danger';
    case 'ARCHIVED':
      return 'neutral';
    default:
      return 'info';
  }
}

export function missionPriorityTone(priority: MissionPriority): StatusTone {
  switch (priority) {
    case 'URGENT':
      return 'danger';
    case 'HIGH':
      return 'warning';
    case 'LOW':
      return 'neutral';
    default:
      return 'info';
  }
}

export function processStateTone(state: MissionCandidateState): StatusTone {
  switch (state) {
    case 'ACCEPTED':
    case 'INTEGRATED':
    case 'PROBATION_COMPLETED':
    case 'PROCESS_COMPLETED':
      return 'success';
    case 'CANDIDATE_REJECTED':
    case 'CLIENT_REJECTED':
    case 'WITHDRAWN':
      return 'danger';
    case 'WAITING':
    case 'POSTPONED':
      return 'warning';
    case 'TALENT_POOL':
    case 'NEW':
      return 'neutral';
    default:
      return 'info';
  }
}

export function assignmentStatusTone(status: AssignmentStatus): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'INACTIVE':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function interviewStatusTone(status: InterviewStatus): StatusTone {
  switch (status) {
    case 'SCHEDULED':
      return 'info';
    case 'POSTPONED':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'CANCELED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function evaluationStatusTone(status: EvaluationStatus): StatusTone {
  switch (status) {
    case 'SUBMITTED':
      return 'success';
    case 'DRAFT':
      return 'info';
    default:
      return 'neutral';
  }
}

export function offerStatusTone(status: OfferStatus): StatusTone {
  switch (status) {
    case 'ACCEPTED':
      return 'success';
    case 'SENT':
    case 'NEGOTIATING':
      return 'info';
    case 'REJECTED':
    case 'WITHDRAWN':
    case 'EXPIRED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function placementStatusTone(status: PlacementStatus): StatusTone {
  return status === 'CONFIRMED' ? 'success' : 'warning';
}

export function publicStatusTone(status: PublicOpportunityStatus): StatusTone {
  switch (status) {
    case 'OPEN':
      return 'success';
    case 'PAUSED':
      return 'warning';
    case 'CLOSED':
      return 'danger';
    default:
      return 'neutral';
  }
}
