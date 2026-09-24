import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MissionsPanel } from './App.js';

const MISSION_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSION_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type DeferredResponse = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
};

describe('MissionsPanel request ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('lets a manual Mission B selection supersede a pending deep-linked Mission A', async () => {
    const missionA = syntheticMission(MISSION_A_ID, 'Mission A');
    const missionB = syntheticMission(MISSION_B_ID, 'Mission B');
    const missionADetail = deferredResponse();
    const calls: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url.includes('/v1/missions?')) {
        return Promise.resolve(missionListResponse([missionA, missionB]));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}`)) {
        return missionADetail.promise;
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}`)) {
        return Promise.resolve(jsonResponse({ mission: missionB }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}/assignments`)) {
        return Promise.resolve(
          assignmentListResponse([syntheticAssignment(MISSION_B_ID, 'Mission B Recruiter')]),
        );
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/assignments`)) {
        return Promise.resolve(
          assignmentListResponse([syntheticAssignment(MISSION_A_ID, 'Mission A Recruiter')]),
        );
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    window.history.pushState({}, '', `/missions?mission=${MISSION_A_ID}`);
    render(
      <MissionsPanel
        accessToken="token-a"
        initialMissionId={MISSION_A_ID}
        onSelectionChange={(missionId) =>
          window.history.replaceState({}, '', `/missions?mission=${missionId}`)
        }
        permissions={['missions:view', 'mission_assignments:view']}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Mission B' }));
    expect(window.location.search).toBe(`?mission=${MISSION_B_ID}`);
    expect(await screen.findByRole('heading', { level: 2, name: 'Mission B' })).toBeVisible();
    expect(await screen.findByText(/Mission B Recruiter/)).toBeVisible();

    await settle(missionADetail, jsonResponse({ mission: missionA }));

    expect(screen.getByRole('heading', { level: 2, name: 'Mission B' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Mission A' })).toBeNull();
    expect(screen.queryByText(/Mission A Recruiter/)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(calls.filter((url) => url.endsWith(`/${MISSION_A_ID}/assignments`))).toHaveLength(0);
  });

  it('stops an old-token Mission chain after session replacement and lets the new session load', async () => {
    const missionA = syntheticMission(MISSION_A_ID, 'Mission A');
    const missionB = syntheticMission(MISSION_B_ID, 'Mission B');
    const missionAAssignments = deferredResponse();
    const calls: Array<{ authorization: string | null; url: string }> = [];
    const permissions = [
      'missions:view',
      'mission_assignments:view',
      'mission_candidates:view',
      'public_opportunities:view',
      'public_applications:view',
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const authorization = new Headers(init?.headers).get('Authorization');
      calls.push({ authorization, url });
      if (url.includes('/v1/missions?')) {
        return Promise.resolve(
          missionListResponse(authorization === 'Bearer token-a' ? [missionA] : [missionB]),
        );
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}`)) {
        return Promise.resolve(jsonResponse({ mission: missionA }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/assignments`)) {
        return missionAAssignments.promise;
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}`)) {
        return Promise.resolve(jsonResponse({ mission: missionB }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}/assignments`)) {
        return Promise.resolve(assignmentListResponse([]));
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}/candidates`)) {
        return Promise.resolve(missionCandidateListResponse());
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}/public-opportunity`)) {
        return Promise.resolve(
          jsonResponse({ publicOpportunity: syntheticPublicOpportunity(MISSION_B_ID) }),
        );
      }
      if (url.endsWith(`/v1/missions/${MISSION_B_ID}/public-opportunity/applications`)) {
        return Promise.resolve(jsonResponse({ applications: [] }));
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    const view = render(
      <MissionsPanel
        accessToken="token-a"
        initialMissionId={MISSION_A_ID}
        onSelectionChange={() => undefined}
        permissions={permissions}
      />,
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Mission A' })).toBeVisible();
    expect(
      calls.some(({ authorization, url }) =>
        Boolean(
          authorization === 'Bearer token-a' &&
          url.endsWith(`/v1/missions/${MISSION_A_ID}/assignments`),
        ),
      ),
    ).toBe(true);

    view.rerender(
      <MissionsPanel
        accessToken="token-b"
        initialMissionId={MISSION_A_ID}
        onSelectionChange={() => undefined}
        permissions={permissions}
      />,
    );
    expect(screen.queryByRole('heading', { level: 2, name: 'Mission A' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Mission B' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Mission B' })).toBeVisible();

    await settle(missionAAssignments, assignmentListResponse([]));

    const oldTokenFollowUps = calls.filter(
      ({ authorization, url }) =>
        authorization === 'Bearer token-a' &&
        (url.endsWith(`/v1/missions/${MISSION_A_ID}/candidates`) ||
          url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity`) ||
          url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity/applications`)),
    );
    expect(oldTokenFollowUps).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Mission B' })).toBeVisible();
    expect(
      calls.some(
        ({ authorization, url }) =>
          authorization === 'Bearer token-b' && url.endsWith(`/v1/missions/${MISSION_B_ID}`),
      ),
    ).toBe(true);
  });

  it('discards Mission detail and nested data when permissions change on the mounted workspace', async () => {
    const missionA = syntheticMission(MISSION_A_ID, 'Mission A');
    const opportunity = deferredResponse();
    const calls: string[] = [];
    const fullPermissions = [
      'missions:view',
      'mission_assignments:view',
      'mission_candidates:view',
      'public_opportunities:view',
      'public_applications:view',
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url.includes('/v1/missions?')) {
        return Promise.resolve(missionListResponse([missionA]));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}`)) {
        return Promise.resolve(jsonResponse({ mission: missionA }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/assignments`)) {
        return Promise.resolve(
          assignmentListResponse([syntheticAssignment(MISSION_A_ID, 'Prior Recruiter')]),
        );
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/candidates`)) {
        return Promise.resolve(missionCandidateListResponse('Prior Candidate'));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity`)) {
        return opportunity.promise;
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity/applications`)) {
        return Promise.resolve(jsonResponse({ applications: [] }));
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    const view = render(
      <MissionsPanel
        accessToken="same-token"
        initialMissionId={MISSION_A_ID}
        onSelectionChange={() => undefined}
        permissions={fullPermissions}
      />,
    );
    expect(await screen.findByText(/Prior Candidate/)).toBeVisible();
    expect(screen.getAllByText(/Prior Recruiter/)).not.toHaveLength(0);

    view.rerender(
      <MissionsPanel
        accessToken="same-token"
        initialMissionId={MISSION_A_ID}
        onSelectionChange={() => undefined}
        permissions={['missions:view']}
      />,
    );
    expect(screen.queryByRole('heading', { level: 2, name: 'Mission A' })).toBeNull();
    expect(screen.queryByText(/Prior Recruiter/)).toBeNull();
    expect(screen.queryByText(/Prior Candidate/)).toBeNull();

    await settle(
      opportunity,
      jsonResponse({ publicOpportunity: syntheticPublicOpportunity(MISSION_A_ID) }),
    );

    expect(screen.queryByRole('heading', { level: 2, name: 'Mission A' })).toBeNull();
    expect(screen.queryByText(/Prior Recruiter/)).toBeNull();
    expect(screen.queryByText(/Prior Candidate/)).toBeNull();
    expect(
      calls.filter((url) =>
        url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity/applications`),
      ),
    ).toHaveLength(0);
  });

  it('shows one generic unavailable state and starts no nested reads for a hidden deep-linked Mission', async () => {
    const calls: string[] = [];
    const hiddenDetail = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url.includes('/v1/missions?')) {
        return Promise.resolve(missionListResponse([]));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}`)) {
        return hiddenDetail.promise;
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(
      <MissionsPanel
        accessToken="limited-token"
        initialMissionId={MISSION_A_ID}
        onSelectionChange={() => undefined}
        permissions={[
          'missions:view',
          'mission_assignments:view',
          'mission_candidates:view',
          'public_opportunities:view',
          'public_applications:view',
        ]}
      />,
    );

    expect(calls.some((url) => url.endsWith(`/v1/missions/${MISSION_A_ID}`))).toBe(true);
    await settle(
      hiddenDetail,
      jsonResponse(
        { code: 'MISSION_NOT_FOUND', message: `Classified detail for ${MISSION_A_ID}` },
        404,
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Mission unavailable.');
    expect(screen.queryByText(/Classified detail/)).toBeNull();
    expect(screen.queryByText(MISSION_A_ID)).toBeNull();
    expect(
      calls.filter(
        (url) =>
          url.endsWith(`/v1/missions/${MISSION_A_ID}/assignments`) ||
          url.endsWith(`/v1/missions/${MISSION_A_ID}/candidates`) ||
          url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity`) ||
          url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity/applications`),
      ),
    ).toHaveLength(0);
  });

  it('clears required flags in the submitted configuration when staff disables upload categories', async () => {
    const mission = syntheticMission(MISSION_A_ID, 'Mission A');
    const opportunity = syntheticPublicOpportunity(MISSION_A_ID, {
      certificationsEnabled: true,
      certificationsRequired: true,
      diplomasEnabled: true,
      diplomasRequired: true,
    });
    const patchBodies: Array<Record<string, unknown>> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      if (url.includes('/v1/missions?')) {
        return Promise.resolve(missionListResponse([mission]));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}`)) {
        return Promise.resolve(jsonResponse({ mission }));
      }
      if (url.endsWith(`/v1/missions/${MISSION_A_ID}/public-opportunity`)) {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as Record<
            string,
            unknown
          >;
          patchBodies.push(body);
          return Promise.resolve(
            jsonResponse({
              publicOpportunity: {
                ...opportunity,
                uploadRequirements: {
                  ...opportunity.uploadRequirements,
                  certificationsEnabled: body.certificationsEnabled,
                  certificationsRequired: body.certificationsRequired,
                  diplomasEnabled: body.diplomasEnabled,
                  diplomasRequired: body.diplomasRequired,
                },
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse({ publicOpportunity: opportunity }));
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(
      <MissionsPanel
        accessToken="staff-token"
        initialMissionId={null}
        onSelectionChange={() => undefined}
        permissions={['missions:view', 'public_opportunities:view', 'public_opportunities:manage']}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Mission A' }));
    const certificationEnabled = await screen.findByRole('checkbox', {
      name: 'Certifications enabled',
    });
    const certificationRequired = screen.getByRole('checkbox', {
      name: 'Certifications required',
    });
    const diplomaEnabled = screen.getByRole('checkbox', { name: 'Diplomas enabled' });
    const diplomaRequired = screen.getByRole('checkbox', { name: 'Diplomas required' });
    expect(certificationRequired).toBeChecked();
    expect(diplomaRequired).toBeChecked();

    fireEvent.click(certificationEnabled);
    fireEvent.click(diplomaEnabled);
    fireEvent.click(screen.getByRole('button', { name: 'Save public opportunity' }));

    expect(await screen.findByText('Public opportunity configuration saved.')).toBeVisible();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual(
      expect.objectContaining({
        certificationsEnabled: false,
        certificationsRequired: false,
        diplomasEnabled: false,
        diplomasRequired: false,
      }),
    );
  });
});

function syntheticMission(id: string, title: string) {
  return {
    id,
    clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
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
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };
}

function syntheticAssignment(missionId: string, userDisplayName: string) {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    missionId,
    userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    userDisplayName,
    role: 'RECRUITER',
    status: 'ACTIVE',
    isLead: true,
    assignedAt: '2026-09-15T10:00:00.000Z',
    endedAt: null,
    archivedAt: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };
}

function missionListResponse(missions: unknown[]): Response {
  return jsonResponse({
    missions,
    pagination: { page: 1, pageSize: 20, total: missions.length },
  });
}

function assignmentListResponse(assignments: unknown[]): Response {
  return jsonResponse({
    assignments,
    pagination: { page: 1, pageSize: 20, total: assignments.length },
  });
}

function missionCandidateListResponse(candidateName?: string): Response {
  return jsonResponse({
    candidates: candidateName
      ? [
          {
            id: '99999999-9999-4999-8999-999999999999',
            missionId: MISSION_A_ID,
            candidateId: '88888888-8888-4888-8888-888888888888',
            candidate: {
              id: '88888888-8888-4888-8888-888888888888',
              displayName: candidateName,
              firstName: 'Prior',
              lastName: 'Candidate',
              email: 'prior@example.test',
              normalizedEmail: 'prior@example.test',
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
              createdAt: '2026-09-15T10:00:00.000Z',
              updatedAt: '2026-09-15T10:00:00.000Z',
            },
            responsibleRecruiterUserId: '77777777-7777-4777-8777-777777777777',
            responsibleRecruiterDisplayName: 'Prior Recruiter',
            state: 'NEW',
            rank: null,
            source: 'MANUAL',
            sourceContext: null,
            priority: 'NORMAL',
            internalNotes: null,
            outcomeReason: null,
            clientVisible: false,
            presentedAt: null,
            presentedByUserId: null,
            placementConfirmedAt: null,
            placementConfirmedByUserId: null,
            archivedAt: null,
            createdAt: '2026-09-15T10:00:00.000Z',
            updatedAt: '2026-09-15T10:00:00.000Z',
          },
        ]
      : [],
    pagination: { page: 1, pageSize: 20, total: candidateName ? 1 : 0 },
  });
}

function syntheticPublicOpportunity(
  missionId: string,
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
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };
}

function deferredResponse(): DeferredResponse {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settlePromise) => {
    resolve = settlePromise;
  });
  return { promise, resolve };
}

async function settle(deferred: DeferredResponse, response: Response): Promise<void> {
  await act(async () => {
    deferred.resolve(response);
    await deferred.promise;
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}
