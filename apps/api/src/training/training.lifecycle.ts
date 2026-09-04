import {
  TrainingEnrollmentStatus,
  TrainingProgramStatus,
  TrainingSessionParticipationStatus,
  TrainingSessionStatus,
} from '../persistence/prisma/generated-client.js';

/**
 * Deterministic training lifecycle transitions.
 *
 * The program, session, and participation state machines mirror the approved
 * diagrams in `docs/workflows.md` exactly.
 *
 * The enrollment machine mirrors `docs/workflows.md` and additionally allows an
 * explicit authorized withdrawal from any active state, which Issue #37 requires.
 * Withdrawal is a dedicated action, not a free-form status write.
 */

const PROGRAM_TRANSITIONS: Record<TrainingProgramStatus, readonly TrainingProgramStatus[]> = {
  [TrainingProgramStatus.PROGRAM_DRAFT]: [TrainingProgramStatus.PROGRAM_ACTIVE],
  [TrainingProgramStatus.PROGRAM_ACTIVE]: [TrainingProgramStatus.PROGRAM_CLOSED],
  [TrainingProgramStatus.PROGRAM_CLOSED]: [TrainingProgramStatus.PROGRAM_ARCHIVED],
  [TrainingProgramStatus.PROGRAM_ARCHIVED]: [],
};

const SESSION_TRANSITIONS: Record<TrainingSessionStatus, readonly TrainingSessionStatus[]> = {
  [TrainingSessionStatus.SESSION_PLANNED]: [TrainingSessionStatus.SESSION_SCHEDULED],
  [TrainingSessionStatus.SESSION_SCHEDULED]: [
    TrainingSessionStatus.SESSION_IN_PROGRESS,
    TrainingSessionStatus.SESSION_POSTPONED,
    TrainingSessionStatus.SESSION_CANCELED,
  ],
  [TrainingSessionStatus.SESSION_POSTPONED]: [
    TrainingSessionStatus.SESSION_SCHEDULED,
    TrainingSessionStatus.SESSION_CANCELED,
  ],
  [TrainingSessionStatus.SESSION_IN_PROGRESS]: [TrainingSessionStatus.SESSION_COMPLETED],
  [TrainingSessionStatus.SESSION_COMPLETED]: [TrainingSessionStatus.SESSION_ARCHIVED],
  [TrainingSessionStatus.SESSION_CANCELED]: [TrainingSessionStatus.SESSION_ARCHIVED],
  [TrainingSessionStatus.SESSION_ARCHIVED]: [],
};

const ENROLLMENT_TRANSITIONS: Record<
  TrainingEnrollmentStatus,
  readonly TrainingEnrollmentStatus[]
> = {
  [TrainingEnrollmentStatus.REGISTERED]: [TrainingEnrollmentStatus.APPROVAL_PENDING],
  [TrainingEnrollmentStatus.APPROVAL_PENDING]: [
    TrainingEnrollmentStatus.APPROVED,
    TrainingEnrollmentStatus.REJECTED,
  ],
  [TrainingEnrollmentStatus.APPROVED]: [
    TrainingEnrollmentStatus.PAYMENT_PENDING,
    TrainingEnrollmentStatus.ENROLLED,
  ],
  [TrainingEnrollmentStatus.PAYMENT_PENDING]: [
    TrainingEnrollmentStatus.ENROLLED,
    TrainingEnrollmentStatus.CANCELED,
  ],
  [TrainingEnrollmentStatus.ENROLLED]: [TrainingEnrollmentStatus.EVALUATED],
  [TrainingEnrollmentStatus.EVALUATED]: [
    TrainingEnrollmentStatus.INDIVIDUAL_COACHING,
    TrainingEnrollmentStatus.CERTIFICATE_ISSUED,
  ],
  [TrainingEnrollmentStatus.INDIVIDUAL_COACHING]: [TrainingEnrollmentStatus.CERTIFICATE_ISSUED],
  [TrainingEnrollmentStatus.CERTIFICATE_ISSUED]: [TrainingEnrollmentStatus.SATISFACTION_RECORDED],
  [TrainingEnrollmentStatus.SATISFACTION_RECORDED]: [TrainingEnrollmentStatus.FOLLOW_UP],
  [TrainingEnrollmentStatus.FOLLOW_UP]: [TrainingEnrollmentStatus.CLOSED],
  [TrainingEnrollmentStatus.CLOSED]: [],
  [TrainingEnrollmentStatus.REJECTED]: [],
  [TrainingEnrollmentStatus.CANCELED]: [],
};

const PARTICIPATION_TRANSITIONS: Record<
  TrainingSessionParticipationStatus,
  readonly TrainingSessionParticipationStatus[]
> = {
  [TrainingSessionParticipationStatus.EXPECTED]: [
    TrainingSessionParticipationStatus.ATTENDED,
    TrainingSessionParticipationStatus.ABSENT,
    TrainingSessionParticipationStatus.EXCUSED,
  ],
  [TrainingSessionParticipationStatus.ATTENDED]: [
    TrainingSessionParticipationStatus.SESSION_OUTCOME_RECORDED,
  ],
  [TrainingSessionParticipationStatus.ABSENT]: [
    TrainingSessionParticipationStatus.SESSION_OUTCOME_RECORDED,
  ],
  [TrainingSessionParticipationStatus.EXCUSED]: [
    TrainingSessionParticipationStatus.SESSION_OUTCOME_RECORDED,
  ],
  [TrainingSessionParticipationStatus.SESSION_OUTCOME_RECORDED]: [
    TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED,
  ],
  [TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED]: [],
};

/** Enrollment states that still occupy the participant's active program slot. */
export const TERMINAL_ENROLLMENT_STATUSES: readonly TrainingEnrollmentStatus[] = [
  TrainingEnrollmentStatus.CLOSED,
  TrainingEnrollmentStatus.REJECTED,
  TrainingEnrollmentStatus.CANCELED,
];

/** Session states that no longer accept schedule or attendance changes. */
export const TERMINAL_SESSION_STATUSES: readonly TrainingSessionStatus[] = [
  TrainingSessionStatus.SESSION_COMPLETED,
  TrainingSessionStatus.SESSION_CANCELED,
  TrainingSessionStatus.SESSION_ARCHIVED,
];

/** Session states from which an authorized reschedule is meaningful. */
export const RESCHEDULABLE_SESSION_STATUSES: readonly TrainingSessionStatus[] = [
  TrainingSessionStatus.SESSION_PLANNED,
  TrainingSessionStatus.SESSION_SCHEDULED,
  TrainingSessionStatus.SESSION_POSTPONED,
];

/** Attendance states that a correction may set. */
export const CORRECTABLE_PARTICIPATION_STATUSES: readonly TrainingSessionParticipationStatus[] = [
  TrainingSessionParticipationStatus.EXPECTED,
  TrainingSessionParticipationStatus.ATTENDED,
  TrainingSessionParticipationStatus.ABSENT,
  TrainingSessionParticipationStatus.EXCUSED,
  TrainingSessionParticipationStatus.SESSION_OUTCOME_RECORDED,
];

export function isAllowedProgramTransition(
  current: TrainingProgramStatus,
  next: TrainingProgramStatus,
): boolean {
  return (PROGRAM_TRANSITIONS[current] ?? []).includes(next);
}

export function isAllowedSessionTransition(
  current: TrainingSessionStatus,
  next: TrainingSessionStatus,
): boolean {
  return (SESSION_TRANSITIONS[current] ?? []).includes(next);
}

export function isAllowedEnrollmentTransition(
  current: TrainingEnrollmentStatus,
  next: TrainingEnrollmentStatus,
): boolean {
  return (ENROLLMENT_TRANSITIONS[current] ?? []).includes(next);
}

export function isAllowedParticipationTransition(
  current: TrainingSessionParticipationStatus,
  next: TrainingSessionParticipationStatus,
): boolean {
  return (PARTICIPATION_TRANSITIONS[current] ?? []).includes(next);
}

export function isTerminalEnrollmentStatus(status: TrainingEnrollmentStatus): boolean {
  return TERMINAL_ENROLLMENT_STATUSES.includes(status);
}

export function isTerminalSessionStatus(status: TrainingSessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status);
}
