import type {
  TrainingEnrollmentSummary,
  TrainingParticipationSummary,
  TrainingProgramSummary,
  TrainingSessionSummary,
} from '@hire-me/contracts';
import { vi } from 'vitest';

/** Synthetic fixtures for Training tests. No real person, client, or program is represented. */

export const ACTOR_ID = '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a';
export const OWNER_ID = '1b1b1b1b-1b1b-41b1-81b1-1b1b1b1b1b1b';
export const TRAINER_ID = '1c1c1c1c-1c1c-41c1-81c1-1c1c1c1c1c1c';
export const LEARNER_ID = '1d1d1d1d-1d1d-41d1-81d1-1d1d1d1d1d1d';
export const CLIENT_ID = '2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a';
export const CONTACT_ID = '2b2b2b2b-2b2b-42b2-82b2-2b2b2b2b2b2b';
export const CANDIDATE_ID = '2c2c2c2c-2c2c-42c2-82c2-2c2c2c2c2c2c';
export const PROGRAM_A_ID = '3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a';
export const PROGRAM_B_ID = '3b3b3b3b-3b3b-43b3-83b3-3b3b3b3b3b3b';
export const SESSION_A_ID = '4a4a4a4a-4a4a-44a4-84a4-4a4a4a4a4a4a';
export const SESSION_B_ID = '4b4b4b4b-4b4b-44b4-84b4-4b4b4b4b4b4b';
export const ENROLLMENT_A_ID = '5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5a5a';
export const ENROLLMENT_B_ID = '5b5b5b5b-5b5b-45b5-85b5-5b5b5b5b5b5b';
export const PARTICIPATION_A_ID = '6a6a6a6a-6a6a-46a6-86a6-6a6a6a6a6a6a';
export const DOCUMENT_ID = '7a7a7a7a-7a7a-47a7-87a7-7a7a7a7a7a7a';
export const VERSION_ID = '7b7b7b7b-7b7b-47b7-87b7-7b7b7b7b7b7b';

/** Every fixture ID, so a test can prove none of them is ever rendered as text. */
export const FIXTURE_IDS = [
  ACTOR_ID,
  OWNER_ID,
  TRAINER_ID,
  LEARNER_ID,
  CLIENT_ID,
  CONTACT_ID,
  CANDIDATE_ID,
  PROGRAM_A_ID,
  PROGRAM_B_ID,
  SESSION_A_ID,
  SESSION_B_ID,
  ENROLLMENT_A_ID,
  ENROLLMENT_B_ID,
  PARTICIPATION_A_ID,
  DOCUMENT_ID,
  VERSION_ID,
];

const TIMESTAMP = '2026-09-15T10:00:00.000Z';

export function syntheticProgram(
  overrides: Partial<TrainingProgramSummary> = {},
): TrainingProgramSummary {
  return {
    id: PROGRAM_A_ID,
    reference: 'TRN-A',
    name: 'Synthetic Onboarding',
    description: 'Synthetic program description.',
    targetAudience: 'Synthetic audience',
    status: 'PROGRAM_ACTIVE',
    ownerUserId: OWNER_ID,
    ownerDisplayName: 'Synthetic Owner',
    clientId: null,
    clientDisplayName: null,
    plannedStartDate: '2026-09-20T09:00:00.000Z',
    plannedEndDate: '2026-10-20T17:00:00.000Z',
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function syntheticSession(
  overrides: Partial<TrainingSessionSummary> = {},
): TrainingSessionSummary {
  return {
    id: SESSION_A_ID,
    trainingProgramId: PROGRAM_A_ID,
    title: 'Synthetic Induction',
    sequence: 1,
    scheduledAt: '2026-09-21T09:00:00.000Z',
    scheduledEndAt: '2026-09-21T12:00:00.000Z',
    deliveryMode: 'ONSITE',
    trainerUserId: TRAINER_ID,
    trainerDisplayName: 'Synthetic Trainer',
    location: 'Synthetic Room',
    meetingUrl: null,
    status: 'SESSION_SCHEDULED',
    outcome: null,
    rescheduleCount: 0,
    previousScheduledAt: null,
    lastRescheduledAt: null,
    lastRescheduleReason: null,
    canceledAt: null,
    cancellationReason: null,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function syntheticEnrollment(
  overrides: Partial<TrainingEnrollmentSummary> = {},
): TrainingEnrollmentSummary {
  return {
    id: ENROLLMENT_A_ID,
    trainingProgramId: PROGRAM_A_ID,
    participantType: 'CANDIDATE',
    participant: {
      candidateId: CANDIDATE_ID,
      userId: null,
      clientContactId: null,
      externalTrainingParticipantId: null,
    },
    participantDisplay: { displayName: 'Synthetic Candidate', email: 'candidate@example.test' },
    status: 'ENROLLED',
    enrolledAt: TIMESTAMP,
    withdrawnAt: null,
    withdrawalReason: null,
    completedAt: null,
    certificateStatus: 'PENDING',
    certificateReady: false,
    createdByUserId: ACTOR_ID,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

/** A client-contact enrollment the actor may not see: the display is redacted server-side. */
export function restrictedEnrollment(): TrainingEnrollmentSummary {
  return syntheticEnrollment({
    id: ENROLLMENT_B_ID,
    participantType: 'CLIENT_CONTACT',
    participant: {
      candidateId: null,
      userId: null,
      clientContactId: CONTACT_ID,
      externalTrainingParticipantId: null,
    },
    participantDisplay: null,
  });
}

export function syntheticParticipation(
  overrides: Partial<TrainingParticipationSummary> = {},
): TrainingParticipationSummary {
  return {
    id: PARTICIPATION_A_ID,
    trainingSessionId: SESSION_A_ID,
    trainingEnrollmentId: ENROLLMENT_A_ID,
    enrollment: {
      id: ENROLLMENT_A_ID,
      participantType: 'CANDIDATE',
      participantDisplay: { displayName: 'Synthetic Candidate', email: 'candidate@example.test' },
    },
    status: 'EXPECTED',
    attendanceRecordedAt: null,
    recordedByUserId: null,
    sessionOutcome: null,
    completionStatus: null,
    trainerNotes: null,
    correctionCount: 0,
    lastCorrectedAt: null,
    lastCorrectionReason: null,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function page<Key extends string, Item>(
  key: Key,
  items: Item[],
  options: { page?: number; pageSize?: number; total?: number } = {},
) {
  return {
    [key]: items,
    pagination: {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      total: options.total ?? items.length,
    },
  } as Record<Key, Item[]> & { pagination: { page: number; pageSize: number; total: number } };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string): Response {
  return jsonResponse({ error: { code, message: 'Synthetic failure.' } }, status);
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T = Response>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export interface RecordedCall {
  authorization: string | null;
  body: Record<string, unknown> | null;
  method: string;
  path: string;
  search: URLSearchParams;
}

/**
 * Routes every `fetch` to `handler` by method and pathname. An unrouted
 * request rejects, so a test fails loudly on a read it did not expect.
 */
export function mockTrainingApi(
  handler: (call: RecordedCall) => Promise<Response> | Response | undefined,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const rawBody = typeof init?.body === 'string' ? init.body : null;
    const call: RecordedCall = {
      authorization: new Headers(init?.headers).get('Authorization'),
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
    };
    calls.push(call);
    const response = handler(call);
    return response === undefined
      ? Promise.reject(new Error(`Unexpected request ${call.method} ${call.path}`))
      : Promise.resolve(response);
  });
  return calls;
}

export const READ_ONLY = [
  'training_programs:view',
  'training_sessions:view',
  'training_enrollments:view',
  'training_participation:view',
];

export const FULL_ACCESS = [
  ...READ_ONLY,
  'training_programs:manage',
  'training_programs:status:manage',
  'training_programs:archive',
  'training_sessions:manage',
  'training_sessions:archive',
  'training_enrollments:manage',
  'training_participation:manage',
  'training_participation:correct',
  'training_participation:archive',
  'clients:view',
  'client_contacts:view',
  'candidates:view',
  'documents:generate',
  'documents:view',
  'documents:download',
];
