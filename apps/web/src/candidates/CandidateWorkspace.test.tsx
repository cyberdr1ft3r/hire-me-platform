import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CandidateDetail } from '@hire-me/contracts';

import { I18nProvider, type Locale } from '../i18n/index.js';
import { resolveCandidateAccess } from './candidate-access.js';
import {
  EMPTY_CANDIDATE_FILTERS,
  type CandidateDetailState,
  type CandidateFeedback,
  type CandidateListState,
} from './candidate-state.js';
import {
  asServerWouldReturn,
  FULL_PERMISSIONS,
  ORDINARY_PERMISSIONS,
  P,
  syntheticCandidate,
} from './candidate-test-data.js';
import { CandidateWorkspace, type CandidateWorkspaceProps } from './CandidateWorkspace.js';

/**
 * Presentation tests for the Candidate workspace.
 *
 * They render the real presentation with explicit permission sets, so every
 * assertion is about what an actor can see or trigger — never about CSS.
 */

afterEach(() => {
  cleanup();
});

function renderWorkspace(
  permissions: readonly string[],
  overrides: Partial<CandidateWorkspaceProps> = {},
  options: { candidate?: CandidateDetail; locale?: Locale; raw?: boolean } = {},
) {
  const record = options.candidate ?? syntheticCandidate();
  // By default the record is shaped exactly as the API would shape it.
  const shaped = options.raw ? record : asServerWouldReturn(record, permissions);
  const props: CandidateWorkspaceProps = {
    access: resolveCandidateAccess(permissions),
    appliedFilters: EMPTY_CANDIDATE_FILTERS,
    detail: { candidate: shaped, status: 'ready' },
    feedback: null,
    filters: EMPTY_CANDIDATE_FILTERS,
    list: { candidates: [shaped], page: 1, pageSize: 20, status: 'ready', total: 1 },
    onAddRecord: vi.fn(() => Promise.resolve({ ok: true as const })),
    onArchive: vi.fn(),
    onArchiveRecord: vi.fn(() => Promise.resolve(true)),
    onChangeStatus: vi.fn(),
    onCreate: vi.fn(() => Promise.resolve({ ok: true as const })),
    onFiltersChange: vi.fn(),
    onPage: vi.fn(),
    onResetFilters: vi.fn(),
    onRetryDetail: vi.fn(),
    onRetryList: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onUpdate: vi.fn(() => Promise.resolve({ ok: true as const })),
    onUpdateRecord: vi.fn(() => Promise.resolve({ ok: true as const })),
    pending: null,
    selectedId: shaped.id,
    ...overrides,
  };
  render(
    <I18nProvider initialLocale={options.locale ?? 'en'}>
      <CandidateWorkspace {...props} />
    </I18nProvider>,
  );
  return props;
}

const button = (name: string | RegExp) => screen.queryByRole('button', { name });

describe('Candidate workspace action permissions', () => {
  it('renders the list and the record but no write action for a view-only actor', () => {
    renderWorkspace([P.view]);

    expect(screen.getByRole('heading', { level: 1, name: 'Candidates' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Synthetic Candidate' })).toBeVisible();
    for (const name of [
      'New candidate',
      'Edit profile',
      'Mark active',
      'Mark inactive',
      'Move to talent pool',
      'Archive candidate',
      'Add skill',
      'Add language',
      'Add experience',
      'Add education',
    ]) {
      expect(button(name)).toBeNull();
    }
    expect(screen.queryByRole('group', { name: 'Candidate actions' })).toBeNull();
  });

  it('offers creation only with candidates:create', () => {
    renderWorkspace([P.view, P.create]);
    expect(button('New candidate')).toBeVisible();
    cleanup();
    renderWorkspace(ORDINARY_PERMISSIONS.filter((code) => code !== P.create));
    expect(button('New candidate')).toBeNull();
  });

  it('offers profile editing only with candidates:update, and never on an archived record', () => {
    renderWorkspace([P.view, P.update]);
    expect(button('Edit profile')).toBeVisible();
    cleanup();
    renderWorkspace(
      [P.view, P.update],
      {},
      {
        candidate: syntheticCandidate({
          archivedAt: '2026-07-22T00:00:00.000Z',
          status: 'ARCHIVED',
        }),
      },
    );
    expect(button('Edit profile')).toBeNull();
    expect(
      screen.getByText(
        'This candidate is archived. Archived profiles are read-only and keep their history.',
      ),
    ).toBeVisible();
  });

  it('offers only the other non-archival lifecycle states with candidates:status:manage', () => {
    const props = renderWorkspace([P.view, P.statusManage]);

    expect(button('Mark active')).toBeNull();
    expect(button('Mark inactive')).toBeVisible();
    expect(button('Move to talent pool')).toBeVisible();
    expect(button('Archive candidate')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Move to talent pool' }));
    expect(props.onChangeStatus).toHaveBeenCalledWith('TALENT_POOL');
  });

  it('never offers lifecycle or archive actions on an archived record', () => {
    renderWorkspace(
      [P.view, P.statusManage, P.archive],
      {},
      {
        candidate: syntheticCandidate({
          archivedAt: '2026-07-22T00:00:00.000Z',
          status: 'ARCHIVED',
        }),
      },
    );
    for (const name of [
      'Mark active',
      'Mark inactive',
      'Move to talent pool',
      'Archive candidate',
    ]) {
      expect(button(name)).toBeNull();
    }
  });

  it('offers archival only with candidates:archive, as a separate destructive action', () => {
    const props = renderWorkspace([P.view, P.archive]);
    expect(button('Mark inactive')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Archive candidate' }));
    expect(props.onArchive).toHaveBeenCalledTimes(1);
  });

  it('disables every write action while a mutation is in flight', () => {
    renderWorkspace(ORDINARY_PERMISSIONS, { pending: 'status' });
    const actions = screen.getByRole('group', { name: 'Candidate actions' });
    for (const control of within(actions).getAllByRole('button')) {
      expect(control).toBeDisabled();
    }
  });
});

describe('Candidate sensitive-data boundaries', () => {
  it('renders nothing about compensation or consent without their view permissions', () => {
    // `raw` hands the presentation a record that still carries both areas, to
    // prove the gate is the permission itself and not merely the absent data.
    renderWorkspace(ORDINARY_PERMISSIONS, {}, { raw: true });

    expect(screen.queryByRole('heading', { name: 'Restricted information' })).toBeNull();
    expect(screen.queryByText('Compensation')).toBeNull();
    expect(screen.queryByText('Salary expectation')).toBeNull();
    expect(screen.queryByText('Consent')).toBeNull();
    expect(screen.queryByText('Granted')).toBeNull();
    expect(document.body.textContent).not.toMatch(/54,000/);
  });

  it('shows compensation read-only with candidate_compensation:view', () => {
    renderWorkspace([...ORDINARY_PERMISSIONS, P.compensationView]);

    const section = screen.getByRole('region', { name: 'Restricted information' });
    expect(within(section).getByText('Salary expectation')).toBeVisible();
    expect(within(section).getByText(/€54,000\.00/)).toBeVisible();
    expect(within(section).queryByText('Consent')).toBeNull();
    expect(within(section).queryByRole('textbox')).toBeNull();
    expect(within(section).queryByRole('spinbutton')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('keeps compensation read-only even with candidate_compensation:update, as before', () => {
    renderWorkspace([...ORDINARY_PERMISSIONS, P.compensationView, P.compensationUpdate]);

    const section = screen.getByRole('region', { name: 'Restricted information' });
    expect(within(section).getByText(/€54,000\.00/)).toBeVisible();
    expect(within(section).queryByRole('textbox')).toBeNull();
    expect(within(section).queryByRole('spinbutton')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('shows consent read-only with candidate_consent:view, and still read-only with manage', () => {
    renderWorkspace([...ORDINARY_PERMISSIONS, P.consentView]);
    let section = screen.getByRole('region', { name: 'Restricted information' });
    expect(within(section).getByText('Consent status')).toBeVisible();
    expect(within(section).getByText('Granted')).toBeVisible();
    expect(within(section).queryByText('Salary expectation')).toBeNull();
    expect(within(section).queryByRole('combobox')).toBeNull();
    cleanup();

    renderWorkspace([...ORDINARY_PERMISSIONS, P.consentView, P.consentManage]);
    section = screen.getByRole('region', { name: 'Restricted information' });
    expect(within(section).getByText('Granted')).toBeVisible();
    expect(within(section).queryByRole('combobox')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('never shows compensation or consent in the candidate list, whatever the access', () => {
    renderWorkspace(FULL_PERMISSIONS, { detail: { status: 'idle' }, selectedId: null });

    const list = screen.getByRole('region', { name: 'Candidate list' });
    expect(within(list).getByText('Synthetic Candidate')).toBeVisible();
    expect(list.textContent).not.toMatch(/54,000|EUR|€|Granted|Consent|Salary/);
  });

  it('keeps compensation and consent fields out of the profile edit form', () => {
    renderWorkspace(FULL_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));

    const form = screen.getByRole('form', { name: 'Edit profile' });
    const names = Array.from(form.querySelectorAll('input, textarea, select'), (control) =>
      control.getAttribute('name'),
    );
    expect(names).toEqual([
      'displayName',
      'email',
      'phone',
      'currentJobTitle',
      'city',
      'country',
      'source',
      'professionalSummary',
    ]);
  });
});

describe('Candidate structured profile sections', () => {
  it('renders each section with a heading and list semantics, experience current first', () => {
    renderWorkspace(ORDINARY_PERMISSIONS);

    for (const title of ['Skills', 'Languages', 'Work experience', 'Education']) {
      expect(screen.getByRole('region', { name: new RegExp(`^${title}`) })).toBeVisible();
    }
    const skills = screen.getByRole('region', { name: /^Skills/ });
    expect(within(skills).getByRole('listitem')).toHaveTextContent('SourcingAdvanced');

    const experience = screen.getByRole('region', { name: /^Work experience/ });
    const roles = within(experience).getAllByRole('listitem');
    expect(roles[0]).toHaveTextContent('Senior Recruiter');
    expect(roles[0]).toHaveTextContent('2020-01 – Present');
    expect(roles[0]).toHaveTextContent('Current role');
    expect(roles[1]).toHaveTextContent('2016-01 – 2019-12');
  });

  it('says the records are unavailable, not empty, without candidate_profile:view', () => {
    renderWorkspace([P.view]);
    expect(
      screen.getByText('Structured profile records are not available with your current access.'),
    ).toBeVisible();
    expect(screen.queryByText('No skills recorded.')).toBeNull();
    expect(screen.queryByRole('region', { name: /^Skills/ })).toBeNull();
  });

  it('offers add controls only with candidate_profile:manage', () => {
    renderWorkspace([P.view, P.profileView]);
    expect(button('Add skill')).toBeNull();
    cleanup();

    const props = renderWorkspace([P.view, P.profileView, P.profileManage]);
    fireEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    const form = screen.getByRole('form', { name: 'Add skill' });
    fireEvent.change(within(form).getByLabelText(/^Skill/), { target: { value: 'Interviewing' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add skill' }));
    expect(props.onAddRecord).toHaveBeenCalledWith({
      kind: 'skill',
      values: { level: '', name: 'Interviewing' },
    });
  });

  it('marks records archived with their candidate without a color-only signal', () => {
    const candidate = syntheticCandidate({
      archivedAt: '2026-07-22T00:00:00.000Z',
      status: 'ARCHIVED',
    });
    candidate.skills = candidate.skills.map((skill) => ({
      ...skill,
      archivedAt: '2026-07-22T00:00:00.000Z',
    }));
    renderWorkspace(ORDINARY_PERMISSIONS, {}, { candidate });

    const skills = screen.getByRole('region', { name: /^Skills/ });
    expect(within(skills).getByText('Archived')).toBeVisible();
    expect(within(skills).queryByRole('button')).toBeNull();
  });
});

describe('Candidate workspace localization', () => {
  it('renders English labels and localized lifecycle values', () => {
    renderWorkspace(FULL_PERMISSIONS);
    expect(screen.getByText('Recruitment')).toBeVisible();
    expect(
      screen.getByText('Manage candidate profiles and recruitment information.'),
    ).toBeVisible();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Contact and profile' })).toBeVisible();
  });

  it('renders the whole workspace in French, including domain values', () => {
    renderWorkspace(FULL_PERMISSIONS, {}, { locale: 'fr' });

    expect(screen.getByRole('heading', { level: 1, name: 'Candidats' })).toBeVisible();
    expect(screen.getByText('Recrutement')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nouveau candidat' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Marquer comme inactif' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Archiver le candidat' })).toBeVisible();
    expect(screen.getAllByText('Actif').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Informations restreintes' })).toBeVisible();
    expect(screen.getByText('Accordé')).toBeVisible();
    expect(screen.getByText(/54\s000,00/u)).toBeVisible();
    expect(screen.getByRole('option', { name: 'Vivier de talents' })).toHaveValue('TALENT_POOL');
    expect(screen.queryByText('Candidates')).toBeNull();
  });

  it('keeps language-neutral values in the status filter options', () => {
    renderWorkspace([P.view], {}, { locale: 'fr' });
    const options = Array.from(
      screen.getByLabelText('Statut').querySelectorAll('option'),
      (option) => option.value,
    );
    expect(options).toEqual(['', 'ACTIVE', 'INACTIVE', 'TALENT_POOL', 'ARCHIVED']);
  });
});

describe('Candidate workspace states', () => {
  const ready = (list: CandidateListState, detail: CandidateDetailState = { status: 'idle' }) => ({
    detail,
    list,
    selectedId: null,
  });

  it('shows a loading state that never claims an empty list', () => {
    renderWorkspace([P.view], ready({ status: 'loading' }));
    expect(screen.getByText('Loading candidates…')).toBeInTheDocument();
    expect(screen.queryByText('No candidates yet')).toBeNull();
  });

  it('shows a safe list failure with a retry', () => {
    const props = renderWorkspace([P.view], ready({ status: 'error' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load candidates.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetryList).toHaveBeenCalledTimes(1);
  });

  const emptyPage: CandidateListState = {
    candidates: [],
    page: 1,
    pageSize: 20,
    status: 'ready',
    total: 0,
  };

  it('distinguishes an empty workspace from a search without matches', () => {
    renderWorkspace([P.view], ready(emptyPage));
    expect(screen.getByRole('heading', { name: 'No candidates yet' })).toBeVisible();
    cleanup();

    const filtered = { ...EMPTY_CANDIDATE_FILTERS, search: 'nobody' };
    const props = renderWorkspace([P.view], {
      ...ready(emptyPage),
      appliedFilters: filtered,
      filters: filtered,
    });
    expect(screen.getByRole('heading', { name: 'No matching candidates' })).toBeVisible();
    const empty = screen.getByRole('region', { name: 'No matching candidates' });
    fireEvent.click(within(empty).getByRole('button', { name: 'Clear search' }));
    expect(props.onResetFilters).toHaveBeenCalledTimes(1);
  });

  /*
   * Issue #67 (D-CAND-01) supersedes the former "only the most recent matches"
   * notice: the list is now one server page, stated with its page and range.
   */
  it('states the server page and range, and asks for the neighbouring pages', () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      syntheticCandidate({
        displayName: `Candidate ${index + 21}`,
        id: `00000000-0000-4000-8000-${String(index + 21).padStart(12, '0')}`,
      }),
    );
    const props = renderWorkspace(
      [P.view],
      ready({ candidates: rows, page: 2, pageSize: 20, status: 'ready', total: 45 }),
    );
    const pages = screen.getByRole('navigation', { name: 'Candidate pages' });
    expect(within(pages).getByText('Page 2 of 3')).toBeVisible();
    expect(within(pages).getByText('21–40 of 45')).toBeVisible();
    fireEvent.click(within(pages).getByRole('button', { name: 'Next page' }));
    fireEvent.click(within(pages).getByRole('button', { name: 'Previous page' }));
    expect(props.onPage).toHaveBeenNthCalledWith(1, 3);
    expect(props.onPage).toHaveBeenNthCalledWith(2, 1);
  });

  it('disables the page controls at the boundaries and hides them for one page', () => {
    const candidate = syntheticCandidate();
    renderWorkspace(
      [P.view],
      ready({ candidates: [candidate], page: 1, pageSize: 20, status: 'ready', total: 21 }),
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    cleanup();

    renderWorkspace(
      [P.view],
      ready({ candidates: [candidate], page: 2, pageSize: 20, status: 'ready', total: 21 }),
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByText('Page 2 of 2')).toBeVisible();
    cleanup();

    renderWorkspace(
      [P.view],
      ready({ candidates: [candidate], page: 1, pageSize: 20, status: 'ready', total: 1 }),
    );
    expect(screen.getByText('Page 1 of 1')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('shows no-selection, detail loading, and detail failure distinctly', () => {
    renderWorkspace([P.view], { detail: { status: 'idle' }, selectedId: null });
    expect(screen.getByRole('heading', { name: 'No candidate selected' })).toBeVisible();
    cleanup();

    renderWorkspace([P.view], { detail: { candidateId: 'x', status: 'loading' } });
    expect(screen.getByText('Loading candidate profile…')).toBeInTheDocument();
    cleanup();

    const props = renderWorkspace([P.view], { detail: { candidateId: 'x', status: 'error' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this candidate.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetryDetail).toHaveBeenCalledTimes(1);
  });

  it('marks the selected candidate with aria-current', () => {
    renderWorkspace([P.view]);
    expect(screen.getByRole('button', { name: 'Synthetic Candidate' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('announces success and failure feedback in the active language', () => {
    const statusChanged: CandidateFeedback = {
      kind: 'statusChanged',
      status: 'INACTIVE',
      tone: 'success',
    };
    renderWorkspace([P.view], { feedback: statusChanged });
    expect(
      screen.getByText('Candidate status changed to Inactive.').closest('[role="status"]'),
    ).not.toBeNull();
    cleanup();

    renderWorkspace(
      [P.view],
      {
        feedback: { failure: 'archived', kind: 'failed', tone: 'danger' },
      },
      { locale: 'fr' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ce candidat a été archivé et ne peut plus être modifié.',
    );
  });
});

describe('Candidate forms', () => {
  it('validates required and email fields beside their controls before any request', async () => {
    const props = renderWorkspace([P.view, P.create]);
    fireEvent.click(screen.getByRole('button', { name: 'New candidate' }));

    const form = screen.getByRole('form', { name: 'New candidate' });
    const name = within(form).getByLabelText(/^Full name/);
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.change(within(form).getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create candidate' }));

    expect(await within(form).findByText('This field is required.')).toBeVisible();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('This field is required.');
    expect(within(form).getByText('Enter a valid email address.')).toBeVisible();
    expect(name).toHaveFocus();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('shows a duplicate-email conflict on the email field and keeps the form open', async () => {
    const props = renderWorkspace([P.view, P.create], {
      onCreate: vi.fn(() =>
        Promise.resolve({ fieldErrors: { email: 'duplicateEmail' as const }, ok: false as const }),
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'New candidate' }));
    const form = screen.getByRole('form', { name: 'New candidate' });
    fireEvent.change(within(form).getByLabelText(/^Full name/), {
      target: { value: 'Created Candidate' },
    });
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: 'existing@example.test' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Create candidate' }));

    await waitFor(() => expect(props.onCreate).toHaveBeenCalledTimes(1));
    const email = within(form).getByLabelText('Email');
    expect(
      await within(form).findByText('A candidate with this email already exists.'),
    ).toBeVisible();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('form', { name: 'New candidate' })).toBeInTheDocument();
  });

  it('shows a safe form-level failure for other conflicts', async () => {
    renderWorkspace(ORDINARY_PERMISSIONS, {
      onUpdate: vi.fn(() => Promise.resolve({ failure: 'archived' as const, ok: false as const })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const form = screen.getByRole('form', { name: 'Edit profile' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'This candidate has been archived and can no longer be changed.',
    );
  });

  it('closes the editor after a successful save', async () => {
    const props = renderWorkspace(ORDINARY_PERMISSIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const form = screen.getByRole('form', { name: 'Edit profile' });
    fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Paris' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit profile' })).toBeNull());
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Paris', displayName: 'Synthetic Candidate' }),
    );
  });
});

describe('Candidate source filter and labels', () => {
  it('offers only the platform source and an exact recorded source, with neutral values', () => {
    const props = renderWorkspace([P.view]);
    const source = screen.getByLabelText('Source');
    expect(
      Array.from(source.querySelectorAll('option'), (option) => [option.value, option.textContent]),
    ).toEqual([
      ['', 'Any source'],
      ['publicApplication', 'Public application'],
      ['recorded', 'Other recorded source'],
    ]);
    // The free-text field appears only for a recorded source.
    expect(screen.queryByLabelText('Recorded source')).toBeNull();
    fireEvent.change(source, { target: { value: 'recorded' } });
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMode: 'recorded' }),
    );
    cleanup();

    renderWorkspace(
      [P.view],
      { filters: { ...EMPTY_CANDIDATE_FILTERS, sourceMode: 'recorded', sourceText: 'LinkedIn' } },
      { locale: 'fr' },
    );
    expect(
      Array.from(screen.getByLabelText('Source').querySelectorAll('option'), (option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ['', 'Toutes les sources'],
      ['publicApplication', 'Candidature en ligne'],
      ['recorded', 'Autre source enregistrée'],
    ]);
    expect(screen.getByLabelText('Source enregistrée')).toHaveValue('LinkedIn');
  });

  it('names the platform source in each language and shows other sources as recorded', () => {
    const fromApplication = syntheticCandidate({ source: 'public_application' });
    const typed = syntheticCandidate({
      displayName: 'Typed Source',
      id: '00000000-0000-4000-8000-000000000067',
      source: 'LinkedIn',
    });
    renderWorkspace(
      [P.view],
      {
        list: {
          candidates: [fromApplication, typed],
          page: 1,
          pageSize: 20,
          status: 'ready',
          total: 2,
        },
      },
      { candidate: fromApplication },
    );
    expect(screen.getAllByText('Public application').length).toBeGreaterThanOrEqual(2);
    const rows = within(screen.getByRole('region', { name: 'Candidate list' })).getAllByRole(
      'listitem',
    );
    expect(within(rows[0]!).getByText('Public application')).toBeVisible();
    expect(within(rows[1]!).getByText('LinkedIn')).toBeVisible();
    expect(document.body.textContent).not.toContain('public_application');
    cleanup();

    renderWorkspace([P.view], {}, { candidate: fromApplication, locale: 'fr' });
    expect(screen.getAllByText('Candidature en ligne').length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toContain('public_application');
  });
});

describe('Candidate structured record maintenance', () => {
  const editNames = [
    'Edit Sourcing',
    'Edit French',
    'Edit Senior Recruiter · Example Talent',
    'Edit Junior Recruiter · Example Staffing',
    'Edit MSc Work Psychology · Example University',
  ];

  it('offers Edit and Archive on each active record only with candidate_profile:manage', () => {
    renderWorkspace([P.view, P.profileView]);
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Archive (?!candidate)/ })).toBeNull();
    cleanup();

    renderWorkspace([P.view, P.profileView, P.profileManage]);
    for (const name of editNames) {
      expect(screen.getByRole('button', { name })).toBeVisible();
      expect(screen.getByRole('button', { name: name.replace('Edit', 'Archive') })).toBeVisible();
    }
    // The visible text stays short; the accessible name says which record it acts on.
    expect(screen.getByRole('button', { name: 'Edit Sourcing' })).toHaveTextContent(/^Edit$/);
  });

  it('offers nothing on an archived record, and nothing on an archived candidate', () => {
    const candidate = syntheticCandidate();
    candidate.skills = candidate.skills.map((skill) => ({
      ...skill,
      archivedAt: '2026-07-22T00:00:00.000Z',
    }));
    renderWorkspace(ORDINARY_PERMISSIONS, {}, { candidate });
    const skills = screen.getByRole('region', { name: /^Skills/ });
    expect(within(skills).getByText('Archived')).toBeVisible();
    expect(within(skills).queryByRole('button', { name: /Sourcing/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit French' })).toBeVisible();
    cleanup();

    renderWorkspace(
      ORDINARY_PERMISSIONS,
      {},
      {
        candidate: syntheticCandidate({
          archivedAt: '2026-07-22T00:00:00.000Z',
          status: 'ARCHIVED',
        }),
      },
    );
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive French' })).toBeNull();
  });

  it('pre-fills each edit form and submits the edited values for that record only', async () => {
    const props = renderWorkspace(ORDINARY_PERMISSIONS);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sourcing' }));
    const skill = screen.getByRole('form', { name: 'Edit Sourcing' });
    expect(within(skill).getByLabelText(/^Skill/)).toHaveValue('Sourcing');
    expect(within(skill).getByLabelText('Level')).toHaveValue('Advanced');
    fireEvent.change(within(skill).getByLabelText('Level'), { target: { value: 'Expert' } });
    fireEvent.click(within(skill).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(props.onUpdateRecord).toHaveBeenCalledWith({
        kind: 'skill',
        recordId: 'a0000000-0000-4000-8000-000000000001',
        values: { level: 'Expert', name: 'Sourcing' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Senior Recruiter · Example Talent' }));
    const experience = screen.getByRole('form', { name: 'Edit Senior Recruiter · Example Talent' });
    expect(within(experience).getByLabelText('Employer *')).toHaveValue('Example Talent');
    expect(within(experience).getByLabelText('Start date')).toHaveValue('2020-01');
    expect(within(experience).getByLabelText('End date')).toHaveValue('');
    expect(within(experience).getByLabelText('Current role')).toBeChecked();
    fireEvent.click(within(experience).getByRole('button', { name: 'Cancel' }));
    expect(props.onUpdateRecord).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit Senior Recruiter · Example Talent' }),
      ).toHaveFocus(),
    );
  });

  it('asks the container to archive the record, naming it rather than its ID', () => {
    const props = renderWorkspace(ORDINARY_PERMISSIONS);
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive MSc Work Psychology · Example University' }),
    );
    expect(props.onArchiveRecord).toHaveBeenCalledWith({
      kind: 'education',
      recordId: 'e0000000-0000-4000-8000-000000000001',
    });
    expect(document.body.textContent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('disables record actions while any write is in flight and shows progress on its row only', () => {
    renderWorkspace(ORDINARY_PERMISSIONS, {
      pending: 'record:c0000000-0000-4000-8000-000000000001',
    });
    const languages = screen.getByRole('region', { name: /^Languages/ });
    expect(within(languages).getByRole('button', { name: 'Archive French' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Archive Sourcing' })).not.toHaveAttribute(
      'aria-busy',
    );
    for (const name of [...editNames, 'Archive Sourcing', 'Add skill']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('names record actions and their feedback in French', () => {
    renderWorkspace(
      ORDINARY_PERMISSIONS,
      { feedback: { kind: 'recordUpdated', record: 'skill', tone: 'success' } },
      { locale: 'fr' },
    );
    expect(screen.getByRole('button', { name: 'Modifier Sourcing' })).toHaveTextContent(
      /^Modifier$/,
    );
    expect(screen.getByRole('button', { name: 'Archiver Sourcing' })).toHaveTextContent(
      /^Archiver$/,
    );
    expect(screen.getByText('Compétence mise à jour.')).toBeVisible();
    cleanup();

    renderWorkspace(
      ORDINARY_PERMISSIONS,
      { feedback: { failure: 'recordUnavailable', kind: 'failed', tone: 'danger' } },
      { locale: 'fr' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Cet élément a changé ou n’est plus disponible. Le profil a été actualisé.',
    );
  });
});
