import { render, screen, waitFor } from '@testing-library/react';
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

describe('Task workspace inside a French shell', () => {
  it('keeps the document, shell, and bilingual Task module French', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/tasks');
    mockInternalSession();
    render(<App />);

    // The shell itself is translated.
    expect(await screen.findByRole('link', { name: 'Tâches' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');

    const taskHeading = await screen.findByRole('heading', { name: 'Pipeline des tâches' });
    expect(effectiveLanguage(taskHeading)).toBe('fr');
    expect(taskHeading.closest('[lang="en"]')).toBeNull();

    // The shell chrome is outside that boundary.
    expect(effectiveLanguage(screen.getByRole('link', { name: 'Tâches' }))).toBe('fr');
  });

  it('leaves Task permission behaviour untouched after removing the boundary', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/tasks');
    mockInternalSession(['tasks:view']);
    render(<App />);

    await screen.findByRole('heading', { name: 'Pipeline des tâches' });
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
      'training',
    ]);
    expect(isDeferredEnglishRoute('tasks')).toBe(false);
    // Reporting, Candidates, and Tasks are bilingual since their redesigns, so they left
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

// The public opportunity pages became bilingual in Issue #62, so their English
// boundary was removed. They must never be announced as English again inside
// a French document.
describe('bilingual public routes carry no English boundary', () => {
  it('keeps the French public opportunity list inside the document language', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/opportunities');
    mockPublicSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { level: 1, name: 'Postes à pourvoir' });
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(effectiveLanguage(heading)).toBe('fr');
    expect(await screen.findByRole('link', { name: 'Synthetic public role' })).toBeVisible();
    expect(document.querySelector('.legacy-english-content')).toBeNull();
    expect(document.querySelector('[lang="en"]')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the French public opportunity detail and form inside the document language', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/opportunities/synthetic-role');
    mockPublicSession();
    render(<App />);

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Synthetic public role',
    });
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(effectiveLanguage(heading)).toBe('fr');
    const form = screen.getByRole('form', { name: 'Postuler à cette offre' });
    expect(effectiveLanguage(form)).toBe('fr');
    expect(document.querySelector('.legacy-english-content')).toBeNull();
    expect(document.querySelector('[lang="en"]')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
  });

  it('follows the shared stored locale preference on the public pages', async () => {
    restoreLanguage = stubBrowserLanguage('en-US');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    window.history.pushState({}, '', '/opportunities');
    mockPublicSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { level: 1, name: 'Postes à pourvoir' });
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(effectiveLanguage(heading)).toBe('fr');
    // Loading the public page did not touch the stored preference.
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
  });
});

describe('the Task route language boundary', () => {
  it('renders the bilingual Task workspace directly in French', async () => {
    restoreLanguage = stubBrowserLanguage('fr-FR');
    window.history.pushState({}, '', '/tasks');
    mockInternalSession();
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Pipeline des tâches' });
    expect(effectiveLanguage(heading)).toBe('fr');
    expect(heading.closest('.legacy-english-content')).toBeNull();
    expect(document.querySelector('.legacy-english-content')).toBeNull();
  });
});
