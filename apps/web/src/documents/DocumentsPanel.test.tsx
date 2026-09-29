import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n, type Locale } from '../i18n/index.js';
import { installBlobArrayBuffer } from '../public-opportunities/public-opportunity-test-data.js';
import { DocumentsPanel } from './DocumentsPanel.js';
import {
  CANDIDATE_ID,
  CLIENT_ID,
  deferred,
  DOCUMENT_A_ID,
  DOCUMENT_B_ID,
  errorResponse,
  FIXTURE_IDS,
  FULL_ACCESS,
  INTERVIEW_ID,
  jsonResponse,
  listPage,
  MISSION_ID,
  mockDocumentApi,
  option,
  PROCESS_ID,
  syntheticDocument,
  syntheticVersion,
  type RecordedCall,
} from './document-test-data.js';

function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')} type="button">
      Toggle locale
    </button>
  );
}

function Panel({
  accessToken = 'token-a',
  locale = 'en',
  permissions = FULL_ACCESS,
}: {
  accessToken?: string;
  locale?: Locale;
  permissions?: string[];
}) {
  return (
    <I18nProvider initialLocale={locale}>
      <LocaleToggle />
      <DocumentsPanel accessToken={accessToken} permissions={permissions} />
    </I18nProvider>
  );
}

const linkedDocument = syntheticDocument(DOCUMENT_A_ID, 'Synthetic interview report', {
  documentType: 'INTERVIEW_REPORT',
  context: { interviewId: INTERVIEW_ID },
  contextDisplay: {
    client: null,
    candidate: null,
    mission: null,
    missionCandidate: null,
    interview: {
      id: INTERVIEW_ID,
      interviewType: 'HR',
      scheduledStartAt: '2026-09-20T09:00:00.000Z',
      missionLabel: 'Synthetic Mission',
      candidateLabel: 'Synthetic Candidate',
    },
  },
});

const clientDocument = syntheticDocument(DOCUMENT_B_ID, 'Synthetic client brief', {
  documentType: 'CLIENT_FILE',
  context: { clientId: CLIENT_ID, recruitmentMissionId: MISSION_ID },
  contextDisplay: {
    client: { id: CLIENT_ID, label: 'Synthetic Client' },
    candidate: null,
    mission: { id: MISSION_ID, label: 'Synthetic Mission' },
    missionCandidate: null,
    interview: null,
  },
});

function listCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === 'GET' && call.path === '/v1/documents');
}

/** Default routing: two documents, their details, and a few safe options per kind. */
function standardApi(
  overrides: (call: RecordedCall) => Promise<Response> | Response | undefined = () => undefined,
): RecordedCall[] {
  return mockDocumentApi((call) => {
    const override = overrides(call);
    if (override) return override;
    if (call.method === 'GET' && call.path === '/v1/documents') {
      return jsonResponse(listPage([linkedDocument, clientDocument]));
    }
    if (call.method === 'GET' && call.path === `/v1/documents/${DOCUMENT_A_ID}`) {
      return jsonResponse({ document: linkedDocument });
    }
    if (call.method === 'GET' && call.path === `/v1/documents/${DOCUMENT_B_ID}`) {
      return jsonResponse({ document: clientDocument });
    }
    if (call.method === 'GET' && call.path === '/v1/documents/context-options') {
      switch (call.search.get('kind')) {
        case 'client':
          return jsonResponse({ options: [option(CLIENT_ID, 'Synthetic Client')] });
        case 'candidate':
          return jsonResponse({
            options: [option(CANDIDATE_ID, 'Synthetic Candidate', { detail: 'Analyst' })],
          });
        case 'mission':
          return jsonResponse({
            options: [option(MISSION_ID, 'Synthetic Mission', { detail: 'Synthetic Client' })],
          });
        case 'missionCandidate':
          return jsonResponse({
            options: [option(PROCESS_ID, 'Synthetic Candidate', { detail: 'Synthetic Mission' })],
          });
        case 'interview':
          return jsonResponse({
            options: [
              option(INTERVIEW_ID, 'Synthetic Candidate', {
                detail: 'Synthetic Mission',
                interview: { interviewType: 'HR', scheduledStartAt: '2026-09-20T09:00:00.000Z' },
              }),
            ],
          });
      }
    }
    return undefined;
  });
}

async function openDocument(title: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: title }));
  await screen.findByRole('heading', { level: 2, name: title });
}

/** The registration form lives in a disclosure; open it before use. */
function registerForm(): HTMLElement {
  const disclosure = document.querySelector<HTMLDetailsElement>('details.document-register');
  if (disclosure && !disclosure.open) {
    disclosure.open = true;
  }
  return screen.getByRole('form', { name: 'Register a document' });
}

async function choose(combobox: HTMLElement, label: string | RegExp): Promise<void> {
  const choice = await within(combobox).findByRole('option', { name: label });
  fireEvent.change(combobox, { target: { value: (choice as HTMLOptionElement).value } });
}

describe('DocumentsPanel presentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers no raw-ID or owner inputs anywhere in the Document Center', async () => {
    standardApi();
    const { container } = render(<Panel />);
    await openDocument('Synthetic client brief');

    const inputs = [...container.querySelectorAll('input, select, textarea')];
    for (const input of inputs) {
      const name = input.getAttribute('name') ?? '';
      expect(name).not.toMatch(/id$/i);
      expect(name).not.toMatch(/owner/i);
    }
    expect(screen.queryByLabelText(/\bid\b/i)).toBeNull();
    expect(screen.queryByLabelText(/owner/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/\bid\b/i)).toBeNull();
    // Registration states who becomes owner instead of asking for one.
    expect(within(registerForm()).getByText(/recorded as the owner/i)).toBeVisible();
  });

  it('never renders a linked record or document UUID as text', async () => {
    standardApi();
    const { container } = render(<Panel />);
    await openDocument('Synthetic interview report');
    await screen.findByRole('navigation', { name: 'Related to' });

    const text = container.textContent ?? '';
    for (const id of FIXTURE_IDS) {
      expect(text).not.toContain(id);
    }
    // Option values carry IDs for the API but never appear as visible labels.
    for (const choice of container.querySelectorAll('option')) {
      expect(choice.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });

  it('shows human context labels in the library and a Related-to breadcrumb in detail', async () => {
    standardApi();
    render(<Panel />);

    const table = await screen.findByRole('table', { name: 'Document list' });
    const clientRow = within(table).getByRole('row', { name: /Synthetic client brief/ });
    expect(within(clientRow).getByText('Client file')).toBeVisible();
    expect(clientRow).toHaveTextContent('Synthetic Client');
    expect(clientRow).toHaveTextContent('Synthetic Mission');

    await openDocument('Synthetic interview report');
    const trail = screen.getByRole('navigation', { name: 'Related to' });
    const steps = within(trail).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'MissionSynthetic Mission',
      'Candidate processSynthetic Candidate',
      expect.stringMatching(/^InterviewHR interview · /),
    ]);
  });

  it('keeps a hidden candidate hidden and shows a missing document as unavailable', async () => {
    const withoutCandidate = syntheticDocument(DOCUMENT_A_ID, 'Synthetic interview report', {
      context: { interviewId: INTERVIEW_ID },
      contextDisplay: {
        ...linkedDocument.contextDisplay,
        interview: { ...linkedDocument.contextDisplay.interview!, candidateLabel: null },
      },
    });
    standardApi((call) => {
      if (call.path === '/v1/documents') {
        return jsonResponse(listPage([withoutCandidate, clientDocument]));
      }
      if (call.path === `/v1/documents/${DOCUMENT_A_ID}`) {
        return jsonResponse({ document: withoutCandidate });
      }
      if (call.path === `/v1/documents/${DOCUMENT_B_ID}`) {
        return errorResponse(404, 'DOCUMENT_NOT_FOUND');
      }
      return undefined;
    });
    render(<Panel />);

    await openDocument('Synthetic interview report');
    const trail = screen.getByRole('navigation', { name: 'Related to' });
    expect(within(trail).queryByText('Candidate process')).toBeNull();
    expect(within(trail).queryByText('Synthetic Candidate')).toBeNull();
    expect(within(trail).getByText('Synthetic Mission')).toBeVisible();

    // A document that became hidden reads exactly like one that never existed.
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic client brief' }));
    expect(await screen.findByText('This document is no longer available to you.')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Synthetic client brief' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Related to' })).toBeNull();
  });

  it('labels Uploaded, Generated, and Imported versions and shows generated provenance', async () => {
    const generated = syntheticDocument(DOCUMENT_A_ID, 'Synthetic quotation', {
      documentType: 'QUOTATION',
      generatedSourceType: 'COMMERCIAL_QUOTATION',
      versions: [
        syntheticVersion(DOCUMENT_A_ID, 1, { source: 'IMPORTED' }),
        syntheticVersion(DOCUMENT_A_ID, 2, { source: 'UPLOADED' }),
        syntheticVersion(DOCUMENT_A_ID, 3, {
          source: 'GENERATED',
          templateId: 'commercial.quotation',
          templateVersion: 2,
          generationLanguage: 'fr',
        }),
      ],
    });
    standardApi((call) => {
      if (call.path === '/v1/documents') return jsonResponse(listPage([generated]));
      if (call.path === `/v1/documents/${DOCUMENT_A_ID}`) {
        return jsonResponse({ document: generated });
      }
      return undefined;
    });
    render(<Panel />);

    const row = await screen.findByRole('row', { name: /Synthetic quotation/ });
    expect(within(row).getByText('Generated')).toBeVisible();
    expect(within(row).getByText('v3')).toBeVisible();

    await openDocument('Synthetic quotation');
    const history = screen.getByRole('list', { name: 'Version history' });
    const entries = within(history).getAllByRole('listitem');
    expect(entries.map((entry) => within(entry).getByText(/^Version \d$/).textContent)).toEqual([
      'Version 3',
      'Version 2',
      'Version 1',
    ]);
    expect(within(entries[0]!).getByText('Generated')).toBeVisible();
    expect(within(entries[0]!).getByText('Current')).toBeVisible();
    expect(within(entries[1]!).getByText('Uploaded')).toBeVisible();
    expect(within(entries[2]!).getByText('Imported')).toBeVisible();
    expect(
      within(entries[0]!).getByText(/Template commercial\.quotation, revision 2/),
    ).toBeVisible();
    expect(within(entries[0]!).getByText(/Language: FR/)).toBeVisible();
    expect(screen.getByText('Generated from').nextElementSibling).toHaveTextContent('Quotation');
  });
});

describe('DocumentsPanel permissions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('presents a view-only account without write, download, archive, or context controls', async () => {
    const calls = standardApi();
    render(<Panel permissions={['documents:view']} />);
    await openDocument('Synthetic client brief');

    expect(screen.getByText('Read-only access')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Register a document' })).toBeNull();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive document' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Details' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Add a version' })).toBeNull();
    // Pickers exist only for record kinds the account can already read.
    const filters = screen.getByRole('search', { name: 'Filter documents' });
    expect(within(filters).queryByRole('combobox', { name: 'Client' })).toBeNull();
    expect(within(filters).queryByRole('combobox', { name: 'Candidate' })).toBeNull();
    expect(within(filters).queryByRole('combobox', { name: 'Mission' })).toBeNull();
    expect(within(filters).queryByRole('combobox', { name: 'Show' })).toBeNull();
    const status = within(filters).getByRole('combobox', { name: 'Status' });
    expect(within(status).queryByRole('option', { name: 'Archived' })).toBeNull();
    expect(calls.some((call) => call.path === '/v1/documents/context-options')).toBe(false);
    // The owner and creator are presented as names.
    expect(screen.getByText('Owner').nextElementSibling).toHaveTextContent('Synthetic Owner');
  });

  it('offers only the attach targets whose source permission the account holds', async () => {
    standardApi();
    render(<Panel permissions={['documents:view', 'documents:create', 'clients:view']} />);
    await screen.findByRole('table', { name: 'Document list' });

    const form = registerForm();
    const targets = within(form)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('value'));
    expect(targets).toEqual(['UNLINKED', 'CLIENT']);
  });
});

describe('DocumentsPanel guided creation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches a new document to an interview chosen by name through its candidate process', async () => {
    const created = syntheticDocument(DOCUMENT_B_ID, 'Synthetic HR notes', {
      documentType: 'INTERVIEW_REPORT',
      context: { interviewId: INTERVIEW_ID },
      contextDisplay: linkedDocument.contextDisplay,
      versions: [],
    });
    const calls = standardApi((call) => {
      if (call.method === 'POST' && call.path === '/v1/documents') {
        return jsonResponse({ document: created }, 201);
      }
      return undefined;
    });
    render(<Panel />);
    await screen.findByRole('table', { name: 'Document list' });

    const form = registerForm();
    fireEvent.change(within(form).getByLabelText(/^Title/), {
      target: { value: 'Synthetic HR notes' },
    });
    fireEvent.change(within(form).getByRole('combobox', { name: /Document type/ }), {
      target: { value: 'INTERVIEW_REPORT' },
    });
    fireEvent.click(within(form).getByRole('radio', { name: 'Interview' }));
    const submit = within(form).getByRole('button', { name: 'Register document' });
    expect(submit).toBeDisabled();

    await choose(
      within(form).getByRole('combobox', { name: 'Candidate process' }),
      'Synthetic Candidate · Synthetic Mission',
    );
    const interview = await within(form).findByRole('combobox', { name: 'Interview' });
    await choose(interview, /^HR interview · /);
    const interviewRequest = calls.find(
      (call) =>
        call.path === '/v1/documents/context-options' && call.search.get('kind') === 'interview',
    );
    expect(interviewRequest?.search.get('missionCandidateId')).toBe(PROCESS_ID);
    expect(interviewRequest?.search.get('purpose')).toBe('attach');

    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(await screen.findByText('Document registered.')).toBeVisible();
    const post = calls.find((call) => call.method === 'POST' && call.path === '/v1/documents');
    expect(post?.body).toEqual({
      title: 'Synthetic HR notes',
      documentType: 'INTERVIEW_REPORT',
      visibility: 'INTERNAL_ONLY',
      context: { interviewId: INTERVIEW_ID },
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Synthetic HR notes' }),
    ).toHaveFocus();
    // The form resets for the next document.
    expect(within(registerForm()).getByLabelText(/^Title/)).toHaveValue('');
  });

  it('limits a recruitment contract to a mission and blocks submission until one is chosen', async () => {
    standardApi();
    render(<Panel />);
    await screen.findByRole('table', { name: 'Document list' });

    const form = registerForm();
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: 'Contract' } });
    fireEvent.change(within(form).getByRole('combobox', { name: /Document type/ }), {
      target: { value: 'CONTRAT_RECRUTEMENT' },
    });
    const radios = within(form).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(['MISSION']);
    expect(within(form).getByRole('radio', { name: 'Mission' })).toBeChecked();
    expect(within(form).getByRole('button', { name: 'Register document' })).toBeDisabled();
    await choose(
      within(form).getByRole('combobox', { name: 'Mission' }),
      'Synthetic Mission · Synthetic Client',
    );
    expect(within(form).getByRole('button', { name: 'Register document' })).toBeEnabled();
  });

  it.each([
    ['DOCUMENT_CLIENT_CONTEXT_INVALID', 'The selected record can no longer receive documents.'],
    ['DOCUMENT_CONTEXT_MISMATCH', 'The selected records do not belong together.'],
  ])('shows the server rejection %s without selecting anything', async (code, message) => {
    standardApi((call) => {
      if (call.method === 'POST' && call.path === '/v1/documents') {
        return errorResponse(409, code);
      }
      return undefined;
    });
    render(<Panel />);
    await screen.findByRole('table', { name: 'Document list' });

    const form = registerForm();
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: 'Brief' } });
    fireEvent.click(within(form).getByRole('radio', { name: 'Client' }));
    await choose(within(form).getByRole('combobox', { name: 'Client' }), 'Synthetic Client');
    fireEvent.click(within(form).getByRole('button', { name: 'Register document' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('heading', { level: 2, name: 'Brief' })).toBeNull();
    // The operator's input is kept so the choice can be corrected.
    expect(within(form).getByLabelText(/^Title/)).toHaveValue('Brief');
  });
});

describe('DocumentsPanel filters and pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters by a client chosen by name and by source, lifecycle, and search', async () => {
    const calls = standardApi();
    render(<Panel />);
    await screen.findByRole('table', { name: 'Document list' });

    const filters = screen.getByRole('search', { name: 'Filter documents' });
    fireEvent.change(within(filters).getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'brief' },
    });
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Source' }), {
      target: { value: 'GENERATED' },
    });
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Show' }), {
      target: { value: 'archived' },
    });
    await choose(within(filters).getByRole('combobox', { name: 'Client' }), 'Synthetic Client');
    fireEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(listCalls(calls)).toHaveLength(2));
    const query = listCalls(calls)[1]!.search;
    expect(query.get('search')).toBe('brief');
    expect(query.get('source')).toBe('GENERATED');
    expect(query.get('lifecycle')).toBe('archived');
    expect(query.get('clientId')).toBe(CLIENT_ID);
    expect(query.get('page')).toBe('1');
    const clientOptions = calls.find(
      (call) =>
        call.path === '/v1/documents/context-options' && call.search.get('kind') === 'client',
    );
    expect(clientOptions?.search.get('purpose')).toBe('filter');
    // The default view lists current documents only.
    expect(listCalls(calls)[0]!.search.get('lifecycle')).toBe('current');
  });

  it('pages through results and falls back when a page empties', async () => {
    const calls = standardApi((call) => {
      if (call.path !== '/v1/documents') return undefined;
      const page = Number(call.search.get('page'));
      if (page === 3) return jsonResponse(listPage([], 41, 3));
      return jsonResponse(listPage([clientDocument], 41, page));
    });
    render(<Panel />);
    expect(await screen.findByText('41 documents')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(listCalls(calls).at(-1)?.search.get('page')).toBe('2'));
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(listCalls(calls).at(-1)?.search.get('page')).toBe('2'));
    expect(listCalls(calls).map((call) => call.search.get('page'))).toEqual(['1', '2', '3', '2']);
  });
});

describe('DocumentsPanel localization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Document Center in French', async () => {
    standardApi();
    render(<Panel locale="fr" />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Bibliothèque de documents' }),
    ).toBeVisible();
    const row = await screen.findByRole('row', { name: /Synthetic interview report/ });
    expect(within(row).getByText('Rapport d’entretien')).toBeVisible();
    expect(within(row).getByText('Téléversé')).toBeVisible();
    expect(within(row).getByText('Actif')).toBeVisible();
    await openDocument('Synthetic interview report');
    expect(screen.getByRole('navigation', { name: 'Rattaché à' })).toHaveTextContent(
      'Entretien RH',
    );
    expect(screen.getByRole('heading', { name: 'Historique des versions' })).toBeVisible();
    // The current file and its history entry both offer the download.
    expect(screen.getAllByRole('button', { name: 'Télécharger la version 1' })).toHaveLength(2);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Enregistrer un document' }),
    ).toBeVisible();
  });

  it('keeps selection and filter drafts across a locale switch without refetching', async () => {
    const calls = standardApi();
    render(<Panel />);
    await openDocument('Synthetic interview report');
    const filters = screen.getByRole('search', { name: 'Filter documents' });
    fireEvent.change(within(filters).getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'draft term' },
    });
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Bibliothèque de documents' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Synthetic interview report' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('search', { name: 'Filtrer les documents' })).getByRole('searchbox', {
        name: 'Rechercher',
      }),
    ).toHaveValue('draft term');
    expect(calls.length).toBe(before);
  });
});

describe('DocumentsPanel async safety', () => {
  installBlobArrayBuffer();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a late detail response for a document the operator left', async () => {
    const slowA = deferred();
    standardApi((call) =>
      call.path === `/v1/documents/${DOCUMENT_A_ID}` ? slowA.promise : undefined,
    );
    render(<Panel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Synthetic interview report' }));
    await openDocument('Synthetic client brief');
    await act(async () => {
      slowA.resolve(jsonResponse({ document: linkedDocument }));
      await slowA.promise;
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Synthetic client brief' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Synthetic interview report' }),
    ).toBeNull();
  });

  it('ignores a late list response from a previous session', async () => {
    const slowFirst = deferred();
    standardApi((call) => {
      if (call.path !== '/v1/documents') return undefined;
      if (call.authorization === 'Bearer token-a') return slowFirst.promise;
      return jsonResponse(listPage([clientDocument]));
    });
    const { rerender } = render(<Panel />);
    rerender(<Panel accessToken="token-b" />);
    expect(await screen.findByRole('button', { name: 'Synthetic client brief' })).toBeVisible();

    await act(async () => {
      slowFirst.resolve(jsonResponse(listPage([linkedDocument])));
      await slowFirst.promise;
    });
    expect(screen.queryByRole('button', { name: 'Synthetic interview report' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Synthetic client brief' })).toBeVisible();
  });

  it('does not land a new version on a different document selected meanwhile', async () => {
    const slowVersion = deferred();
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === `/v1/documents/${DOCUMENT_A_ID}/versions`
        ? slowVersion.promise
        : undefined,
    );
    render(<Panel />);
    await openDocument('Synthetic interview report');

    const upload = screen.getByRole('form', { name: 'Add a version' });
    const file = new File(['%PDF-1.7 synthetic'], 'synthetic-v2.pdf', { type: 'application/pdf' });
    fireEvent.change(within(upload).getByLabelText(/^File/), { target: { files: [file] } });
    expect(within(upload).getByRole('button', { name: 'Upload new version' })).toBeEnabled();
    // jsdom validates `required` file inputs against its own empty file list, so submit directly.
    fireEvent.submit(upload);
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith(`${DOCUMENT_A_ID}/versions`))).toBe(true),
    );
    const versionPost = calls.find((call) => call.path.endsWith(`${DOCUMENT_A_ID}/versions`));
    expect(versionPost?.body).toMatchObject({
      filename: 'synthetic-v2.pdf',
      contentType: 'application/pdf',
    });

    await openDocument('Synthetic client brief');
    // One write at a time: the other document's write controls wait for the lock.
    expect(screen.getByRole('button', { name: 'Archive document' })).toBeDisabled();

    await act(async () => {
      slowVersion.resolve(
        jsonResponse({
          document: syntheticDocument(DOCUMENT_A_ID, 'Synthetic interview report', {
            versions: [syntheticVersion(DOCUMENT_A_ID, 1), syntheticVersion(DOCUMENT_A_ID, 2)],
          }),
        }),
      );
      await slowVersion.promise;
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Synthetic client brief' })).toBeVisible();
    expect(screen.queryByText('New version added.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Archive document' })).toBeEnabled();
  });

  it('adds an immutable version and keeps every earlier version downloadable', async () => {
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === `/v1/documents/${DOCUMENT_A_ID}/versions`
        ? jsonResponse({
            document: syntheticDocument(DOCUMENT_A_ID, 'Synthetic interview report', {
              context: linkedDocument.context,
              contextDisplay: linkedDocument.contextDisplay,
              versions: [
                syntheticVersion(DOCUMENT_A_ID, 1),
                syntheticVersion(DOCUMENT_A_ID, 2, { filename: 'synthetic-v2.pdf' }),
              ],
            }),
          })
        : undefined,
    );
    render(<Panel />);
    await openDocument('Synthetic interview report');

    const upload = screen.getByRole('form', { name: 'Add a version' });
    const file = new File(['%PDF-1.7 synthetic'], 'synthetic-v2.pdf', { type: 'application/pdf' });
    fireEvent.change(within(upload).getByLabelText(/^File/), { target: { files: [file] } });
    expect(within(upload).getByRole('button', { name: 'Upload new version' })).toBeEnabled();
    // jsdom validates `required` file inputs against its own empty file list, so submit directly.
    fireEvent.submit(upload);

    expect(await screen.findByText('New version added.')).toBeVisible();
    const history = screen.getByRole('list', { name: 'Version history' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Download version 2' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Download version 1' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /delete|replace|remove/i })).toBeNull();
    expect(calls.filter((call) => call.method !== 'GET').map((call) => call.method)).toEqual([
      'POST',
    ]);
  });

  it('downloads a historical version through the protected endpoint as a local file', async () => {
    const createObjectURL = vi.fn(() => 'blob:synthetic-document');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    const history = syntheticDocument(DOCUMENT_A_ID, 'Synthetic interview report', {
      versions: [syntheticVersion(DOCUMENT_A_ID, 1), syntheticVersion(DOCUMENT_A_ID, 2)],
    });
    const oldVersion = history.versions[0]!;
    const calls = standardApi((call) => {
      if (call.path === `/v1/documents/${DOCUMENT_A_ID}`) {
        return jsonResponse({ document: history });
      }
      if (call.path === `/v1/documents/${DOCUMENT_A_ID}/versions/${oldVersion.id}/download`) {
        return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } });
      }
      return undefined;
    });
    render(<Panel />);
    await openDocument('Synthetic interview report');

    fireEvent.click(screen.getByRole('button', { name: 'Download version 1' }));

    expect(await screen.findByText('Download started.')).toBeVisible();
    expect(clicks[0]?.download).toBe('synthetic-v1.pdf');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-document');
    expect(calls.find((call) => call.path.endsWith('/download'))?.authorization).toBe(
      'Bearer token-a',
    );
  });

  it('resets selection and drafts when the session principal changes', async () => {
    standardApi();
    const { rerender } = render(<Panel />);
    await openDocument('Synthetic interview report');
    const filters = screen.getByRole('search', { name: 'Filter documents' });
    fireEvent.change(within(filters).getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'secret draft' },
    });

    rerender(<Panel accessToken="token-b" permissions={['documents:view']} />);

    await screen.findByRole('table', { name: 'Document list' });
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Synthetic interview report' }),
    ).toBeNull();
    expect(
      within(screen.getByRole('search', { name: 'Filter documents' })).getByRole('searchbox', {
        name: 'Search',
      }),
    ).toHaveValue('');
  });
});

describe('DocumentsPanel accessibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has one page heading, labelled controls, text status, and focus that follows selection', async () => {
    standardApi();
    const { container } = render(<Panel />);
    await screen.findByRole('table', { name: 'Document list' });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const control of container.querySelectorAll('input:not([type="radio"]), select')) {
      const id = control.getAttribute('id');
      expect(id && container.querySelector(`label[for="${id}"]`)).toBeTruthy();
    }
    for (const radio of container.querySelectorAll('input[type="radio"]')) {
      expect(radio.closest('label')).not.toBeNull();
    }
    // Every table cell names its column so stacked mobile cards stay readable.
    for (const cell of container.querySelectorAll('.document-table td')) {
      expect(cell.getAttribute('data-label')).toBeTruthy();
    }
    // Status is text, never color alone.
    const row = screen.getByRole('row', { name: /Synthetic client brief/ });
    expect(within(row).getByText('Active')).toBeVisible();

    const select = screen.getByRole('button', { name: 'Synthetic client brief' });
    select.focus();
    fireEvent.click(select);
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Synthetic client brief',
    });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Synthetic client brief' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('row', { name: /Synthetic client brief/ })).toHaveAttribute(
      'data-selected',
      'true',
    );
  });
});
