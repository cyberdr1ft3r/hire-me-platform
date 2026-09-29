import { afterEach, describe, expect, it, vi } from 'vitest';

import { listMissionAssignmentUserOptions, listMissionCandidates } from './api';

const API = 'https://api.example.test';
const MISSION_ID = '33333333-3333-4333-8333-333333333333';

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

describe('listMissionAssignmentUserOptions', () => {
  it('requests the mission-scoped option source and keeps only safe option fields', async () => {
    const fetchMock = mockFetch(200, {
      users: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'Omar Tazi',
          email: 'omar.tazi@example.test',
          roles: ['ADMIN'],
        },
      ],
    });

    const result = await listMissionAssignmentUserOptions(
      'token-1',
      MISSION_ID,
      { search: ' omar ', role: 'RECRUITER' },
      API,
    );

    expect(result).toEqual({
      users: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'Omar Tazi',
          email: 'omar.tazi@example.test',
        },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${API}/v1/missions/${MISSION_ID}/assignment-user-options?search=omar&role=RECRUITER`,
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
    expect(init?.method).toBeUndefined();
  });

  it('omits the query string when no filter is given', async () => {
    const fetchMock = mockFetch(200, { users: [] });
    await listMissionAssignmentUserOptions('token-1', MISSION_ID, {}, API);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${API}/v1/missions/${MISSION_ID}/assignment-user-options`,
    );
  });

  it('rejects an invalid query before any request and surfaces denied responses', async () => {
    const fetchMock = mockFetch(403, { error: { code: 'FORBIDDEN' } });
    await expect(
      listMissionAssignmentUserOptions('token-1', MISSION_ID, { search: 'x'.repeat(121) }, API),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(listMissionAssignmentUserOptions('token-1', MISSION_ID, {}, API)).rejects.toThrow(
      'status 403',
    );
  });
});

describe('listMissionCandidates', () => {
  it('requests the given page and keeps the pagination metadata', async () => {
    const fetchMock = mockFetch(200, {
      candidates: [],
      pagination: { page: 2, pageSize: 20, total: 25 },
    });

    const result = await listMissionCandidates(
      'token-1',
      MISSION_ID,
      { page: 2, pageSize: 20 },
      API,
    );

    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${API}/v1/missions/${MISSION_ID}/candidates?page=2&pageSize=20`,
    );
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 25 });
  });

  it('keeps the unpaged call used by other workspaces', async () => {
    const fetchMock = mockFetch(200, {
      candidates: [],
      pagination: { page: 1, pageSize: 20, total: 0 },
    });
    await listMissionCandidates('token-1', MISSION_ID, {}, API);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${API}/v1/missions/${MISSION_ID}/candidates`);
  });
});
