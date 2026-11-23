import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { requestNavigation, resetNavigationGuardForTests } from '../navigation/navigation-guard.js';
import { AdminPanel } from './AdminPanel.js';

const USER_ID = '57baf24e-8837-4378-aa0d-e98f0473f665';
const userSummary = {
  id: USER_ID,
  displayName: 'Synthetic Admin',
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

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status }),
  );
}

function mockAdminApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes('/v1/admin/roles')) return json({ roles: [] });
    if (url.includes('/v1/admin/permissions')) return json({ permissions: [] });
    if (url.includes('/v1/admin/users?')) {
      return json({ users: [userSummary], pagination: { page: 1, pageSize: 20, total: 1 } });
    }
    if (url.endsWith(`/v1/admin/users/${USER_ID}`) && init?.method === 'PATCH') {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as {
        displayName: string;
      };
      return json({ user: { ...userSummary, displayName: body.displayName, sessions: [] } });
    }
    if (url.endsWith(`/v1/admin/users/${USER_ID}`)) {
      return json({ user: { ...userSummary, sessions: [] } });
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

function leavingAsks(): boolean {
  const navigate = vi.fn();
  requestNavigation(navigate);
  return navigate.mock.calls.length === 0;
}

async function openUser(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Admin' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  return within(screen.getByRole('dialog')).findByLabelText(/^Display name/);
}

describe('AdminPanel unsaved input (Issue #228 B0′)', () => {
  beforeEach(() => resetNavigationGuardForTests());
  afterEach(() => vi.restoreAllMocks());

  it('asks for a changed profile until it is saved, and never for the user search', async () => {
    mockAdminApi();
    render(
      <I18nProvider initialLocale="en">
        <AdminPanel
          accessToken="synthetic-token"
          permissions={['users:view', 'users:update']}
          section="users"
        />
      </I18nProvider>,
    );

    const search = await screen.findByLabelText('Search');
    fireEvent.focusIn(search);
    fireEvent.change(search, { target: { value: 'synthetic' } });
    expect(leavingAsks()).toBe(false);

    const displayName = await openUser();
    fireEvent.change(displayName, { target: { value: 'Renamed Admin' } });
    act(() => expect(leavingAsks()).toBe(true));
    expect(await screen.findByText('You have unsaved changes. Discard them?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(displayName).toHaveValue('Renamed Admin');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('User updated.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Selected user detail' })).getByRole('heading', {
        name: 'Renamed Admin',
      }),
    ).toBeVisible();
    expect(leavingAsks()).toBe(false);
  });

  it('keeps the directory usable when a detail fails and retries the selected account', async () => {
    const adminFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/admin/users?')) {
        return json({ users: [userSummary], pagination: { page: 1, pageSize: 20, total: 1 } });
      }
      if (adminFetch.mock.calls.length === 2) return json({}, 503);
      return json({ user: { ...userSummary, sessions: [] } });
    });
    render(
      <I18nProvider initialLocale="en">
        <AdminPanel accessToken="synthetic-token" permissions={['users:view']} section="users" />
      </I18nProvider>,
    );

    const row = await screen.findByRole('button', { name: 'Synthetic Admin' });
    expect(screen.queryByRole('region', { name: 'Selected user detail' })).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(await screen.findByText('Could not load the user')).toBeVisible();
    expect(row).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Synthetic Admin' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New user' })).not.toBeInTheDocument();
  });

  it('requires a confirmation scoped to the selected account before suspending', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/v1/admin/users?')) {
        return json({ users: [userSummary], pagination: { page: 1, pageSize: 20, total: 1 } });
      }
      if (init?.method === 'PATCH') {
        return json({ user: { ...userSummary, sessions: [], status: 'SUSPENDED' } });
      }
      return json({ user: { ...userSummary, sessions: [] } });
    });
    render(
      <I18nProvider initialLocale="en">
        <AdminPanel
          accessToken="synthetic-token"
          permissions={['users:view', 'users:status:manage']}
          section="users"
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Admin' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    let dialog = screen.getByRole('dialog', { name: 'Suspend' });
    expect(dialog).toHaveAccessibleDescription(/Suspend Synthetic Admin/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    dialog = screen.getByRole('dialog', { name: 'Suspend' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Account status updated.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeVisible();
  });

  it('shows only authorized section links and delegates navigation without loading inactive data', async () => {
    const onNavigateSection = vi.fn();
    mockAdminApi();
    render(
      <I18nProvider initialLocale="en">
        <AdminPanel
          accessToken="synthetic-token"
          onNavigateSection={onNavigateSection}
          permissions={['users:view', 'permissions:view']}
          section="users"
        />
      </I18nProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Roles and permissions' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/admin/permissions'),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('link', { name: 'Roles and permissions' }));
    expect(onNavigateSection).toHaveBeenCalledWith('access');
  });

  it('filters readable roles and keeps technical codes behind functional disclosure', async () => {
    const permission = {
      id: USER_ID,
      code: 'candidates:view',
      description: 'View candidates',
      scopeType: 'GLOBAL',
      status: 'ACTIVE',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/v1/admin/roles')) {
        return json({
          roles: [
            {
              id: USER_ID,
              name: 'ADMIN',
              description: 'Raw description',
              status: 'ACTIVE',
              permissions: [permission],
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });
    render(
      <I18nProvider initialLocale="fr">
        <AdminPanel accessToken="synthetic-token" permissions={['roles:view']} section="access" />
      </I18nProvider>,
    );
    const description = await screen.findByText('Administration courante de la plateforme.');
    expect(description).toBeVisible();
    const role = description.closest('article');
    const details = role?.querySelector('details');
    expect(screen.getByText('candidates:view')).not.toBeVisible();
    expect(screen.queryByText('Raw description')).not.toBeInTheDocument();
    details?.setAttribute('open', '');
    expect(screen.getByText('Recrutement · 1 permission')).toBeVisible();
    expect(screen.getByText('candidates:view')).not.toBeVisible();
    screen.getByText('Recrutement · 1 permission').closest('details')?.setAttribute('open', '');
    expect(screen.getByText('candidates:view')).toBeVisible();
    expect(screen.getByText('View candidates')).toHaveAttribute('lang', 'en');

    const search = screen.getByRole('searchbox', { name: 'Rechercher des rôles et permissions' });
    fireEvent.change(search, { target: { value: 'does not match' } });
    expect(screen.getByText('Aucune entrée ne correspond à ces filtres.')).toBeVisible();
    fireEvent.change(search, { target: { value: 'candidates:view' } });
    expect(screen.getByRole('heading', { name: 'Administrateur' })).toBeVisible();
    const area = screen.getByRole('combobox', { name: 'Domaine fonctionnel' });
    fireEvent.change(area, { target: { value: 'finance' } });
    expect(screen.queryByRole('heading', { name: 'Administrateur' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres d’accès' }));
    expect(screen.getByRole('heading', { name: 'Administrateur' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Catalogue des permissions' }),
    ).not.toBeInTheDocument();
  });

  it('allows a catalog failure to be retried without requesting unauthorized roles', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => json({}, 500));
    fetch.mockImplementation(() => json({ permissions: [] }));
    render(
      <I18nProvider initialLocale="en">
        <AdminPanel
          accessToken="synthetic-token"
          permissions={['permissions:view']}
          section="access"
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading access' }));
    expect(await screen.findByText('No approved access entries are available.')).toBeVisible();
    expect(fetch.mock.calls).toHaveLength(2);
    const requestedUrls = fetch.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    expect(requestedUrls.every((url) => url.endsWith('/v1/admin/permissions'))).toBe(true);
  });

  it('shows a localized denial for an unauthorized direct section', () => {
    render(
      <I18nProvider initialLocale="fr">
        <AdminPanel accessToken="synthetic-token" permissions={['users:view']} section="billing" />
      </I18nProvider>,
    );

    expect(screen.getByText('Section indisponible')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Utilisateurs' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: 'Facturation' })).not.toBeInTheDocument();
  });
});
