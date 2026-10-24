import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

const USER_ID = '9b35a643-a774-4c1c-ab5a-b7aec73804d2';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function authResponse() {
  return {
    accessToken: 'login-page-token',
    accessTokenExpiresAt: '2026-10-24T16:05:00.000Z',
    user: {
      displayName: 'Login Tester',
      email: 'login@example.test',
      id: USER_ID,
      permissions: [],
    },
  };
}

function mockApi(loginResponse: () => Promise<Response>) {
  let loginCalls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/health')) {
      return Promise.resolve(
        json({
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-10-24T16:00:00.000Z',
          uptimeSeconds: 1,
        }),
      );
    }
    if (url.endsWith('/auth/refresh')) {
      return Promise.resolve(json({}, 401));
    }
    if (url.endsWith('/auth/login')) {
      loginCalls += 1;
      return loginResponse();
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  return { loginCalls: () => loginCalls };
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'login@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'Synthetic-password-123!' },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('Login Page v2', () => {
  it('signs in successfully and opens the initial workspace landing page', async () => {
    mockApi(() => Promise.resolve(json(authResponse())));
    render(<App />);

    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    expect(screen.getByLabelText('Account and session')).toBeVisible();
  });

  it('shows a safe recovery message for invalid credentials and preserves the entered email', async () => {
    mockApi(() => Promise.resolve(json({ error: { code: 'AUTHENTICATION_FAILED' } }, 401)));
    render(<App />);

    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in unsuccessful');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Check your email and password, then try again.',
    );
    expect(screen.getByLabelText('Email')).toHaveValue('login@example.test');
  });

  it('distinguishes a network failure without exposing technical diagnostics', async () => {
    mockApi(() => Promise.reject(new TypeError('synthetic network detail')));
    render(<App />);

    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach HireMe. Check your connection and try again.',
    );
    expect(screen.queryByText(/synthetic network detail/i)).not.toBeInTheDocument();
  });

  it('blocks duplicate submissions while the first login request is pending', async () => {
    let resolveLogin!: (response: Response) => void;
    const pendingLogin = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const api = mockApi(() => pendingLogin);
    render(<App />);

    fillCredentials();
    const form = screen.getByRole('form', { name: 'Login' });
    fireEvent.submit(form);
    fireEvent.submit(form);

    const pendingButton = screen.getByRole('button', { name: 'Signing in…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    expect(api.loginCalls()).toBe(1);

    resolveLogin(json(authResponse()));
    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  });

  it('reveals and hides the password through an accessible non-submit control', async () => {
    mockApi(() => Promise.resolve(json(authResponse())));
    render(<App />);
    await screen.findByText('Service available');

    const password = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(password).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('submits through native form keyboard semantics', async () => {
    const api = mockApi(() => Promise.resolve(json(authResponse())));
    render(<App />);

    fillCredentials();
    const password = screen.getByLabelText('Password');
    password.focus();
    expect(password).toHaveFocus();
    fireEvent.submit(screen.getByRole('form', { name: 'Login' }));

    await waitFor(() => expect(api.loginCalls()).toBe(1));
    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  });

  it('switches the complete login experience between English and French', async () => {
    mockApi(() => Promise.resolve(json(authResponse())));
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await screen.findByText('Service available')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    expect(screen.getByRole('heading', { name: 'Ravi de vous revoir' })).toBeVisible();
    expect(screen.getByLabelText('Adresse e-mail')).toBeVisible();
    expect(screen.getByLabelText('Mot de passe')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    expect(screen.getByText('Service disponible')).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
  });
});
