import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function mockInternalSession() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/health')) {
      return Promise.resolve(
        jsonResponse({
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-09-09T12:00:00.000Z',
          uptimeSeconds: 1,
        }),
      );
    }
    if (url.endsWith('/auth/refresh')) {
      return Promise.resolve(jsonResponse({}, 401));
    }
    if (url.endsWith('/auth/login')) {
      return Promise.resolve(
        jsonResponse({
          accessToken: 'synthetic-access-token',
          accessTokenExpiresAt: '2026-09-09T12:05:00.000Z',
          user: {
            displayName: 'Shell Operator',
            email: 'shell@example.test',
            id: '00000000-0000-4000-8000-000000000052',
            permissions: ['tasks:view'],
          },
        }),
      );
    }
    if (url.includes('/v1/tasks')) {
      return Promise.resolve(
        jsonResponse({
          pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
          tasks: [],
        }),
      );
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('authenticated AppShell integration', () => {
  it('keeps login outside the shell, then navigates with History API and restores popstate', async () => {
    mockInternalSession();
    render(<App />);

    expect(screen.getByRole('form', { name: 'Login' })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'shell@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    const overview = await screen.findByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'Tasks' }));
    expect(window.location.pathname).toBe('/tasks');
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');

    act(() => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(overview).toHaveAttribute('aria-current', 'page'));
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  it('keeps public opportunities outside the authenticated shell', async () => {
    window.history.pushState({}, '', '/opportunities');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/health')) {
        return Promise.resolve(
          jsonResponse({
            service: 'hire-me-api',
            status: 'ok',
            timestamp: '2026-09-09T12:00:00.000Z',
            uptimeSeconds: 1,
          }),
        );
      }
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({}, 401));
      }
      if (url.endsWith('/v1/public/opportunities')) {
        return Promise.resolve(jsonResponse({ opportunities: [] }));
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Open roles' })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument();
  });
});
