import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import {
  deferredEnglishRoutes,
  isDeferredEnglishRoute,
} from '../navigation/internal-navigation.js';
import { LOCALE_STORAGE_KEY } from './locale.js';

/**
 * The document language follows the active locale, so a French session sets
 * `<html lang="fr">`. Surfaces that are deliberately still English must declare
 * their own language, or assistive technology is told that English copy is
 * French. These tests hold that invariant while the deferred scope stands.
 */

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
];

const syntheticOpportunity = {
  applicationDeadline: null,
  clientName: null,
  publicDescription: null,
  publicEngagementType: null,
  publicExperienceLevel: null,
  publicLocation: null,
  publicSkills: null,
  publicSlug: 'synthetic-role',
  publicSummary: null,
  publicTitle: 'Synthetic public role',
  publicWorkArrangement: null,
  salary: null,
  uploadRequirements: {
    additionalAttachmentsEnabled: false,
    allowedMimeTypes: ['application/pdf'],
    certificationsEnabled: false,
    certificationsRequired: false,
    cvRequired: true,
    diplomasEnabled: false,
    diplomasRequired: false,
    maxFileSizeBytes: 1_000_000,
    maxTotalUploadBytes: 2_000_000,
  },
};

function healthResponse(): Response {
  return jsonResponse({
    service: 'hire-me-api',
    status: 'ok',
    timestamp: '2026-09-09T12:00:00.000Z',
    uptimeSeconds: 1,
  });
}

function mockInternalSession(permissions: readonly string[] = shellPermissions) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/health')) {
      return Promise.resolve(healthResponse());
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
            permissions: [...permissions],
          },
        }),
      );
    }
    if (url.includes('/v1/tasks') || url.includes('/v1/notifications')) {
      const collection = url.includes('/v1/notifications') ? 'notifications' : 'tasks';
      return Promise.resolve(
        jsonResponse({
          [collection]: [],
          pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
        }),
      );
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

function mockPublicSession() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/health')) {
      return Promise.resolve(healthResponse());
    }
    if (url.endsWith('/auth/refresh')) {
      return Promise.resolve(jsonResponse({}, 401));
    }
    if (url.endsWith('/v1/public/opportunities')) {
      return Promise.resolve(jsonResponse({ opportunities: [syntheticOpportunity] }));
    }
    if (url.includes('/v1/public/opportunities/')) {
      return Promise.resolve(jsonResponse({ opportunity: syntheticOpportunity }));
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

/** The language actually announced for an element, walking up to the document. */
function effectiveLanguage(element: HTMLElement): string {
  return element.closest('[lang]')?.getAttribute('lang') ?? '';
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

describe('deferred English modules inside a French shell', () => {
  it('keeps the document French, the shell French, and the legacy module English', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/tasks');
    mockInternalSession();
    render(<App />);

    // The shell itself is translated.
    expect(await screen.findByRole('link', { name: 'Tâches' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');

    // The module inside it is not, and says so.
    const legacyHeading = await screen.findByRole('heading', { name: 'Tasks' });
    expect(effectiveLanguage(legacyHeading)).toBe('en');
    const boundary = legacyHeading.closest('[lang="en"]');
    expect(boundary).not.toBeNull();
    expect(boundary?.getAttribute('lang')).toBe('en');

    // The shell chrome is outside that boundary.
    expect(effectiveLanguage(screen.getByRole('link', { name: 'Tâches' }))).toBe('fr');
  });

  it('leaves permission behaviour untouched by the language boundary', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/tasks');
    mockInternalSession(['tasks:view']);
    render(<App />);

    await screen.findByRole('heading', { name: 'Tasks' });
    // Only the permitted destinations are present, exactly as without the boundary.
    expect(screen.getByRole('link', { name: 'Tâches' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Candidats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/tasks');
  });

  it('applies the boundary to every deferred destination and to nothing else', () => {
    expect([...deferredEnglishRoutes].sort()).toEqual([
      'accounting',
      'admin',
      'clients',
      'commercial',
      'documents',
      'missions',
      'tasks',
      'training',
    ]);
    expect(isDeferredEnglishRoute('tasks')).toBe(true);
    // Reporting and Candidates are bilingual since their redesigns, so they left
    // the boundary and must never be announced as English inside a French
    // document again.
    expect(isDeferredEnglishRoute('reporting')).toBe(false);
    expect(isDeferredEnglishRoute('candidates')).toBe(false);
    // The Overview page is translated, so it is never marked as English content.
    expect(isDeferredEnglishRoute('home')).toBe(false);
  });
});

describe('translated surfaces carry no English override', () => {
  it('leaves the localized Overview inside the document language', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    mockInternalSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Vue d’ensemble' });
    expect(document.documentElement.lang).toBe('fr');
    expect(effectiveLanguage(heading)).toBe('fr');
    expect(heading.closest('.legacy-english-content')).toBeNull();
    expect(document.querySelector('.legacy-english-content')).toBeNull();
  });

  it('leaves the localized permission denial inside the document language', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/admin');
    mockInternalSession(['tasks:view']);
    render(<App />);

    const denial = await screen.findByRole('alert');
    expect(denial).toHaveTextContent('Accès refusé.');
    expect(effectiveLanguage(denial)).toBe('fr');
    expect(document.querySelector('.legacy-english-content')).toBeNull();
  });

  it('keeps the localized login screen inside the document language', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/health')) {
        return Promise.resolve(healthResponse());
      }
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({}, 401));
      }
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });

    render(<App />);

    const form = await screen.findByRole('form', { name: 'Connexion' });
    expect(effectiveLanguage(form)).toBe('fr');
    expect(document.querySelector('.legacy-english-content')).toBeNull();
  });
});

describe('deferred English public routes', () => {
  it('marks the public opportunity list as English while the document stays French', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/opportunities');
    mockPublicSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Open roles' });
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(effectiveLanguage(heading)).toBe('en');
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument();
  });

  it('marks the public opportunity detail as English while the document stays French', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/opportunities/synthetic-role');
    mockPublicSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Synthetic public role' });
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(effectiveLanguage(heading)).toBe('en');
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the shared locale preference working across the public boundary', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    window.history.pushState({}, '', '/opportunities');
    mockPublicSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Open roles' });
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(effectiveLanguage(heading)).toBe('en');
    // The public page did not touch the stored preference.
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
  });
});

describe('the boundary is language metadata only', () => {
  it('does not change the module DOM, its layout box, or its behaviour', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/tasks');
    mockInternalSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Tasks' });
    const boundary = heading.closest('.legacy-english-content');
    expect(boundary).not.toBeNull();
    // The panel remains the boundary's own child, so no element was inserted
    // between the module root and its content.
    expect(boundary?.firstElementChild).toBe(heading.closest('.admin-panel'));

    // Navigating to a translated destination removes the boundary entirely.
    fireEvent.click(screen.getByRole('link', { name: 'Vue d’ensemble' }));
    expect(await screen.findByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible();
    expect(document.querySelector('.legacy-english-content')).toBeNull();
  });
});
