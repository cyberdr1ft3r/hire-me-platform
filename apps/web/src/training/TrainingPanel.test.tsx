import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n, type Locale } from '../i18n/index.js';
import { TrainingPanel } from './TrainingPanel.js';
import {
  ACTOR_ID,
  CLIENT_ID,
  CONTACT_ID,
  deferred,
  DOCUMENT_ID,
  ENROLLMENT_A_ID,
  errorResponse,
  FIXTURE_IDS,
  FULL_ACCESS,
  jsonResponse,
  LEARNER_ID,
  mockTrainingApi,
  OWNER_ID,
  page,
  PARTICIPATION_A_ID,
  PROGRAM_A_ID,
  PROGRAM_B_ID,
  READ_ONLY,
  restrictedEnrollment,
  SESSION_A_ID,
  syntheticEnrollment,
  syntheticParticipation,
  syntheticProgram,
  syntheticSession,
  TRAINER_ID,
  VERSION_ID,
  type RecordedCall,
} from './training-test-data.js';

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
  actorUserId = ACTOR_ID,
  locale = 'en',
  permissions = FULL_ACCESS,
}: {
  accessToken?: string;
  actorUserId?: string;
  locale?: Locale;
  permissions?: string[];
}) {
  return (
    <I18nProvider initialLocale={locale}>
      <LocaleToggle />
      <TrainingPanel
        accessToken={accessToken}
        actorUserId={actorUserId}
        permissions={permissions}
      />
    </I18nProvider>
  );
}

const programA = syntheticProgram();
const programB = syntheticProgram({
  id: PROGRAM_B_ID,
  reference: 'TRN-B',
  name: 'Synthetic Leadership',
  ownerDisplayName: 'Synthetic Second Owner',
});
const sessionA = syntheticSession();
const enrollmentA = syntheticEnrollment();
const participationA = syntheticParticipation();

const TIMESTAMP = '2026-09-15T10:00:00.000Z';

const syntheticClient = {
  id: CLIENT_ID,
  name: 'Synthetic Client',
  normalizedName: 'synthetic client',
  status: 'ACTIVE',
  industry: null,
  website: null,
  mainPhone: null,
  country: null,
  city: 'Synthetic City',
  commercial: null,
  archivedAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const syntheticContact = {
  id: CONTACT_ID,
  clientId: CLIENT_ID,
  displayName: 'Synthetic Contact',
  email: 'contact@example.test',
  normalizedEmail: 'contact@example.test',
  phone: null,
  roleTitle: null,
  status: 'ACTIVE',
  portalStatus: 'DISABLED',
  archivedAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const programsPath = '/v1/training/programs';
const sessionsPath = (programId: string) => `/v1/training/programs/${programId}/sessions`;
const enrollmentsPath = (programId: string) => `/v1/training/programs/${programId}/enrollments`;
const participationsPath = `/v1/training/programs/${PROGRAM_A_ID}/sessions/${SESSION_A_ID}/participations`;

/** Default routing: two programs, one session, one enrollment, one attendance record. */
function standardApi(
  overrides: (call: RecordedCall) => Promise<Response> | Response | undefined = () => undefined,
): RecordedCall[] {
  return mockTrainingApi((call) => {
    const override = overrides(call);
    if (override) return override;
    if (call.method !== 'GET') return undefined;
    switch (call.path) {
      case programsPath:
        return jsonResponse(page('programs', [programA, programB]));
      case sessionsPath(PROGRAM_A_ID):
        return jsonResponse(page('sessions', [sessionA], { pageSize: 10 }));
      case sessionsPath(PROGRAM_B_ID):
        return jsonResponse(page('sessions', [], { pageSize: 10 }));
      case enrollmentsPath(PROGRAM_A_ID):
        return jsonResponse(page('enrollments', [enrollmentA], { pageSize: 10 }));
      case enrollmentsPath(PROGRAM_B_ID):
        return jsonResponse(page('enrollments', [], { pageSize: 10 }));
      case participationsPath:
        return jsonResponse(page('participations', [participationA]));
      case '/v1/training/program-owner-user-options':
        return jsonResponse({
          users: [{ id: OWNER_ID, displayName: 'Synthetic Owner', email: 'owner@example.test' }],
        });
      case `/v1/training/programs/${PROGRAM_A_ID}/session-trainer-user-options`:
        return jsonResponse({
          users: [
            { id: TRAINER_ID, displayName: 'Synthetic Trainer', email: 'trainer@example.test' },
          ],
        });
      case `/v1/training/programs/${PROGRAM_A_ID}/enrollment-user-options`:
        return jsonResponse({
          users: [
            { id: LEARNER_ID, displayName: 'Synthetic Learner', email: 'learner@example.test' },
          ],
        });
      case `/v1/training/programs/${PROGRAM_A_ID}/sessions/${SESSION_A_ID}/enrollment-options`:
        return jsonResponse({
          enrollments: [
            {
              id: ENROLLMENT_A_ID,
              participantType: 'CANDIDATE',
              participant: { displayName: 'Synthetic Candidate', email: 'candidate@example.test' },
            },
          ],
        });
      case '/v1/clients':
        return jsonResponse(page('clients', [syntheticClient]));
      case `/v1/clients/${CLIENT_ID}/contacts`:
        return jsonResponse(page('contacts', [syntheticContact]));
      case '/v1/candidates':
        return jsonResponse(page('candidates', []));
      default:
        return undefined;
    }
  });
}

function callsTo(calls: RecordedCall[], path: string, method = 'GET'): RecordedCall[] {
  return calls.filter((call) => call.method === method && call.path === path);
}

async function openProgram(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name }));
  await screen.findByRole('heading', { level: 2, name });
}

async function openSession(title = 'Synthetic Induction'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: title }));
  await screen.findByRole('heading', { level: 3, name: title });
}

function programFilters(name = 'Filter training programs'): HTMLElement {
  return screen.getByRole('search', { name });
}

function expectNoRawIds(): void {
  const text = document.body.textContent ?? '';
  for (const id of FIXTURE_IDS) {
    expect(text).not.toContain(id);
  }
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  for (const input of document.querySelectorAll('input, textarea')) {
    expect((input as HTMLInputElement).value).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TrainingPanel: presentation and localization', () => {
  it('renders one English page heading, human names, and no identifier', async () => {
    standardApi();
    render(<Panel />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeVisible();
    const table = await screen.findByRole('table', { name: 'Training programs' });
    expect(within(table).getByText('Synthetic Owner')).toBeVisible();
    expect(within(table).getByText('Synthetic Second Owner')).toBeVisible();
    expect(screen.getByText('2 programs')).toBeVisible();

    await openProgram('Synthetic Onboarding');
    await openSession();
    expect(await screen.findByRole('table', { name: 'Session attendance' })).toBeVisible();
    expect(screen.getAllByText('Synthetic Trainer').length).toBeGreaterThan(0);
    expectNoRawIds();
  });

  it('renders the whole workspace in French', async () => {
    standardApi();
    render(<Panel locale="fr" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Formation' })).toBeVisible();
    expect(await screen.findByText('2 programmes')).toBeVisible();
    await openProgram('Synthetic Onboarding');
    expect(screen.getByRole('button', { name: 'Clôturer le programme' })).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: 'Séances' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Inscriptions' })).toBeVisible();
    expect(screen.getAllByText('Programmée').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Candidat').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sessions')).toBeNull();
    expectNoRawIds();
  });

  it('keeps selection, filters, child context, and typed forms across a locale switch without refetching', async () => {
    const calls = standardApi();
    render(<Panel />);

    await openProgram('Synthetic Onboarding');
    await openSession();
    await screen.findByRole('table', { name: 'Session attendance' });
    fireEvent.change(within(programFilters()).getByLabelText('Search'), {
      target: { value: 'onboarding' },
    });
    const create = screen
      .getByText('New training program')
      .closest('details') as HTMLDetailsElement;
    fireEvent.click(screen.getByText('New training program'));
    fireEvent.change(within(create).getByLabelText(/^Name/), {
      target: { value: 'Typed program name' },
    });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Formation' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Synthetic Onboarding' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Synthetic Induction' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Présences à la séance' })).toBeVisible();
    expect(
      within(programFilters('Filtrer les programmes de formation')).getByLabelText('Recherche'),
    ).toHaveValue('onboarding');
    expect(
      within(
        screen.getByText('Nouveau programme de formation').closest('details') as HTMLElement,
      ).getByLabelText(/^Nom/),
    ).toHaveValue('Typed program name');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls.length).toBe(before);
  });
});

describe('TrainingPanel: lists, filters, and option sources', () => {
  it('pages and filters programs on the server, using the signed-in account for "owned by me"', async () => {
    const calls = standardApi((call) =>
      call.method === 'GET' && call.path === programsPath && call.search.get('page') === '2'
        ? jsonResponse(page('programs', [programB], { page: 2, total: 21 }))
        : call.method === 'GET' && call.path === programsPath
          ? jsonResponse(page('programs', [programA], { total: 21 }))
          : undefined,
    );
    render(<Panel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('button', { name: 'Synthetic Leadership' })).toBeVisible();
    expect(callsTo(calls, programsPath).at(-1)?.search.get('pageSize')).toBe('20');

    const filters = programFilters();
    fireEvent.change(within(filters).getByLabelText('Search'), { target: { value: ' lead ' } });
    fireEvent.change(within(filters).getByLabelText('Status'), {
      target: { value: 'PROGRAM_ACTIVE' },
    });
    fireEvent.change(within(filters).getByLabelText('Owner'), { target: { value: 'me' } });
    await within(filters).findByRole('option', { name: 'Synthetic Client · Synthetic City' });
    fireEvent.change(within(filters).getByLabelText('Client'), { target: { value: CLIENT_ID } });
    fireEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(callsTo(calls, programsPath).at(-1)?.search.get('page')).toBe('1'));
    const query = callsTo(calls, programsPath).at(-1)!.search;
    expect(query.get('search')).toBe('lead');
    expect(query.get('status')).toBe('PROGRAM_ACTIVE');
    expect(query.get('ownerUserId')).toBe(ACTOR_ID);
    expect(query.get('clientId')).toBe(CLIENT_ID);
  });

  it('loads people only from the D-073 Training sources and never from another directory', async () => {
    const calls = standardApi();
    render(<Panel />);

    const filters = programFilters();
    fireEvent.change(within(filters).getByLabelText('Owner'), { target: { value: 'selected' } });
    await within(filters).findByRole('option', { name: 'Synthetic Owner · owner@example.test' });

    await openProgram('Synthetic Onboarding');
    fireEvent.click(await screen.findByText('Schedule a session'));
    await screen.findAllByRole('option', { name: 'Synthetic Trainer · trainer@example.test' });

    fireEvent.click(screen.getByText('Enroll a participant'));
    const enroll = screen.getByRole('form', { name: 'Enroll a participant' });
    fireEvent.change(within(enroll).getByLabelText('Participant type'), {
      target: { value: 'USER' },
    });
    await within(enroll).findByRole('option', { name: 'Synthetic Learner · learner@example.test' });

    await openSession();
    const add = await screen.findByRole('form', { name: 'Add a participant to this session' });
    await within(add).findByRole('option', {
      name: 'Synthetic Candidate · Candidate · candidate@example.test',
    });

    const paths = calls.map((call) => call.path);
    expect(paths).toContain('/v1/training/program-owner-user-options');
    expect(paths).toContain(`/v1/training/programs/${PROGRAM_A_ID}/session-trainer-user-options`);
    expect(paths).toContain(`/v1/training/programs/${PROGRAM_A_ID}/enrollment-user-options`);
    expect(paths).toContain(
      `/v1/training/programs/${PROGRAM_A_ID}/sessions/${SESSION_A_ID}/enrollment-options`,
    );
    expect(
      paths.filter(
        (path) =>
          path.startsWith('/v1/admin') ||
          path.startsWith('/v1/users') ||
          path.startsWith('/v1/tasks') ||
          path.startsWith('/v1/missions'),
      ),
    ).toEqual([]);
    const candidateCall = calls.find((call) => call.path === '/v1/candidates');
    expect(candidateCall?.search.get('status')).toBe('ACTIVE');
    expectNoRawIds();
  });

  it('filters sessions by trainer, delivery mode, and dates', async () => {
    const calls = standardApi();
    render(<Panel />);
    await openProgram('Synthetic Onboarding');

    const filters = await screen.findByRole('search', { name: 'Filter sessions' });
    fireEvent.change(within(filters).getByLabelText('Trainer'), { target: { value: 'me' } });
    fireEvent.change(within(filters).getByLabelText('Delivery mode'), {
      target: { value: 'REMOTE' },
    });
    fireEvent.change(within(filters).getByLabelText('Starting from'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }));

    await waitFor(() =>
      expect(callsTo(calls, sessionsPath(PROGRAM_A_ID)).at(-1)?.search.get('deliveryMode')).toBe(
        'REMOTE',
      ),
    );
    const query = callsTo(calls, sessionsPath(PROGRAM_A_ID)).at(-1)!.search;
    expect(query.get('trainerUserId')).toBe(ACTOR_ID);
    expect(query.get('scheduledFrom')).toMatch(/^2026-0(8|9)-/);
    expect(query.get('pageSize')).toBe('10');
  });

  it('shows loading, error with retry, and empty states', async () => {
    let fail = true;
    standardApi((call) => {
      if (call.method === 'GET' && call.path === programsPath) {
        if (fail) return errorResponse(500, 'INTERNAL');
        return jsonResponse(page('programs', []));
      }
      return undefined;
    });
    render(<Panel />);

    expect(screen.getByText('Loading training programs…')).toBeInTheDocument();
    expect(await screen.findByText('Training programs could not be loaded.')).toBeVisible();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No programs yet')).toBeVisible();
  });
});

describe('TrainingPanel: privacy and permissions', () => {
  it('shows a restricted participant as localized text, never an identifier', async () => {
    standardApi((call) =>
      call.method === 'GET' && call.path === enrollmentsPath(PROGRAM_A_ID)
        ? jsonResponse(page('enrollments', [restrictedEnrollment()], { pageSize: 10 }))
        : undefined,
    );
    render(<Panel locale="fr" />);
    await openProgram('Synthetic Onboarding');

    const table = await screen.findByRole('table', { name: 'Inscriptions au programme' });
    expect(within(table).getByText('Participant non visible')).toBeVisible();
    expect(within(table).getByText(/Contact client/)).toBeVisible();
    expectNoRawIds();
  });

  it('offers each enrollment source only with its source permissions, and never EXTERNAL', async () => {
    standardApi();
    render(<Panel permissions={[...READ_ONLY, 'training_enrollments:manage']} />);
    await openProgram('Synthetic Onboarding');
    fireEvent.click(await screen.findByText('Enroll a participant'));
    const enroll = screen.getByRole('form', { name: 'Enroll a participant' });
    const type = within(enroll).getByLabelText('Participant type');
    expect(
      within(type)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Internal user']);
    expect(screen.queryByRole('columnheader', { name: 'Client' })).toBeNull();
    expect(within(programFilters()).queryByLabelText('Client')).toBeNull();
  });

  it('enrolls a client contact only from the program client and only with contact read', async () => {
    const linked = syntheticProgram({ clientId: CLIENT_ID, clientDisplayName: 'Synthetic Client' });
    const calls = standardApi((call) => {
      if (call.method === 'GET' && call.path === programsPath) {
        return jsonResponse(page('programs', [linked]));
      }
      if (call.method === 'POST' && call.path === enrollmentsPath(PROGRAM_A_ID)) {
        return jsonResponse({ enrollment: syntheticEnrollment() }, 201);
      }
      return undefined;
    });
    render(<Panel />);
    await openProgram('Synthetic Onboarding');
    fireEvent.click(await screen.findByText('Enroll a participant'));
    const enroll = screen.getByRole('form', { name: 'Enroll a participant' });
    fireEvent.change(within(enroll).getByLabelText('Participant type'), {
      target: { value: 'CLIENT_CONTACT' },
    });
    expect(within(enroll).getByLabelText('Client')).toHaveValue('Synthetic Client');
    await within(enroll).findByRole('option', { name: 'Synthetic Contact · contact@example.test' });
    fireEvent.change(within(enroll).getByLabelText(/^Client contact/), {
      target: { value: CONTACT_ID },
    });
    fireEvent.click(within(enroll).getByRole('button', { name: 'Enroll participant' }));

    await waitFor(() =>
      expect(callsTo(calls, enrollmentsPath(PROGRAM_A_ID), 'POST')).toHaveLength(1),
    );
    expect(callsTo(calls, enrollmentsPath(PROGRAM_A_ID), 'POST')[0]?.body).toEqual({
      participantType: 'CLIENT_CONTACT',
      clientContactId: CONTACT_ID,
    });
    expect(callsTo(calls, `/v1/clients/${CLIENT_ID}/contacts`)[0]?.search.get('status')).toBe(
      'ACTIVE',
    );
    expect(callsTo(calls, '/v1/clients')).toHaveLength(2);
    expect(await screen.findByText('Participant enrolled.')).toBeVisible();
  });

  it('keeps a read-only account free of every write control', async () => {
    standardApi();
    render(<Panel permissions={READ_ONLY} />);

    expect(await screen.findByText('Read-only access')).toBeVisible();
    await openProgram('Synthetic Onboarding');
    await openSession();
    fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
    await screen.findByRole('region', { name: 'Attendance record' });
    for (const name of [
      'Close program',
      'Edit program',
      'Reschedule',
      'Cancel session',
      'Save attendance',
      'Add to session',
      'Generate PDF',
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByText('New training program')).toBeNull();
    expect(screen.queryByText('Schedule a session')).toBeNull();
    expect(screen.queryByText('Enroll a participant')).toBeNull();
    expect(screen.queryByText('Correct attendance')).toBeNull();
  });
});

describe('TrainingPanel: session and stale-response safety', () => {
  it('drops every result from a replaced token and reloads for the new one', async () => {
    const lateList = deferred();
    const calls = standardApi((call) => {
      if (call.method === 'GET' && call.path === programsPath) {
        return call.authorization === 'Bearer token-a'
          ? lateList.promise
          : jsonResponse(page('programs', [programA]));
      }
      return undefined;
    });
    const { rerender } = render(<Panel accessToken="token-a" />);
    await waitFor(() => expect(callsTo(calls, programsPath)).toHaveLength(1));

    rerender(<Panel accessToken="token-b" />);
    expect(await screen.findByRole('button', { name: 'Synthetic Onboarding' })).toBeVisible();

    await act(async () => {
      lateList.resolve(jsonResponse(page('programs', [programB])));
      await lateList.promise;
    });
    expect(screen.queryByRole('button', { name: 'Synthetic Leadership' })).toBeNull();
    expect(callsTo(calls, programsPath).at(-1)?.authorization).toBe('Bearer token-b');
  });

  it('clears selection and typed state when the permission principal changes', async () => {
    standardApi();
    const { rerender } = render(<Panel />);
    await openProgram('Synthetic Onboarding');

    rerender(<Panel permissions={READ_ONLY} />);
    await screen.findByText('Read-only access');
    expect(screen.queryByRole('heading', { level: 2, name: 'Synthetic Onboarding' })).toBeNull();
    expect(
      screen.getByText('Select a program to see its sessions, enrollments, and attendance.'),
    ).toBeVisible();
  });

  it('never lets a late Program A child read populate Program B', async () => {
    const lateSessions = deferred();
    const lateEnrollments = deferred();
    standardApi((call) => {
      if (call.method === 'GET' && call.path === sessionsPath(PROGRAM_A_ID)) {
        return lateSessions.promise;
      }
      if (call.method === 'GET' && call.path === enrollmentsPath(PROGRAM_A_ID)) {
        return lateEnrollments.promise;
      }
      return undefined;
    });
    render(<Panel />);

    await openProgram('Synthetic Onboarding');
    await openProgram('Synthetic Leadership');
    expect(await screen.findByText('No sessions yet')).toBeVisible();

    await act(async () => {
      lateSessions.resolve(jsonResponse(page('sessions', [sessionA], { pageSize: 10 })));
      lateEnrollments.resolve(jsonResponse(page('enrollments', [enrollmentA], { pageSize: 10 })));
      await Promise.all([lateSessions.promise, lateEnrollments.promise]);
    });
    expect(screen.queryByRole('button', { name: 'Synthetic Induction' })).toBeNull();
    expect(screen.queryByText('Synthetic Candidate')).toBeNull();
    expect(screen.getByText('No enrollments yet')).toBeVisible();
  });

  it('ignores a late mutation response for a program that is no longer selected', async () => {
    const lateStatus = deferred();
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === `/v1/training/programs/${PROGRAM_A_ID}/status`
        ? lateStatus.promise
        : undefined,
    );
    render(<Panel />);

    await openProgram('Synthetic Onboarding');
    fireEvent.click(screen.getByRole('button', { name: 'Close program' }));
    await waitFor(() =>
      expect(callsTo(calls, `/v1/training/programs/${PROGRAM_A_ID}/status`, 'POST')).toHaveLength(
        1,
      ),
    );
    // One write at a time: the other write controls wait for it.
    expect(screen.getByRole('button', { name: 'Edit program' })).toBeDisabled();

    await openProgram('Synthetic Leadership');
    await act(async () => {
      lateStatus.resolve(jsonResponse({ program: { ...programA, status: 'PROGRAM_CLOSED' } }));
      await lateStatus.promise;
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Synthetic Leadership' })).toBeVisible();
    expect(screen.queryByText('Program status updated.')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close program' })).toBeEnabled(),
    );
  });
});

describe('TrainingPanel: lifecycle, participation, and certificates', () => {
  it('changes program status and reports a lifecycle conflict with localized copy', async () => {
    const calls = standardApi((call) =>
      call.method === 'POST' && call.path === `/v1/training/programs/${PROGRAM_A_ID}/status`
        ? errorResponse(409, 'TRAINING_PROGRAM_STATUS_TRANSITION_BLOCKED')
        : undefined,
    );
    render(<Panel />);
    await openProgram('Synthetic Onboarding');
    fireEvent.click(screen.getByRole('button', { name: 'Close program' }));

    expect(
      await screen.findByText(
        'This record changed or does not allow that step now. The latest state is shown.',
      ),
    ).toBeVisible();
    expect(callsTo(calls, `/v1/training/programs/${PROGRAM_A_ID}/status`, 'POST')[0]?.body).toEqual(
      {
        status: 'PROGRAM_CLOSED',
      },
    );
  });

  it('requires a reason to cancel a session and updates it in place', async () => {
    const cancelPath = `/v1/training/programs/${PROGRAM_A_ID}/sessions/${SESSION_A_ID}/cancel`;
    const canceled = {
      ...sessionA,
      status: 'SESSION_CANCELED' as const,
      cancellationReason: 'Synthetic reason',
    };
    let wasCanceled = false;
    const calls = standardApi((call) => {
      if (call.method === 'POST' && call.path === cancelPath) {
        wasCanceled = true;
        return jsonResponse({ session: canceled });
      }
      return wasCanceled && call.method === 'GET' && call.path === sessionsPath(PROGRAM_A_ID)
        ? jsonResponse(page('sessions', [canceled], { pageSize: 10 }))
        : undefined;
    });
    render(<Panel />);
    await openProgram('Synthetic Onboarding');
    await openSession();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }));
    const form = screen.getByRole('form', { name: 'Cancel this session' });
    const confirm = within(form).getByRole('button', { name: 'Confirm cancellation' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/^Cancellation reason/), {
      target: { value: 'Synthetic reason' },
    });
    fireEvent.click(confirm);

    expect(await screen.findByText('Session canceled.')).toBeVisible();
    expect(callsTo(calls, cancelPath, 'POST')[0]?.body).toEqual({ reason: 'Synthetic reason' });
    const detail = screen.getByRole('article', { name: 'Synthetic Induction' });
    expect(within(detail).getByText('Synthetic reason')).toBeVisible();
  });

  it('adds a participant through session enrollment options and records attendance', async () => {
    const attendancePath = `${participationsPath}/${PARTICIPATION_A_ID}/attendance`;
    const calls = standardApi((call) => {
      if (call.method === 'POST' && call.path === participationsPath) {
        return jsonResponse({ participation: participationA }, 201);
      }
      if (call.method === 'POST' && call.path === attendancePath) {
        return jsonResponse({ participation: { ...participationA, status: 'ATTENDED' } });
      }
      return undefined;
    });
    render(<Panel />);
    await openProgram('Synthetic Onboarding');
    await openSession();

    const add = await screen.findByRole('form', { name: 'Add a participant to this session' });
    await within(add).findByRole('option', {
      name: 'Synthetic Candidate · Candidate · candidate@example.test',
    });
    fireEvent.change(within(add).getByLabelText(/^Enrolled participant/), {
      target: { value: ENROLLMENT_A_ID },
    });
    fireEvent.click(within(add).getByRole('button', { name: 'Add to session' }));
    expect(await screen.findByText('Participant added to the session.')).toBeVisible();
    expect(callsTo(calls, participationsPath, 'POST')[0]?.body).toEqual({
      trainingEnrollmentId: ENROLLMENT_A_ID,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    const record = screen.getByRole('form', { name: 'Save attendance' });
    fireEvent.change(within(record).getByLabelText(/^New status/), {
      target: { value: 'ATTENDED' },
    });
    fireEvent.click(within(record).getByRole('button', { name: 'Save attendance' }));
    expect(await screen.findByText('Attendance saved.')).toBeVisible();
    expect(callsTo(calls, attendancePath, 'POST')[0]?.body).toEqual({
      status: 'ATTENDED',
      sessionOutcome: null,
      completionStatus: null,
      trainerNotes: null,
    });
    expectNoRawIds();
  });

  it('shows certificate readiness, changes applicability, and generates a certificate', async () => {
    const ready = syntheticEnrollment({
      completedAt: TIMESTAMP,
      certificateReady: true,
      status: 'EVALUATED',
    });
    const certificatePath = `/v1/training/programs/${PROGRAM_A_ID}/enrollments/${ENROLLMENT_A_ID}/certificate-status`;
    const generatePath = `/v1/training/programs/${PROGRAM_A_ID}/enrollments/${ENROLLMENT_A_ID}/generate-certificate`;
    const calls = standardApi((call) => {
      if (call.method === 'GET' && call.path === enrollmentsPath(PROGRAM_A_ID)) {
        return jsonResponse(page('enrollments', [ready], { pageSize: 10 }));
      }
      if (call.method === 'POST' && call.path === certificatePath) {
        return jsonResponse({
          enrollment: { ...ready, certificateStatus: 'NOT_APPLICABLE', certificateReady: false },
        });
      }
      if (call.method === 'POST' && call.path === generatePath) {
        return jsonResponse({
          generated: {
            documentId: DOCUMENT_ID,
            versionId: VERSION_ID,
            versionNumber: 1,
            sourceType: 'TRAINING_ENROLLMENT',
            sourceId: ENROLLMENT_A_ID,
            documentType: 'TRAINING_CERTIFICATE',
            outputFamily: 'PDF',
            language: 'en',
            templateId: 'training-certificate',
            templateVersion: 1,
            filename: 'certificate.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            checksumSha256: 'a'.repeat(64),
            generatedByUserId: ACTOR_ID,
            generatedAt: TIMESTAMP,
            replayed: false,
          },
        });
      }
      if (call.method === 'GET' && call.path === `/v1/documents/${DOCUMENT_ID}/versions`) {
        return jsonResponse({ versions: [] });
      }
      return undefined;
    });
    render(<Panel />);
    await openProgram('Synthetic Onboarding');
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    const certificate = screen.getByRole('region', { name: 'Certificate' });
    expect(within(certificate).getByText('Ready: a certificate can be generated.')).toBeVisible();
    fireEvent.click(within(certificate).getByRole('button', { name: 'Generate PDF' }));
    expect(await screen.findByText('Certificate generated.')).toBeVisible();
    expect(
      within(certificate).getByText('PDF certificate version 1 generated in English.'),
    ).toBeVisible();
    expect(within(certificate).getByRole('button', { name: 'Download' })).toBeVisible();
    expect(callsTo(calls, generatePath, 'POST')[0]?.body).toMatchObject({
      outputFamily: 'PDF',
      language: 'en',
    });

    fireEvent.change(within(certificate).getByLabelText(/^Certificate applicability/), {
      target: { value: 'NOT_APPLICABLE' },
    });
    fireEvent.click(within(certificate).getByRole('button', { name: 'Save applicability' }));
    expect(await screen.findByText('Certificate applicability updated.')).toBeVisible();
    expect(callsTo(calls, certificatePath, 'POST')[0]?.body).toEqual({
      certificateStatus: 'NOT_APPLICABLE',
    });
    expectNoRawIds();
  });

  it('moves focus to the selected program heading', async () => {
    standardApi();
    render(<Panel />);
    await openProgram('Synthetic Onboarding');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 2, name: 'Synthetic Onboarding' }),
      ),
    );
  });
});
