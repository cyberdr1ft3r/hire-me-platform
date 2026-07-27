import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('shows API health returned through the configured API client', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'hire-me-api',
          timestamp: '2026-07-21T10:00:00.000Z',
          uptimeSeconds: 1,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<App />);

    expect(
      screen.getByRole('heading', { name: /recruitment operations workspace/i }),
    ).toBeVisible();
    expect(await screen.findByText('hire-me-api is ok')).toBeVisible();
  });

  it('logs in without storing tokens in browser storage and logs out', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              service: 'hire-me-api',
              timestamp: '2026-07-21T10:00:00.000Z',
              uptimeSeconds: 1,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }

      if (url.endsWith('/auth/login')) {
        expect(init?.credentials).toBe('include');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'synthetic-access-token',
              accessTokenExpiresAt: '2026-07-21T10:05:00.000Z',
              user: {
                id: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
                displayName: 'Development Administrator',
                email: 'admin@example.test',
                permissions: ['records:view'],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/auth/logout')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe(
          'Bearer synthetic-access-token',
        );
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok' })));
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Development Administrator')).toBeVisible();
    expect(localStorageSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(await screen.findByRole('button', { name: /login/i })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows permission denied on the protected administration route', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              service: 'hire-me-api',
              timestamp: '2026-07-21T10:00:00.000Z',
              uptimeSeconds: 1,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }

      if (url.endsWith('/auth/login')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'synthetic-access-token',
              accessTokenExpiresAt: '2026-07-21T10:05:00.000Z',
              user: {
                id: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
                displayName: 'Limited User',
                email: 'limited@example.test',
                permissions: ['records:view'],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'limited@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /administration/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied.');
  });

  it('loads administration data and creates an internal user through contracts', async () => {
    const userId = '57baf24e-8837-4378-aa0d-e98f0473f665';
    const roleId = 'f135c142-f840-4e29-a10c-e2f1851ec4a1';
    const permissionId = 'e1692b9c-af8c-49ca-8997-566679131796';
    const createdUserId = '80d1e2f7-6dc9-4ed9-aafd-6911ec9bd411';
    const userSummary = {
      id: userId,
      displayName: 'Admin User',
      email: 'admin@example.test',
      normalizedEmail: 'admin@example.test',
      status: 'ACTIVE',
      userType: 'INTERNAL',
      locale: 'en',
      lastLoginAt: null,
      archivedAt: null,
      createdAt: '2026-07-21T10:00:00.000Z',
      updatedAt: '2026-07-21T10:00:00.000Z',
      roles: ['ADMIN'],
      effectivePermissions: ['users:view'],
      activeSessionCount: 0,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              service: 'hire-me-api',
              timestamp: '2026-07-21T10:00:00.000Z',
              uptimeSeconds: 1,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }

      if (url.endsWith('/auth/login')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'synthetic-access-token',
              accessTokenExpiresAt: '2026-07-21T10:05:00.000Z',
              user: {
                id: userId,
                displayName: 'Admin User',
                email: 'admin@example.test',
                permissions: ['users:view'],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/admin/roles')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              roles: [
                {
                  id: roleId,
                  name: 'ADMIN',
                  description: 'Administrator',
                  status: 'ACTIVE',
                  permissions: [],
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/admin/permissions')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              permissions: [
                {
                  id: permissionId,
                  code: 'users:view',
                  description: 'View users',
                  scopeType: 'EXPLICIT',
                  status: 'ACTIVE',
                },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/admin/users?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              users: [userSummary],
              pagination: { page: 1, pageSize: 20, total: 1 },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/v1/admin/users') && init?.method === 'POST') {
        expect((init.headers as Headers).get('Authorization')).toBe(
          'Bearer synthetic-access-token',
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                ...userSummary,
                id: createdUserId,
                displayName: 'Created User',
                email: 'created@example.test',
                normalizedEmail: 'created@example.test',
                roles: [],
                effectivePermissions: [],
                sessions: [],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /administration/i }));

    expect(await screen.findByRole('heading', { name: /administration/i })).toBeVisible();
    expect(await screen.findByText('users:view')).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText(/display name/i), {
      target: { value: 'Created User' },
    });
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'created@example.test' },
    });
    fireEvent.change(screen.getByPlaceholderText(/initial password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText('User created.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/admin/users',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('loads client CRM data and creates a client through shared contracts', async () => {
    const userId = '57baf24e-8837-4378-aa0d-e98f0473f666';
    const clientId = '10c9d5d1-2f74-465f-a9bb-12f3a3bfc4c1';
    const clientSummary = {
      id: clientId,
      name: 'Synthetic Client',
      normalizedName: 'synthetic client',
      status: 'PROSPECT',
      industry: 'Services',
      website: null,
      mainPhone: null,
      country: 'France',
      city: 'Paris',
      commercial: null,
      archivedAt: null,
      createdAt: '2026-07-21T10:00:00.000Z',
      updatedAt: '2026-07-21T10:00:00.000Z',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              service: 'hire-me-api',
              timestamp: '2026-07-21T10:00:00.000Z',
              uptimeSeconds: 1,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }

      if (url.endsWith('/auth/login')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'synthetic-access-token',
              accessTokenExpiresAt: '2026-07-21T10:05:00.000Z',
              user: {
                id: userId,
                displayName: 'Client Operator',
                email: 'client-operator@example.test',
                permissions: ['clients:view', 'clients:create'],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/clients?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              clients: [clientSummary],
              pagination: { page: 1, pageSize: 20, total: 1 },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/v1/clients') && init?.method === 'POST') {
        expect((init.headers as Headers).get('Authorization')).toBe(
          'Bearer synthetic-access-token',
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              client: {
                ...clientSummary,
                id: 'dcbecbd1-86fa-464b-8c24-a7d9c6d84b8d',
                name: 'Created Client',
                normalizedName: 'created client',
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/clients/dcbecbd1-86fa-464b-8c24-a7d9c6d84b8d/contacts?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              contacts: [],
              pagination: { page: 1, pageSize: 20, total: 0 },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'client-operator@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /clients/i }));

    expect(await screen.findByRole('heading', { name: /clients/i })).toBeVisible();
    expect(await screen.findByText('Synthetic Client')).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText(/client name/i), {
      target: { value: 'Created Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    expect(await screen.findByText('Client created.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/clients',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('loads candidate profile data and creates a candidate through shared contracts', async () => {
    const userId = '57baf24e-8837-4378-aa0d-e98f0473f667';
    const candidateId = '8a68ec11-453b-4f33-b65e-c09642ebc69b';
    const candidateSummary = {
      id: candidateId,
      displayName: 'Synthetic Candidate',
      firstName: null,
      lastName: null,
      email: 'candidate@example.test',
      normalizedEmail: 'candidate@example.test',
      phone: null,
      city: 'Paris',
      country: 'France',
      currentJobTitle: 'Recruiter',
      professionalSummary: null,
      linkedinUrl: null,
      status: 'ACTIVE',
      source: 'Synthetic',
      sourceDetail: null,
      availabilityNotice: null,
      compensation: null,
      consent: null,
      archivedAt: null,
      createdAt: '2026-07-21T10:00:00.000Z',
      updatedAt: '2026-07-21T10:00:00.000Z',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              service: 'hire-me-api',
              timestamp: '2026-07-21T10:00:00.000Z',
              uptimeSeconds: 1,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }

      if (url.endsWith('/auth/login')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'synthetic-access-token',
              accessTokenExpiresAt: '2026-07-21T10:05:00.000Z',
              user: {
                id: userId,
                displayName: 'Candidate Operator',
                email: 'candidate-operator@example.test',
                permissions: ['candidates:view', 'candidates:create'],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/candidates?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              candidates: [candidateSummary],
              pagination: { page: 1, pageSize: 20, total: 1 },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.endsWith('/v1/candidates') && init?.method === 'POST') {
        expect((init.headers as Headers).get('Authorization')).toBe(
          'Bearer synthetic-access-token',
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              candidate: {
                ...candidateSummary,
                id: 'a22c0929-9ac3-4d0e-ad26-760814c6465d',
                displayName: 'Created Candidate',
                email: 'created.candidate@example.test',
                normalizedEmail: 'created.candidate@example.test',
                skills: [],
                languages: [],
                workExperiences: [],
                education: [],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'candidate-operator@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /candidates/i }));

    expect(await screen.findByRole('heading', { name: /candidates/i })).toBeVisible();
    expect(await screen.findByText('Synthetic Candidate')).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText(/candidate name/i), {
      target: { value: 'Created Candidate' },
    });
    fireEvent.change(screen.getByPlaceholderText(/candidate email/i), {
      target: { value: 'created.candidate@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create candidate/i }));

    expect(await screen.findByText('Candidate created.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/candidates',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('hides public opportunity controls from mission users without public permissions', async () => {
    const fetchMock = mockMissionWorkspace(['missions:view']);

    await openMissionWorkspace('Mission Operator');

    expect(await screen.findByText('Synthetic Mission')).toBeVisible();
    expect(screen.queryByRole('region', { name: /public opportunity controls/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /public applications/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/public-opportunity'),
      expect.anything(),
    );
  });

  it('shows read-only public opportunity configuration without edit or publish authority', async () => {
    mockMissionWorkspace(['missions:view', 'public_opportunities:view']);

    await openMissionWorkspace('Mission Operator');

    expect(
      await screen.findByRole('region', { name: /public opportunity controls/i }),
    ).toBeVisible();
    expect(screen.getByText(/DRAFT - application link disabled - unlisted/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /save public opportunity/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /enable applications/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /list on website/i })).toBeDisabled();
  });

  it('requires publish permission for publication actions', async () => {
    const fetchMock = mockMissionWorkspace([
      'missions:view',
      'public_opportunities:view',
      'public_opportunities:publish',
    ]);

    await openMissionWorkspace('Mission Operator');
    fireEvent.click(await screen.findByRole('button', { name: /enable applications/i }));

    expect(await screen.findByText('Application link enabled.')).toBeVisible();
    expect(screen.getByRole('button', { name: /save public opportunity/i })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/missions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/public-opportunity',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'OPEN', applicationLinkEnabled: true }),
      }),
    );
  });

  it('requires application-view permission to inspect public submissions', async () => {
    mockMissionWorkspace([
      'missions:view',
      'public_opportunities:view',
      'public_applications:view',
    ]);

    await openMissionWorkspace('Mission Operator');

    expect(await screen.findByRole('region', { name: /public applications/i })).toBeVisible();
    expect(screen.getByText(/Public Applicant - applicant@example.test - 2 files/i)).toBeVisible();
  });

  it('allows authorized mission users to save public opportunity configuration safely', async () => {
    const fetchMock = mockMissionWorkspace([
      'missions:view',
      'public_opportunities:view',
      'public_opportunities:manage',
      'public_opportunities:publish',
      'public_applications:view',
    ]);
    const missionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await openMissionWorkspace('Mission Operator');

    const link = await screen.findByRole('link', {
      name: /http:\/\/localhost(?::3000)?\/opportunities\/synthetic-public-role/i,
    });
    expect(link).toBeVisible();
    expect(link).not.toHaveTextContent(missionId);

    fireEvent.change(screen.getByDisplayValue('Synthetic public role'), {
      target: { value: 'Updated public role' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save public opportunity/i }));

    expect(await screen.findByText('Public opportunity configuration saved.')).toBeVisible();
    const patchBody = fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          requestUrl(url) === `http://127.0.0.1:3000/v1/missions/${missionId}/public-opportunity` &&
          init?.method === 'PATCH',
      )
      .map(([, init]) => requestJsonBody(init))
      .at(-1);
    expect(patchBody?.publicTitle).toBe('Updated public role');
    expect(patchBody).not.toHaveProperty('missionId');
  });
});

function mockMissionWorkspace(permissions: string[]) {
  const mission = syntheticMission();
  const publicOpportunity = syntheticPublicOpportunity();
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url.endsWith('/health')) {
      return Promise.resolve(
        jsonResponse({
          status: 'ok',
          service: 'hire-me-api',
          timestamp: '2026-07-21T10:00:00.000Z',
          uptimeSeconds: 1,
        }),
      );
    }

    if (url.endsWith('/auth/refresh')) {
      return Promise.resolve(new Response('{}', { status: 401 }));
    }

    if (url.endsWith('/auth/login')) {
      return Promise.resolve(
        jsonResponse({
          accessToken: 'synthetic-access-token',
          accessTokenExpiresAt: '2026-07-21T10:05:00.000Z',
          user: {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            displayName: 'Mission Operator',
            email: 'mission-operator@example.test',
            permissions,
          },
        }),
      );
    }

    if (url.includes('/v1/missions?')) {
      return Promise.resolve(
        jsonResponse({
          missions: [mission],
          pagination: { page: 1, pageSize: 20, total: 1 },
        }),
      );
    }

    if (url.endsWith(`/v1/missions/${mission.id}`)) {
      return Promise.resolve(jsonResponse({ mission }));
    }

    if (url.endsWith(`/v1/missions/${mission.id}/public-opportunity`) && init?.method === 'PATCH') {
      const update = requestJsonBody(init);
      return Promise.resolve(
        jsonResponse({
          publicOpportunity: {
            ...publicOpportunity,
            ...update,
            updatedAt: '2026-07-21T10:10:00.000Z',
          },
        }),
      );
    }

    if (url.endsWith(`/v1/missions/${mission.id}/public-opportunity`)) {
      return Promise.resolve(jsonResponse({ publicOpportunity }));
    }

    if (url.endsWith(`/v1/missions/${mission.id}/public-opportunity/applications`)) {
      return Promise.resolve(
        jsonResponse({
          applications: [
            {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              publicOpportunityId: publicOpportunity.id,
              missionId: mission.id,
              candidateId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              missionCandidateId: '99999999-9999-4999-8999-999999999999',
              submittedFullName: 'Public Applicant',
              submittedEmail: 'applicant@example.test',
              submittedCity: 'Paris',
              submittedCountry: 'France',
              submittedCurrentPosition: 'Consultant',
              fileCount: 2,
              submittedAt: '2026-07-21T10:00:00.000Z',
            },
          ],
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected request ${url}`));
  });

  return fetchMock;
}

async function openMissionWorkspace(displayName: string): Promise<void> {
  render(<App />);
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: `${displayName.toLowerCase().replaceAll(' ', '-')}@example.test` },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'Synthetic-password-123!' },
  });
  fireEvent.click(screen.getByRole('button', { name: /login/i }));
  fireEvent.click(await screen.findByRole('button', { name: /missions/i }));
  fireEvent.click(await screen.findByRole('button', { name: /synthetic mission/i }));
}

function syntheticMission() {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    clientName: 'Synthetic Client',
    title: 'Synthetic Mission',
    description: 'Synthetic mission description',
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
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

function syntheticPublicOpportunity() {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    publicSlug: 'synthetic-public-role',
    status: 'DRAFT',
    applicationLinkEnabled: false,
    listedOnWebsite: false,
    publicationStartsAt: null,
    publicTitle: 'Synthetic public role',
    publicSummary: 'Short public summary',
    publicDescription: 'Public description',
    publicLocation: 'Paris',
    publicWorkArrangement: 'Hybrid',
    publicEngagementType: 'CDI',
    publicExperienceLevel: 'Senior',
    publicSkills: 'TypeScript, PostgreSQL',
    clientName: null,
    salary: null,
    applicationDeadline: null,
    showClientName: false,
    showSalary: false,
    uploadRequirements: {
      cvRequired: true,
      certificationsEnabled: true,
      certificationsRequired: false,
      diplomasEnabled: true,
      diplomasRequired: false,
      additionalAttachmentsEnabled: true,
      maxFileSizeBytes: 5_000_000,
      maxTotalUploadBytes: 12_000_000,
      allowedMimeTypes: ['application/pdf'],
    },
    consentTextVersion: 'synthetic-v1',
    archivedAt: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== 'string') {
    return {};
  }

  const parsed: unknown = JSON.parse(init.body);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function requestUrl(input: string | URL | Request): string {
  if (input instanceof Request) {
    return input.url;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input;
}
