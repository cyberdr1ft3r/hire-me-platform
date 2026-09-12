import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { LOCALE_STORAGE_KEY } from '../i18n/index.js';
import {
  API,
  callsTo,
  deferred,
  installBlobArrayBuffer,
  jsonResponse,
  mockPublicApi,
  requestBody,
  requestUrl,
  resolveInAct,
  syntheticFile,
  syntheticOpportunity,
} from './public-opportunity-test-data.js';

const LIST_URL = `${API}/v1/public/opportunities`;
const DETAIL_URL = `${LIST_URL}/synthetic-role`;
const SUBMIT_URL = `${DETAIL_URL}/applications`;

const RECEIVED = { message: 'SERVER-WORDING-NEVER-RENDERED', status: 'RECEIVED' };

/** Values a leaked internal field would carry. None may ever reach the page. */
const INTERNAL_SENTINELS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'INTERNAL-NOTE-SENTINEL',
  'recruiter-sentinel@example.test',
  'PIPELINE-SENTINEL',
  'synthetic-consent-v9',
];

function withInternalFields(opportunity = syntheticOpportunity()) {
  return {
    ...opportunity,
    applicationLinkEnabled: true,
    consentTextVersion: 'synthetic-consent-v9',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    internalNotes: 'INTERNAL-NOTE-SENTINEL',
    listedOnWebsite: true,
    missionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    pipelineState: 'PIPELINE-SENTINEL',
    recruiter: { email: 'recruiter-sentinel@example.test' },
    showClientName: false,
    showSalary: false,
    status: 'OPEN',
  };
}

function openList(locale: 'en' | 'fr' = 'en') {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.history.pushState({}, '', '/opportunities');
  render(<App />);
}

function openDetail(locale: 'en' | 'fr' = 'en', slug = 'synthetic-role') {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.history.pushState({}, '', `/opportunities/${slug}`);
  return render(<App />);
}

function applicationForm(name = 'Apply for this role') {
  return screen.getByRole('form', { name });
}

function fillRequired({ cv = true }: { cv?: boolean } = {}) {
  fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Ada Example' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.test' } });
  if (cv) {
    fireEvent.change(screen.getByLabelText(/^CV/), {
      target: {
        files: [syntheticFile('%PDF-1.4 synthetic', 'synthetic-cv.pdf', 'application/pdf')],
      },
    });
  }
  fireEvent.click(screen.getByRole('checkbox', { name: /I consent to HireMe/ }));
}

function postedBodies(fetchMock: ReturnType<typeof mockPublicApi>): unknown[] {
  return callsTo(fetchMock, SUBMIT_URL).map(([, init]) => requestBody(init));
}

beforeAll(installBlobArrayBuffer);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('public opportunity list', () => {
  it('requests the public list once and shows only published fields', async () => {
    const fetchMock = mockPublicApi({
      list: () =>
        Promise.resolve(
          jsonResponse({
            opportunities: [
              withInternalFields(),
              withInternalFields(
                syntheticOpportunity({
                  publicEngagementType: null,
                  publicLocation: null,
                  publicSlug: 'second-role',
                  publicSummary: null,
                  publicTitle: 'Second synthetic role',
                  publicWorkArrangement: null,
                }),
              ),
            ],
          }),
        ),
    });
    openList();

    const link = await screen.findByRole('link', { name: 'Synthetic public role' });
    expect(link).toHaveAttribute('href', '/opportunities/synthetic-role');
    expect(screen.getByRole('link', { name: 'Second synthetic role' })).toHaveAttribute(
      'href',
      '/opportunities/second-role',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Open roles' })).toBeVisible();
    expect(screen.getByText('2 open roles')).toBeVisible();

    const firstRow = link.closest('article') as HTMLElement;
    expect(within(firstRow).getByText('Example City')).toBeVisible();
    expect(within(firstRow).getByText('Synthetic arrangement')).toBeVisible();
    expect(within(firstRow).getByText('Synthetic contract')).toBeVisible();
    expect(within(firstRow).getByText('Short synthetic summary.')).toBeVisible();
    // The list never shows salary, client, deadline, or description.
    expect(within(firstRow).queryByText(/Synthetic public description/)).toBeNull();

    // API order is preserved; nothing is sorted, filtered, or paged.
    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(['Synthetic public role', 'Second synthetic role']);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /sort|filter/i })).toBeNull();

    expect(callsTo(fetchMock, LIST_URL)).toHaveLength(1);
    for (const sentinel of INTERNAL_SENTINELS) {
      expect(document.body.innerHTML).not.toContain(sentinel);
    }
  });

  it('shows loading without any placeholder opportunity, then the empty state', async () => {
    const list = deferred<Response>();
    mockPublicApi({ list: () => list.promise });
    openList();

    expect(await screen.findByRole('status')).toHaveTextContent('Loading open roles…');
    expect(screen.queryByRole('link', { name: /synthetic/i })).toBeNull();
    expect(screen.queryByText('No open roles at the moment')).toBeNull();

    await resolveInAct(list, jsonResponse({ opportunities: [] }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'No open roles at the moment' }),
    ).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/open role$/)).toBeNull();
  });

  it('shows a safe failure with a retry that reloads the list', async () => {
    let attempts = 0;
    const fetchMock = mockPublicApi({
      list: () => {
        attempts += 1;
        return Promise.resolve(
          attempts === 1
            ? jsonResponse({ error: { code: 'X', message: 'RAW-BACKEND-DETAIL' } }, 500)
            : jsonResponse({ opportunities: [syntheticOpportunity()] }),
        );
      },
    });
    openList();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t load the open roles. Check your connection and try again.',
    );
    expect(document.body.innerHTML).not.toContain('RAW-BACKEND-DETAIL');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Synthetic public role' })).toBeVisible();
    expect(callsTo(fetchMock, LIST_URL)).toHaveLength(2);
  });

  it('renders French copy and switches language without refetching', async () => {
    const fetchMock = mockPublicApi({
      list: () => Promise.resolve(jsonResponse({ opportunities: [syntheticOpportunity()] })),
    });
    openList('fr');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Postes à pourvoir' }),
    ).toBeVisible();
    expect(screen.getByText('1 poste à pourvoir')).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');

    fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Open roles' })).toBeVisible();
    expect(screen.getByText('1 open role')).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(callsTo(fetchMock, LIST_URL)).toHaveLength(1);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('uses a public frame, not the internal shell', async () => {
    mockPublicApi({ list: () => Promise.resolve(jsonResponse({ opportunities: [] })) });
    openList();

    await screen.findByRole('heading', { level: 1, name: 'Open roles' });
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('contentinfo')).toBeVisible();
    expect(screen.getByRole('link', { name: 'HireMe Opportunities' })).toHaveAttribute(
      'href',
      '/opportunities',
    );
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#public-main',
    );
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('public opportunity detail', () => {
  it('requests the slug from the URL and shows the published detail', async () => {
    const fetchMock = mockPublicApi({
      detail: () =>
        Promise.resolve(
          jsonResponse({
            opportunity: withInternalFields(
              syntheticOpportunity({
                applicationDeadline: '2026-10-30T17:00:00.000Z',
                salary: {
                  salaryCurrency: 'EUR',
                  salaryMaxCents: 5_800_000,
                  salaryMinCents: 4_600_000,
                },
              }),
            ),
          }),
        ),
    });
    openDetail();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' }),
    ).toBeVisible();
    expect(callsTo(fetchMock, DETAIL_URL)).toHaveLength(1);
    expect(screen.getByText('Short synthetic summary.')).toBeVisible();

    const facts = screen.getByRole('complementary', { name: 'Key details' });
    const fact = (label: string) =>
      within(facts).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    // A hidden client name reads as confidential, as it always has.
    expect(fact('Company')).toBe('Confidential');
    expect(fact('Location')).toBe('Example City');
    expect(fact('Work arrangement')).toBe('Synthetic arrangement');
    expect(fact('Contract type')).toBe('Synthetic contract');
    expect(fact('Experience level')).toBe('Synthetic level');
    expect(fact('Salary')).toBe('€46,000 – €58,000');
    expect(fact('Apply by')).toBe('30 October 2026 at 17:00 UTC');
    expect(within(facts).getByRole('link', { name: 'Apply now' })).toHaveAttribute(
      'href',
      '#apply',
    );

    expect(screen.getByRole('heading', { level: 2, name: 'About the role' })).toBeVisible();
    expect(screen.getByText(/Second synthetic paragraph\./)).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Skills' })).toBeVisible();
    expect(document.getElementById('apply')).toHaveAccessibleName('Apply for this role');
    expect(screen.getByRole('link', { name: 'All open roles' })).toHaveAttribute(
      'href',
      '/opportunities',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    for (const sentinel of INTERNAL_SENTINELS) {
      expect(document.body.innerHTML).not.toContain(sentinel);
    }
    expect(document.querySelector('[data-opportunity], [data-mission-id], script')).toBeNull();
  });

  it('shows the client name and omits salary and deadline only when the API does', async () => {
    mockPublicApi({
      detail: () =>
        Promise.resolve(
          jsonResponse({
            opportunity: syntheticOpportunity({
              clientName: 'Example Client Company',
              publicExperienceLevel: null,
              publicSkills: null,
            }),
          }),
        ),
    });
    openDetail();

    const facts = await screen.findByRole('complementary', { name: 'Key details' });
    expect(within(facts).getByText('Example Client Company')).toBeVisible();
    expect(within(facts).queryByText('Salary')).toBeNull();
    expect(within(facts).queryByText('Apply by')).toBeNull();
    expect(within(facts).queryByText('Experience level')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Skills' })).toBeNull();
  });

  it('shows one identical not-found page for every 404, echoing nothing', async () => {
    const bodies = [
      { error: { code: 'PUBLIC_OPPORTUNITY_NOT_AVAILABLE', message: 'RAW-404-ONE' } },
      { error: { code: 'SOMETHING_ELSE', message: 'RAW-404-TWO' } },
    ];
    const pages: string[] = [];
    for (const [index, body] of bodies.entries()) {
      const fetchMock = mockPublicApi({
        detail: () => Promise.resolve(jsonResponse(body, 404)),
      });
      const slug = `hidden-slug-${index}`;
      const { unmount } = openDetail('en', slug);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'This opportunity is not available' }),
      ).toBeVisible();
      expect(callsTo(fetchMock, `${LIST_URL}/${slug}`)).toHaveLength(1);
      const main = screen.getByRole('main');
      expect(main).not.toHaveTextContent(slug);
      expect(main).not.toHaveTextContent(/RAW-404/);
      expect(screen.queryByRole('form')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Browse other open roles' })).toHaveAttribute(
        'href',
        '/opportunities',
      );
      pages.push(main.innerHTML);
      unmount();
      vi.restoreAllMocks();
    }
    expect(pages[0]).toBe(pages[1]);
  });

  it('distinguishes a failed request from not-found and retries it', async () => {
    let attempts = 0;
    const fetchMock = mockPublicApi({
      detail: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new TypeError('network down'))
          : Promise.resolve(jsonResponse({ opportunity: syntheticOpportunity() }));
      },
    });
    openDetail();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Opportunity unavailable right now' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t load this opportunity. Check your connection and try again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' }),
    ).toBeVisible();
    expect(callsTo(fetchMock, DETAIL_URL)).toHaveLength(2);
  });

  it('shows detail loading without a placeholder opportunity', async () => {
    const detail = deferred<Response>();
    mockPublicApi({ detail: () => detail.promise });
    openDetail();

    expect(await screen.findByRole('status')).toHaveTextContent('Loading opportunity…');
    expect(screen.getByRole('heading', { level: 1, name: 'Opportunity' })).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    await resolveInAct(detail, jsonResponse({ opportunity: syntheticOpportunity() }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' }),
    ).toBeVisible();
  });

  it('renders the detail and form in French', async () => {
    mockPublicApi({
      detail: () =>
        Promise.resolve(
          jsonResponse({
            opportunity: syntheticOpportunity({
              applicationDeadline: '2026-10-30T17:00:00.000Z',
              salary: { salaryCurrency: 'EUR', salaryMaxCents: null, salaryMinCents: 4_600_000 },
            }),
          }),
        ),
    });
    openDetail('fr');

    const facts = await screen.findByRole('complementary', { name: 'Informations clés' });
    expect(within(facts).getByText('Confidentielle')).toBeVisible();
    expect(within(facts).getByText('Mode de travail')).toBeVisible();
    expect(within(facts).getByText('À partir de 46 000 €')).toBeVisible();
    expect(within(facts).getByText('30 octobre 2026 à 17:00 UTC')).toBeVisible();
    expect(within(facts).getByRole('link', { name: 'Postuler' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'À propos du poste' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tous les postes à pourvoir' })).toBeVisible();

    const form = applicationForm('Postuler à cette offre');
    expect(within(form).getByLabelText(/^Nom complet/)).toBeRequired();
    expect(within(form).getByLabelText(/^Adresse e-mail/)).toBeRequired();
    expect(within(form).getByLabelText('Années d’expérience')).toBeVisible();
    expect(within(form).getByText('Choisir un fichier', { selector: 'label' })).toBeVisible();
    expect(within(form).getByText('Aucun fichier sélectionné')).toBeVisible();
    expect(within(form).getByText(/Formats acceptés\s: PDF ou texte brut\./)).toBeVisible();
    // French typography: a no-break space precedes the colon.
    expect(form.textContent).toContain('Formats acceptés :');
    expect(
      within(form).getByRole('checkbox', {
        name: /J’accepte que HireMe traite cette candidature\./,
      }),
    ).toBeRequired();
    expect(within(form).getByRole('button', { name: 'Envoyer ma candidature' })).toBeVisible();
    expect(document.querySelector('[lang="en"], .legacy-english-content')).toBeNull();
  });
});

describe('public application', () => {
  function mockDetailAndSubmit(submit: (init: RequestInit | undefined) => Promise<Response>) {
    return mockPublicApi({
      detail: () => Promise.resolve(jsonResponse({ opportunity: syntheticOpportunity() })),
      submit: (_slug, init) => submit(init),
    });
  }

  it('offers exactly the existing fields, with visible labels', async () => {
    mockDetailAndSubmit(() => Promise.resolve(jsonResponse(RECEIVED)));
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });
    const form = applicationForm();

    const names = Array.from(form.querySelectorAll('input, textarea, select'))
      .map((control) => control.getAttribute('name'))
      .filter(Boolean);
    expect(names).toEqual([
      'fullName',
      'email',
      'phone',
      'city',
      'country',
      'currentPosition',
      'experienceYears',
      'availability',
      'skills',
      'languages',
      'salaryExpectationCents',
      'salaryExpectationCurrency',
      'professionalLinks',
      'motivation',
      'cv',
      'consentGranted',
      'website',
    ]);
    for (const control of form.querySelectorAll<HTMLElement>(
      'input:not([name="website"]), textarea',
    )) {
      expect(control).toHaveAccessibleName();
      expect(control.getAttribute('placeholder')).toBeNull();
    }
    // The anti-spam trap is hidden from people, assistive technology, and autofill.
    const trap = form.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText(/^CV/)).toHaveAttribute('accept', 'application/pdf,text/plain');
  });

  it('shows enabled document categories and marks required ones', async () => {
    mockPublicApi({
      detail: () =>
        Promise.resolve(
          jsonResponse({
            opportunity: syntheticOpportunity({
              uploadRequirements: {
                ...syntheticOpportunity().uploadRequirements,
                additionalAttachmentsEnabled: true,
                certificationsEnabled: true,
                certificationsRequired: true,
                cvRequired: false,
                diplomasEnabled: true,
              },
            }),
          }),
        ),
    });
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });

    expect(screen.getByLabelText(/^CV/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Certification/)).toBeRequired();
    expect(screen.getByLabelText(/^Diploma/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Additional document/)).not.toBeRequired();
    // The visible required marker is decorative; the accessible name stays the category.
    expect(screen.getByLabelText(/^Certification/)).toHaveAccessibleName('Certification');
  });

  it('validates locally, focuses the first invalid field, and sends nothing', async () => {
    const fetchMock = mockDetailAndSubmit(() => Promise.resolve(jsonResponse(RECEIVED)));
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });

    fireEvent.submit(applicationForm());

    const fullName = screen.getByLabelText(/^Full name/);
    expect(fullName).toHaveFocus();
    expect(fullName).toHaveAttribute('aria-invalid', 'true');
    expect(fullName).toHaveAccessibleDescription('This field is required.');
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription('This field is required.');
    expect(screen.getByLabelText(/^CV/)).toHaveAccessibleDescription(
      'No file selected Add this document to apply.',
    );
    expect(screen.getByRole('checkbox', { name: /I consent/ })).toHaveAccessibleDescription(
      'Your consent is needed to submit this application.',
    );
    expect(screen.getByText('Check your application')).toBeVisible();

    fireEvent.change(fullName, { target: { value: 'Ada Example' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Years of experience'), { target: { value: '81' } });
    fireEvent.submit(applicationForm());
    expect(screen.getByLabelText(/^Email/)).toHaveFocus();
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(screen.getByLabelText('Years of experience')).toHaveAccessibleDescription(
      'Enter a whole number from 0 to 80.',
    );

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Years of experience'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/^CV/), {
      target: { files: [syntheticFile('GIF89a', 'photo.gif', 'image/gif')] },
    });
    fireEvent.submit(applicationForm());
    expect(screen.getByLabelText(/^CV/)).toHaveFocus();
    expect(screen.getByLabelText(/^CV/)).toHaveAccessibleDescription(
      'photo.gif This file type is not accepted.',
    );

    expect(callsTo(fetchMock, SUBMIT_URL)).toHaveLength(0);
  });

  it('sends the exact request body and shows success only after the server confirms', async () => {
    const response = deferred<Response>();
    const fetchMock = mockDetailAndSubmit(() => response.promise);
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });

    fillRequired();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: ' +000 000 ' } });
    fireEvent.change(screen.getByLabelText('Years of experience'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByLabelText('Motivation'), { target: { value: ' Synthetic. ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(callsTo(fetchMock, SUBMIT_URL)).toHaveLength(1));
    const [, init] = callsTo(fetchMock, SUBMIT_URL)[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(requestBody(init)).toEqual({
      consentGranted: true,
      email: 'ada@example.test',
      experienceYears: 7,
      files: [
        {
          base64Content: btoa('%PDF-1.4 synthetic'),
          category: 'CV',
          contentType: 'application/pdf',
          filename: 'synthetic-cv.pdf',
        },
      ],
      fullName: 'Ada Example',
      motivation: 'Synthetic.',
      phone: '+000 000',
      salaryExpectationCents: 15000,
      salaryExpectationCurrency: 'EUR',
    });

    // Nothing claims success while the server has not answered.
    expect(screen.queryByText('Application received')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();

    await resolveInAct(response, jsonResponse(RECEIVED));

    const heading = await screen.findByRole('heading', { level: 3, name: 'Application received' });
    expect(heading).toHaveFocus();
    expect(heading.closest('[role="status"]')).toHaveTextContent(
      'Thank you. Your application has been received and will be reviewed if this opportunity is still available.',
    );
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Apply now' })).toBeNull();
    expect(document.body.innerHTML).not.toContain(RECEIVED.message);
  });

  it.each([
    [
      400,
      'Some information could not be accepted. Check your details and documents, then try again.',
    ],
    [404, 'This opportunity is no longer accepting applications.'],
    [429, 'Too many attempts in a short time. Wait a minute, then try again.'],
    [500, 'Your application could not be sent. Check your connection and try again.'],
  ])('shows safe localized feedback for HTTP %i and keeps the form', async (status, copy) => {
    mockDetailAndSubmit(() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'ANY_CODE', message: 'RAW-BACKEND-DETAIL' } }, status),
      ),
    );
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });

    fillRequired();
    fireEvent.submit(applicationForm());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Application not sent');
    expect(alert).toHaveTextContent(copy);
    expect(document.body.innerHTML).not.toContain('RAW-BACKEND-DETAIL');
    expect(screen.getByLabelText(/^Full name/)).toHaveValue('Ada Example');
    expect(screen.getByText('synthetic-cv.pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeEnabled();
    expect(screen.queryByText('Application received')).toBeNull();
  });

  it('treats a network failure as a safe generic failure', async () => {
    mockDetailAndSubmit(() => Promise.reject(new TypeError('RAW-NETWORK-DETAIL')));
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });
    fillRequired();
    fireEvent.submit(applicationForm());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your application could not be sent. Check your connection and try again.',
    );
    expect(document.body.innerHTML).not.toContain('RAW-NETWORK-DETAIL');
  });

  it('sends one request for a double click, Enter plus click, and repeated Enter', async () => {
    const response = deferred<Response>();
    const fetchMock = mockDetailAndSubmit(() => response.promise);
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });
    fillRequired();

    const form = applicationForm();
    const button = screen.getByRole('button', { name: 'Submit application' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(callsTo(fetchMock, SUBMIT_URL)).toHaveLength(1));
    fireEvent.submit(form);

    const busy = screen.getByRole('button', { name: 'Submitting…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(form).toHaveAttribute('aria-busy', 'true');

    await resolveInAct(response, jsonResponse(RECEIVED));
    expect(await screen.findByText('Application received')).toBeVisible();
    expect(callsTo(fetchMock, SUBMIT_URL)).toHaveLength(1);
    expect(postedBodies(fetchMock)).toHaveLength(1);
  });

  it('switches language mid-application without refetching or clearing the form', async () => {
    const fetchMock = mockDetailAndSubmit(() => Promise.resolve(jsonResponse(RECEIVED)));
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });

    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Ada Example' } });
    fireEvent.change(screen.getByLabelText('Motivation'), { target: { value: 'Synthetic.' } });
    fireEvent.change(screen.getByLabelText(/^CV/), {
      target: { files: [syntheticFile('%PDF-1.4', 'synthetic-cv.pdf', 'application/pdf')] },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
    // A validation error is also carried across, re-worded in the new language.
    fireEvent.submit(applicationForm());
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription('This field is required.');

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    expect(await screen.findByRole('form', { name: 'Postuler à cette offre' })).toBeVisible();
    expect(screen.getByLabelText(/^Nom complet/)).toHaveValue('Ada Example');
    expect(screen.getByLabelText('Motivation')).toHaveValue('Synthetic.');
    expect(screen.getByText('synthetic-cv.pdf')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /J’accepte/ })).toBeChecked();
    expect(screen.getByLabelText(/^Adresse e-mail/)).toHaveAccessibleDescription(
      'Ce champ est obligatoire.',
    );
    expect(document.documentElement.lang).toBe('fr');
    expect(callsTo(fetchMock, DETAIL_URL)).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/^Adresse e-mail/), {
      target: { value: 'ada@example.test' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Postuler à cette offre' }));
    expect(await screen.findByText('Candidature reçue')).toBeVisible();
    // The API receives the same language-neutral values in either locale.
    expect(postedBodies(fetchMock)).toEqual([
      expect.objectContaining({
        email: 'ada@example.test',
        files: [expect.objectContaining({ category: 'CV' })],
        fullName: 'Ada Example',
        motivation: 'Synthetic.',
      }),
    ]);
    expect(callsTo(fetchMock, DETAIL_URL)).toHaveLength(1);
  });

  it('applies the published size limit before sending anything', async () => {
    const fetchMock = mockPublicApi({
      detail: () =>
        Promise.resolve(
          jsonResponse({
            opportunity: syntheticOpportunity({
              uploadRequirements: {
                ...syntheticOpportunity().uploadRequirements,
                maxFileSizeBytes: 1_000_000,
              },
            }),
          }),
        ),
      submit: () => Promise.resolve(jsonResponse(RECEIVED)),
    });
    openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Synthetic public role' });
    fillRequired({ cv: false });
    fireEvent.change(screen.getByLabelText(/^CV/), {
      target: { files: [syntheticFile('x'.repeat(1_000_001), 'large.pdf', 'application/pdf')] },
    });
    fireEvent.submit(applicationForm());

    expect(screen.getByLabelText(/^CV/)).toHaveAccessibleDescription(
      'large.pdf This file is larger than 1 MB.',
    );
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input) === SUBMIT_URL)).toBe(false);
  });
});
