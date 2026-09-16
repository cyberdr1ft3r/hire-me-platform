import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';

import type { AuthenticatedUser, CandidateDetail } from '@hire-me/contracts';

import { App } from '../App.js';
import { I18nProvider, useI18n, type Locale } from '../i18n/index.js';
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
  /** The bearer credential the request carried, so session boundaries can be asserted. */
  token: string | null;
  url: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

type Handler = (call: RecordedCall) => Response | Promise<Response> | undefined;

/** The nullable fields a created structured record has when the request omits them. */
const CHILD_DEFAULTS: Record<string, object> = {
  education: { description: null, endDate: null, field: null, startDate: null },
  languages: {},
  skills: { lastUsed: null, level: null, years: null },
  workExperiences: { description: null, endDate: null, isCurrent: false, startDate: null },
};

/** The nested structured-record routes, their detail collection, and response key. */
const CHILD_ROUTES: Record<
  string,
  {
    collection: 'education' | 'languages' | 'skills' | 'workExperiences';
    key: string;
    notFound: string;
  }
> = {
  education: {
    collection: 'education',
    key: 'education',
    notFound: 'CANDIDATE_EDUCATION_NOT_FOUND',
  },
  languages: { collection: 'languages', key: 'language', notFound: 'CANDIDATE_LANGUAGE_NOT_FOUND' },
  skills: { collection: 'skills', key: 'skill', notFound: 'CANDIDATE_SKILL_NOT_FOUND' },
  'work-experiences': {
    collection: 'workExperiences',
    key: 'workExperience',
    notFound: 'CANDIDATE_WORK_EXPERIENCE_NOT_FOUND',
  },
};

/**
 * A Candidate PATCH as the server applies it: the restricted keys land in their
 * own compensation and consent groups, every other key on the master record.
 */
function applyCandidatePatch(
  record: CandidateDetail,
  body: Record<string, unknown>,
): CandidateDetail {
  const {
    consentRecordedAt,
    consentStatus,
    salaryExpectationCents,
    salaryExpectationCurrency,
    ...profile
  } = body;
  const compensation = record.compensation ?? {
    salaryExpectationCents: null,
    salaryExpectationCurrency: null,
  };
  const consent = record.consent ?? { consentRecordedAt: null, consentStatus: 'UNKNOWN' };
  return {
    ...record,
    ...(profile as Partial<CandidateDetail>),
    compensation: {
      salaryExpectationCents:
        salaryExpectationCents !== undefined
          ? (salaryExpectationCents as number | null)
          : compensation.salaryExpectationCents,
      salaryExpectationCurrency:
        salaryExpectationCurrency !== undefined
          ? (salaryExpectationCurrency as string | null)
          : compensation.salaryExpectationCurrency,
    },
    consent: {
      consentRecordedAt:
        consentRecordedAt !== undefined
          ? (consentRecordedAt as string | null)
          : consent.consentRecordedAt,
      consentStatus:
        consentStatus !== undefined
          ? (consentStatus as NonNullable<CandidateDetail['consent']>['consentStatus'])
          : consent.consentStatus,
    },
  };
}

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
    const token = init?.headers instanceof Headers ? init.headers.get('Authorization') : null;
    const call = { body, method, token, url };
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
    const [, id, action, childId, childAction] = path.split('/');
    const record = id ? records.get(id) : undefined;
    // Structured records: a partial update or an archival, never a deletion.
    const child = action ? CHILD_ROUTES[action] : undefined;
    if (record && child && !childId && method === 'POST' && action !== 'skills') {
      const created = {
        archivedAt: null,
        candidateId: record.id,
        createdAt: '2026-07-23T00:00:00.000Z',
        id: 'd0000000-0000-4000-8000-000000000099',
        updatedAt: '2026-07-23T00:00:00.000Z',
        ...CHILD_DEFAULTS[child.collection],
        ...(body as object),
      };
      records.set(record.id, {
        ...record,
        [child.collection]: [created, ...(record[child.collection] as object[])],
      });
      return Promise.resolve(jsonResponse({ [child.key]: created }, 201));
    }
    if (record && child && childId) {
      const rows = record[child.collection] as { archivedAt: string | null; id: string }[];
      const existing = rows.find((row) => row.id === childId);
      if (!existing) {
        return Promise.resolve(jsonResponse({ error: { code: child.notFound } }, 404));
      }
      const next =
        method === 'POST' && childAction === 'archive'
          ? { ...existing, archivedAt: '2026-07-23T00:00:00.000Z' }
          : method === 'PATCH' && !childAction
            ? { ...existing, ...(body as object) }
            : null;
      if (!next) {
        return Promise.reject(new Error(`Unhandled ${method} ${url}`));
      }
      records.set(record.id, {
        ...record,
        [child.collection]: rows.map((row) => (row.id === childId ? next : row)),
      });
      return Promise.resolve(jsonResponse({ [child.key]: next }, method === 'POST' ? 201 : 200));
    }
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
      const next = applyCandidatePatch(record, body as Record<string, unknown>);
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

/** Candidate list responses shaped by their `search` parameter, as the server would filter. */
function listResponseFor(url: string): Response {
  const search = new URL(url).searchParams.get('search') ?? '';
  const candidates = [
    syntheticCandidate(),
    syntheticCandidate({ displayName: 'Second Candidate', id: SECOND_CANDIDATE_ID }),
  ].filter((candidate) => candidate.displayName.includes(search));
  return jsonResponse({
    candidates: candidates.map((candidate) => asServerWouldReturn(candidate, ORDINARY_PERMISSIONS)),
    pagination: { page: 1, pageSize: 20, total: candidates.length },
  });
}

const isListCall = (call: RecordedCall) => call.method === 'GET' && call.url.startsWith(`${API}?`);
const searchOf = (call: RecordedCall) => new URL(call.url).searchParams.get('search');

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
  it('resolves the pending deep-link intent when Strict Mode replays mount effects', async () => {
    let releaseDetail: (() => void) | undefined;
    const detail = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    const { calls } = stubCandidateApi([P.view], (call) =>
      call.url === `${API}/${SECOND_CANDIDATE_ID}`
        ? detail.then(() =>
            jsonResponse({
              candidate: syntheticCandidate({
                displayName: 'Second Candidate',
                id: SECOND_CANDIDATE_ID,
              }),
            }),
          )
        : undefined,
    );
    render(
      <StrictMode>
        <I18nProvider>
          <CandidatesPanel
            accessToken={TOKEN}
            initialCandidateId={SECOND_CANDIDATE_ID}
            permissions={[P.view]}
          />
        </I18nProvider>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(calls.filter((call) => call.url === `${API}/${SECOND_CANDIDATE_ID}`)).toHaveLength(2),
    );
    releaseDetail?.();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Second Candidate' }),
    ).toBeVisible();
  });

  it('loads an exact deep-linked candidate independently of the current list page', async () => {
    const { calls } = stubCandidateApi([P.view]);
    render(
      <I18nProvider>
        <CandidatesPanel
          accessToken={TOKEN}
          initialCandidateId={SECOND_CANDIDATE_ID}
          permissions={[P.view]}
        />
      </I18nProvider>,
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Second Candidate' }),
    ).toBeVisible();
    expect(calls.some((call) => call.url === `${API}/${SECOND_CANDIDATE_ID}`)).toBe(true);
  });

  it('lets manual selection supersede the one-shot deep-link intent and replace its URL owner', async () => {
    let resolveInitial: ((response: Response) => void) | undefined;
    const initialRead = new Promise<Response>((resolve) => {
      resolveInitial = resolve;
    });
    stubCandidateApi([P.view], (call) =>
      call.url === `${API}/${CANDIDATE_ID}` ? initialRead : undefined,
    );
    const onSelectionChange = vi.fn();
    render(
      <I18nProvider>
        <CandidatesPanel
          accessToken={TOKEN}
          initialCandidateId={CANDIDATE_ID}
          onSelectionChange={onSelectionChange}
          permissions={[P.view]}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Second Candidate' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Second Candidate' }),
    ).toBeVisible();
    expect(onSelectionChange).toHaveBeenCalledWith(SECOND_CANDIDATE_ID);

    resolveInitial?.(jsonResponse({ candidate: syntheticCandidate() }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
  });

  it('shows the same generic detail failure for a hidden deep-linked candidate', async () => {
    stubCandidateApi([P.view], (call) =>
      call.url === `${API}/${CANDIDATE_ID}`
        ? jsonResponse({ code: 'CANDIDATE_NOT_FOUND', message: 'hidden' }, 404)
        : undefined,
    );
    render(
      <I18nProvider>
        <CandidatesPanel
          accessToken={TOKEN}
          initialCandidateId={CANDIDATE_ID}
          permissions={[P.view]}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText('Unable to load this candidate.')).toBeVisible();
    expect(screen.queryByText('hidden')).toBeNull();
    expect(screen.queryByText(CANDIDATE_ID)).toBeNull();
  });

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

/** A response the test releases explicitly, so every ordering is deterministic. */
function deferredResponse() {
  let release: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const isSecondCandidateDetail = (call: RecordedCall) =>
  call.method === 'GET' && call.url === `${API}/${SECOND_CANDIDATE_ID}`;

/** Moves the selection to the second candidate and waits until its record is on screen. */
async function moveToSecondCandidate() {
  fireEvent.click(screen.getByRole('button', { name: 'Second Candidate' }));
  return screen.findByRole('heading', { level: 2, name: 'Second Candidate' });
}

/**
 * The single write lock is released when the write in flight settles. Both the
 * success and the failure path end there, so waiting for the second candidate's
 * own action to be enabled again proves the earlier write has fully resolved.
 */
async function waitForWriteToSettle() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark inactive' })).toBeEnabled());
}

describe('Candidate writes stay scoped to the candidate they started on', () => {
  it('does not show a late update success for candidate A on candidate B', async () => {
    const update = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}` ? update.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const form = screen.getByRole('form', { name: 'Edit profile' });
    fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Paris' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));

    await moveToSecondCandidate();
    update.release(
      jsonResponse({ candidate: syntheticCandidate({ city: 'Paris', displayName: 'Updated A' }) }),
    );
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Updated A' })).toBeNull();
    expect(screen.queryByText('Candidate updated.')).toBeNull();
    // The server write itself was not cancelled, and the list may still refresh.
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'GET' && call.url.includes('?')).length).toBe(2);
  });

  it.each([
    ['status change', 'Mark inactive', `/${CANDIDATE_ID}/status`],
    ['archival', 'Archive candidate', `/${CANDIDATE_ID}/archive`],
  ])(
    'does not show a late %s failure for candidate A on candidate B',
    async (_label, action, path) => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const write = deferredResponse();
      stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
        call.url === `${API}${path}` ? write.promise : undefined,
      );
      renderPanel(ORDINARY_PERMISSIONS);
      await selectCandidate();

      fireEvent.click(screen.getByRole('button', { name: action }));
      await moveToSecondCandidate();
      write.release(
        jsonResponse({ error: { code: 'CANDIDATE_ARCHIVED', message: 'raw backend text' } }, 409),
      );
      await waitForWriteToSettle();

      expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(
        screen.queryByText('This candidate has been archived and can no longer be changed.'),
      ).toBeNull();
    },
  );

  it('does not show a late update failure for candidate A on candidate B', async () => {
    const update = deferredResponse();
    stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}` ? update.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.click(
      within(screen.getByRole('form', { name: 'Edit profile' })).getByRole('button', {
        name: 'Save changes',
      }),
    );
    await moveToSecondCandidate();
    update.release(jsonResponse({ error: { code: 'CANDIDATE_ARCHIVED' } }, 409));
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not show a late add-record success for candidate A on candidate B, or re-read A', async () => {
    const skill = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.url === `${API}/${CANDIDATE_ID}/skills` ? skill.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    const form = screen.getByRole('form', { name: 'Add skill' });
    fireEvent.change(within(form).getByLabelText(/^Skill/), { target: { value: 'Interviewing' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add skill' }));
    await moveToSecondCandidate();
    expect(calls.some(isSecondCandidateDetail)).toBe(true);

    skill.release(
      jsonResponse(
        {
          skill: {
            archivedAt: null,
            candidateId: CANDIDATE_ID,
            createdAt: '2026-07-22T00:00:00.000Z',
            id: 'a0000000-0000-4000-8000-000000000099',
            lastUsed: null,
            level: null,
            name: 'Interviewing',
            updatedAt: '2026-07-22T00:00:00.000Z',
            years: null,
          },
        },
        201,
      ),
    );
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByText('Skill added.')).toBeNull();
    const candidateAReads = calls.filter(
      (call) => call.method === 'GET' && call.url === `${API}/${CANDIDATE_ID}`,
    );
    expect(candidateAReads).toHaveLength(1);
  });
});

describe('Candidate writes never overlap', () => {
  const writeCalls = (calls: RecordedCall[]) =>
    candidateCalls(calls).filter((call) => call.method !== 'GET');

  it('locks every other write entry point while a lifecycle change is in flight', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const status = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.url.endsWith('/status') ? status.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    // Forms that were opened while nothing was pending.
    fireEvent.click(screen.getByRole('button', { name: 'New candidate' }));
    const createForm = screen.getByRole('form', { name: 'New candidate' });
    fireEvent.change(within(createForm).getByLabelText(/^Full name/), {
      target: { value: 'Overlapping Candidate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const editForm = screen.getByRole('form', { name: 'Edit profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    const skillForm = screen.getByRole('form', { name: 'Add skill' });
    fireEvent.change(within(skillForm).getByLabelText(/^Skill/), {
      target: { value: 'Interviewing' },
    });

    // The first write starts.
    fireEvent.click(screen.getByRole('button', { name: 'Mark inactive' }));
    await waitFor(() => expect(writeCalls(calls)).toHaveLength(1));

    // No second write can start from any entry point.
    expect(screen.getByRole('button', { name: 'New candidate' })).toBeDisabled();
    expect(within(createForm).getByRole('button', { name: 'Create candidate' })).toBeDisabled();
    expect(within(editForm).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(within(skillForm).getByRole('button', { name: 'Add skill' })).toBeDisabled();
    for (const name of ['Move to talent pool', 'Archive candidate']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    for (const name of ['Add language', 'Add experience', 'Add education']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }

    // Even implicit submission from a text field is refused while the write runs.
    fireEvent.submit(createForm);
    fireEvent.submit(editForm);
    fireEvent.submit(skillForm);
    fireEvent.click(screen.getByRole('button', { name: 'Move to talent pool' }));
    expect(writeCalls(calls)).toHaveLength(1);

    // Once it settles, the lock is released and a new write may start.
    status.release(jsonResponse({ candidate: syntheticCandidate({ status: 'INACTIVE' }) }));
    expect(await screen.findByText('Candidate status changed to Inactive.')).toBeVisible();
    await waitFor(() =>
      expect(within(editForm).getByRole('button', { name: 'Save changes' })).toBeEnabled(),
    );
    expect(writeCalls(calls)).toHaveLength(1);
    fireEvent.submit(skillForm);
    await waitFor(() => expect(writeCalls(calls)).toHaveLength(2));
    expect(writeCalls(calls)[1]?.url).toBe(`${API}/${CANDIDATE_ID}/skills`);
  });

  it('keeps the lock until an in-flight create settles, then restores focus to New candidate', async () => {
    const create = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'POST' && call.url === API ? create.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'New candidate' }));
    const form = screen.getByRole('form', { name: 'New candidate' });
    const name = within(form).getByLabelText(/^Full name/);
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: 'Created Candidate' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create candidate' }));
    await waitFor(() => expect(writeCalls(calls)).toHaveLength(1));

    // While the create is in flight, no other write may begin.
    for (const control of ['Edit profile', 'Mark inactive', 'Archive candidate', 'Add skill']) {
      expect(screen.getByRole('button', { name: control })).toBeDisabled();
    }

    create.release(
      jsonResponse(
        {
          candidate: syntheticCandidate({
            displayName: 'Created Candidate',
            id: 'a22c0929-9ac3-4d0e-ad26-760814c6465d',
          }),
        },
        201,
      ),
    );

    expect(await screen.findByText('Candidate created.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'New candidate' })).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New candidate' })).toHaveFocus(),
    );
  });
});

describe('Post-write list refreshes follow the current filters and session', () => {
  it('refreshes with the latest applied filters, not those captured when the write began', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const status = deferredResponse();
    const heldLists: { call: RecordedCall; release: () => void }[] = [];
    let holdLists = false;
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) => {
      if (isListCall(call)) {
        if (!holdLists) {
          return listResponseFor(call.url);
        }
        const gate = deferredResponse();
        heldLists.push({ call, release: () => gate.release(listResponseFor(call.url)) });
        return gate.promise;
      }
      return call.url.endsWith('/status') ? status.promise : undefined;
    });
    renderPanel(ORDINARY_PERMISSIONS);
    const list = await screen.findByRole('region', { name: 'Candidate list' });
    await within(list).findByRole('button', { name: 'Second Candidate' });

    // Filter A is applied, and candidate A is selected from its results.
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Synthetic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));
    await waitFor(() =>
      expect(within(list).queryByRole('button', { name: 'Second Candidate' })).toBeNull(),
    );
    await selectCandidate();

    // A write starts under Filter A and stays pending.
    fireEvent.click(screen.getByRole('button', { name: 'Mark inactive' }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/status'))).toBe(true));

    // Filter B is applied and its list resolves while the write is still pending.
    holdLists = true;
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));
    await waitFor(() => expect(heldLists).toHaveLength(1));
    expect(searchOf(heldLists[0]!.call)).toBe('Second');
    heldLists[0]!.release();
    expect(await within(list).findByRole('button', { name: 'Second Candidate' })).toBeVisible();
    expect(within(list).queryByRole('button', { name: 'Synthetic Candidate' })).toBeNull();

    // The old write resolves. Its list refresh must use Filter B, never Filter A.
    status.release(jsonResponse({ candidate: syntheticCandidate({ status: 'INACTIVE' }) }));
    expect(await screen.findByText('Candidate status changed to Inactive.')).toBeVisible();
    await waitFor(() => expect(heldLists).toHaveLength(2));
    expect(searchOf(heldLists[1]!.call)).toBe('Second');
    heldLists[1]!.release();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move to talent pool' })).toBeEnabled(),
    );

    // The visible rows and the controls still describe Filter B.
    expect(within(list).getByRole('button', { name: 'Second Candidate' })).toBeVisible();
    expect(within(list).queryByRole('button', { name: 'Synthetic Candidate' })).toBeNull();
    expect(screen.getByLabelText('Search')).toHaveValue('Second');
    // Filter A was requested exactly once: when the user applied it.
    expect(calls.filter(isListCall).map(searchOf)).toEqual([null, 'Synthetic', 'Second', 'Second']);
  });

  it('starts no post-write list request with an earlier session token', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const status = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.url.endsWith('/status') ? status.promise : undefined,
    );
    const panel = (token: string) => (
      <I18nProvider initialLocale="en">
        <CandidatesPanel accessToken={token} permissions={ORDINARY_PERMISSIONS} />
      </I18nProvider>
    );
    const view = render(panel('token-a'));
    await selectCandidate();

    // The write starts in session A and stays pending.
    fireEvent.click(screen.getByRole('button', { name: 'Mark inactive' }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/status'))).toBe(true));
    expect(calls.find((call) => call.url.endsWith('/status'))?.token).toBe('Bearer token-a');

    // Session B begins and performs its own list load. Session A's write still holds the lock.
    view.rerender(panel('token-b'));
    expect(screen.getByRole('button', { name: 'New candidate' })).toBeDisabled();
    await waitFor(() =>
      expect(calls.some((call) => isListCall(call) && call.token === 'Bearer token-b')).toBe(true),
    );
    const sessionBStart = calls.findIndex(
      (call) => isListCall(call) && call.token === 'Bearer token-b',
    );

    // The session-A write resolves afterwards; the write lock it held is released.
    status.release(jsonResponse({ candidate: syntheticCandidate({ status: 'INACTIVE' }) }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New candidate' })).toBeEnabled(),
    );

    // No request after session B began carries the session-A token.
    const afterSessionB = candidateCalls(calls.slice(sessionBStart));
    expect(afterSessionB.every((call) => call.token === 'Bearer token-b')).toBe(true);
    expect(afterSessionB.filter(isListCall)).toHaveLength(1);
    // The session-B list stands, and the stale session-A result stays suppressed.
    const list = screen.getByRole('region', { name: 'Candidate list' });
    expect(within(list).getByRole('button', { name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByText('Candidate status changed to Inactive.')).toBeNull();
    // Issue #69 review: session A's selected record is not carried into session B.
    expect(screen.queryByRole('button', { name: 'Mark inactive' })).toBeNull();
    expect(screen.getByText('No candidate selected')).toBeVisible();
  });
});

/* --- Issue #67: server-side pages and the source filter (D-CAND-01) --------- */

/** A synthetic candidate pool the stubbed server pages and filters itself. */
function candidatePool(size: number): CandidateDetail[] {
  return Array.from({ length: size }, (_, index) =>
    syntheticCandidate({
      displayName: `Candidate ${String(index + 1).padStart(2, '0')}`,
      education: [],
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      languages: [],
      skills: [],
      source: index % 3 === 0 ? 'public_application' : 'LinkedIn',
      status: index % 5 === 4 ? 'TALENT_POOL' : 'ACTIVE',
      workExperiences: [],
    }),
  );
}

/**
 * Answers a list request the way the API does: exact status, exact source
 * ignoring case, a name search, then one page in the server's order.
 */
function pagedResponse(url: string, pool: readonly CandidateDetail[]): Response {
  const parameters = new URL(url).searchParams;
  const page = Number(parameters.get('page') ?? '1');
  const pageSize = Number(parameters.get('pageSize') ?? '20');
  const status = parameters.get('status');
  const source = parameters.get('source')?.toLowerCase();
  const search = parameters.get('search')?.toLowerCase() ?? '';
  const matches = pool.filter(
    (candidate) =>
      (!status || candidate.status === status) &&
      (!source || candidate.source?.toLowerCase() === source) &&
      candidate.displayName.toLowerCase().includes(search),
  );
  return jsonResponse({
    candidates: matches
      .slice((page - 1) * pageSize, page * pageSize)
      .map((candidate) => asServerWouldReturn(candidate, ORDINARY_PERMISSIONS)),
    pagination: { page, pageSize, total: matches.length },
  });
}

const listParameters = (call: RecordedCall) => Object.fromEntries(new URL(call.url).searchParams);

function LocaleSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')} type="button">
      switch language
    </button>
  );
}

describe('Candidate list pages and source filter', () => {
  it('moves between server pages, stating the page and range, within the boundaries', async () => {
    const pool = candidatePool(45);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      isListCall(call) ? pagedResponse(call.url, pool) : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    const pages = await screen.findByRole('navigation', { name: 'Candidate pages' });

    expect(listParameters(calls.filter(isListCall)[0]!)).toEqual({ page: '1', pageSize: '20' });
    expect(within(pages).getByText('Page 1 of 3')).toBeVisible();
    expect(within(pages).getByText('1–20 of 45')).toBeVisible();
    expect(within(pages).getByRole('button', { name: 'Previous page' })).toBeDisabled();

    fireEvent.click(within(pages).getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 2 of 3')).toBeVisible();
    expect(screen.getByText('21–40 of 45')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Candidate 21' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Candidate 01' })).toBeNull();
    // Focus continues from the top of the new page.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Candidate list' })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 3 of 3')).toBeVisible();
    expect(screen.getByText('41–45 of 45')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Page 2 of 3')).toBeVisible();
    expect(calls.filter(isListCall).map((call) => listParameters(call).page)).toEqual([
      '1',
      '2',
      '3',
      '2',
    ]);
  });

  it('returns to page 1 on new filters and sends the exact source value with status and search', async () => {
    const pool = candidatePool(45);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      isListCall(call) ? pagedResponse(call.url, pool) : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 of 3');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Candidate' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'publicApplication' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));
    await waitFor(() => expect(calls.filter(isListCall)).toHaveLength(3));
    expect(listParameters(calls.filter(isListCall)[2]!)).toEqual({
      page: '1',
      pageSize: '20',
      search: 'Candidate',
      source: 'public_application',
      status: 'ACTIVE',
    });
    // Only matching candidates are listed: the platform source and an active status.
    expect(await screen.findByText('Page 1 of 1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Candidate 01' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Candidate 02' })).toBeNull();

    // A source recorded as free text is matched exactly as typed, trimmed.
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'recorded' } });
    fireEvent.change(screen.getByLabelText('Recorded source'), {
      target: { value: '  LinkedIn ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));
    await waitFor(() => expect(calls.filter(isListCall)).toHaveLength(4));
    expect(listParameters(calls.filter(isListCall)[3]!)).toMatchObject({
      page: '1',
      source: 'LinkedIn',
    });

    // Reset clears the source and returns to the plain first page.
    fireEvent.click(await screen.findByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(calls.filter(isListCall)).toHaveLength(5));
    expect(listParameters(calls.filter(isListCall)[4]!)).toEqual({ page: '1', pageSize: '20' });
    expect(screen.getByLabelText('Source')).toHaveValue('');
    expect(screen.queryByLabelText('Recorded source')).toBeNull();
  });

  it('shows a filtered empty result without page controls', async () => {
    stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      isListCall(call) ? pagedResponse(call.url, candidatePool(5)) : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await screen.findByRole('navigation', { name: 'Candidate pages' });

    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'recorded' } });
    fireEvent.change(screen.getByLabelText('Recorded source'), { target: { value: 'Nowhere' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));

    expect(await screen.findByRole('heading', { name: 'No matching candidates' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Candidate pages' })).toBeNull();
  });

  it('never lets an earlier page response replace the list for newer filters', async () => {
    const pool = candidatePool(45);
    const pageTwo = deferredResponse();
    stubCandidateApi(ORDINARY_PERMISSIONS, (call) => {
      if (!isListCall(call)) return undefined;
      const parameters = listParameters(call);
      return parameters.page === '2' && !parameters.search
        ? pageTwo.promise
        : pagedResponse(call.url, pool);
    });
    renderPanel(ORDINARY_PERMISSIONS);
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));

    // Newer filters are applied (Enter in the search field) while page 2 is still on its way.
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Candidate 0' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Candidate search' }));
    expect(await screen.findByText('Page 1 of 1')).toBeVisible();

    pageTwo.release(pagedResponse(`${API}?page=2&pageSize=20`, pool));
    await waitFor(() => expect(screen.getByText('1–9 of 9')).toBeVisible());
    expect(screen.queryByText('Page 2 of 3')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Candidate 21' })).toBeNull();
  });

  it('moves to the last page with matches when a write empties the current page', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const pool: CandidateDetail[] = candidatePool(21).map((candidate) => ({
      ...candidate,
      status: 'ACTIVE',
    }));
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) => {
      if (isListCall(call)) return pagedResponse(call.url, pool);
      const id = call.url.slice(API.length + 1).split('/')[0];
      const index = pool.findIndex((candidate) => candidate.id === id);
      if (index < 0) return undefined;
      if (call.method === 'POST' && call.url.endsWith('/archive')) {
        pool[index] = {
          ...pool[index]!,
          archivedAt: '2026-07-23T00:00:00.000Z',
          status: 'ARCHIVED',
        };
      }
      return jsonResponse({ candidate: asServerWouldReturn(pool[index]!, ORDINARY_PERMISSIONS) });
    });
    renderPanel(ORDINARY_PERMISSIONS);
    fireEvent.change(await screen.findByLabelText('Status'), { target: { value: 'ACTIVE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await selectCandidate('Candidate 21');

    // Archiving the only active candidate on page 2 leaves that page empty.
    fireEvent.click(screen.getByRole('button', { name: 'Archive candidate' }));
    expect(await screen.findByText('Candidate archived.')).toBeVisible();
    expect(await screen.findByText('Page 1 of 1')).toBeVisible();
    expect(screen.getByText('1–20 of 20')).toBeVisible();
    const pagesRead = calls.filter(isListCall).map((call) => listParameters(call).page);
    expect(pagesRead.slice(-2)).toEqual(['2', '1']);
  });

  it('keeps the page and filters through a language switch without refetching', async () => {
    const pool = candidatePool(45);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      isListCall(call) ? pagedResponse(call.url, pool) : undefined,
    );
    render(
      <I18nProvider initialLocale="en">
        <CandidatesPanel accessToken={TOKEN} permissions={[...ORDINARY_PERMISSIONS]} />
        <LocaleSwitch />
      </I18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Source'), {
      target: { value: 'publicApplication' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search candidates' }));
    expect(await screen.findByText('1–15 of 15')).toBeVisible();
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'switch language' }));

    expect(await screen.findByText('Page 1 sur 1')).toBeVisible();
    expect(screen.getByText(/1 à 15 sur 15/u)).toBeVisible();
    expect(screen.getByLabelText('Source')).toHaveValue('publicApplication');
    expect(
      within(screen.getByLabelText('Source')).getByRole('option', { name: 'Candidature en ligne' }),
    ).toBeInTheDocument();
    expect(calls.length).toBe(before);
  });
});

/* --- Issue #67: structured record maintenance (D-CAND-02) ------------------- */

const SKILL_ID = 'a0000000-0000-4000-8000-000000000001';
const LANGUAGE_ID = 'c0000000-0000-4000-8000-000000000001';
const EXPERIENCE_ID = 'b0000000-0000-4000-8000-000000000001';
const EDUCATION_ID = 'e0000000-0000-4000-8000-000000000001';

const recordWrites = (calls: RecordedCall[]) =>
  candidateCalls(calls).filter((call) => call.method !== 'GET');
const candidateAReads = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === 'GET' && call.url === `${API}/${CANDIDATE_ID}`);

describe('Structured record maintenance', () => {
  it('edits a skill level in place with only the changed field, then re-reads the record', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    expect(within(form).getByLabelText(/^Skill/)).toHaveValue('Sourcing');
    expect(within(form).getByLabelText('Level')).toHaveValue('Advanced');
    fireEvent.change(within(form).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Skill updated.')).toBeVisible();
    expect(recordWrites(calls)).toEqual([
      expect.objectContaining({
        body: { level: 'Expert' },
        method: 'PATCH',
        url: `${API}/${CANDIDATE_ID}/skills/${SKILL_ID}`,
      }),
    ]);
    expect(candidateAReads(calls)).toHaveLength(2);
    const skills = screen.getByRole('region', { name: /^Skills/ });
    expect(within(skills).getAllByRole('listitem')).toHaveLength(1);
    expect(within(skills).getByText('Expert')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Sourcing' })).toHaveFocus(),
    );
  });

  it('corrects work experience dates without creating a duplicate record', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Junior Recruiter · Example Staffing' }),
    );
    const form = screen.getByRole('form', { name: 'Edit Junior Recruiter · Example Staffing' });
    expect(within(form).getByLabelText('Start date')).toHaveValue('2016-01');
    expect(within(form).getByLabelText('End date')).toHaveValue('2019-12');
    expect(within(form).getByLabelText('Current role')).not.toBeChecked();
    fireEvent.change(within(form).getByLabelText('Start date'), { target: { value: '2015-09' } });
    fireEvent.change(within(form).getByLabelText('End date'), { target: { value: '2019-08' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Experience updated.')).toBeVisible();
    expect(recordWrites(calls)).toEqual([
      expect.objectContaining({
        body: { endDate: '2019-08', startDate: '2015-09' },
        method: 'PATCH',
        url: `${API}/${CANDIDATE_ID}/work-experiences/${EXPERIENCE_ID}`,
      }),
    ]);
    const experience = screen.getByRole('region', { name: /^Work experience/ });
    expect(within(experience).getAllByRole('listitem')).toHaveLength(2);
    expect(within(experience).getByText('2015-09 – 2019-08')).toBeVisible();
  });

  it('edits a language and an education entry through their own endpoints', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit French' }));
    const languageForm = screen.getByRole('form', { name: 'Edit French' });
    fireEvent.change(within(languageForm).getByLabelText(/^Proficiency/), {
      target: { value: 'Bilingual' },
    });
    fireEvent.click(within(languageForm).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Language updated.')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit MSc Work Psychology · Example University' }),
    );
    const educationForm = screen.getByRole('form', {
      name: 'Edit MSc Work Psychology · Example University',
    });
    fireEvent.change(within(educationForm).getByLabelText('Field of study'), {
      target: { value: '' },
    });
    fireEvent.click(within(educationForm).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Education updated.')).toBeVisible();

    expect(recordWrites(calls).map((call) => [call.method, call.url, call.body])).toEqual([
      ['PATCH', `${API}/${CANDIDATE_ID}/languages/${LANGUAGE_ID}`, { proficiency: 'Bilingual' }],
      // A cleared optional field is sent as null, exactly as the contract allows.
      ['PATCH', `${API}/${CANDIDATE_ID}/education/${EDUCATION_ID}`, { field: null }],
    ]);
  });

  it('sends nothing when an edit changes nothing', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit Sourcing' })).toBeNull());
    expect(recordWrites(calls)).toEqual([]);
  });

  it.each([
    ['skill', 'Archive Sourcing', `skills/${SKILL_ID}`, 'Skill archived.', /^Skills/],
    ['language', 'Archive French', `languages/${LANGUAGE_ID}`, 'Language archived.', /^Languages/],
    [
      'work experience',
      'Archive Junior Recruiter · Example Staffing',
      `work-experiences/${EXPERIENCE_ID}`,
      'Experience archived.',
      /^Work experience/,
    ],
    [
      'education',
      'Archive MSc Work Psychology · Example University',
      `education/${EDUCATION_ID}`,
      'Education archived.',
      /^Education/,
    ],
  ])(
    'archives a %s after confirmation and keeps it as history, never deleting it',
    async (_kind, action, path, success, region) => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
      renderPanel(ORDINARY_PERMISSIONS);
      await selectCandidate();

      fireEvent.click(screen.getByRole('button', { name: action }));

      expect(await screen.findByText(success)).toBeVisible();
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('stays in the profile history as archived'),
      );
      expect(recordWrites(calls)).toEqual([
        expect.objectContaining({ method: 'POST', url: `${API}/${CANDIDATE_ID}/${path}/archive` }),
      ]);
      expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
      // The row stays, marked archived, and offers nothing further.
      const section = screen.getByRole('region', { name: region });
      expect(within(section).getByText('Archived')).toBeVisible();
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    },
  );

  it('sends nothing when an archival is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Archive Sourcing' }));
    expect(recordWrites(calls)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Archive Sourcing' })).toBeEnabled();
  });

  it('reports a refused record change generically and keeps the form open', async () => {
    stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/skills/')
        ? jsonResponse({ error: { code: 'PERMISSION_DENIED', message: 'role HR lacks x' } }, 403)
        : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    fireEvent.change(within(form).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Your access does not allow this change.',
    );
    expect(document.body.textContent).not.toContain('role HR lacks x');
    expect(screen.queryByText('Skill updated.')).toBeNull();
  });

  it('re-reads the record when the row was archived or removed meanwhile', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/skills/')
        ? jsonResponse({ error: { code: 'CANDIDATE_SKILL_ARCHIVED', message: 'raw' } }, 409)
        : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    fireEvent.change(within(form).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'This record changed or is no longer available. The profile has been refreshed.',
    );
    await waitFor(() => expect(candidateAReads(calls)).toHaveLength(2));
  });

  it('does not show a late record edit for candidate A on candidate B, or re-read A', async () => {
    const edit = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}/skills/${SKILL_ID}`
        ? edit.promise
        : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    fireEvent.change(within(form).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));
    await moveToSecondCandidate();

    edit.release(jsonResponse({ skill: { ...syntheticCandidate().skills[0]!, level: 'Expert' } }));
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByText('Skill updated.')).toBeNull();
    expect(screen.queryByText('Expert')).toBeNull();
    expect(candidateAReads(calls)).toHaveLength(1);
  });

  it('does not show a late record archival for candidate A on candidate B', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const archive = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.url === `${API}/${CANDIDATE_ID}/languages/${LANGUAGE_ID}/archive`
        ? archive.promise
        : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Archive French' }));
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));
    await moveToSecondCandidate();

    archive.release(jsonResponse({ error: { code: 'CANDIDATE_ARCHIVED', message: 'raw' } }, 409));
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Language archived.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Archive French' })).toBeEnabled();
  });

  it('sends one edit even when submitted twice, and locks every other write meanwhile', async () => {
    const edit = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/skills/') ? edit.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    fireEvent.change(within(form).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));

    for (const name of [
      'Archive French',
      'Edit French',
      'Archive Junior Recruiter · Example Staffing',
      'Add skill',
      'Edit profile',
      'Archive candidate',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Archive French' }));
    expect(recordWrites(calls)).toHaveLength(1);

    edit.release(jsonResponse({ skill: { ...syntheticCandidate().skills[0]!, level: 'Expert' } }));
    expect(await screen.findByText('Skill updated.')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Archive French' })).toBeEnabled(),
    );
    expect(recordWrites(calls)).toHaveLength(1);
  });

  it('drops a record edit result from an earlier session', async () => {
    const edit = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/skills/') ? edit.promise : undefined,
    );
    const panel = (token: string) => (
      <I18nProvider initialLocale="en">
        <CandidatesPanel accessToken={token} permissions={[...ORDINARY_PERMISSIONS]} />
      </I18nProvider>
    );
    const view = render(panel('token-a'));
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const form = screen.getByRole('form', { name: 'Edit Sourcing' });
    fireEvent.change(within(form).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));

    view.rerender(panel('token-b'));
    await waitFor(() =>
      expect(calls.some((call) => isListCall(call) && call.token === 'Bearer token-b')).toBe(true),
    );
    const sessionBStart = calls.findIndex(
      (call) => isListCall(call) && call.token === 'Bearer token-b',
    );

    edit.release(jsonResponse({ skill: { ...syntheticCandidate().skills[0]!, level: 'Expert' } }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search candidates' })).toBeEnabled(),
    );

    expect(screen.queryByText('Skill updated.')).toBeNull();
    const afterSessionB = candidateCalls(calls.slice(sessionBStart));
    expect(afterSessionB.every((call) => call.token === 'Bearer token-b')).toBe(true);
    expect(afterSessionB.some((call) => call.url === `${API}/${CANDIDATE_ID}`)).toBe(false);
  });
});

/* --- Review 5195637199: experience description, education dates and description --- */

const SENIOR_ROLE = 'Senior Recruiter · Example Talent';
const DEGREE = 'MSc Work Psychology · Example University';

/** Opens a record's edit form by its accessible action name. */
function editRecord(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${label}` }));
  return screen.getByRole('form', { name: `Edit ${label}` });
}

async function saveAndWait(form: HTMLElement, success: string) {
  fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText(success)).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole('form', { name: form.getAttribute('aria-label') ?? '' })).toBeNull(),
  );
}

describe('Work experience description', () => {
  it('adds an experience with its description, and omits an empty description', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    const add = async (description: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Add experience' }));
      const form = screen.getByRole('form', { name: 'Add experience' });
      fireEvent.change(within(form).getByLabelText(/^Employer/), {
        target: { value: 'Example Co' },
      });
      fireEvent.change(within(form).getByLabelText(/^Job title/), { target: { value: 'Analyst' } });
      fireEvent.change(within(form).getByLabelText('Description'), {
        target: { value: description },
      });
      fireEvent.click(within(form).getByRole('button', { name: 'Add experience' }));
      expect(await screen.findByText('Experience added.')).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('form', { name: 'Add experience' })).toBeNull(),
      );
    };
    await add('  Built the weekly reporting.  ');
    await add('   ');

    const posts = recordWrites(calls).filter((call) => call.url.endsWith('/work-experiences'));
    expect(posts.map((call) => call.body)).toEqual([
      {
        description: 'Built the weekly reporting.',
        employer: 'Example Co',
        isCurrent: false,
        title: 'Analyst',
      },
      { employer: 'Example Co', isCurrent: false, title: 'Analyst' },
    ]);
  });

  it('edits only the description, clears it with null, and sends nothing when unchanged', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    let form = editRecord(SENIOR_ROLE);
    expect(within(form).getByLabelText('Description')).toHaveValue('Leads technical sourcing.');
    expect(within(form).getByLabelText('Description')).toHaveAttribute('maxlength', '2000');
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: { value: 'Leads technical sourcing and onboarding.' },
    });
    await saveAndWait(form, 'Experience updated.');

    form = editRecord(SENIOR_ROLE);
    expect(within(form).getByLabelText('Description')).toHaveValue(
      'Leads technical sourcing and onboarding.',
    );
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: '' } });
    await saveAndWait(form, 'Experience updated.');

    form = editRecord(SENIOR_ROLE);
    expect(within(form).getByLabelText('Description')).toHaveValue('');
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: `Edit ${SENIOR_ROLE}` })).toBeNull(),
    );

    const path = `${API}/${CANDIDATE_ID}/work-experiences/b0000000-0000-4000-8000-000000000002`;
    expect(recordWrites(calls).map((call) => [call.method, call.url, call.body])).toEqual([
      ['PATCH', path, { description: 'Leads technical sourcing and onboarding.' }],
      ['PATCH', path, { description: null }],
    ]);
  });

  it('drops an experience description edit from an earlier session', async () => {
    const edit = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/work-experiences/') ? edit.promise : undefined,
    );
    const panel = (token: string) => (
      <I18nProvider initialLocale="en">
        <CandidatesPanel accessToken={token} permissions={[...ORDINARY_PERMISSIONS]} />
      </I18nProvider>
    );
    const view = render(panel('token-a'));
    await selectCandidate();

    const form = editRecord(SENIOR_ROLE);
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: 'New.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));

    view.rerender(panel('token-b'));
    await waitFor(() =>
      expect(calls.some((call) => isListCall(call) && call.token === 'Bearer token-b')).toBe(true),
    );
    const sessionBStart = calls.findIndex(
      (call) => isListCall(call) && call.token === 'Bearer token-b',
    );
    edit.release(
      jsonResponse({
        workExperience: { ...syntheticCandidate().workExperiences[1]!, description: 'New.' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search candidates' })).toBeEnabled(),
    );

    expect(screen.queryByText('Experience updated.')).toBeNull();
    const afterSessionB = candidateCalls(calls.slice(sessionBStart));
    expect(afterSessionB.every((call) => call.token === 'Bearer token-b')).toBe(true);
    expect(afterSessionB.some((call) => call.url === `${API}/${CANDIDATE_ID}`)).toBe(false);
  });
});

describe('Education dates and description', () => {
  it('adds education with its dates and description, omitting empty optional fields', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: 'Add education' }));
    const form = screen.getByRole('form', { name: 'Add education' });
    fireEvent.change(within(form).getByLabelText(/^Institution/), {
      target: { value: 'Example School' },
    });
    fireEvent.change(within(form).getByLabelText(/^Qualification/), {
      target: { value: 'MBA' },
    });
    fireEvent.change(within(form).getByLabelText('Start date'), { target: { value: '2018' } });
    fireEvent.change(within(form).getByLabelText('End date'), { target: { value: '2020' } });
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: { value: 'Thesis on structured hiring.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Add education' }));

    expect(await screen.findByText('Education added.')).toBeVisible();
    const post = recordWrites(calls).find((call) => call.url.endsWith('/education'));
    expect(post?.body).toEqual({
      description: 'Thesis on structured hiring.',
      endDate: '2020',
      institution: 'Example School',
      qualification: 'MBA',
      startDate: '2018',
    });
    const education = screen.getByRole('region', { name: /^Education/ });
    expect(within(education).getByText('Thesis on structured hiring.')).toBeVisible();
    expect(within(education).getByText('2018 – 2020')).toBeVisible();
  });

  it('pre-fills education and sends only changed dates, a changed description, and null for cleared fields', async () => {
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS);
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    let form = editRecord(DEGREE);
    expect(within(form).getByLabelText('Start date')).toHaveValue('2012');
    expect(within(form).getByLabelText('End date')).toHaveValue('2014');
    expect(within(form).getByLabelText('Description')).toHaveValue('');
    expect(within(form).getByLabelText('Start date')).toHaveAttribute('maxlength', '40');
    expect(within(form).getByLabelText('Description')).toHaveAttribute('maxlength', '2000');
    fireEvent.change(within(form).getByLabelText('End date'), { target: { value: '2015' } });
    await saveAndWait(form, 'Education updated.');

    form = editRecord(DEGREE);
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: { value: 'Organisational psychology.' },
    });
    await saveAndWait(form, 'Education updated.');

    form = editRecord(DEGREE);
    expect(within(form).getByLabelText('End date')).toHaveValue('2015');
    expect(within(form).getByLabelText('Description')).toHaveValue('Organisational psychology.');
    for (const label of ['Start date', 'End date', 'Description']) {
      fireEvent.change(within(form).getByLabelText(label), { target: { value: '' } });
    }
    await saveAndWait(form, 'Education updated.');

    form = editRecord(DEGREE);
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: `Edit ${DEGREE}` })).toBeNull());

    const path = `${API}/${CANDIDATE_ID}/education/${EDUCATION_ID}`;
    expect(recordWrites(calls).map((call) => [call.method, call.url, call.body])).toEqual([
      ['PATCH', path, { endDate: '2015' }],
      ['PATCH', path, { description: 'Organisational psychology.' }],
      ['PATCH', path, { description: null, endDate: null, startDate: null }],
    ]);
  });

  it('does not show a late education edit for candidate A on candidate B, or re-read A', async () => {
    const edit = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/education/') ? edit.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    const form = editRecord(DEGREE);
    fireEvent.change(within(form).getByLabelText('Start date'), { target: { value: '2011' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));
    await moveToSecondCandidate();

    edit.release(
      jsonResponse({ education: { ...syntheticCandidate().education[0]!, startDate: '2011' } }),
    );
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByText('Education updated.')).toBeNull();
    expect(screen.queryByText('2011 – 2014')).toBeNull();
    expect(candidateAReads(calls)).toHaveLength(1);
  });

  it('sends one education edit even when submitted twice, and locks every other write meanwhile', async () => {
    const edit = deferredResponse();
    const { calls } = stubCandidateApi(ORDINARY_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url.includes('/education/') ? edit.promise : undefined,
    );
    renderPanel(ORDINARY_PERMISSIONS);
    await selectCandidate();

    const form = editRecord(DEGREE);
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: { value: 'Organisational psychology.' },
    });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(recordWrites(calls)).toHaveLength(1));

    for (const name of [
      `Edit ${SENIOR_ROLE}`,
      `Archive ${SENIOR_ROLE}`,
      'Add education',
      'Add experience',
      'Archive candidate',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(within(form).getByRole('button', { name: /Save changes|Working/ })).toBeDisabled();

    edit.release(
      jsonResponse({
        education: {
          ...syntheticCandidate().education[0]!,
          description: 'Organisational psychology.',
        },
      }),
    );
    expect(await screen.findByText('Education updated.')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Archive ${SENIOR_ROLE}` })).toBeEnabled(),
    );
    expect(recordWrites(calls)).toHaveLength(1);
  });
});

/* --- Issue #69: compensation and consent maintenance (D-CAND-03) ----------- */

const candidatePatches = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}`);

function openRestrictedForm(action: 'Edit compensation' | 'Manage consent') {
  fireEvent.click(screen.getByRole('button', { name: action }));
  return screen.getByRole('form', { name: action });
}

/** Saves a restricted form and waits until it has closed and the write lock is released. */
async function saveRestricted(form: HTMLElement, action: 'Edit compensation' | 'Manage consent') {
  fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.queryByRole('form', { name: action })).toBeNull());
  await waitFor(() => expect(screen.getByRole('button', { name: action })).toBeEnabled());
}

const restrictedSection = () => screen.getByRole('region', { name: 'Restricted information' });

describe('Compensation maintenance through the Candidate update', () => {
  it('sends only the changed amount in exact cents, then re-reads the candidate', async () => {
    const consoleCalls = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log'),
    );
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const form = openRestrictedForm('Edit compensation');
    expect(within(form).getByLabelText('Salary expectation')).toHaveValue('54000');
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '36000.5' },
    });
    await saveRestricted(form, 'Edit compensation');

    expect(candidatePatches(calls).map((call) => call.body)).toEqual([
      { salaryExpectationCents: 3_600_050 },
    ]);
    // The authoritative record is read again after the write.
    const patchAt = calls.indexOf(candidatePatches(calls)[0]!);
    expect(candidateAReads(calls).some((call) => calls.indexOf(call) > patchAt)).toBe(true);
    expect(within(restrictedSection()).getByText('€36,000.50')).toBeVisible();
    const success = screen.getByText('Compensation updated.');
    expect(success.closest('[role="status"], [role="alert"]')?.textContent).not.toMatch(/\d/);

    // Nothing sensitive reaches a URL or the console.
    for (const call of calls) {
      expect(call.url).not.toMatch(/3600050|36000|54000|salary/i);
    }
    for (const spy of consoleCalls) {
      for (const args of spy.mock.calls) {
        expect(JSON.stringify(args)).not.toMatch(/3600050|36000\.5|54000/);
      }
    }
  });

  it('sends a currency alone, null for a cleared amount or currency, zero as zero, and nothing unchanged', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const change = async (label: 'Currency' | 'Salary expectation', value: string) => {
      const form = openRestrictedForm('Edit compensation');
      fireEvent.change(within(form).getByLabelText(label), { target: { value } });
      await saveRestricted(form, 'Edit compensation');
    };
    await change('Currency', 'MAD');
    await change('Salary expectation', '');
    expect(within(restrictedSection()).getByText('Not recorded')).toBeVisible();
    await change('Salary expectation', '0');
    await change('Currency', '');
    // Saving the form untouched sends nothing.
    await saveRestricted(openRestrictedForm('Edit compensation'), 'Edit compensation');

    expect(candidatePatches(calls).map((call) => call.body)).toEqual([
      { salaryExpectationCurrency: 'MAD' },
      { salaryExpectationCents: null },
      { salaryExpectationCents: 0 },
      { salaryExpectationCurrency: null },
    ]);
    expect(within(restrictedSection()).getByText('0.00')).toBeVisible();
  });

  it('rejects an invalid amount or currency without any request', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const form = openRestrictedForm('Edit compensation');
    for (const [label, value] of [
      ['Salary expectation', '36000.505'],
      ['Salary expectation', '-1'],
      ['Salary expectation', '3.6e4'],
    ] as const) {
      fireEvent.change(within(form).getByLabelText(label), { target: { value } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
      expect(
        await within(form).findByText(
          'Enter an amount such as 36000 or 36000.50, with at most two decimals.',
        ),
      ).toBeVisible();
    }
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '36000' },
    });
    fireEvent.change(within(form).getByLabelText('Currency'), { target: { value: 'EU' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(
      await within(form).findByText('Enter exactly three characters, for example EUR.'),
    ).toBeVisible();

    expect(candidatePatches(calls)).toHaveLength(0);
  });

  it('shows a denied write generically, keeps the stored value, and exposes no policy text', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}`
        ? jsonResponse(
            {
              error: {
                code: 'CANDIDATE_COMPENSATION_PERMISSION_REQUIRED',
                message: 'Candidate compensation fields require candidate_compensation:update.',
              },
            },
            403,
          )
        : undefined,
    );
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const form = openRestrictedForm('Edit compensation');
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '36000' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Your access does not allow this change.',
    );
    expect(document.body.textContent).not.toContain('candidate_compensation');
    expect(screen.queryByText('Compensation updated.')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(within(restrictedSection()).getByText('€54,000.00')).toBeVisible();
    expect(candidatePatches(calls)).toHaveLength(1);
  });

  it('refreshes a candidate archived meanwhile and withdraws the restricted actions', async () => {
    let archivedMeanwhile = false;
    stubCandidateApi(FULL_PERMISSIONS, (call) => {
      if (call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}`) {
        archivedMeanwhile = true;
        return jsonResponse({ error: { code: 'CANDIDATE_ARCHIVED', message: 'raw' } }, 409);
      }
      if (archivedMeanwhile && call.method === 'GET' && call.url === `${API}/${CANDIDATE_ID}`) {
        return jsonResponse({
          candidate: syntheticCandidate({
            archivedAt: '2026-07-22T00:00:00.000Z',
            status: 'ARCHIVED',
          }),
        });
      }
      return undefined;
    });
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const form = openRestrictedForm('Manage consent');
    fireEvent.change(within(form).getByLabelText('Consent status'), {
      target: { value: 'REVOKED' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'This candidate is archived. Archived profiles are read-only and keep their history.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage consent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit compensation' })).toBeNull();
    expect(within(restrictedSection()).getByText('Granted')).toBeVisible();
  });
});

describe('Consent maintenance through the Candidate update', () => {
  const originalTimezone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Europe/Paris';
  });

  afterAll(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  it('saves the status and the recorded time independently, null when cleared, nothing unchanged', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    // 12:00 UTC in July is 14:00 in Paris.
    let form = openRestrictedForm('Manage consent');
    expect(within(form).getByLabelText('Recorded date and time')).toHaveValue('2026-07-21T14:00');
    fireEvent.change(within(form).getByLabelText('Consent status'), {
      target: { value: 'REVOKED' },
    });
    await saveRestricted(form, 'Manage consent');
    expect(await screen.findByText('Consent updated.')).toBeVisible();
    expect(within(restrictedSection()).getByText('Revoked')).toBeVisible();

    form = openRestrictedForm('Manage consent');
    // The untouched instant is still the stored one.
    expect(within(form).getByLabelText('Recorded date and time')).toHaveValue('2026-07-21T14:00');
    fireEvent.change(within(form).getByLabelText('Recorded date and time'), {
      target: { value: '2026-08-01T11:30' },
    });
    await saveRestricted(form, 'Manage consent');

    form = openRestrictedForm('Manage consent');
    expect(within(form).getByLabelText('Recorded date and time')).toHaveValue('2026-08-01T11:30');
    fireEvent.change(within(form).getByLabelText('Recorded date and time'), {
      target: { value: '' },
    });
    await saveRestricted(form, 'Manage consent');
    expect(within(restrictedSection()).getByText('Not recorded')).toBeVisible();

    await saveRestricted(openRestrictedForm('Manage consent'), 'Manage consent');

    expect(candidatePatches(calls).map((call) => call.body)).toEqual([
      { consentStatus: 'REVOKED' },
      { consentRecordedAt: '2026-08-01T09:30:00.000Z' },
      { consentRecordedAt: null },
    ]);
    for (const call of calls) {
      expect(call.url).not.toMatch(/REVOKED|GRANTED|2026-08-01|consent/i);
    }
  });
});

describe('Restricted writes share the Candidate write lifecycle', () => {
  it('sends one save even when submitted twice, and locks every other write meanwhile', async () => {
    const save = deferredResponse();
    const { calls } = stubCandidateApi(FULL_PERMISSIONS, (call) =>
      call.method === 'PATCH' ? save.promise : undefined,
    );
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const form = openRestrictedForm('Edit compensation');
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '1' },
    });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(candidatePatches(calls)).toHaveLength(1));

    for (const name of [
      'Manage consent',
      'Edit profile',
      'Archive candidate',
      'Add skill',
      'Edit Sourcing',
      'Mark inactive',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(within(form).getByRole('button', { name: /Save changes|Working/ })).toBeDisabled();

    save.release(
      jsonResponse({
        candidate: asServerWouldReturn(
          syntheticCandidate({
            compensation: { salaryExpectationCents: 100, salaryExpectationCurrency: 'EUR' },
          }),
          FULL_PERMISSIONS,
        ),
      }),
    );
    expect(await screen.findByText('Compensation updated.')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Manage consent' })).toBeEnabled(),
    );
    expect(candidatePatches(calls)).toHaveLength(1);
  });

  it('does not show a late restricted save for candidate A on candidate B, or re-read A', async () => {
    const save = deferredResponse();
    const { calls } = stubCandidateApi(FULL_PERMISSIONS, (call) =>
      call.method === 'PATCH' && call.url === `${API}/${CANDIDATE_ID}` ? save.promise : undefined,
    );
    renderPanel(FULL_PERMISSIONS);
    await selectCandidate();

    const form = openRestrictedForm('Edit compensation');
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '12345.67' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(candidatePatches(calls)).toHaveLength(1));
    await moveToSecondCandidate();

    save.release(
      jsonResponse({
        candidate: asServerWouldReturn(
          syntheticCandidate({
            compensation: { salaryExpectationCents: 1_234_567, salaryExpectationCurrency: 'EUR' },
          }),
          FULL_PERMISSIONS,
        ),
      }),
    );
    await waitForWriteToSettle();

    expect(screen.getByRole('heading', { level: 2, name: 'Second Candidate' })).toBeVisible();
    expect(screen.queryByText('Compensation updated.')).toBeNull();
    expect(document.body.textContent).not.toContain('12,345.67');
    expect(candidateAReads(calls)).toHaveLength(1);
  });

  it('drops a restricted save result from an earlier session', async () => {
    const save = deferredResponse();
    const { calls } = stubCandidateApi(FULL_PERMISSIONS, (call) =>
      call.method === 'PATCH' ? save.promise : undefined,
    );
    const panel = (token: string) => (
      <I18nProvider initialLocale="en">
        <CandidatesPanel accessToken={token} permissions={[...FULL_PERMISSIONS]} />
      </I18nProvider>
    );
    const view = render(panel('token-a'));
    await selectCandidate();

    const form = openRestrictedForm('Manage consent');
    fireEvent.change(within(form).getByLabelText('Consent status'), {
      target: { value: 'EXPIRED' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(candidatePatches(calls)).toHaveLength(1));

    view.rerender(panel('token-b'));
    await waitFor(() =>
      expect(calls.some((call) => isListCall(call) && call.token === 'Bearer token-b')).toBe(true),
    );
    const sessionBStart = calls.findIndex(
      (call) => isListCall(call) && call.token === 'Bearer token-b',
    );
    save.release(
      jsonResponse({
        candidate: asServerWouldReturn(
          syntheticCandidate({ consent: { consentRecordedAt: null, consentStatus: 'EXPIRED' } }),
          FULL_PERMISSIONS,
        ),
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search candidates' })).toBeEnabled(),
    );

    expect(screen.queryByText('Consent updated.')).toBeNull();
    expect(screen.queryByText('Expired')).toBeNull();
    const afterSessionB = candidateCalls(calls.slice(sessionBStart));
    expect(afterSessionB.every((call) => call.token === 'Bearer token-b')).toBe(true);
    expect(afterSessionB.some((call) => call.url === `${API}/${CANDIDATE_ID}`)).toBe(false);
  });

  it('switches language with a restricted form open, keeping what was typed, without refetching', async () => {
    const { calls } = stubCandidateApi(FULL_PERMISSIONS);
    render(
      <I18nProvider initialLocale="en">
        <CandidatesPanel accessToken={TOKEN} permissions={[...FULL_PERMISSIONS]} />
        <LocaleSwitch />
      </I18nProvider>,
    );
    await selectCandidate();
    const form = openRestrictedForm('Edit compensation');
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '36000.5' },
    });
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'switch language' }));

    const french = await screen.findByRole('form', { name: 'Modifier la rémunération' });
    expect(within(french).getByLabelText('Prétentions salariales')).toHaveValue('36000.5');
    expect(within(french).getByLabelText('Devise')).toHaveValue('EUR');
    expect(calls.length).toBe(before);
  });
});

/* --- Issue #69 review: the Candidate workspace belongs to one session ------- */

/** One principal's server-side view: its own records, shaped by its current permissions. */
interface PrincipalView {
  permissions: () => readonly string[];
  records: Map<string, CandidateDetail>;
}

const nadia = (overrides: Partial<CandidateDetail> = {}) =>
  syntheticCandidate({ displayName: 'Nadia Example', id: CANDIDATE_ID, ...overrides });
const omar = () => syntheticCandidate({ displayName: 'Omar Example', id: SECOND_CANDIDATE_ID });

/** Principal A reads Nadia at 54,000 EUR with consent granted. */
const principalA = (permissions: () => readonly string[] = () => FULL_PERMISSIONS) => ({
  permissions,
  records: new Map([
    [CANDIDATE_ID, nadia()],
    [SECOND_CANDIDATE_ID, omar()],
  ]),
});

/** Principal B's authoritative read of the same candidate differs, so its origin is visible. */
const principalB = (): PrincipalView => ({
  permissions: () => FULL_PERMISSIONS,
  records: new Map([
    [
      CANDIDATE_ID,
      nadia({
        compensation: { salaryExpectationCents: 4_100_000, salaryExpectationCurrency: 'MAD' },
        consent: { consentRecordedAt: '2026-08-18T10:00:00.000Z', consentStatus: 'REVOKED' },
      }),
    ],
    [SECOND_CANDIDATE_ID, omar()],
  ]),
});

/**
 * A Candidate API that answers each bearer token with that principal's own
 * view. `hold` may keep any request unresolved until the test releases it.
 */
function stubPrincipalApi(
  views: Record<string, PrincipalView>,
  hold?: (call: RecordedCall) => Promise<Response> | undefined,
) {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const token = init?.headers instanceof Headers ? init.headers.get('Authorization') : null;
    const call = { body, method, token, url };
    calls.push(call);

    const held = hold?.(call);
    if (held) {
      return held;
    }
    const view = token ? views[token.replace('Bearer ', '')] : undefined;
    if (!view || !url.startsWith(API)) {
      return Promise.reject(new Error(`Unexpected ${method} ${url}`));
    }
    const shaped = (record: CandidateDetail) => asServerWouldReturn(record, view.permissions());
    const path = url.slice(API.length);
    if (method === 'GET' && path.startsWith('?')) {
      const list = [...view.records.values()].map(shaped);
      return Promise.resolve(
        jsonResponse({
          candidates: list,
          pagination: { page: 1, pageSize: 20, total: list.length },
        }),
      );
    }
    const id = path.split('/')[1] ?? '';
    const record = view.records.get(id);
    if (!record) {
      return Promise.resolve(jsonResponse({ error: { code: 'CANDIDATE_NOT_FOUND' } }, 404));
    }
    if (method === 'GET' && path === `/${id}`) {
      return Promise.resolve(jsonResponse({ candidate: shaped(record) }));
    }
    if (method === 'PATCH' && path === `/${id}`) {
      const next = applyCandidatePatch(record, body as Record<string, unknown>);
      view.records.set(id, next);
      return Promise.resolve(jsonResponse({ candidate: shaped(next) }));
    }
    return Promise.reject(new Error(`Unhandled ${method} ${url}`));
  });
  return calls;
}

function sessionPanel(token: string, permissions: readonly string[] = FULL_PERMISSIONS) {
  return (
    <I18nProvider initialLocale="en">
      <CandidatesPanel accessToken={token} permissions={[...permissions]} />
    </I18nProvider>
  );
}

/**
 * Nothing principal A read about Nadia — identity, record, restricted values,
 * forms — is on screen. At the instant of the switch the list rows A read are
 * gone too; afterwards principal B's own list may show the same candidate.
 */
function expectNoPrincipalAWorkspace({ atSwitch = false } = {}) {
  expect(screen.queryByRole('heading', { level: 2, name: 'Nadia Example' })).toBeNull();
  if (atSwitch) {
    expect(screen.queryByRole('button', { name: 'Nadia Example' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Omar Example' })).toBeNull();
  }
  expect(screen.queryByRole('region', { name: 'Restricted information' })).toBeNull();
  expect(screen.queryByRole('form')).toBeNull();
  expect(document.body.textContent).not.toMatch(
    /54,000|Granted|Expired|candidate@example\.test|Salary expectation|Consent status/,
  );
  expect(screen.getByText('No candidate selected')).toBeVisible();
}

const candidateTokensAfter = (calls: RecordedCall[], index: number) =>
  candidateCalls(calls.slice(index)).map((call) => call.token);

describe('Candidate workspace session boundary', () => {
  it('discards principal A’s candidate, restricted values, open form, and feedback as principal B takes over', async () => {
    const calls = stubPrincipalApi({ 'token-a': principalA(), 'token-b': principalB() });
    const view = render(sessionPanel('token-a'));
    await selectCandidate('Nadia Example');
    expect(within(restrictedSection()).getByText('€54,000.00')).toBeVisible();
    expect(within(restrictedSection()).getByText('Granted')).toBeVisible();

    // Principal A saves a consent change (feedback on screen), then opens another form.
    const consent = openRestrictedForm('Manage consent');
    fireEvent.change(within(consent).getByLabelText('Consent status'), {
      target: { value: 'EXPIRED' },
    });
    await saveRestricted(consent, 'Manage consent');
    expect(screen.getByText('Consent updated.')).toBeVisible();
    const form = openRestrictedForm('Edit compensation');
    fireEvent.change(within(form).getByLabelText('Salary expectation'), {
      target: { value: '1' },
    });
    const switchedAt = calls.length;

    // Principal B, holding the same restricted view permissions, takes over the mounted panel.
    view.rerender(sessionPanel('token-b'));

    // Immediately, before anything resolves, nothing of principal A's workspace remains.
    expectNoPrincipalAWorkspace({ atSwitch: true });
    expect(form.isConnected).toBe(false);
    expect(screen.queryByText('Consent updated.')).toBeNull();
    expect(screen.getByLabelText('Search')).toHaveValue('');

    // Principal B loads its own list, and only with its own token.
    const list = screen.getByRole('region', { name: 'Candidate list' });
    await within(list).findByRole('button', { name: 'Nadia Example' });
    expect(screen.queryByRole('heading', { level: 2, name: 'Nadia Example' })).toBeNull();

    // Principal B explicitly opens the candidate and sees its own authoritative record.
    await selectCandidate('Nadia Example');
    const restricted = restrictedSection();
    expect(within(restricted).getByText(/41,000\.00/)).toBeVisible();
    expect(within(restricted).getByText('Revoked')).toBeVisible();
    expect(document.body.textContent).not.toMatch(/54,000|Expired|Granted/);
    expect(
      candidateTokensAfter(calls, switchedAt).every((token) => token === 'Bearer token-b'),
    ).toBe(true);
  });

  it('drops a principal-A write that settles after principal B took over, and never re-reads for A', async () => {
    const write = deferredResponse();
    const calls = stubPrincipalApi({ 'token-a': principalA(), 'token-b': principalB() }, (call) =>
      call.method === 'PATCH' && call.token === 'Bearer token-a' ? write.promise : undefined,
    );
    const view = render(sessionPanel('token-a'));
    await selectCandidate('Nadia Example');
    const form = openRestrictedForm('Manage consent');
    fireEvent.change(within(form).getByLabelText('Consent status'), {
      target: { value: 'EXPIRED' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(candidatePatches(calls)).toHaveLength(1));
    const switchedAt = calls.length;

    view.rerender(sessionPanel('token-b'));

    expectNoPrincipalAWorkspace({ atSwitch: true });
    // The single write lock is still held by principal A's write.
    expect(screen.getByRole('button', { name: 'New candidate' })).toBeDisabled();

    write.release(
      jsonResponse({
        candidate: asServerWouldReturn(
          nadia({ consent: { consentRecordedAt: null, consentStatus: 'EXPIRED' } }),
          FULL_PERMISSIONS,
        ),
      }),
    );
    // The lock is released only once that write has fully settled.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New candidate' })).toBeEnabled(),
    );

    expectNoPrincipalAWorkspace();
    expect(screen.queryByText('Consent updated.')).toBeNull();
    expect(
      candidateTokensAfter(calls, switchedAt).every((token) => token === 'Bearer token-b'),
    ).toBe(true);
    expect(candidateAReads(calls.slice(switchedAt))).toHaveLength(0);

    await selectCandidate('Nadia Example');
    expect(within(restrictedSection()).getByText('Revoked')).toBeVisible();
    expect(within(restrictedSection()).getByText(/41,000\.00/)).toBeVisible();
  });

  it('never renders a principal-A detail read that resolves after principal B took over', async () => {
    const read = deferredResponse();
    let holdRead = false;
    const calls = stubPrincipalApi({ 'token-a': principalA(), 'token-b': principalB() }, (call) =>
      holdRead && call.method === 'GET' && call.url === `${API}/${CANDIDATE_ID}`
        ? read.promise
        : undefined,
    );
    const view = render(sessionPanel('token-a'));
    await selectCandidate('Omar Example');
    // Principal A opens Nadia; that read stays unresolved.
    holdRead = true;
    fireEvent.click(screen.getByRole('button', { name: 'Nadia Example' }));
    await waitFor(() => expect(candidateAReads(calls)).toHaveLength(1));
    holdRead = false;
    const switchedAt = calls.length;

    view.rerender(sessionPanel('token-b'));
    expectNoPrincipalAWorkspace({ atSwitch: true });
    expect(screen.queryByRole('heading', { level: 2, name: 'Omar Example' })).toBeNull();

    const late = jsonResponse({ candidate: asServerWouldReturn(nadia(), FULL_PERMISSIONS) });
    const consumed = vi.spyOn(late, 'json');
    read.release(late);
    // Wait until the client has read the late body, then drain the remaining
    // promise continuations without any timer.
    await waitFor(() => expect(consumed).toHaveBeenCalled());
    await act(async () => {
      await consumed.mock.results[0]!.value;
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve();
      }
    });

    expectNoPrincipalAWorkspace();
    await within(screen.getByRole('region', { name: 'Candidate list' })).findByRole('button', {
      name: 'Nadia Example',
    });
    expect(screen.queryByRole('heading', { level: 2, name: 'Nadia Example' })).toBeNull();
    expect(
      candidateTokensAfter(calls, switchedAt).every((token) => token === 'Bearer token-b'),
    ).toBe(true);
  });

  it('starts over when the same session loses or gains the restricted permissions', async () => {
    let serverPermissions: readonly string[] = FULL_PERMISSIONS;
    const calls = stubPrincipalApi({ 'token-a': principalA(() => serverPermissions) });
    const view = render(sessionPanel('token-a', FULL_PERMISSIONS));
    await selectCandidate('Nadia Example');
    openRestrictedForm('Edit compensation');

    // The same permissions in a new array are the same principal: nothing is reset or re-read.
    const before = calls.length;
    view.rerender(sessionPanel('token-a', [...FULL_PERMISSIONS]));
    expect(screen.getByRole('form', { name: 'Edit compensation' })).toBeVisible();
    expect(calls.length).toBe(before);

    // Revoked: the earlier response, which carried the restricted values, is discarded.
    serverPermissions = ORDINARY_PERMISSIONS;
    view.rerender(sessionPanel('token-a', ORDINARY_PERMISSIONS));
    expectNoPrincipalAWorkspace({ atSwitch: true });
    await selectCandidate('Nadia Example');
    expect(screen.queryByRole('region', { name: 'Restricted information' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/54,000|Granted|Salary expectation/);

    // Granted again: nothing is inherited from the restricted-free response either;
    // the values come from a fresh read made with the new permissions.
    serverPermissions = FULL_PERMISSIONS;
    const readsBefore = candidateAReads(calls).length;
    view.rerender(sessionPanel('token-a', FULL_PERMISSIONS));
    expect(screen.queryByRole('heading', { level: 2, name: 'Nadia Example' })).toBeNull();
    await selectCandidate('Nadia Example');
    expect(candidateAReads(calls)).toHaveLength(readsBefore + 1);
    expect(within(restrictedSection()).getByText('€54,000.00')).toBeVisible();
    expect(
      within(restrictedSection()).getByRole('button', { name: 'Edit compensation' }),
    ).toBeEnabled();
  });
});
