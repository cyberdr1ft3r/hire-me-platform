import type {
  TrainingCertificateStatus,
  TrainingDeliveryMode,
  TrainingEnrollmentStatus,
  TrainingParticipantType,
  TrainingProgramStatus,
  TrainingSessionParticipationStatus,
  TrainingSessionStatus,
} from '@hire-me/contracts';

import type { StatusTone } from '../ui/index.js';

/**
 * Presentation of the Training state machines.
 *
 * The transition tables mirror `apps/api/src/training/training.lifecycle.ts` so
 * the workspace offers only the next steps the API accepts. They never replace
 * the server check: a stale or concurrent change is still refused there.
 */

export const PROGRAM_STATUSES: readonly TrainingProgramStatus[] = [
  'PROGRAM_DRAFT',
  'PROGRAM_ACTIVE',
  'PROGRAM_CLOSED',
  'PROGRAM_ARCHIVED',
];

export const SESSION_STATUSES: readonly TrainingSessionStatus[] = [
  'SESSION_PLANNED',
  'SESSION_SCHEDULED',
  'SESSION_IN_PROGRESS',
  'SESSION_COMPLETED',
  'SESSION_POSTPONED',
  'SESSION_CANCELED',
  'SESSION_ARCHIVED',
];

export const DELIVERY_MODES: readonly TrainingDeliveryMode[] = ['ONSITE', 'REMOTE', 'HYBRID'];

export const ENROLLMENT_STATUSES: readonly TrainingEnrollmentStatus[] = [
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
];

export const PARTICIPANT_TYPES: readonly TrainingParticipantType[] = [
  'USER',
  'CANDIDATE',
  'CLIENT_CONTACT',
  'EXTERNAL',
];

export const PARTICIPATION_STATUSES: readonly TrainingSessionParticipationStatus[] = [
  'EXPECTED',
  'ATTENDED',
  'ABSENT',
  'EXCUSED',
  'SESSION_OUTCOME_RECORDED',
  'PARTICIPATION_ARCHIVED',
];

/** Program status actions; archiving is its own capability and action. */
const PROGRAM_NEXT: Record<TrainingProgramStatus, TrainingProgramStatus[]> = {
  PROGRAM_DRAFT: ['PROGRAM_ACTIVE'],
  PROGRAM_ACTIVE: ['PROGRAM_CLOSED'],
  PROGRAM_CLOSED: [],
  PROGRAM_ARCHIVED: [],
};

/** Session status actions; cancel and archive are dedicated actions. */
const SESSION_NEXT: Record<TrainingSessionStatus, TrainingSessionStatus[]> = {
  SESSION_PLANNED: ['SESSION_SCHEDULED'],
  SESSION_SCHEDULED: ['SESSION_IN_PROGRESS', 'SESSION_POSTPONED'],
  SESSION_POSTPONED: ['SESSION_SCHEDULED'],
  SESSION_IN_PROGRESS: ['SESSION_COMPLETED'],
  SESSION_COMPLETED: [],
  SESSION_CANCELED: [],
  SESSION_ARCHIVED: [],
};

/** Enrollment status actions; cancellation happens only through withdrawal. */
const ENROLLMENT_NEXT: Record<TrainingEnrollmentStatus, TrainingEnrollmentStatus[]> = {
  REGISTERED: ['APPROVAL_PENDING'],
  APPROVAL_PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAYMENT_PENDING', 'ENROLLED'],
  PAYMENT_PENDING: ['ENROLLED'],
  ENROLLED: ['EVALUATED'],
  EVALUATED: ['INDIVIDUAL_COACHING', 'CERTIFICATE_ISSUED'],
  INDIVIDUAL_COACHING: ['CERTIFICATE_ISSUED'],
  CERTIFICATE_ISSUED: ['SATISFACTION_RECORDED'],
  SATISFACTION_RECORDED: ['FOLLOW_UP'],
  FOLLOW_UP: ['CLOSED'],
  CLOSED: [],
  REJECTED: [],
  CANCELED: [],
};

/** First attendance and outcome steps; everything else is a correction. */
const PARTICIPATION_NEXT: Record<
  TrainingSessionParticipationStatus,
  TrainingSessionParticipationStatus[]
> = {
  EXPECTED: ['ATTENDED', 'ABSENT', 'EXCUSED'],
  ATTENDED: ['SESSION_OUTCOME_RECORDED'],
  ABSENT: ['SESSION_OUTCOME_RECORDED'],
  EXCUSED: ['SESSION_OUTCOME_RECORDED'],
  SESSION_OUTCOME_RECORDED: [],
  PARTICIPATION_ARCHIVED: [],
};

export const CORRECTABLE_PARTICIPATION_STATUSES: readonly TrainingSessionParticipationStatus[] = [
  'EXPECTED',
  'ATTENDED',
  'ABSENT',
  'EXCUSED',
  'SESSION_OUTCOME_RECORDED',
];

const TERMINAL_ENROLLMENT: readonly TrainingEnrollmentStatus[] = ['CLOSED', 'REJECTED', 'CANCELED'];
const TERMINAL_SESSION: readonly TrainingSessionStatus[] = [
  'SESSION_COMPLETED',
  'SESSION_CANCELED',
  'SESSION_ARCHIVED',
];
const RESCHEDULABLE_SESSION: readonly TrainingSessionStatus[] = [
  'SESSION_PLANNED',
  'SESSION_SCHEDULED',
  'SESSION_POSTPONED',
];
const ATTENDANCE_SESSION: readonly TrainingSessionStatus[] = [
  'SESSION_SCHEDULED',
  'SESSION_IN_PROGRESS',
  'SESSION_COMPLETED',
];

export function nextProgramStatuses(status: TrainingProgramStatus): TrainingProgramStatus[] {
  return PROGRAM_NEXT[status];
}

export function nextSessionStatuses(status: TrainingSessionStatus): TrainingSessionStatus[] {
  return SESSION_NEXT[status];
}

export function nextEnrollmentStatuses(
  status: TrainingEnrollmentStatus,
): TrainingEnrollmentStatus[] {
  return ENROLLMENT_NEXT[status];
}

export function nextParticipationStatuses(
  status: TrainingSessionParticipationStatus,
): TrainingSessionParticipationStatus[] {
  return PARTICIPATION_NEXT[status];
}

/** Draft and active programs accept sessions, enrollment, and attendance. */
export function programAcceptsOperations(program: {
  status: TrainingProgramStatus;
  archivedAt: string | null;
}): boolean {
  return (
    program.archivedAt === null &&
    (program.status === 'PROGRAM_DRAFT' || program.status === 'PROGRAM_ACTIVE')
  );
}

export function programEditable(program: {
  status: TrainingProgramStatus;
  archivedAt: string | null;
}): boolean {
  return program.archivedAt === null && program.status !== 'PROGRAM_ARCHIVED';
}

export function sessionEditable(session: {
  status: TrainingSessionStatus;
  archivedAt: string | null;
}): boolean {
  return session.archivedAt === null && !TERMINAL_SESSION.includes(session.status);
}

export function sessionReschedulable(session: {
  status: TrainingSessionStatus;
  archivedAt: string | null;
}): boolean {
  return session.archivedAt === null && RESCHEDULABLE_SESSION.includes(session.status);
}

export function sessionCancelable(session: {
  status: TrainingSessionStatus;
  archivedAt: string | null;
}): boolean {
  return (
    session.archivedAt === null &&
    (session.status === 'SESSION_SCHEDULED' || session.status === 'SESSION_POSTPONED')
  );
}

export function sessionArchivable(session: {
  status: TrainingSessionStatus;
  archivedAt: string | null;
}): boolean {
  return (
    session.archivedAt === null &&
    (session.status === 'SESSION_COMPLETED' || session.status === 'SESSION_CANCELED')
  );
}

export function sessionAcceptsAttendance(session: {
  status: TrainingSessionStatus;
  archivedAt: string | null;
}): boolean {
  return session.archivedAt === null && ATTENDANCE_SESSION.includes(session.status);
}

/** Linking a participant needs a session that is still being delivered. */
export function sessionAcceptsParticipants(session: {
  status: TrainingSessionStatus;
  archivedAt: string | null;
}): boolean {
  return sessionEditable(session);
}

export function enrollmentIsTerminal(enrollment: {
  status: TrainingEnrollmentStatus;
  archivedAt: string | null;
}): boolean {
  return enrollment.archivedAt !== null || TERMINAL_ENROLLMENT.includes(enrollment.status);
}

export function enrollmentArchivable(enrollment: {
  status: TrainingEnrollmentStatus;
  archivedAt: string | null;
}): boolean {
  return enrollment.archivedAt === null && TERMINAL_ENROLLMENT.includes(enrollment.status);
}

export function programStatusTone(status: TrainingProgramStatus): StatusTone {
  switch (status) {
    case 'PROGRAM_ACTIVE':
      return 'success';
    case 'PROGRAM_DRAFT':
      return 'info';
    default:
      return 'neutral';
  }
}

export function sessionStatusTone(status: TrainingSessionStatus): StatusTone {
  switch (status) {
    case 'SESSION_SCHEDULED':
    case 'SESSION_IN_PROGRESS':
      return 'info';
    case 'SESSION_COMPLETED':
      return 'success';
    case 'SESSION_POSTPONED':
      return 'warning';
    case 'SESSION_CANCELED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function enrollmentStatusTone(status: TrainingEnrollmentStatus): StatusTone {
  switch (status) {
    case 'REJECTED':
    case 'CANCELED':
      return 'danger';
    case 'APPROVAL_PENDING':
    case 'PAYMENT_PENDING':
      return 'warning';
    case 'CLOSED':
    case 'REGISTERED':
      return 'neutral';
    case 'CERTIFICATE_ISSUED':
    case 'EVALUATED':
      return 'success';
    default:
      return 'info';
  }
}

export function participationStatusTone(status: TrainingSessionParticipationStatus): StatusTone {
  switch (status) {
    case 'ATTENDED':
    case 'SESSION_OUTCOME_RECORDED':
      return 'success';
    case 'ABSENT':
      return 'danger';
    case 'EXCUSED':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function certificateStatusTone(status: TrainingCertificateStatus): StatusTone {
  switch (status) {
    case 'ISSUED':
      return 'success';
    case 'PENDING':
      return 'info';
    default:
      return 'neutral';
  }
}
