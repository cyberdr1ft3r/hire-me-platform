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
});
