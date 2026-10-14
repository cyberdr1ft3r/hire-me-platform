import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

const USER_ID = '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authBody(accessToken: string, permissions: string[]) {
  return {
    accessToken,
    accessTokenExpiresAt: '2026-10-14T10:05:00.000Z',
    user: {
      id: USER_ID,
      displayName: 'Session Tester',
      email: 'session@example.test',
      permissions,
    },
  };
}

/**
 * A fake API where the Agenda endpoint accepts only currently valid access
 * tokens. `refresh` decides what `/auth/refresh` answers; the first refresh is
 * the page-load restore.
 */
function mockApi(options: {
  permissions?: string[];
  /** A rotated token and its permissions, or the refresh failure status. */
  refresh: (attempt: number) => { token: string; permissions: string[] } | { status: number };
}) {
  const validTokens = new Set<string>();
  const agendaAuthorizations: Array<string | null> = [];
  let refreshAttempts = 0;

  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const authorization = new Headers(init.headers).get('Authorization');

    if (url.endsWith('/health')) {
      return Promise.resolve(
        json({
          status: 'ok',
          service: 'hire-me-api',
          timestamp: '2026-10-14T10:00:00.000Z',
          uptimeSeconds: 1,
        }),
      );
    }
    if (url.endsWith('/auth/refresh')) {
      refreshAttempts += 1;
      const outcome = options.refresh(refreshAttempts);
      if ('status' in outcome) {
        return Promise.resolve(json({ error: { code: 'AUTHENTICATION_FAILED' } }, outcome.status));
      }
      validTokens.add(outcome.token);
      return Promise.resolve(json(authBody(outcome.token, outcome.permissions)));
    }
    if (url.endsWith('/auth/login')) {
      validTokens.add('login-token');
      return Promise.resolve(
        json(authBody('login-token', options.permissions ?? ['records:view'])),
      );
    }
    if (url.includes('/v1/agenda')) {
      agendaAuthorizations.push(authorization);
      const token = authorization?.replace(/^Bearer /, '') ?? '';
      return Promise.resolve(
        validTokens.has(token)
          ? json({
              items: [],
              window: { from: '2026-10-14T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' },
            })
          : json({ error: { code: 'AUTHENTICATION_FAILED' } }, 401),
      );
    }
    if (url.endsWith('/auth/logout')) {
      return Promise.resolve(json({ status: 'ok' }));
    }
    return Promise.resolve(json({}, 404));
  });

  return {
    agendaAuthorizations,
    refreshAttempts: () => refreshAttempts,
    expireAccessTokens: () => validTokens.clear(),
  };
}

async function signIn(): Promise<void> {
  fireEvent.change(await screen.findByLabelText(/email/i), {
    target: { value: 'session@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'Synthetic-password-123!' },
  });
  fireEvent.click(screen.getByRole('button', { name: /login/i }));
}

describe('App authenticated session (Issue #202)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('recovers an expired token on navigation, then reuses it without re-running effects', async () => {
    const api = mockApi({
      refresh: (attempt) =>
        attempt === 1
          ? { status: 401 }
          : { token: `rotated-${attempt}`, permissions: ['records:view'] },
    });
    render(<App />);
    await signIn();
    await screen.findByLabelText('Account and session');

    // The access token expires while the user is elsewhere; navigating to the
    // Agenda must refresh once and show data instead of an unavailable state.
    api.expireAccessTokens();
    window.history.pushState({}, '', '/agenda');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(await screen.findByText('Nothing scheduled here')).toBeVisible();
    expect(api.agendaAuthorizations).toEqual(['Bearer login-token', 'Bearer rotated-2']);
    expect(api.refreshAttempts()).toBe(2);

    // A later background reload sends the rotated token directly, and the
    // rotation did not re-run the panel's effect (no extra list request).
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.agendaAuthorizations).toHaveLength(3));
    expect(api.agendaAuthorizations[2]).toBe('Bearer rotated-2');
    expect(api.refreshAttempts()).toBe(2);
  });

  it('returns to sign in exactly once when the refresh session was revoked', async () => {
    const api = mockApi({ refresh: () => ({ status: 401 }) });
    window.history.pushState({}, '', '/agenda');
    render(<App />);
    await signIn();
    expect(await screen.findByText('Nothing scheduled here')).toBeVisible();

    api.expireAccessTokens();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('button', { name: /login/i })).toBeVisible();
    // Page-load restore plus one shared refresh; the Agenda request is not retried.
    expect(api.refreshAttempts()).toBe(2);
    expect(api.agendaAuthorizations).toEqual(['Bearer login-token', 'Bearer login-token']);
  });

  it('applies permissions revoked since sign in when the token is refreshed', async () => {
    const api = mockApi({
      permissions: ['tasks:view'],
      refresh: (attempt) =>
        attempt === 1 ? { status: 401 } : { token: 'reduced', permissions: [] },
    });
    window.history.pushState({}, '', '/agenda');
    render(<App />);
    await signIn();
    expect(await screen.findByText('Nothing scheduled here')).toBeVisible();
    expect(screen.getByRole('link', { name: /tasks/i })).toBeVisible();

    api.expireAccessTokens();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /tasks/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Nothing scheduled here')).toBeVisible();
  });

  it('restores the session with a single refresh under StrictMode double mounting', async () => {
    const api = mockApi({ refresh: () => ({ token: 'restored', permissions: ['records:view'] }) });
    window.history.pushState({}, '', '/agenda');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByText('Nothing scheduled here')).toBeVisible();
    expect(api.refreshAttempts()).toBe(1);
    expect(api.agendaAuthorizations.every((value) => value === 'Bearer restored')).toBe(true);
  });
});
