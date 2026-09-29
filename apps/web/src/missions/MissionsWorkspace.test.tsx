import type {
  InterviewSummary,
  MissionAssignmentSummary,
  MissionCandidateSummary,
  MissionSummary,
  OfferAggregate,
} from '@hire-me/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n } from '../i18n/index.js';
import { deferredEnglishRoutes } from '../navigation/internal-navigation.js';
import { MissionsPanel } from './MissionsPanel.js';
import {
  ACTOR_ID,
  CLIENT_ID,
  MISSION_A_ID,
  MISSION_B_ID,
  RECRUITER_ID,
  deferred,
  jsonResponse,
  mockMissionApi,
  page,
  syntheticAssignment,
  syntheticInterview,
  syntheticMission,
  syntheticOffer,
  syntheticProcess,
  type RecordedCall,
} from './mission-test-data.js';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const VIEW = [
  'missions:view',
  'mission_assignments:view',
  'mission_candidates:view',
  'offers:view',
  'placements:view',
  'interviews:view',
];

const MANAGE = [
  ...VIEW,
  'missions:create',
  'missions:update',
  'missions:status:manage',
  'mission_assignments:manage',
  'mission_candidates:create',
  'mission_candidates:transition',
  'offers:create',
  'offers:update',
  'offers:send_or_mark_sent',
  'offers:withdraw',
  'clients:view',
  'candidates:view',
];

interface World {
  assignments: Record<string, MissionAssignmentSummary[]>;
  interviews: Record<string, InterviewSummary[]>;
  missions: MissionSummary[];
  offers: Record<string, OfferAggregate | null>;
  processes: Record<string, MissionCandidateSummary[]>;
  userOptions: Record<string, { displayName: string; email: string; id: string }[]>;
}

const missionA = syntheticMission(MISSION_A_ID, 'Mission Alpha');
const missionB = syntheticMission(MISSION_B_ID, 'Mission Beta');
const processA = syntheticProcess(MISSION_A_ID, 'Alex Candidate');
const processB = syntheticProcess(MISSION_B_ID, 'Bea Candidate');

function world(overrides: Partial<World> = {}): World {
  return {
    assignments: {
      [MISSION_A_ID]: [syntheticAssignment(MISSION_A_ID, 'Alpha Recruiter')],
      [MISSION_B_ID]: [syntheticAssignment(MISSION_B_ID, 'Beta Recruiter')],
    },
    interviews: {
      [processA.id]: [syntheticInterview(processA, 'Alpha Organizer')],
      [processB.id]: [syntheticInterview(processB, 'Beta Organizer')],
    },
    missions: [missionA, missionB],
    offers: {
      [processA.id]: syntheticOffer(processA, 'Alpha contract'),
      [processB.id]: syntheticOffer(processB, 'Beta contract'),
    },
    processes: { [MISSION_A_ID]: [processA], [MISSION_B_ID]: [processB] },
    userOptions: {},
    ...overrides,
  };
}

type Override = (call: RecordedCall) => Promise<Response> | Response | undefined;

function serve(data: World, override?: Override): RecordedCall[] {
  return mockMissionApi((call) => {
    const special = override?.(call);
    if (special) return special;
    const { method, path } = call;
    if (path === '/v1/missions' && method === 'GET') {
      return jsonResponse(page('missions', data.missions));
    }
    let match = /^\/v1\/missions\/([^/]+)$/.exec(path);
    if (match && method === 'GET') {
      const mission = data.missions.find((entry) => entry.id === match![1]);
      return mission
        ? jsonResponse({ mission })
        : jsonResponse({ code: 'MISSION_NOT_FOUND', message: 'Not found' }, 404);
    }
    match = /^\/v1\/missions\/([^/]+)\/assignments$/.exec(path);
    if (match && method === 'GET') {
      return jsonResponse(page('assignments', data.assignments[match[1]!] ?? []));
    }
    match = /^\/v1\/missions\/([^/]+)\/assignment-user-options$/.exec(path);
    if (match) {
      return jsonResponse({ users: data.userOptions[match[1]!] ?? [] });
    }
    match = /^\/v1\/missions\/([^/]+)\/candidates$/.exec(path);
    if (match && method === 'GET') {
      return jsonResponse(page('candidates', data.processes[match[1]!] ?? []));
    }
    match = /^\/v1\/missions\/[^/]+\/candidates\/([^/]+)\/offers$/.exec(path);
    if (match && method === 'GET') {
      return jsonResponse({ offer: data.offers[match[1]!] ?? null });
    }
    if (/^\/v1\/missions\/[^/]+\/candidates\/[^/]+\/placement$/.test(path)) {
      return jsonResponse({ placement: null });
    }
    match = /^\/v1\/missions\/[^/]+\/candidates\/([^/]+)\/interviews$/.exec(path);
    if (match && method === 'GET') {
      return jsonResponse(page('interviews', data.interviews[match[1]!] ?? []));
    }
    if (path === '/v1/clients' || path === '/v1/candidates') {
      return jsonResponse(page(path === '/v1/clients' ? 'clients' : 'candidates', []));
    }
    return undefined;
  });
}

function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')} type="button">
      Toggle locale
    </button>
  );
}

function Workspace({
  accessToken = 'token-a',
  initialMissionId = null,
  onSelectionChange = () => undefined,
  permissions,
}: {
  accessToken?: string;
  initialMissionId?: string | null;
  onSelectionChange?: (missionId: string) => void;
  permissions: string[];
}) {
  return (
    <>
      <LocaleToggle />
      <MissionsPanel
        accessToken={accessToken}
        actorUserId={ACTOR_ID}
        initialMissionId={initialMissionId}
        onSelectionChange={onSelectionChange}
        permissions={permissions}
      />
    </>
  );
}

function renderWorkspace(
  props: Parameters<typeof Workspace>[0],
  locale: 'en' | 'fr' = 'en',
): { rerender: (next: Parameters<typeof Workspace>[0]) => void } {
  const view = render(
    <I18nProvider initialLocale={locale}>
      <Workspace {...props} />
    </I18nProvider>,
  );
  return {
    rerender: (next) =>
      view.rerender(
        <I18nProvider initialLocale={locale}>
          <Workspace {...next} />
        </I18nProvider>,
      ),
  };
}

async function selectMission(title: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
}

async function openProcess(candidateName: string): Promise<HTMLElement> {
  fireEvent.click(
    await screen.findByRole('button', { name: `Open the process for ${candidateName}` }),
  );
  return screen.findByRole('region', { name: candidateName });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function writes(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method !== 'GET');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Missions workspace localization and structure', () => {
  it('is bilingual and no longer marked as deferred English content', async () => {
    serve(world());
    renderWorkspace({ permissions: VIEW }, 'fr');

    expect(deferredEnglishRoutes).not.toContain('missions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Missions' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Missions de recrutement' }),
    ).toBeVisible();
    expect(screen.getByRole('search', { name: 'Recherche de missions' })).toBeVisible();
    expect(await screen.findByText('2 missions')).toBeVisible();
    expect(document.querySelector('.legacy-english-content')).toBeNull();
    // Recruiter-authored titles are data, shown exactly as stored.
    expect(screen.getByRole('button', { name: /^Mission Alpha/ })).toBeVisible();
  });

  it('keeps selection, the open process, filters, and typed values across a locale switch without refetching', async () => {
    const calls = serve(world());
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await openProcess('Alex Candidate');
    await screen.findByText('Alpha contract');
    const search = within(screen.getByRole('search', { name: 'Mission search' })).getByRole(
      'searchbox',
      { name: 'Search' },
    );
    fireEvent.change(search, { target: { value: 'unapplied draft' } });
    const title = within(screen.getByRole('form', { name: 'Edit mission' })).getByRole('textbox', {
      name: 'Title',
    });
    fireEvent.change(title, { target: { value: 'Typed but unsaved title' } });
    await flush();
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Missions de recrutement' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Mission Alpha' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Alex Candidate' })).toBeVisible();
    expect(screen.getByText('Alpha contract')).toBeVisible();
    expect(
      within(screen.getByRole('search', { name: 'Recherche de missions' })).getByRole('searchbox', {
        name: 'Rechercher',
      }),
    ).toHaveValue('unapplied draft');
    expect(
      within(screen.getByRole('form', { name: 'Modifier la mission' })).getByRole('textbox', {
        name: 'Intitulé',
      }),
    ).toHaveValue('Typed but unsaved title');
    await flush();
    expect(calls.length).toBe(before);
  });
});

describe('Missions option sources and raw identifiers', () => {
  it('offers no raw-ID controls and never shows an identifier', async () => {
    const calls = serve(
      world({
        userOptions: {
          [MISSION_A_ID]: [
            { id: ACTOR_ID, displayName: 'Option Person', email: 'option@example.test' },
          ],
        },
      }),
    );
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await openProcess('Alex Candidate');
    await screen.findByText('Alpha contract');
    await screen.findByRole('option', { name: /Option Person/ });

    const controls = [
      ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const label = control.labels?.[0]?.textContent ?? control.getAttribute('aria-label') ?? '';
      expect(label, control.name).not.toMatch(/\b(id|uuid|identifier)\b/i);
      expect(control.value, control.name).not.toMatch(UUID);
    }
    const shownText = document.body.textContent ?? '';
    for (const id of [MISSION_A_ID, CLIENT_ID, RECRUITER_ID, ACTOR_ID, processA.id]) {
      expect(shownText).not.toContain(id);
    }
    // Team options come from the mission-scoped endpoint, never the admin user directory.
    expect(calls.some((call) => call.path.endsWith('/assignment-user-options'))).toBe(true);
    expect(calls.some((call) => call.path.startsWith('/v1/admin'))).toBe(false);
    expect(
      calls.some((call) => call.path.includes('user-options') && call.path.startsWith('/v1/tasks')),
    ).toBe(false);
  });

  it('filters by the signed-in user only through the Assigned to me control', async () => {
    const calls = serve(world());
    renderWorkspace({ permissions: VIEW });

    const filters = await screen.findByRole('search', { name: 'Mission search' });
    fireEvent.click(within(filters).getByRole('checkbox', { name: 'Assigned to me' }));
    fireEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }));

    await waitFor(() =>
      expect(
        calls.some((call) => call.path === '/v1/missions' && call.search.has('assigneeUserId')),
      ).toBe(true),
    );
    const listCall = calls.filter((call) => call.path === '/v1/missions').at(-1)!;
    expect(listCall.search.get('assigneeUserId')).toBe(ACTOR_ID);
    // Without client directory access there is no client picker and no client read.
    expect(within(filters).queryByRole('combobox', { name: 'Client' })).toBeNull();
    expect(calls.some((call) => call.path === '/v1/clients')).toBe(false);
  });

  it('explains missing directory access instead of offering a typed identifier', async () => {
    const calls = serve(world());
    renderWorkspace({
      permissions: [...VIEW, 'missions:create', 'mission_candidates:create'],
    });

    await selectMission('Mission Alpha');
    expect(
      await screen.findByText('Creating a mission requires access to the client directory.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Linking a candidate requires access to the candidate directory.'),
    ).toBeVisible();
    expect(calls.some((call) => call.path === '/v1/candidates')).toBe(false);
    expect(calls.some((call) => call.path === '/v1/clients')).toBe(false);
  });

  it('shows a read-only workspace to an actor without write permissions', async () => {
    serve(world());
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await openProcess('Alex Candidate');
    expect(screen.getByText('Read-only access')).toBeVisible();
    expect(screen.queryByText('New mission')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save mission' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link candidate' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark sent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule interview' })).toBeNull();
  });
});

describe('Missions context ownership', () => {
  it('never lets Mission A team rows populate Mission B', async () => {
    const lateTeam = deferred();
    serve(world(), (call) =>
      call.path === `/v1/missions/${MISSION_A_ID}/assignments` ? lateTeam.promise : undefined,
    );
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await selectMission('Mission Beta');
    expect(await screen.findByText('Beta Recruiter')).toBeVisible();

    await act(async () => {
      lateTeam.resolve(
        jsonResponse(page('assignments', [syntheticAssignment(MISSION_A_ID, 'Alpha Recruiter')])),
      );
      await lateTeam.promise;
    });
    await flush();
    expect(screen.getByRole('heading', { level: 2, name: 'Mission Beta' })).toBeVisible();
    expect(screen.queryByText('Alpha Recruiter')).toBeNull();
  });

  it('never lets Mission A team options populate the Mission B picker', async () => {
    const lateOptions = deferred();
    serve(
      world({
        userOptions: {
          [MISSION_B_ID]: [{ id: ACTOR_ID, displayName: 'Beta Option', email: 'b@example.test' }],
        },
      }),
      (call) =>
        call.path === `/v1/missions/${MISSION_A_ID}/assignment-user-options`
          ? lateOptions.promise
          : undefined,
    );
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await screen.findByRole('region', { name: 'Mission team' });
    await selectMission('Mission Beta');
    expect(await screen.findByRole('option', { name: /Beta Option/ })).toBeInTheDocument();

    await act(async () => {
      lateOptions.resolve(
        jsonResponse({
          users: [{ id: RECRUITER_ID, displayName: 'Alpha Option', email: 'a@example.test' }],
        }),
      );
      await lateOptions.promise;
    });
    await flush();
    expect(screen.queryByRole('option', { name: /Alpha Option/ })).toBeNull();
  });

  it('never lets a Mission A process, offer, or interview populate Mission B', async () => {
    const lateOffer = deferred();
    const lateInterviews = deferred();
    serve(world(), (call) => {
      if (call.path.endsWith(`/candidates/${processA.id}/offers`)) return lateOffer.promise;
      if (call.path.endsWith(`/candidates/${processA.id}/interviews`))
        return lateInterviews.promise;
      return undefined;
    });
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await openProcess('Alex Candidate');
    await selectMission('Mission Beta');
    await screen.findByRole('heading', { level: 2, name: 'Mission Beta' });
    expect(screen.queryByRole('region', { name: 'Alex Candidate' })).toBeNull();

    await act(async () => {
      lateOffer.resolve(jsonResponse({ offer: syntheticOffer(processA, 'Alpha contract') }));
      lateInterviews.resolve(
        jsonResponse(page('interviews', [syntheticInterview(processA, 'Alpha Organizer')])),
      );
      await Promise.all([lateOffer.promise, lateInterviews.promise]);
    });
    await flush();
    expect(screen.queryByText('Alpha contract')).toBeNull();
    expect(screen.queryByText('Alpha Organizer')).toBeNull();

    await openProcess('Bea Candidate');
    expect(await screen.findByText('Beta contract')).toBeVisible();
    expect(await screen.findByText('Beta Organizer')).toBeVisible();
    expect(screen.queryByText('Alpha contract')).toBeNull();
    expect(screen.queryByText('Alpha Organizer')).toBeNull();
  });

  it('drops a late offer after the process is closed', async () => {
    const lateOffer = deferred();
    serve(world(), (call) =>
      call.path.endsWith(`/candidates/${processA.id}/offers`) ? lateOffer.promise : undefined,
    );
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    const process = await openProcess('Alex Candidate');
    fireEvent.click(within(process).getByRole('button', { name: 'Close process' }));
    expect(screen.queryByRole('region', { name: 'Alex Candidate' })).toBeNull();

    await act(async () => {
      lateOffer.resolve(jsonResponse({ offer: syntheticOffer(processA, 'Alpha contract') }));
      await lateOffer.promise;
    });
    await flush();
    expect(screen.queryByText('Alpha contract')).toBeNull();
  });
});

describe('Missions writes', () => {
  it('runs one write at a time', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sent = deferred();
    const calls = serve(world(), (call) =>
      call.method === 'POST' && call.path.endsWith('/mark-sent') ? sent.promise : undefined,
    );
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await openProcess('Alex Candidate');
    const offer = await screen.findByRole('region', { name: 'Offer' });
    fireEvent.click(within(offer).getByRole('button', { name: 'Mark sent' }));
    fireEvent.click(within(offer).getByRole('button', { name: 'Withdraw offer' }));
    fireEvent.click(within(offer).getByRole('button', { name: 'Revise offer' }));
    expect(writes(calls)).toHaveLength(1);
    expect(within(offer).getByRole('button', { name: 'Withdraw offer' })).toBeDisabled();

    await act(async () => {
      sent.resolve(jsonResponse({ offer: syntheticOffer(processA, 'Alpha contract', 'SENT') }));
      await sent.promise;
    });
    expect(await screen.findByText('Offer marked as sent.')).toBeVisible();
    expect(writes(calls)).toHaveLength(1);
  });

  it('drops a write result that settles after the session changed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sent = deferred();
    serve(world(), (call) =>
      call.method === 'POST' && call.path.endsWith('/mark-sent') ? sent.promise : undefined,
    );
    const view = renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await openProcess('Alex Candidate');
    const offer = await screen.findByRole('region', { name: 'Offer' });
    fireEvent.click(within(offer).getByRole('button', { name: 'Mark sent' }));

    view.rerender({ accessToken: 'token-b', permissions: MANAGE });
    await act(async () => {
      sent.resolve(jsonResponse({ offer: syntheticOffer(processA, 'Alpha contract', 'SENT') }));
      await sent.promise;
    });
    await flush();
    expect(screen.queryByText('Offer marked as sent.')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Mission Alpha' })).toBeNull();
    expect(screen.queryByText('Alpha contract')).toBeNull();
  });

  it('asks before a lifecycle change and sends nothing when declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const calls = serve(world());
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    const lifecycle = await screen.findByRole('region', { name: 'Lifecycle' });
    const [move] = within(lifecycle).getAllByRole('button', { name: /^Move to/ });
    fireEvent.click(move!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(writes(calls)).toHaveLength(0);
  });

  it('reports the selection so the deep link follows the chosen mission', async () => {
    serve(world());
    const onSelectionChange = vi.fn<(missionId: string) => void>();
    renderWorkspace({ onSelectionChange, permissions: VIEW });

    await selectMission('Mission Beta');
    expect(onSelectionChange).toHaveBeenCalledWith(MISSION_B_ID);
    expect(screen.getByRole('button', { name: /^Mission Beta/ }).getAttribute('aria-current')).toBe(
      'true',
    );
  });
});
