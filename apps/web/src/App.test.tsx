import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

const syntheticMissionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

  it('does not expose task controls to users without task permissions', async () => {
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
                displayName: 'No Task User',
                email: 'no-task@example.test',
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
      target: { value: 'no-task@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /tasks/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied.');
    expect(screen.queryByRole('form', { name: /create task/i })).not.toBeInTheDocument();
  });

  it('loads read-only task lists without mutation controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
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
                displayName: 'Read Only Task User',
                email: 'readonly@example.test',
                permissions: ['tasks:view', 'notifications:view_own'],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/tasks') && init?.method !== 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tasks: [
                {
                  id: '11111111-1111-4111-8111-111111111111',
                  title: 'Review candidate follow-up',
                  description: null,
                  status: 'OPEN',
                  priority: 'NORMAL',
                  startAt: null,
                  dueAt: null,
                  timezone: null,
                  ownerUserId: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
                  ownerDisplayName: 'Read Only Task User',
                  assigneeUserIds: [],
                  context: {
                    candidateId: null,
                    clientId: null,
                    clientContactId: null,
                    recruitmentMissionId: null,
                    missionRecruiterId: null,
                    missionCandidateId: null,
                    interviewId: null,
                    recruitmentOfferId: null,
                    recruitmentOfferVersionId: null,
                    missionPlacementId: null,
                    trainingProgramId: null,
                    trainingSessionId: null,
                    trainingEnrollmentId: null,
                    trainingSessionParticipationId: null,
                    documentId: null,
                  },
                  completedAt: null,
                  canceledAt: null,
                  archivedAt: null,
                  createdAt: '2026-07-21T10:00:00.000Z',
                  updatedAt: '2026-07-21T10:00:00.000Z',
                },
              ],
              pageInfo: { page: 1, pageSize: 25, total: 1, hasNextPage: false },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/notifications')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              notifications: [],
              pageInfo: { page: 1, pageSize: 25, total: 0, hasNextPage: false },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'readonly@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /tasks/i }));

    expect(await screen.findByRole('button', { name: 'Review candidate follow-up' })).toBeVisible();
    expect(screen.queryByRole('form', { name: /create task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /process reminders/i })).not.toBeInTheDocument();
  });

  it('lets authorized staff create tasks through environment-configured API calls', async () => {
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
                id: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
                displayName: 'Task Manager',
                email: 'tasks@example.test',
                permissions: [
                  'tasks:view',
                  'tasks:create',
                  'tasks:assign',
                  'tasks:transition',
                  'tasks:comment',
                  'tasks:reminders:manage',
                  'notifications:view_own',
                ],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/tasks') && init?.method !== 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tasks: [],
              pageInfo: { page: 1, pageSize: 25, total: 0, hasNextPage: false },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }

      if (url.endsWith('/v1/tasks') && init?.method === 'POST') {
        expect(JSON.parse(init.body as string)).toEqual(
          expect.objectContaining({
            title: 'Call client after interview',
            ownerUserId: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
          }),
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              task: {
                id: '22222222-2222-4222-8222-222222222222',
                title: 'Call client after interview',
                description: null,
                status: 'OPEN',
                priority: 'NORMAL',
                startAt: null,
                dueAt: null,
                timezone: null,
                ownerUserId: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
                ownerDisplayName: 'Task Manager',
                assigneeUserIds: [],
                context: {
                  candidateId: null,
                  clientId: null,
                  clientContactId: null,
                  recruitmentMissionId: null,
                  missionRecruiterId: null,
                  missionCandidateId: null,
                  interviewId: null,
                  recruitmentOfferId: null,
                  recruitmentOfferVersionId: null,
                  missionPlacementId: null,
                  trainingProgramId: null,
                  trainingSessionId: null,
                  trainingEnrollmentId: null,
                  trainingSessionParticipationId: null,
                  documentId: null,
                },
                completedAt: null,
                canceledAt: null,
                archivedAt: null,
                createdAt: '2026-07-21T10:00:00.000Z',
                updatedAt: '2026-07-21T10:00:00.000Z',
                assignments: [],
                comments: [],
                reminders: [],
                history: [],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }

      if (url.includes('/v1/notifications')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              notifications: [],
              pageInfo: { page: 1, pageSize: 25, total: 0, hasNextPage: false },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'tasks@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /tasks/i }));
    fireEvent.change(await screen.findByPlaceholderText(/task title/i), {
      target: { value: 'Call client after interview' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    expect(await screen.findByText('Task created.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/tasks',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
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

  it('copies the slug-based public opportunity link without exposing mission identifiers', async () => {
    mockMissionWorkspace(['missions:view', 'public_opportunities:view']);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const missionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await openMissionWorkspace('Mission Operator');
    fireEvent.click(await screen.findByRole('button', { name: /copy public link/i }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/opportunities/synthetic-public-role`,
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain(missionId);
    expect(await screen.findByText('Public link copied.')).toBeVisible();
  });

  it('handles clipboard copy failures without crashing', async () => {
    mockMissionWorkspace(['missions:view', 'public_opportunities:view']);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard unavailable')) },
    });

    await openMissionWorkspace('Mission Operator');
    fireEvent.click(await screen.findByRole('button', { name: /copy public link/i }));

    expect(await screen.findByText('Public link could not be copied.')).toBeVisible();
  });

  it('hides offer and placement controls from mission users without offer permissions', async () => {
    mockMissionWorkspace(['missions:view', 'mission_candidates:view']);

    await openMissionWorkspace('Mission Operator');

    expect(screen.queryByRole('region', { name: /offer and placement controls/i })).toBeNull();
  });

  it('shows read-only offer controls without mutation authority', async () => {
    mockMissionWorkspace([
      'missions:view',
      'mission_candidates:view',
      'offers:view',
      'placements:view',
    ]);

    await openMissionWorkspace('Mission Operator');
    fireEvent.click(await screen.findByRole('button', { name: /load offer and placement/i }));

    expect(
      await screen.findByRole('region', { name: /offer and placement controls/i }),
    ).toBeVisible();
    expect(screen.getByText(/current offer: sent - versions 1/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /revise offer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /confirm placement/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /correct placement/i })).toBeDisabled();
  });

  it('allows authorized mission users to create and progress offers', async () => {
    const fetchMock = mockMissionWorkspace([
      'missions:view',
      'mission_candidates:view',
      'offers:view',
      'offers:create',
      'offers:send_or_mark_sent',
      'offers:record_response',
      'placements:view',
    ]);

    await openMissionWorkspace('Mission Operator');
    fireEvent.click(await screen.findByRole('button', { name: /load offer and placement/i }));
    fireEvent.click(await screen.findByRole('button', { name: /mark sent/i }));
    fireEvent.click(await screen.findByRole('button', { name: /accepted/i }));

    expect(fetchMock.mock.calls.some((call) => requestUrl(call[0]).endsWith('/mark-sent'))).toBe(
      true,
    );
    expect(fetchMock.mock.calls.some((call) => requestUrl(call[0]).endsWith('/response'))).toBe(
      true,
    );
    expect(await screen.findByText('Offer response recorded as ACCEPTED.')).toBeVisible();
  });

  it('requires placement permissions for confirmation and correction controls', async () => {
    const fetchMock = mockMissionWorkspace([
      'missions:view',
      'mission_candidates:view',
      'offers:view',
      'placements:view',
      'placements:confirm',
      'placements:correct',
      'placement_commercial_eligibility:view',
    ]);

    await openMissionWorkspace('Mission Operator');
    fireEvent.click(await screen.findByRole('button', { name: /load offer and placement/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm placement/i }));
    fireEvent.click(await screen.findByRole('button', { name: /correct placement/i }));

    expect(
      fetchMock.mock.calls.some((call) => requestUrl(call[0]).endsWith('/confirm-placement')),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some((call) => requestUrl(call[0]).endsWith('/placement/correct')),
    ).toBe(true);
    expect(await screen.findByText('Placement correction recorded.')).toBeVisible();
  });

  it('loads document management and gates write controls by document permissions', async () => {
    const document = syntheticDocument();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
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
              displayName: 'Document Operator',
              email: 'document-operator@example.test',
              permissions: ['documents:view'],
            },
          }),
        );
      }

      if (url.includes('/v1/documents?')) {
        return Promise.resolve(
          jsonResponse({
            documents: [document],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
        );
      }

      if (url.endsWith(`/v1/documents/${document.id}`)) {
        return Promise.resolve(jsonResponse({ document: { ...document, versions: [] } }));
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'document-operator@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /documents/i }));

    expect(await screen.findByRole('heading', { name: /documents/i })).toBeVisible();
    expect(await screen.findByText('Issue35 Contract')).toBeVisible();
    expect(screen.queryByRole('form', { name: /register document/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /issue35 contract/i }));
    expect(await screen.findByText(/CONTRAT_RECRUTEMENT - ACTIVE/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /archive document/i })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/documents?'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('does not expose commercial records to users without quotation visibility', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);

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
              displayName: 'No Commercial User',
              email: 'no-commercial@example.test',
              permissions: ['records:view'],
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'no-commercial@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    fireEvent.click(await screen.findByRole('button', { name: /commercial/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied.');
    expect(screen.queryByRole('form', { name: /create quotation/i })).toBeNull();
  });

  it('loads read-only commercial records without write controls or client-side totals', async () => {
    const fetchMock = mockCommercialWorkspace(['quotations:view']);

    await openCommercialWorkspace('Commercial Viewer');

    expect(await screen.findByRole('heading', { name: /commercial/i })).toBeVisible();
    expect(await screen.findByText('Q38-WEB')).toBeVisible();
    expect(await screen.findByText('Hidden')).toBeVisible();
    expect(screen.queryByRole('form', { name: /create quotation/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /issue/i })).toBeNull();
    expect(
      fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes('/v1/commercial')),
    ).toBe(true);
  });

  it('lets authorized commercial users create quotations through shared contracts', async () => {
    const fetchMock = mockCommercialWorkspace([
      'commercial_data:access',
      'quotations:view',
      'quotations:manage',
    ]);

    await openCommercialWorkspace('Commercial Operator');
    fireEvent.change(await screen.findByPlaceholderText('Reference'), {
      target: { value: 'Q38-WEB-CREATE' },
    });
    fireEvent.change(screen.getByPlaceholderText('Client id'), {
      target: { value: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    });
    fireEvent.change(screen.getByPlaceholderText('Line description'), {
      target: { value: 'Recruitment fee' },
    });
    fireEvent.change(screen.getByPlaceholderText('Unit price cents'), {
      target: { value: '50000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create quotation$/i }));

    expect(await screen.findByText('Quotation created.')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          requestUrl(call[0]).endsWith('/v1/commercial/quotations') && call[1]?.method === 'POST',
      ),
    ).toBe(true);
  });
});

function mockCommercialWorkspace(permissions: string[]) {
  const quotation = syntheticQuotation();
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = requestUrl(input);

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
            displayName: 'Commercial Operator',
            email: 'commercial-operator@example.test',
            permissions,
          },
        }),
      );
    }

    if (url.includes('/v1/commercial/quotations') && init?.method === 'POST') {
      return Promise.resolve(
        jsonResponse({
          quotation: {
            ...quotation,
            reference: 'Q38-WEB-CREATE',
            lines: [syntheticCommercialLine()],
            history: [],
          },
        }),
      );
    }

    if (url.includes('/v1/commercial/quotations')) {
      return Promise.resolve(
        jsonResponse({
          quotations: [
            permissions.includes('commercial_data:access')
              ? quotation
              : { ...quotation, amounts: null },
          ],
          pagination: { page: 1, pageSize: 10, total: 1 },
        }),
      );
    }

    if (url.includes('/v1/commercial/contracts')) {
      return Promise.resolve(
        jsonResponse({ contracts: [], pagination: { page: 1, pageSize: 10, total: 0 } }),
      );
    }

    if (url.includes('/v1/commercial/purchase-orders')) {
      return Promise.resolve(
        jsonResponse({ purchaseOrders: [], pagination: { page: 1, pageSize: 10, total: 0 } }),
      );
    }

    if (url.includes('/v1/commercial/invoices')) {
      return Promise.resolve(
        jsonResponse({ invoices: [], pagination: { page: 1, pageSize: 10, total: 0 } }),
      );
    }

    return Promise.reject(new Error(`Unexpected request ${url}`));
  });

  return fetchMock;
}

async function openCommercialWorkspace(displayName: string): Promise<void> {
  render(<App />);
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: `${displayName.toLowerCase().replaceAll(' ', '-')}@example.test` },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'Synthetic-password-123!' },
  });
  fireEvent.click(screen.getByRole('button', { name: /login/i }));
  fireEvent.click(await screen.findByRole('button', { name: /commercial/i }));
}

function mockMissionWorkspace(permissions: string[]) {
  const mission = syntheticMission();
  const missionCandidate = syntheticMissionCandidate();
  const offer = syntheticOffer();
  const placement = syntheticPlacement();
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

    if (url.endsWith(`/v1/missions/${mission.id}/candidates`)) {
      return Promise.resolve(
        jsonResponse({
          candidates: [missionCandidate],
          pagination: { page: 1, pageSize: 20, total: 1 },
        }),
      );
    }

    if (
      url.endsWith(`/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers`) &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(jsonResponse({ offer }));
    }

    if (url.endsWith(`/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers`)) {
      return Promise.resolve(jsonResponse({ offer }));
    }

    if (
      url.endsWith(
        `/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers/${offer.currentVersionId}/revise`,
      )
    ) {
      return Promise.resolve(
        jsonResponse({
          offer: {
            ...offer,
            versions: [
              {
                ...offer.versions[0],
                id: '44444444-4444-4444-8444-444444444444',
                versionNumber: 2,
                status: 'DRAFT',
                isCurrent: true,
              },
              { ...offer.versions[0], isCurrent: false },
            ],
            currentVersionId: '44444444-4444-4444-8444-444444444444',
          },
        }),
      );
    }

    if (
      url.endsWith(
        `/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers/${offer.currentVersionId}/mark-sent`,
      )
    ) {
      return Promise.resolve(jsonResponse({ offer }));
    }

    if (
      url.endsWith(
        `/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers/${offer.currentVersionId}/response`,
      )
    ) {
      const update = requestJsonBody(init);
      return Promise.resolve(
        jsonResponse({
          offer: {
            ...offer,
            versions: [{ ...offer.versions[0], status: update.status ?? 'ACCEPTED' }],
          },
        }),
      );
    }

    if (
      url.endsWith(
        `/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers/${offer.currentVersionId}/withdraw`,
      )
    ) {
      return Promise.resolve(
        jsonResponse({
          offer: { ...offer, versions: [{ ...offer.versions[0], status: 'WITHDRAWN' }] },
        }),
      );
    }

    if (url.endsWith(`/v1/missions/${mission.id}/candidates/${missionCandidate.id}/placement`)) {
      return Promise.resolve(jsonResponse({ placement }));
    }

    if (
      url.endsWith(
        `/v1/missions/${mission.id}/candidates/${missionCandidate.id}/offers/${offer.currentVersionId}/confirm-placement`,
      )
    ) {
      return Promise.resolve(jsonResponse({ placement }));
    }

    if (
      url.endsWith(`/v1/missions/${mission.id}/candidates/${missionCandidate.id}/placement/correct`)
    ) {
      return Promise.resolve(
        jsonResponse({
          placement: {
            ...placement,
            status: 'CORRECTED',
            correctionReason: 'ADMINISTRATIVE_ERROR',
          },
        }),
      );
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

function syntheticMissionCandidate() {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    missionId: syntheticMissionId,
    candidateId: '88888888-8888-4888-8888-888888888888',
    candidate: {
      id: '88888888-8888-4888-8888-888888888888',
      displayName: 'Synthetic Candidate',
      firstName: 'Synthetic',
      lastName: 'Candidate',
      email: 'candidate@example.test',
      normalizedEmail: 'candidate@example.test',
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
      createdAt: '2026-07-21T10:00:00.000Z',
      updatedAt: '2026-07-21T10:00:00.000Z',
    },
    responsibleRecruiterUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    responsibleRecruiterDisplayName: 'Mission Operator',
    state: 'CLIENT_OFFER',
    rank: null,
    source: 'PUBLIC_APPLICATION',
    sourceContext: null,
    priority: 'NORMAL',
    internalNotes: null,
    outcomeReason: null,
    clientVisible: false,
    presentedAt: null,
    placementConfirmedAt: null,
    archivedAt: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

function syntheticOffer() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    missionId: syntheticMissionId,
    missionCandidateId: '99999999-9999-4999-8999-999999999999',
    currentVersionId: '22222222-2222-4222-8222-222222222222',
    versions: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        offerId: '11111111-1111-4111-8111-111111111111',
        missionId: syntheticMissionId,
        missionCandidateId: '99999999-9999-4999-8999-999999999999',
        versionNumber: 1,
        status: 'SENT',
        isCurrent: true,
        offeredSalaryAmountCents: 900000,
        offeredSalaryCurrency: 'MAD',
        contractType: 'CDI',
        proposedStartDate: null,
        probationPeriod: null,
        bonuses: null,
        benefits: null,
        allowances: null,
        compensationNotes: null,
        clientFacingRemarks: null,
        internalRecruiterRemarks: null,
        sentAt: '2026-07-21T10:00:00.000Z',
        responseRecordedAt: null,
        responseReason: null,
        withdrawnAt: null,
        withdrawalReason: null,
        expiresAt: null,
        expiredAt: null,
        archivedAt: null,
        createdAt: '2026-07-21T10:00:00.000Z',
        updatedAt: '2026-07-21T10:00:00.000Z',
      },
    ],
    history: [],
    archivedAt: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

function syntheticPlacement() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    missionId: syntheticMissionId,
    missionCandidateId: '99999999-9999-4999-8999-999999999999',
    offerVersionId: '22222222-2222-4222-8222-222222222222',
    status: 'CONFIRMED',
    integrationStartDate: '2026-07-21T10:00:00.000Z',
    confirmedAt: '2026-07-21T10:00:00.000Z',
    confirmedByUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    operationalNote: null,
    eligibleForInvoicing: true,
    invoicingEligibleAt: '2026-07-21T10:00:00.000Z',
    correctedAt: null,
    correctedByUserId: null,
    correctionReason: null,
    correctionComment: null,
    closureEligible: true,
    archivedAt: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    history: [],
  };
}

function syntheticDocument() {
  return {
    id: '12121212-1212-4121-8121-121212121212',
    title: 'Issue35 Contract',
    documentType: 'CONTRAT_RECRUTEMENT',
    visibility: 'INTERNAL_ONLY',
    status: 'ACTIVE',
    outputFamily: 'PDF',
    ownerUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    createdByUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    context: {
      clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      recruitmentMissionId: syntheticMissionId,
    },
    currentVersionId: '34343434-3434-4343-8343-343434343434',
    archivedAt: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

function syntheticQuotation() {
  return {
    id: '56565656-5656-4565-8565-565656565656',
    reference: 'Q38-WEB',
    clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    recruitmentMissionId: syntheticMissionId,
    status: 'DRAFT',
    issueDate: null,
    validUntil: null,
    amounts: {
      currency: 'MAD',
      subtotalCents: 50000,
      taxCents: 10000,
      totalCents: 60000,
    },
    archivedAt: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

function syntheticCommercialLine() {
  return {
    id: '67676767-6767-4676-8676-676767676767',
    description: 'Recruitment fee',
    quantity: 1,
    unitPriceCents: 50000,
    taxRateBps: 2000,
    sortOrder: 0,
    lineSubtotalCents: 50000,
    lineTaxCents: 10000,
    lineTotalCents: 60000,
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
