import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser, CandidateDetail } from '@hire-me/contracts';

import { App } from '../App.js';
import { I18nProvider, type Locale } from '../i18n/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import {
  asServerWouldReturn,
  CANDIDATE_ID,
  FULL_PERMISSIONS,
  ORDINARY_PERMISSIONS,
  P,
  SECOND_CANDIDATE_ID,
  syntheticCandidate,
} from './candidate-test-data.js';
import { CandidatesPanel } from './CandidatesPanel.js';

/**
 * Candidate container tests.
 *
 * They drive the real container against a stubbed `fetch`, so the assertions
 * cover exactly what the workspace asks the API for — URLs, methods, and bodies
 * — and what it renders from each answer, including failures.
 */

const TOKEN = 'synthetic-candidate-token';
const API = 'http://127.0.0.1:3000/v1/candidates';

interface RecordedCall {
  body: unknown;
  method: string;
  url: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

type Handler = (call: RecordedCall) => Response | Promise<Response> | undefined;

function stubCandidateApi(permissions: readonly string[], handler?: Handler) {
  const calls: RecordedCall[] = [];
  const records = new Map<string, CandidateDetail>([
    [CANDIDATE_ID, syntheticCandidate()],
    [
      SECOND_CANDIDATE_ID,
      syntheticCandidate({ displayName: 'Second Candidate', id: SECOND_CANDIDATE_ID }),
    ],
  ]);
  const shaped = (record: CandidateDetail) => asServerWouldReturn(record, permissions);

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call = { body, method, url };
    calls.push(call);

    const custom = handler?.(call);
    if (custom) {
      return Promise.resolve(custom);
    }

    const path = url.startsWith(API) ? url.slice(API.length) : null;
    if (path === null) {
      return Promise.reject(new Error(`Unexpected request ${url}`));
    }
    if (method === 'GET' && path.startsWith('?')) {
      const list = [...records.values()].map(shaped);
      return Promise.resolve(
        jsonResponse({
          candidates: list,
          pagination: { page: 1, pageSize: 20, total: list.length },
        }),
      );
    }
    const [, id, action] = path.split('/');
    const record = id ? records.get(id) : undefined;
    if (method === 'POST' && path === '') {
      const created = syntheticCandidate({
        ...(body as Partial<CandidateDetail>),
        education: [],
        id: 'a22c0929-9ac3-4d0e-ad26-760814c6465d',
        languages: [],
        skills: [],
        workExperiences: [],
      });
      records.set(created.id, created);
      return Promise.resolve(jsonResponse({ candidate: shaped(created) }, 201));
    }
    if (!record) {
      return Promise.resolve(jsonResponse({ error: { code: 'CANDIDATE_NOT_FOUND' } }, 404));
    }
    if (method === 'GET' && !action) {
      return Promise.resolve(jsonResponse({ candidate: shaped(record) }));
    }
    if (method === 'PATCH' && !action) {
      const next = { ...record, ...(body as Partial<CandidateDetail>) };
      records.set(record.id, next);
      return Promise.resolve(jsonResponse({ candidate: shaped(next) }));
    }
    if (method === 'PATCH' && action === 'status') {
      const next = { ...record, status: (body as { status: CandidateDetail['status'] }).status };
      records.set(record.id, next);
      return Promise.resolve(jsonResponse({ candidate: shaped(next) }));
    }
    if (method === 'POST' && action === 'archive') {
      const next: CandidateDetail = {
        ...record,
        archivedAt: '2026-07-22T00:00:00.000Z',
        status: 'ARCHIVED',
      };
      records.set(record.id, next);
      return Promise.resolve(jsonResponse({ candidate: shaped(next) }));
    }
    if (method === 'POST' && action === 'skills') {
      const values = body as { level?: string; name: string };
      const skill = {
        archivedAt: null,
        candidateId: record.id,
        createdAt: '2026-07-22T00:00:00.000Z',
        id: 'a0000000-0000-4000-8000-000000000099',
        lastUsed: null,
        level: values.level ?? null,
        name: values.name,
        updatedAt: '2026-07-22T00:00:00.000Z',
        years: null,
      };
      records.set(record.id, { ...record, skills: [skill, ...record.skills] });
      return Promise.resolve(jsonResponse({ skill }, 201));
    }
    return Promise.reject(new Error(`Unhandled ${method} ${url}`));
  });

  return { calls, fetchMock };
}

function renderPanel(permissions: readonly string[], locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <CandidatesPanel accessToken={TOKEN} permissions={[...permissions]} />
    </I18nProvider>,
  );
}

async function selectCandidate(name = 'Synthetic Candidate') {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('heading', { level: 2, name });
}

const candidateCalls = (calls: RecordedCall[]) => calls.filter((call) => call.url.startsWith(API));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Candidate reads', () => {
  it('lists the first 20 candidates with the unchanged query and reads one record on selection', async () => {
    const { calls } = stubCandidateApi([P.view]);
    renderPanel([P.view]);

    await selectCandidate();
    expect(candidateCalls(calls).map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${API}?page=1&pageSize=20`,
      `GET ${API}/${CANDIDATE_ID}`,
    ]);
    const call = calls.find((entry) => entry.url.startsWith(API));
    expect(call?.body).toBeUndefined();
  });

  it('searches with exactly the search and status parameters it has always sent', async () => {
    const { calls } = stubCandidateApi([P.view]);
    renderPanel([P.view]);
    await screen.findByRole('button', { name: 'Synthetic Candidate' });

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'lyon' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'TALENT_POOL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));

    await waitFor(() => expect(candidateCalls(calls)).toHaveLength(2));
    const url = new URL(candidateCalls(calls)[1]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '1',
      pageSize: '20',
      search: 'lyon',
      status: 'TALENT_POOL',
    });
  });

  it('shows a safe failure without backend text, then recovers on retry', async () => {
    let failures = 1;
    stubCandidateApi([P.view], (call) => {
      if (call.method === 'GET' && call.url.includes('?') && failures > 0) {
        failures -= 1;
        return jsonResponse({ error: { code: 'INTERNAL', message: 'db host 10.0.0.5 down' } }, 500);
      }
      return undefined;
    });
    renderPanel([P.view]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load candidates.');
    expect(document.body.textContent).not.toContain('10.0.0.5');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Synthetic Candidate' })).toBeVisible();
  });

  it('discards a late record response for an earlier selection', async () => {
    let releaseFirst: (response: Response) => void = () => undefined;
    stubCandidateApi([P.view], (call) => {
      if (call.method === 'GET' && call.url.endsWith(`/${CANDIDATE_ID}`)) {
        return new Promise<Response>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return undefined;
    });
    renderPanel([P.view]);

    fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Candidate' }));
    await selectCandidate('Second Candidate');

    releaseFirst(jsonResponse({ candidate: syntheticCandidate() }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Synthetic Candidate' })).toBeNull();
  });
});

describe('Candidate mutations keep their exact API behavior', () => {
  it('creates with the same seven approved fields, omitting empty ones', async () => {
    const { calls } = stubCandidateApi([P.view, P.create]);
    renderPanel([P.view, P.create]);
    await screen.findByRole('button', { name: 'Synthetic Candidate' });

    fireEvent.click(screen.getByRole('button', { name: 'New candidate' }));
    const form = screen.getByRole('form', { name: 'New candidate' });
    fireEvent.change(within(form).getByLabelText(/^Full name/), {
      target: { value: 'Created Candidate' },
    });
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: ' created.candidate@example.test ' },
    });
    fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Paris' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create candidate' }));

    expect(await screen.findByText('Candidate created.')).toBeVisible();
    const post = candidateCalls(calls).find((call) => call.method === 'POST');
    expect(post?.url).toBe(API);
    expect(post?.body).toEqual({
      city: 'Paris',
      displayName: 'Created Candidate',
      email: 'created.candidate@example.test',
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Created Candidate' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'New candidate' })).toBeNull();
  });

  it('saves the same eight master fields and never compensation or consent keys', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const form = screen.getByRole('form', { name: 'Edit profile' });
    fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Paris' } });
    fireEvent.change(within(form).getByLabelText('Phone'), { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Candidate updated.')).toBeVisible();
    const patch = candidateCalls(calls).find((call) => call.method === 'PATCH');
    expect(patch?.url).toBe(`${API}/${CANDIDATE_ID}`);
    expect(patch?.body).toEqual({
      city: 'Paris',
      country: 'France',
      currentJobTitle: 'Recruiter',
      displayName: 'Synthetic Candidate',
      email: 'candidate@example.test',
      phone: null,
      professionalSummary: 'Synthetic summary.',
      source: 'Synthetic',
    });
    for (const key of [
      'salaryExpectationCents',
      'salaryExpectationCurrency',
      'consentStatus',
      'consentRecordedAt',
      'status',
    ]) {
      expect(patch?.body).not.toHaveProperty(key);
    }
  });

  it('confirms a lifecycle change and sends only the stored status value', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS, 'fr');
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme inactif' }));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Passer le statut de ce candidat à'),
    );
    expect(confirm.mock.calls[0]?.[0]).toContain('Inactif');
    // French typography: a no-break space precedes the colon.
    expect(await screen.findByText(/^Statut du candidat modifié\s:\sInactif\.$/u)).toBeVisible();
    const patch = candidateCalls(calls).find((call) => call.url.endsWith('/status'));
    expect(patch?.method).toBe('PATCH');
    expect(patch?.body).toEqual({ status: 'INACTIVE' });
  });

  it('sends nothing when a lifecycle change or archival is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();
    const before = candidateCalls(calls).length;

    fireEvent.click(screen.getByRole('button', { name: 'Move to talent pool' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive candidate' }));

    expect(candidateCalls(calls)).toHaveLength(before);
  });

  it('archives through the archive endpoint after confirmation, with no deletion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Archive candidate' }));

    expect(await screen.findByText('Candidate archived.')).toBeVisible();
    expect(candidateCalls(calls).some((call) => call.method === 'DELETE')).toBe(false);
    const archive = candidateCalls(calls).find((call) => call.url.endsWith('/archive'));
    expect(archive).toMatchObject({ body: undefined, method: 'POST' });
    // The record is now read-only: every write action is gone.
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive candidate' })).toBeNull();
  });

  it('adds a skill with the same body and re-reads the record', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    const form = screen.getByRole('form', { name: 'Add skill' });
    fireEvent.change(within(form).getByLabelText(/^Skill/), { target: { value: 'Interviewing' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add skill' }));

    expect(await screen.findByText('Skill added.')).toBeVisible();
    const post = candidateCalls(calls).find((call) => call.url.endsWith('/skills'));
    expect(post).toMatchObject({ body: { name: 'Interviewing' }, method: 'POST' });
    const reads = candidateCalls(calls).filter(
      (call) => call.method === 'GET' && call.url === `${API}/${CANDIDATE_ID}`,
    );
    expect(reads).toHaveLength(2);
    const skills = screen.getByRole('region', { name: /^Skills/ });
    expect(within(skills).getByText('Interviewing')).toBeVisible();
  });
});

describe('Candidate conflict and validation feedback', () => {
  it('maps a duplicate email to the email field without backend text', async () => {
    stubCandidateApi([P.view, P.create], (call) =>
      call.method === 'POST'
        ? jsonResponse(
            {
              error: {
                code: 'CANDIDATE_EMAIL_ALREADY_EXISTS',
                message: 'A candidate with that normalized email already exists (row 42).',
              },
            },
            409,
          )
        : undefined,
    );
    renderPanel([P.view, P.create]);
    await screen.findByRole('button', { name: 'Synthetic Candidate' });

    fireEvent.click(screen.getByRole('button', { name: 'New candidate' }));
    const form = screen.getByRole('form', { name: 'New candidate' });
    fireEvent.change(within(form).getByLabelText(/^Full name/), { target: { value: 'Copy' } });
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: 'candidate@example.test' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Create candidate' }));

    expect(
      await within(form).findByText('A candidate with this email already exists.'),
    ).toBeVisible();
    expect(within(form).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(document.body.textContent).not.toContain('row 42');
  });

  it('refreshes the record when a change meets an archived candidate', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.url.endsWith('/status')
        ? jsonResponse({ error: { code: 'CANDIDATE_ARCHIVED', message: 'raw' } }, 409)
        : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Mark inactive' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This candidate has been archived and can no longer be changed.',
    );
    await waitFor(() =>
      expect(
        candidateCalls(calls).filter(
          (call) => call.method === 'GET' && call.url === `${API}/${CANDIDATE_ID}`,
        ),
      ).toHaveLength(2),
    );
  });
});

describe('Candidate localization in the running application', () => {
  it('switches language on the mounted workspace without refetching or changing data', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    const user: AuthenticatedUser = {
      displayName: 'Candidate Reviewer',
      email: 'reviewer@example.test',
      id: '44444444-4444-4444-8444-444444444444',
      permissions: FULL_PERMISSIONS,
    };
    render(
      <I18nProvider initialLocale="en">
        <AppShell
          apiState={{ message: 'ok', status: 'ready' }}
          currentRoute="candidates"
          onLogout={() => undefined}
          onNavigate={() => undefined}
          onRefreshUser={() => undefined}
          user={user}
        >
          <CandidatesPanel accessToken={TOKEN} permissions={FULL_PERMISSIONS} />
        </AppShell>
      </I18nProvider>,
    );
    const heading = await selectCandidate();
    const before = candidateCalls(calls).map((call) => `${call.method} ${call.url}`);

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    expect(await screen.findByRole('heading', { level: 1, name: 'Candidats' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Informations restreintes' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
    expect(heading.isConnected).toBe(true);
    expect(candidateCalls(calls).map((call) => `${call.method} ${call.url}`)).toEqual(before);
    expect(candidateCalls(calls).every((call) => call.method === 'GET')).toBe(true);
  });

  it('renders /candidates in French with no English-content boundary', async () => {
    window.localStorage.setItem('hireme.locale', 'fr');
    window.history.pushState({}, '', '/candidates');
    stubCandidateApi([P.view], (call) => {
      if (call.url.endsWith('/health')) {
        return jsonResponse({
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-09-10T12:00:00.000Z',
          uptimeSeconds: 1,
        });
      }
      if (call.url.endsWith('/auth/refresh')) {
        return jsonResponse({
          accessToken: TOKEN,
          accessTokenExpiresAt: '2026-09-10T12:05:00.000Z',
          user: {
            displayName: 'Candidate Viewer',
            email: 'viewer@example.test',
            id: '55555555-5555-4555-8555-555555555555',
            permissions: [P.view],
          },
        });
      }
      return undefined;
    });

    render(<App />);

    const title = await screen.findByRole('heading', { level: 1, name: 'Candidats' });
    await screen.findByRole('button', { name: 'Synthetic Candidate' });
    expect(document.documentElement.lang).toBe('fr');
    expect(title.closest('[lang="en"]')).toBeNull();
    expect(document.querySelector('.legacy-english-content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rechercher' })).toBeVisible();
  });
});
