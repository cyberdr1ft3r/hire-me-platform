import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  archiveTrainingEnrollment,
  listTrainingEnrollmentOptions,
  listTrainingEnrollmentUserOptions,
  listTrainingProgramOwnerUserOptions,
  listTrainingPrograms,
  listTrainingSessions,
  listTrainingSessionTrainerUserOptions,
  TrainingRequestError,
  updateTrainingSession,
} from './api';

const API = 'https://api.example.test';
const PROGRAM_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Training option-source API clients', () => {
  it('requests each bounded internal-user source with a trimmed search', async () => {
    const fetchMock = mockFetch(200, { users: [] });

    await listTrainingProgramOwnerUserOptions('token', { search: ' owner ' }, API);
    await listTrainingSessionTrainerUserOptions('token', PROGRAM_ID, { search: ' trainer ' }, API);
    await listTrainingEnrollmentUserOptions('token', PROGRAM_ID, { search: ' learner ' }, API);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${API}/v1/training/program-owner-user-options?search=owner`,
      `${API}/v1/training/programs/${PROGRAM_ID}/session-trainer-user-options?search=trainer`,
      `${API}/v1/training/programs/${PROGRAM_ID}/enrollment-user-options?search=learner`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    }
  });

  it('keeps only safe user fields and validates a query before fetching', async () => {
    const fetchMock = mockFetch(200, {
      users: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'Safe User',
          email: 'safe@example.test',
          roles: ['ADMIN'],
          locale: 'fr',
        },
      ],
    });
    await expect(listTrainingProgramOwnerUserOptions('token', {}, API)).resolves.toEqual({
      users: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'Safe User',
          email: 'safe@example.test',
        },
      ],
    });

    vi.unstubAllGlobals();
    const invalidFetch = mockFetch(200, { users: [] });
    await expect(
      listTrainingProgramOwnerUserOptions('token', { search: 'x'.repeat(121) }, API),
    ).rejects.toThrow();
    expect(invalidFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requests typed enrollment options and preserves only participant presentation', async () => {
    const fetchMock = mockFetch(200, {
      enrollments: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          participantType: 'USER',
          participant: { displayName: 'Learner', email: null, userId: 'hidden' },
        },
      ],
    });

    await expect(
      listTrainingEnrollmentOptions(
        'token',
        PROGRAM_ID,
        SESSION_ID,
        { search: ' learner ', participantType: 'USER' },
        API,
      ),
    ).resolves.toEqual({
      enrollments: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          participantType: 'USER',
          participant: { displayName: 'Learner', email: null },
        },
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API}/v1/training/programs/${PROGRAM_ID}/sessions/${SESSION_ID}/enrollment-options?search=learner&participantType=USER`,
    );
  });

  it('surfaces permission denials', async () => {
    mockFetch(403, { error: { code: 'FORBIDDEN' } });
    await expect(listTrainingProgramOwnerUserOptions('token', {}, API)).rejects.toThrow(
      'status 403',
    );
  });
});

describe('Training workspace API clients', () => {
  const SESSION = {
    id: SESSION_ID,
    trainingProgramId: PROGRAM_ID,
    title: 'Synthetic session',
    sequence: null,
    scheduledAt: '2026-09-10T09:00:00.000Z',
    scheduledEndAt: '2026-09-10T12:00:00.000Z',
    deliveryMode: 'REMOTE',
    trainerUserId: null,
    trainerDisplayName: null,
    location: null,
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
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };

  it('carries the stable error code and status on a failed request, without the server text', async () => {
    mockFetch(409, {
      error: { code: 'TRAINING_PROGRAM_CLOSED', message: 'Server wording never shown.' },
    });
    const failure = await listTrainingPrograms({ accessToken: 'token', apiBaseUrl: API }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TrainingRequestError);
    expect(failure).toMatchObject({ code: 'TRAINING_PROGRAM_CLOSED', status: 409 });
    expect((failure as Error).message).toBe('Training request failed with status 409');
  });

  it('keeps a failure without a stable code as status-only', async () => {
    mockFetch(500, { message: 'Unstructured.' });
    await expect(
      listTrainingPrograms({ accessToken: 'token', apiBaseUrl: API }),
    ).rejects.toMatchObject({ code: null, status: 500 });
  });

  it('sends every session filter the workspace offers', async () => {
    const fetchMock = mockFetch(200, {
      sessions: [],
      pagination: { page: 2, pageSize: 10, total: 11 },
    });
    await listTrainingSessions({
      accessToken: 'token',
      apiBaseUrl: API,
      programId: PROGRAM_ID,
      page: 2,
      pageSize: 10,
      search: 'induction',
      status: 'SESSION_SCHEDULED',
      trainerUserId: '33333333-3333-4333-8333-333333333333',
      deliveryMode: 'REMOTE',
      scheduledFrom: '2026-09-01T00:00:00.000Z',
      scheduledTo: '2026-09-30T23:59:59.999Z',
      includeArchived: true,
    });
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe(`/v1/training/programs/${PROGRAM_ID}/sessions`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      pageSize: '10',
      search: 'induction',
      status: 'SESSION_SCHEDULED',
      trainerUserId: '33333333-3333-4333-8333-333333333333',
      deliveryMode: 'REMOTE',
      scheduledFrom: '2026-09-01T00:00:00.000Z',
      scheduledTo: '2026-09-30T23:59:59.999Z',
      includeArchived: 'true',
    });
  });

  it('patches session details and archives an enrollment through their own routes', async () => {
    const fetchMock = mockFetch(200, { session: SESSION });
    await updateTrainingSession('token', PROGRAM_ID, SESSION_ID, { title: 'Renamed' }, API);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API}/v1/training/programs/${PROGRAM_ID}/sessions/${SESSION_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed' }),
    });

    vi.unstubAllGlobals();
    const archiveFetch = mockFetch(403, { error: { code: 'FORBIDDEN' } });
    await expect(
      archiveTrainingEnrollment('token', PROGRAM_ID, SESSION_ID, API),
    ).rejects.toMatchObject({ status: 403 });
    expect(archiveFetch.mock.calls[0]?.[0]).toBe(
      `${API}/v1/training/programs/${PROGRAM_ID}/enrollments/${SESSION_ID}/archive`,
    );
    expect(archiveFetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });
});
