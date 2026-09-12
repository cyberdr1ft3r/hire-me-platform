import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { LOCALE_STORAGE_KEY } from './locale.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const shellPermissions = [
  'tasks:view',
  'candidates:view',
  'missions:view',
  'reporting:recruitment:view',
  'clients:view',
  'training_programs:view',
  'documents:view',
  'invoices:view',
  'payments:view',
  'users:view',
];

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
      return Promise.resolve(
        jsonResponse({
          accessToken: 'synthetic-access-token',
          accessTokenExpiresAt: '2026-09-09T12:05:00.000Z',
          user: {
            displayName: 'Shell Operator',
            email: 'shell@example.test',
            id: '00000000-0000-4000-8000-000000000054',
            permissions: shellPermissions,
          },
        }),
      );
    }
    if (url.endsWith('/auth/logout')) {
      return Promise.resolve(jsonResponse({}));
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

/** jsdom exposes `navigator.language` on the prototype, so redefine it directly. */
function stubBrowserLanguage(language: string): () => void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'language');
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => language,
  });
  return () => {
    if (original) {
      Object.defineProperty(window.navigator, 'language', original);
    } else {
      delete (window.navigator as unknown as Record<string, unknown>).language;
    }
  };
}

function languageSelect(): HTMLElement {
  return screen.getByLabelText(/^(Language|Langue)$/);
}

let restoreLanguage: (() => void) | undefined;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  restoreLanguage?.();
  restoreLanguage = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('locale selection at startup', () => {
  it('starts in English with no stored preference and no French browser hint', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    mockInternalSession();
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Overview' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('starts in French when the browser language is French', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    mockInternalSession();
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Vue d’ensemble' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('honours a valid stored French preference over an English browser', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    mockInternalSession();
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Vue d’ensemble' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('ignores an invalid stored preference and falls back to English', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ar');
    mockInternalSession();
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Overview' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('switching language in the shell', () => {
  it('translates the shell immediately, persists, and updates the document language', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    mockInternalSession();
    render(<App />);

    await screen.findByRole('link', { name: 'Overview' });
    expect(screen.getByText('API healthy')).toBeVisible();

    fireEvent.change(languageSelect(), { target: { value: 'fr' } });

    expect(await screen.findByRole('link', { name: 'Vue d’ensemble' })).toBeVisible();
    for (const label of ['Tâches', 'Candidats', 'Rapports', 'Comptabilité', 'Administration']) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Actualiser le profil' })).toBeVisible();
    expect(screen.getByText('API opérationnelle')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Aller au contenu principal' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible();

    expect(document.documentElement.lang).toBe('fr');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
  });

  it('switches back from French to English', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    mockInternalSession();
    render(<App />);

    await screen.findByRole('link', { name: 'Vue d’ensemble' });
    fireEvent.change(languageSelect(), { target: { value: 'en' } });

    expect(await screen.findByRole('link', { name: 'Overview' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('keeps the current route, the destination set, and permissions unchanged', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    mockInternalSession();
    render(<App />);

    await screen.findByRole('link', { name: 'Overview' });
    const before = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null && href !== '#main-content');
    expect(window.location.pathname).toBe('/');

    fireEvent.change(languageSelect(), { target: { value: 'fr' } });
    await screen.findByRole('link', { name: 'Vue d’ensemble' });

    const after = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null && href !== '#main-content');

    // Same permitted destinations, same paths, same route: only the labels moved.
    expect(after).toEqual(before);
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('makes no API call merely because the language changed', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    const fetchSpy = mockInternalSession();
    render(<App />);

    await screen.findByRole('link', { name: 'Overview' });
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(0));
    const callsBefore = fetchSpy.mock.calls.length;

    fireEvent.change(languageSelect(), { target: { value: 'fr' } });
    await screen.findByRole('link', { name: 'Vue d’ensemble' });
    fireEvent.change(languageSelect(), { target: { value: 'en' } });
    await screen.findByRole('link', { name: 'Overview' });

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });

  it('keeps sign-out working after a language switch', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    mockInternalSession();
    render(<App />);

    await screen.findByRole('link', { name: 'Overview' });
    fireEvent.change(languageSelect(), { target: { value: 'fr' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByRole('form', { name: 'Connexion' })).toBeVisible();
    expect(screen.getByLabelText('Adresse e-mail')).toBeVisible();
    expect(screen.getByLabelText('Mot de passe')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
  });
});

describe('locale reach beyond the authenticated shell', () => {
  it('localizes the login screen before any session exists', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
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
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    expect(await screen.findByRole('form', { name: 'Connexion' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
    // The API's own health text is never machine-translated.
    expect(await screen.findByText('hire-me-api is ok')).toBeVisible();
  });

  it('renders the public opportunities in the active language under the shared provider', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
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

    // The public pages are bilingual since Issue #62: they follow the shared
    // provider, inherit the document language, and declare no English region.
    const heading = await screen.findByRole('heading', { name: 'Postes à pourvoir' });
    expect(heading).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(heading.closest('[lang]')).toBe(document.documentElement);
    expect(await screen.findByText('Aucun poste à pourvoir pour le moment')).toBeVisible();
  });

  it('denies an unauthorized direct route in the active language', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/admin');
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
        return Promise.resolve(
          jsonResponse({
            accessToken: 'synthetic-access-token',
            accessTokenExpiresAt: '2026-09-09T12:05:00.000Z',
            user: {
              displayName: 'Shell Operator',
              email: 'shell@example.test',
              id: '00000000-0000-4000-8000-000000000054',
              permissions: ['tasks:view'],
            },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé.');
    expect(screen.getByRole('heading', { name: 'Espace protégé' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });
});
