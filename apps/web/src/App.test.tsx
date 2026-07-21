import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
