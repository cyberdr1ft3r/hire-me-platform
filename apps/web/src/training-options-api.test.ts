import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listTrainingEnrollmentOptions,
  listTrainingEnrollmentUserOptions,
  listTrainingProgramOwnerUserOptions,
  listTrainingSessionTrainerUserOptions,
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
