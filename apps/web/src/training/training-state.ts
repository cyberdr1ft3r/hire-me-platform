import type {
  TrainingDeliveryMode,
  TrainingEnrollmentStatus,
  TrainingParticipantType,
  TrainingProgramCreateRequest,
  TrainingProgramStatus,
  TrainingProgramSummary,
  TrainingProgramUpdateRequest,
  TrainingSessionCreateRequest,
  TrainingSessionParticipationStatus,
  TrainingSessionStatus,
  TrainingSessionSummary,
  TrainingSessionUpdateRequest,
} from '@hire-me/contracts';

import { TrainingRequestError } from '../api.js';
import type { MessageKey } from '../i18n/index.js';
import {
  dateInputEndIso,
  dateInputStartIso,
  isoToLocalInput,
  localInputToIso,
} from '../tasks/task-datetime.js';

export const PROGRAM_PAGE_SIZE = 20;
export const SESSION_PAGE_SIZE = 10;
export const ENROLLMENT_PAGE_SIZE = 10;
export const PARTICIPATION_PAGE_SIZE = 20;

/**
 * A record chosen through a permission-checked option source. The label is the
 * record's own data, kept so it survives a locale switch without a refetch; the
 * ID only ever travels back to the API.
 */
export type TrainingPickerOption = {
  id: string;
  label: string;
  detail: string | null;
  participantType?: TrainingParticipantType;
};

export type LoadTrainingOptions = (search: string) => Promise<TrainingPickerOption[]>;

export type ListState<Item> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Item[]; page: number; pageSize: number; total: number };

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** `me` filters on the signed-in account without ever showing its identifier. */
export type PersonScope = 'any' | 'me' | 'selected';

export type ProgramSort = 'recent' | 'name' | 'reference' | 'plannedStart';

export type ProgramFilterValues = {
  search: string;
  status: '' | TrainingProgramStatus;
  includeArchived: boolean;
  client: TrainingPickerOption | null;
  ownerScope: PersonScope;
  owner: TrainingPickerOption | null;
  sort: ProgramSort;
};

export const EMPTY_PROGRAM_FILTERS: ProgramFilterValues = {
  search: '',
  status: '',
  includeArchived: false,
  client: null,
  ownerScope: 'any',
  owner: null,
  sort: 'recent',
};

export type ProgramListQuery = { filters: ProgramFilterValues; page: number };

export const FIRST_PROGRAM_PAGE: ProgramListQuery = { filters: EMPTY_PROGRAM_FILTERS, page: 1 };

export function hasActiveProgramFilters(filters: ProgramFilterValues): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== '' ||
    filters.includeArchived ||
    filters.client !== null ||
    filters.ownerScope !== 'any' ||
    filters.sort !== 'recent'
  );
}

const PROGRAM_SORT: Record<ProgramSort, { sortBy: string; sortDirection: 'asc' | 'desc' }> = {
  recent: { sortBy: 'createdAt', sortDirection: 'desc' },
  name: { sortBy: 'name', sortDirection: 'asc' },
  reference: { sortBy: 'reference', sortDirection: 'asc' },
  plannedStart: { sortBy: 'plannedStartDate', sortDirection: 'asc' },
};

function personFilter(
  scope: PersonScope,
  selected: TrainingPickerOption | null,
  actorUserId: string,
): string | undefined {
  if (scope === 'me') return actorUserId;
  if (scope === 'selected') return selected?.id;
  return undefined;
}

/** Only IDs chosen through a picker, or the signed-in account, reach the query. */
export function toProgramListParameters(filters: ProgramFilterValues, actorUserId: string) {
  return {
    search: filters.search.trim() || undefined,
    status: filters.status || undefined,
    // Archived programs are only listed when history is requested.
    includeArchived: filters.includeArchived || filters.status === 'PROGRAM_ARCHIVED' || undefined,
    clientId: filters.client?.id,
    ownerUserId: personFilter(filters.ownerScope, filters.owner, actorUserId),
    ...PROGRAM_SORT[filters.sort],
  };
}

export type SessionFilterValues = {
  search: string;
  status: '' | TrainingSessionStatus;
  deliveryMode: '' | TrainingDeliveryMode;
  trainerScope: PersonScope;
  trainer: TrainingPickerOption | null;
  from: string;
  to: string;
  includeArchived: boolean;
};

export const EMPTY_SESSION_FILTERS: SessionFilterValues = {
  search: '',
  status: '',
  deliveryMode: '',
  trainerScope: 'any',
  trainer: null,
  from: '',
  to: '',
  includeArchived: false,
};

export type SessionListQuery = { filters: SessionFilterValues; page: number };

export const FIRST_SESSION_PAGE: SessionListQuery = { filters: EMPTY_SESSION_FILTERS, page: 1 };

export function hasActiveSessionFilters(filters: SessionFilterValues): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== '' ||
    filters.deliveryMode !== '' ||
    filters.trainerScope !== 'any' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.includeArchived
  );
}

export function toSessionListParameters(filters: SessionFilterValues, actorUserId: string) {
  return {
    search: filters.search.trim() || undefined,
    status: filters.status || undefined,
    deliveryMode: filters.deliveryMode || undefined,
    trainerUserId: personFilter(filters.trainerScope, filters.trainer, actorUserId),
    scheduledFrom: filters.from ? dateInputStartIso(filters.from) : undefined,
    scheduledTo: filters.to ? dateInputEndIso(filters.to) : undefined,
    includeArchived: filters.includeArchived || filters.status === 'SESSION_ARCHIVED' || undefined,
  };
}

export type EnrollmentFilterValues = {
  status: '' | TrainingEnrollmentStatus;
  participantType: '' | TrainingParticipantType;
  certificateReadyOnly: boolean;
  includeArchived: boolean;
};

export const EMPTY_ENROLLMENT_FILTERS: EnrollmentFilterValues = {
  status: '',
  participantType: '',
  certificateReadyOnly: false,
  includeArchived: false,
};

export type EnrollmentListQuery = { filters: EnrollmentFilterValues; page: number };

export const FIRST_ENROLLMENT_PAGE: EnrollmentListQuery = {
  filters: EMPTY_ENROLLMENT_FILTERS,
  page: 1,
};

export function hasActiveEnrollmentFilters(filters: EnrollmentFilterValues): boolean {
  return (
    filters.status !== '' ||
    filters.participantType !== '' ||
    filters.certificateReadyOnly ||
    filters.includeArchived
  );
}

export function toEnrollmentListParameters(filters: EnrollmentFilterValues) {
  return {
    status: filters.status || undefined,
    participantType: filters.participantType || undefined,
    certificateReadyOnly: filters.certificateReadyOnly || undefined,
    includeArchived: filters.includeArchived || undefined,
  };
}

export type ParticipationFilterValues = {
  status: '' | TrainingSessionParticipationStatus;
  includeArchived: boolean;
};

export const EMPTY_PARTICIPATION_FILTERS: ParticipationFilterValues = {
  status: '',
  includeArchived: false,
};

export type ParticipationListQuery = { filters: ParticipationFilterValues; page: number };

export const FIRST_PARTICIPATION_PAGE: ParticipationListQuery = {
  filters: EMPTY_PARTICIPATION_FILTERS,
  page: 1,
};

export function toParticipationListParameters(filters: ParticipationFilterValues) {
  return {
    status: filters.status || undefined,
    includeArchived:
      filters.includeArchived || filters.status === 'PARTICIPATION_ARCHIVED' || undefined,
  };
}

export type TrainingFeedback = { tone: 'success' | 'danger'; messageKey: MessageKey };

/** One write at a time: every Training mutation takes the same lock. */
export type TrainingWriteAction =
  | 'createProgram'
  | 'updateProgram'
  | 'programStatus'
  | 'archiveProgram'
  | 'createSession'
  | 'updateSession'
  | 'sessionStatus'
  | 'rescheduleSession'
  | 'cancelSession'
  | 'archiveSession'
  | 'createEnrollment'
  | 'enrollmentStatus'
  | 'withdrawEnrollment'
  | 'certificateStatus'
  | 'archiveEnrollment'
  | 'generateCertificate'
  | 'downloadCertificate'
  | 'addParticipation'
  | 'recordAttendance'
  | 'correctAttendance'
  | 'archiveParticipation';

export type ProgramFormValues = {
  reference: string;
  name: string;
  description: string;
  targetAudience: string;
  owner: TrainingPickerOption | null;
  client: TrainingPickerOption | null;
  plannedStart: string;
  plannedEnd: string;
};

export const EMPTY_PROGRAM_FORM: ProgramFormValues = {
  reference: '',
  name: '',
  description: '',
  targetAudience: '',
  owner: null,
  client: null,
  plannedStart: '',
  plannedEnd: '',
};

export function programFormFrom(program: TrainingProgramSummary): ProgramFormValues {
  return {
    reference: program.reference,
    name: program.name,
    description: program.description ?? '',
    targetAudience: program.targetAudience ?? '',
    owner:
      program.ownerUserId && program.ownerDisplayName
        ? { id: program.ownerUserId, label: program.ownerDisplayName, detail: null }
        : null,
    client:
      program.clientId && program.clientDisplayName
        ? { id: program.clientId, label: program.clientDisplayName, detail: null }
        : null,
    plannedStart: isoToLocalInput(program.plannedStartDate),
    plannedEnd: isoToLocalInput(program.plannedEndDate),
  };
}

/** The planned window must end after it starts, as the API requires. */
export function plannedWindowInvalid(start: string, end: string): boolean {
  const from = localInputToIso(start);
  const to = localInputToIso(end);
  return from !== null && to !== null && Date.parse(to) <= Date.parse(from);
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toProgramCreateRequest(values: ProgramFormValues): TrainingProgramCreateRequest {
  return {
    reference: values.reference.trim(),
    name: values.name.trim(),
    description: optionalText(values.description),
    targetAudience: optionalText(values.targetAudience),
    ownerUserId: values.owner?.id,
    clientId: values.client?.id,
    plannedStartDate: localInputToIso(values.plannedStart) ?? undefined,
    plannedEndDate: localInputToIso(values.plannedEnd) ?? undefined,
  };
}

/**
 * Only fields the operator changed are sent, so an untouched stored instant is
 * never rewritten through a lossy local-time round trip.
 */
export function toProgramUpdateRequest(
  values: ProgramFormValues,
  program: TrainingProgramSummary,
): TrainingProgramUpdateRequest | null {
  const original = programFormFrom(program);
  const update: TrainingProgramUpdateRequest = {};
  if (values.name.trim() !== original.name) update.name = values.name.trim();
  if (values.description.trim() !== original.description.trim()) {
    update.description = nullableText(values.description);
  }
  if (values.targetAudience.trim() !== original.targetAudience.trim()) {
    update.targetAudience = nullableText(values.targetAudience);
  }
  if ((values.owner?.id ?? null) !== program.ownerUserId) {
    update.ownerUserId = values.owner?.id ?? null;
  }
  if (values.plannedStart !== original.plannedStart) {
    update.plannedStartDate = localInputToIso(values.plannedStart);
  }
  if (values.plannedEnd !== original.plannedEnd) {
    update.plannedEndDate = localInputToIso(values.plannedEnd);
  }
  return Object.keys(update).length > 0 ? update : null;
}

export type SessionFormValues = {
  title: string;
  sequence: string;
  scheduledAt: string;
  scheduledEndAt: string;
  deliveryMode: TrainingDeliveryMode;
  trainer: TrainingPickerOption | null;
  location: string;
  meetingUrl: string;
  outcome: string;
};

export const EMPTY_SESSION_FORM: SessionFormValues = {
  title: '',
  sequence: '',
  scheduledAt: '',
  scheduledEndAt: '',
  deliveryMode: 'ONSITE',
  trainer: null,
  location: '',
  meetingUrl: '',
  outcome: '',
};

export function sessionFormFrom(session: TrainingSessionSummary): SessionFormValues {
  return {
    title: session.title,
    sequence: session.sequence === null ? '' : String(session.sequence),
    scheduledAt: isoToLocalInput(session.scheduledAt),
    scheduledEndAt: isoToLocalInput(session.scheduledEndAt),
    deliveryMode: session.deliveryMode,
    trainer:
      session.trainerUserId && session.trainerDisplayName
        ? { id: session.trainerUserId, label: session.trainerDisplayName, detail: null }
        : null,
    location: session.location ?? '',
    meetingUrl: session.meetingUrl ?? '',
    outcome: session.outcome ?? '',
  };
}

export function scheduleWindowInvalid(start: string, end: string): boolean {
  const from = localInputToIso(start);
  const to = localInputToIso(end);
  return from === null || to === null || Date.parse(to) <= Date.parse(from);
}

function sequenceValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function toSessionCreateRequest(values: SessionFormValues): TrainingSessionCreateRequest {
  return {
    title: values.title.trim(),
    sequence: sequenceValue(values.sequence),
    scheduledAt: localInputToIso(values.scheduledAt) ?? '',
    scheduledEndAt: localInputToIso(values.scheduledEndAt) ?? '',
    deliveryMode: values.deliveryMode,
    trainerUserId: values.trainer?.id,
    location: optionalText(values.location),
    meetingUrl: optionalText(values.meetingUrl),
  };
}

/** Schedule changes go through reschedule, which keeps their history. */
export function toSessionUpdateRequest(
  values: SessionFormValues,
  session: TrainingSessionSummary,
): TrainingSessionUpdateRequest | null {
  const original = sessionFormFrom(session);
  const update: TrainingSessionUpdateRequest = {};
  if (values.title.trim() !== original.title) update.title = values.title.trim();
  if (values.sequence.trim() !== original.sequence) {
    update.sequence = sequenceValue(values.sequence) ?? null;
  }
  if (values.deliveryMode !== original.deliveryMode) update.deliveryMode = values.deliveryMode;
  if ((values.trainer?.id ?? null) !== session.trainerUserId) {
    update.trainerUserId = values.trainer?.id ?? null;
  }
  if (values.location.trim() !== original.location.trim()) {
    update.location = nullableText(values.location);
  }
  if (values.meetingUrl.trim() !== original.meetingUrl.trim()) {
    update.meetingUrl = nullableText(values.meetingUrl);
  }
  if (values.outcome.trim() !== original.outcome.trim()) {
    update.outcome = nullableText(values.outcome);
  }
  return Object.keys(update).length > 0 ? update : null;
}

const CODE_MESSAGES: Record<string, MessageKey> = {
  TRAINING_ATTENDANCE_ALREADY_RECORDED: 'training.feedback.failure.attendanceAlreadyRecorded',
  TRAINING_ATTENDANCE_CORRECTION_BLOCKED: 'training.feedback.failure.attendanceBlocked',
  TRAINING_ATTENDANCE_TRANSITION_BLOCKED: 'training.feedback.failure.attendanceBlocked',
  TRAINING_CERTIFICATE_ALREADY_ISSUED: 'training.feedback.failure.certificateIssued',
  TRAINING_CLIENT_CONTEXT_INVALID: 'training.feedback.failure.clientInvalid',
  TRAINING_CLIENT_SCOPE_REQUIRED: 'training.feedback.failure.scope',
  TRAINING_ENROLLMENT_ALREADY_ACTIVE: 'training.feedback.failure.alreadyEnrolled',
  TRAINING_ENROLLMENT_ARCHIVE_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_ENROLLMENT_NOT_ACTIVE: 'training.feedback.failure.enrollmentNotActive',
  TRAINING_ENROLLMENT_NOT_MUTABLE: 'training.feedback.failure.lifecycle',
  TRAINING_ENROLLMENT_STATUS_TRANSITION_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_ENROLLMENT_WITHDRAW_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_PARTICIPANT_ARCHIVED: 'training.feedback.failure.participantIneligible',
  TRAINING_PARTICIPANT_CONTEXT_MISMATCH: 'training.feedback.failure.participantContext',
  TRAINING_PARTICIPANT_INELIGIBLE: 'training.feedback.failure.participantIneligible',
  TRAINING_PARTICIPANT_NOT_FOUND: 'training.feedback.failure.participantIneligible',
  TRAINING_PARTICIPANT_SOURCE_SCOPE_REQUIRED: 'training.feedback.failure.scope',
  TRAINING_PARTICIPATION_ALREADY_EXISTS: 'training.feedback.failure.participationExists',
  TRAINING_PARTICIPATION_ARCHIVE_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_PARTICIPATION_NOT_MUTABLE: 'training.feedback.failure.lifecycle',
  TRAINING_PARTICIPATION_PROGRAM_MISMATCH: 'training.feedback.failure.enrollmentNotActive',
  TRAINING_PROGRAM_ARCHIVE_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_PROGRAM_ARCHIVED: 'training.feedback.failure.programArchived',
  TRAINING_PROGRAM_CLOSED: 'training.feedback.failure.programClosed',
  TRAINING_PROGRAM_OWNER_INELIGIBLE: 'training.feedback.failure.personIneligible',
  TRAINING_PROGRAM_PLANNED_WINDOW_INVALID: 'training.feedback.failure.window',
  TRAINING_PROGRAM_REFERENCE_TAKEN: 'training.feedback.failure.referenceTaken',
  TRAINING_PROGRAM_STATUS_TRANSITION_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_SESSION_ARCHIVE_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_SESSION_CANCEL_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_SESSION_NOT_ACCEPTING_ATTENDANCE: 'training.feedback.failure.sessionNotAccepting',
  TRAINING_SESSION_NOT_MUTABLE: 'training.feedback.failure.lifecycle',
  TRAINING_SESSION_RESCHEDULE_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_SESSION_SEQUENCE_TAKEN: 'training.feedback.failure.sequenceTaken',
  TRAINING_SESSION_STATUS_TRANSITION_BLOCKED: 'training.feedback.failure.lifecycle',
  TRAINING_SESSION_TRAINER_INELIGIBLE: 'training.feedback.failure.personIneligible',
};

/** Localized copy for a failed request, from the stable API code only. */
export function trainingFailureKey(error: unknown): MessageKey {
  if (!(error instanceof TrainingRequestError)) {
    return 'training.feedback.failure.generic';
  }
  const mapped = error.code ? CODE_MESSAGES[error.code] : undefined;
  if (mapped) return mapped;
  if (error.status === 404) return 'training.feedback.failure.notFound';
  if (error.status === 403) return 'training.feedback.failure.scope';
  if (error.status === 409) return 'training.feedback.failure.lifecycle';
  if (error.status === 400) return 'training.feedback.failure.invalid';
  return 'training.feedback.failure.generic';
}
