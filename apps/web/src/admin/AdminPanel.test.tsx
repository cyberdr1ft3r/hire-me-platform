import { fireEvent, render, screen, within } from '@testing-library/react';
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
  return within(screen.getByRole('region', { name: 'Selected user detail' })).findByLabelText(
    'Display name',
  );
}

describe('AdminPanel unsaved input (Issue #228 B0′)', () => {
  beforeEach(() => resetNavigationGuardForTests());
  afterEach(() => vi.restoreAllMocks());

  it('asks for a changed profile until it is saved, and never for the user search', async () => {
    const confirmLeave = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockAdminApi();
    render(
      <I18nProvider initialLocale="en">
        <AdminPanel accessToken="synthetic-token" />
      </I18nProvider>,
    );

    const search = await screen.findByLabelText('Search');
    fireEvent.focusIn(search);
    fireEvent.change(search, { target: { value: 'synthetic' } });
    expect(leavingAsks()).toBe(false);

    const displayName = await openUser();
    fireEvent.focusIn(displayName);
    fireEvent.change(displayName, { target: { value: 'Renamed Admin' } });
    expect(leavingAsks()).toBe(true);
    expect(confirmLeave).toHaveBeenCalledWith(
      'You have unsaved changes on this page. Leave and discard them?',
    );

    // The profile form stays open after saving, showing the saved value.
    fireEvent.click(screen.getByRole('button', { name: 'Update profile' }));
    expect(await screen.findByText('User updated.')).toBeVisible();
    expect(displayName).toHaveValue('Renamed Admin');
    expect(leavingAsks()).toBe(false);
  });
});
