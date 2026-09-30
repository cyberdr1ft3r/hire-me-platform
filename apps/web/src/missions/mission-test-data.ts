import type {
  InterviewSummary,
  MissionAssignmentSummary,
  MissionCandidateSummary,
  MissionSummary,
  OfferAggregate,
} from '@hire-me/contracts';
import { vi } from 'vitest';

/** Synthetic fixtures for Missions tests. No real person, client, or dataset is represented. */

export const ACTOR_ID = '12121212-1212-4121-8121-121212121212';
export const MISSION_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MISSION_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const CLIENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const RECRUITER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const TIMESTAMP = '2026-09-15T10:00:00.000Z';

export function syntheticMission(
  id: string,
  title: string,
  overrides: Partial<MissionSummary> = {},
): MissionSummary {
  return {
    id,
    clientId: CLIENT_ID,
    clientName: 'Synthetic Client',
    title,
    description: `${title} description`,
    requirements: null,
    state: 'ACTIVE',
    priority: 'NORMAL',
    numberOfPositions: 1,
    filledPlacementCount: 0,
    location: 'Paris',
    workArrangement: 'Hybrid',
    engagementType: 'CDI',
    targetStartDate: null,
    applicationDeadline: null,
    commercial: null,
    closureReason: null,
    closedAt: null,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

/** Distinct IDs per mission, so one mission's rows never collide with another's. */
function scopedId(missionId: string, suffix: string): string {
  return `${missionId.slice(0, 24)}${suffix}`;
}

export function syntheticAssignment(
  missionId: string,
  userDisplayName: string,
  overrides: Partial<MissionAssignmentSummary> = {},
): MissionAssignmentSummary {
  return {
    id: scopedId(missionId, '000000000001'),
    missionId,
    userId: RECRUITER_ID,
    userDisplayName,
    role: 'LEAD_RECRUITER',
    status: 'ACTIVE',
    isLead: true,
    assignedAt: TIMESTAMP,
    endedAt: null,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function syntheticProcess(
  missionId: string,
  candidateName: string,
  overrides: Partial<MissionCandidateSummary> = {},
): MissionCandidateSummary {
  const candidateId = scopedId(missionId, '000000000088');
  return {
    id: scopedId(missionId, '000000000099'),
    missionId,
    candidateId,
    candidate: {
      id: candidateId,
      displayName: candidateName,
      firstName: candidateName.split(' ')[0] ?? candidateName,
      lastName: candidateName.split(' ').slice(1).join(' ') || 'Candidate',
      email: 'synthetic-candidate@example.test',
      normalizedEmail: 'synthetic-candidate@example.test',
      phone: null,
      city: null,
      country: null,
      currentJobTitle: null,
      professionalSummary: null,
      linkedinUrl: null,
      status: 'ACTIVE',
      source: null,
      sourceDetail: null,
      availabilityNotice: null,
      compensation: null,
      consent: null,
      archivedAt: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    responsibleRecruiterUserId: RECRUITER_ID,
    responsibleRecruiterDisplayName: 'Synthetic Recruiter',
    state: 'CLIENT_OFFER',
    rank: null,
    source: 'MANUAL',
    sourceContext: null,
    priority: 'NORMAL',
    internalNotes: null,
    outcomeReason: null,
    clientVisible: false,
    presentedAt: null,
    placementConfirmedAt: null,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function syntheticOffer(
  process: MissionCandidateSummary,
  contractType: string,
  status: OfferAggregate['versions'][number]['status'] = 'DRAFT',
): OfferAggregate {
  const offerId = scopedId(process.missionId, '000000000011');
  const versionId = scopedId(process.missionId, '000000000022');
  return {
    id: offerId,
    missionId: process.missionId,
    missionCandidateId: process.id,
    currentVersionId: versionId,
    versions: [
      {
        id: versionId,
        offerId,
        missionId: process.missionId,
        missionCandidateId: process.id,
        versionNumber: 1,
        status,
        isCurrent: true,
        offeredSalaryAmountCents: 900_000,
        offeredSalaryCurrency: 'MAD',
        contractType,
        proposedStartDate: null,
        probationPeriod: null,
        bonuses: null,
        benefits: null,
        allowances: null,
        compensationNotes: null,
        clientFacingRemarks: null,
        internalRecruiterRemarks: null,
        sentAt: null,
        responseRecordedAt: null,
        responseReason: null,
        withdrawnAt: null,
        withdrawalReason: null,
        expiresAt: null,
        expiredAt: null,
        archivedAt: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    history: [],
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

export function syntheticInterview(
  process: MissionCandidateSummary,
  organizerDisplayName: string,
): InterviewSummary {
  return {
    id: scopedId(process.missionId, '000000000033'),
    missionCandidateId: process.id,
    type: 'HR',
    scheduledStartAt: '2026-09-20T09:00:00.000Z',
    scheduledEndAt: '2026-09-20T10:00:00.000Z',
    timezone: 'UTC',
    format: 'VIDEO',
    location: null,
    meetingUrl: null,
    organizerUserId: RECRUITER_ID,
    organizerDisplayName,
    status: 'SCHEDULED',
    outcome: null,
    completedAt: null,
    canceledAt: null,
    postponedAt: null,
    archivedAt: null,
    participantCount: 1,
    evaluationCount: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

export function syntheticPublicOpportunity(
  missionId: string,
  overrides: Record<string, unknown> = {},
  uploadRequirementOverrides: Partial<{
    certificationsEnabled: boolean;
    certificationsRequired: boolean;
    diplomasEnabled: boolean;
    diplomasRequired: boolean;
  }> = {},
) {
  return {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    missionId,
    status: 'OPEN',
    applicationLinkEnabled: true,
    listedOnWebsite: false,
    publicSlug: 'synthetic-opportunity',
    publicationStartsAt: null,
    applicationDeadline: null,
    publicTitle: 'Synthetic opportunity',
    publicSummary: null,
    publicDescription: null,
    publicLocation: null,
    publicWorkArrangement: null,
    publicEngagementType: null,
    publicExperienceLevel: null,
    publicSkills: null,
    contentLanguage: null,
    clientName: null,
    salary: null,
    showClientName: false,
    showSalary: false,
    uploadRequirements: {
      cvRequired: true,
      certificationsEnabled: false,
      certificationsRequired: false,
      diplomasEnabled: false,
      diplomasRequired: false,
      additionalAttachmentsEnabled: false,
      maxFileSizeBytes: 5_000_000,
      maxTotalUploadBytes: 12_000_000,
      allowedMimeTypes: ['application/pdf'],
      ...uploadRequirementOverrides,
    },
    consentTextVersion: 'synthetic-v1',
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function page<T>(key: string, items: T[]) {
  return { [key]: items, pagination: { page: 1, pageSize: 20, total: items.length } };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
export function mockMissionApi(
  handler: (
    call: RecordedCall,
  ) => Promise<Response> | Response | undefined,
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
