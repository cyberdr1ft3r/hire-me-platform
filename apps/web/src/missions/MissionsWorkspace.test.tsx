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
import { showMissionDetailTab } from './mission-test-navigation.js';

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

/** Slices like the API: `page`/`pageSize` default to 1 and 20, with real totals. */
function serverPage<T>(key: string, items: T[], search: URLSearchParams) {
  const pageNumber = Number(search.get('page') ?? '1');
  const pageSize = Number(search.get('pageSize') ?? '20');
  const start = (pageNumber - 1) * pageSize;
  return {
    [key]: items.slice(start, start + pageSize),
    pagination: { page: pageNumber, pageSize, total: items.length },
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
      return jsonResponse(
        serverPage('assignments', data.assignments[match[1]!] ?? [], call.search),
      );
    }
    match = /^\/v1\/missions\/([^/]+)\/assignment-user-options$/.exec(path);
    if (match) {
      return jsonResponse({ users: data.userOptions[match[1]!] ?? [] });
    }
    match = /^\/v1\/missions\/([^/]+)\/candidates$/.exec(path);
    if (match && method === 'GET') {
      return jsonResponse(serverPage('candidates', data.processes[match[1]!] ?? [], call.search));
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
      return jsonResponse(serverPage('interviews', data.interviews[match[1]!] ?? [], call.search));
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
  initialInterviewId = null,
  initialMissionId = null,
  initialProcessId = null,
  onSelectionChange = () => undefined,
  permissions,
}: {
  accessToken?: string;
  initialInterviewId?: string | null;
  initialMissionId?: string | null;
  initialProcessId?: string | null;
  onSelectionChange?: (missionId: string) => void;
  permissions: string[];
}) {
  return (
    <>
      <LocaleToggle />
      <MissionsPanel
        accessToken={accessToken}
        actorUserId={ACTOR_ID}
        initialInterviewId={initialInterviewId}
        initialMissionId={initialMissionId}
        initialProcessId={initialProcessId}
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

async function showPipelineTab(locale: 'en' | 'fr' = 'en'): Promise<void> {
  await showMissionDetailTab('pipeline', locale);
}

async function openProcess(candidateName: string): Promise<HTMLElement> {
  await showPipelineTab();
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

describe('Missions detail navigation (#118)', () => {
  it('names the Overview panel without a missing tab when navigation is omitted', async () => {
    serve(world());
    renderWorkspace({ permissions: ['missions:view'] });

    await selectMission('Mission Alpha');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(await screen.findByRole('region', { name: 'Overview' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Mission profile' })).toBeVisible();
  });

  it('hides the edit form until Edit mission is chosen on Overview', async () => {
    serve(world());
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await screen.findByRole('heading', { level: 2, name: 'Mission Alpha' });
    expect(screen.queryByRole('form', { name: 'Edit mission' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit mission' }));
    expect(await screen.findByRole('form', { name: 'Edit mission' })).toBeVisible();
  });

  it('shows team content only on the Team tab', async () => {
    serve(world());
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    expect(screen.queryByRole('region', { name: 'Mission team' })).toBeNull();
    fireEvent.click(await screen.findByRole('tab', { name: 'Team' }));
    expect(await screen.findByRole('region', { name: 'Mission team' })).toBeVisible();
  });

  it('opens the Pipeline tab and process detail for a process deep link', async () => {
    serve(world());
    renderWorkspace({
      initialMissionId: MISSION_A_ID,
      initialProcessId: processA.id,
      permissions: MANAGE,
    });

    expect(await screen.findByRole('tab', { name: 'Pipeline', selected: true })).toBeVisible();
    expect(await screen.findByRole('region', { name: 'Alex Candidate' })).toBeVisible();
    expect(await screen.findByText('Alpha contract')).toBeVisible();
  });

  it('keeps lifecycle actions on Overview while pipeline stays on Pipeline', async () => {
    serve(world());
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    expect(await screen.findByRole('region', { name: 'Lifecycle' })).toBeVisible();
    await openProcess('Alex Candidate');
    expect(screen.getByRole('tab', { name: 'Pipeline', selected: true })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Lifecycle' })).toBeNull();
  });
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
    await screen.findByRole('heading', { level: 2, name: 'Mission Alpha' });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit mission' }));
    const title = within(await screen.findByRole('form', { name: 'Edit mission' })).getByRole(
      'textbox',
      { name: 'Title' },
    );
    fireEvent.change(title, { target: { value: 'Typed but unsaved title' } });
    await openProcess('Alex Candidate');
    await screen.findByText('Alpha contract');
    const search = within(screen.getByRole('search', { name: 'Mission search' })).getByRole(
      'searchbox',
      { name: 'Search' },
    );
    fireEvent.change(search, { target: { value: 'unapplied draft' } });
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
    await showMissionDetailTab('overview', 'fr');
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
    await showMissionDetailTab('team');
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
    await showMissionDetailTab('pipeline');
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
    await showMissionDetailTab('team');
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
    await showMissionDetailTab('team');
    await screen.findByRole('region', { name: 'Mission team' });
    await selectMission('Mission Beta');
    await showMissionDetailTab('team');
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

describe('Missions candidate pipeline pagination', () => {
  const PROCESS_COUNT = 25;

  function numberedProcess(missionId: string, index: number): MissionCandidateSummary {
    const name = `Candidate ${String(index).padStart(2, '0')}`;
    const base = syntheticProcess(missionId, name);
    const suffix = String(index).padStart(10, '0');
    const candidateId = `${missionId.slice(0, 24)}${suffix}88`;
    return {
      ...base,
      id: `${missionId.slice(0, 24)}${suffix}99`,
      candidateId,
      candidate: { ...base.candidate, id: candidateId },
    };
  }

  const many = Array.from({ length: PROCESS_COUNT }, (_, index) =>
    numberedProcess(MISSION_A_ID, index + 1),
  );
  const byName = (name: string) => many.find((entry) => entry.candidate.displayName === name)!;

  function manyWorld(): World {
    return world({
      offers: Object.fromEntries(
        many.map((entry) => [
          entry.id,
          syntheticOffer(entry, `${entry.candidate.displayName} contract`),
        ]),
      ),
      processes: { [MISSION_A_ID]: [...many], [MISSION_B_ID]: [processB] },
    });
  }

  function isCandidatePage(call: RecordedCall, missionId: string, pageNumber: number): boolean {
    return (
      call.method === 'GET' &&
      call.path === `/v1/missions/${missionId}/candidates` &&
      call.search.get('page') === String(pageNumber)
    );
  }

  function pipeline(): HTMLElement {
    return screen.getByRole('region', { name: 'Candidate pipeline' });
  }

  function shownCandidates(): string[] {
    return within(pipeline())
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent ?? '');
  }

  async function nextPage(): Promise<void> {
    await showPipelineTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Next candidate page' }));
    await flush();
  }

  it('shows the first page, reaches page 2, and opens a candidate there without omitting anyone', async () => {
    const calls = serve(manyWorld());
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await showPipelineTab();
    await screen.findByRole('button', { name: 'Open the process for Candidate 01' });
    const firstPage = shownCandidates();
    expect(firstPage).toHaveLength(20);
    expect(firstPage[0]).toBe('Candidate 01');
    expect(firstPage.at(-1)).toBe('Candidate 20');
    expect(within(pipeline()).getByText('Page 1 of 2')).toBeVisible();
    expect(within(pipeline()).getByText('1–20 of 25')).toBeVisible();
    const firstRequest = calls.find((call) => isCandidatePage(call, MISSION_A_ID, 1))!;
    expect(firstRequest.search.get('pageSize')).toBe('20');

    await nextPage();
    await screen.findByRole('button', { name: 'Open the process for Candidate 21' });
    const secondPage = shownCandidates();
    expect(secondPage).toEqual([
      'Candidate 21',
      'Candidate 22',
      'Candidate 23',
      'Candidate 24',
      'Candidate 25',
    ]);
    expect(within(pipeline()).getByText('Page 2 of 2')).toBeVisible();
    expect(within(pipeline()).getByText('21–25 of 25')).toBeVisible();
    expect(new Set([...firstPage, ...secondPage]).size).toBe(PROCESS_COUNT);
    expect(within(pipeline()).getByRole('button', { name: 'Next candidate page' })).toBeDisabled();

    const process = await openProcess('Candidate 23');
    expect(process).toBeVisible();
    expect(await within(process).findByText('Candidate 23 contract')).toBeVisible();
    const row = within(pipeline()).getByRole('rowheader', { name: 'Candidate 23' }).closest('tr')!;
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(
      calls.some((call) => call.path.endsWith(`/candidates/${byName('Candidate 23').id}/offers`)),
    ).toBe(true);
  });

  it('closes an open process explicitly when paging away and drops its late detail', async () => {
    const lateOffer = deferred();
    serve(manyWorld(), (call) =>
      call.path.endsWith(`/candidates/${byName('Candidate 03').id}/offers`)
        ? lateOffer.promise
        : undefined,
    );
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await openProcess('Candidate 03');
    await nextPage();

    expect(await screen.findByRole('button', { name: 'Open the process for Candidate 21' }));
    expect(screen.queryByRole('region', { name: 'Candidate 03' })).toBeNull();
    expect(
      within(pipeline()).getByText(
        'The open candidate process was closed because it is not on this page. Open a candidate on this page to continue.',
      ),
    ).toBeVisible();

    await act(async () => {
      lateOffer.resolve(
        jsonResponse({ offer: syntheticOffer(byName('Candidate 03'), 'Candidate 03 contract') }),
      );
      await lateOffer.promise;
    });
    await flush();
    expect(screen.queryByText('Candidate 03 contract')).toBeNull();

    await openProcess('Candidate 22');
    expect(await screen.findByText('Candidate 22 contract')).toBeVisible();
    expect(within(pipeline()).queryByText(/was closed because it is not on this page/)).toBeNull();
  });

  it('never lets a stale page-1 refresh overwrite page 2', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const staleFirstPage = deferred();
    let firstPageReads = 0;
    serve(manyWorld(), (call) => {
      if (call.method === 'POST' && call.path.endsWith('/transition')) {
        return jsonResponse({ error: { code: 'MISSION_CANDIDATE_STALE', message: 'Stale' } }, 409);
      }
      if (isCandidatePage(call, MISSION_A_ID, 1) && ++firstPageReads === 2) {
        return staleFirstPage.promise;
      }
      return undefined;
    });
    renderWorkspace({ permissions: [...VIEW, 'mission_candidates:transition'] });

    await selectMission('Mission Alpha');
    const process = await openProcess('Candidate 02');
    fireEvent.click(await within(process).findByRole('button', { name: 'Move to Offer accepted' }));
    // The conflict refreshes the mission, which re-reads page 1 and stays pending.
    await waitFor(() => expect(firstPageReads).toBe(2));

    await nextPage();
    await screen.findByRole('button', { name: 'Open the process for Candidate 21' });

    await act(async () => {
      staleFirstPage.resolve(
        jsonResponse(serverPage('candidates', many, new URLSearchParams('page=1&pageSize=20'))),
      );
      await staleFirstPage.promise;
    });
    await flush();
    expect(shownCandidates()[0]).toBe('Candidate 21');
    expect(within(pipeline()).getByText('Page 2 of 2')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open the process for Candidate 01' })).toBeNull();
  });

  it('never lets a stale page-2 response overwrite a newer page 1 or a new session', async () => {
    const stalePage = deferred();
    let pageTwoReads = 0;
    serve(manyWorld(), (call) =>
      isCandidatePage(call, MISSION_A_ID, 2) && ++pageTwoReads === 1
        ? stalePage.promise
        : undefined,
    );
    const view = renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await showPipelineTab();
    await screen.findByRole('button', { name: 'Open the process for Candidate 01' });
    await nextPage();
    await selectMission('Mission Beta');
    await selectMission('Mission Alpha');
    await showPipelineTab();
    await screen.findByRole('button', { name: 'Open the process for Candidate 01' });

    await act(async () => {
      stalePage.resolve(
        jsonResponse(serverPage('candidates', many, new URLSearchParams('page=2&pageSize=20'))),
      );
      await stalePage.promise;
    });
    await flush();
    expect(shownCandidates()[0]).toBe('Candidate 01');
    expect(within(pipeline()).getByText('Page 1 of 2')).toBeVisible();

    // A page request still pending when the session changes is dropped with it.
    const sessionPage = deferred();
    serve(manyWorld(), (call) =>
      isCandidatePage(call, MISSION_A_ID, 2) ? sessionPage.promise : undefined,
    );
    await nextPage();
    view.rerender({ accessToken: 'token-b', permissions: VIEW });
    await act(async () => {
      sessionPage.resolve(
        jsonResponse(serverPage('candidates', many, new URLSearchParams('page=2&pageSize=20'))),
      );
      await sessionPage.promise;
    });
    await flush();
    expect(screen.queryByRole('region', { name: 'Candidate pipeline' })).toBeNull();
    expect(screen.queryByText('Candidate 21')).toBeNull();
  });

  it('keeps the write lock across paging and never applies a stale offer write to the new process', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sent = deferred();
    const calls = serve(manyWorld(), (call) =>
      call.method === 'POST' && call.path.endsWith('/mark-sent') ? sent.promise : undefined,
    );
    renderWorkspace({ permissions: MANAGE });

    await selectMission('Mission Alpha');
    await openProcess('Candidate 04');
    const offer = await screen.findByRole('region', { name: 'Offer' });
    fireEvent.click(within(offer).getByRole('button', { name: 'Mark sent' }));
    expect(writes(calls)).toHaveLength(1);

    await nextPage();
    const process = await openProcess('Candidate 24');
    expect(await within(process).findByText('Candidate 24 contract')).toBeVisible();
    const newOffer = within(process).getByRole('region', { name: 'Offer' });
    expect(within(newOffer).getByRole('button', { name: 'Mark sent' })).toBeDisabled();

    await act(async () => {
      sent.resolve(
        jsonResponse({
          offer: syntheticOffer(byName('Candidate 04'), 'Candidate 04 contract', 'SENT'),
        }),
      );
      await sent.promise;
    });
    await flush();
    expect(within(process).getByText('Candidate 24 contract')).toBeVisible();
    expect(screen.queryByText('Candidate 04 contract')).toBeNull();
    expect(screen.queryByText('Offer marked as sent.')).toBeNull();
    expect(within(newOffer).getByRole('button', { name: 'Mark sent' })).toBeEnabled();
    expect(writes(calls)).toHaveLength(1);
  });

  it('falls back to the last page with entries and closes a process that left it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const data = manyWorld();
    serve(data, (call) =>
      call.method === 'POST' && call.path.endsWith('/transition')
        ? jsonResponse({ error: { code: 'MISSION_CANDIDATE_STALE', message: 'Stale' } }, 409)
        : undefined,
    );
    renderWorkspace({ permissions: [...VIEW, 'mission_candidates:transition'] });

    await selectMission('Mission Alpha');
    await nextPage();
    const process = await openProcess('Candidate 25');
    data.processes[MISSION_A_ID] = many.slice(0, 20);
    fireEvent.click(await within(process).findByRole('button', { name: 'Move to Offer accepted' }));

    expect(await within(pipeline()).findByText('Page 1 of 1')).toBeVisible();
    expect(shownCandidates()).toHaveLength(20);
    expect(screen.queryByRole('region', { name: 'Candidate 25' })).toBeNull();
    expect(within(pipeline()).getByText(/was closed because it is not on this page/)).toBeVisible();
  });

  it('keeps page 2 and its open process across a locale switch without refetching', async () => {
    const calls = serve(manyWorld());
    renderWorkspace({ permissions: VIEW });

    await selectMission('Mission Alpha');
    await nextPage();
    await openProcess('Candidate 23');
    await screen.findByText('Candidate 23 contract');
    await flush();
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Toggle locale' }));

    const frenchPipeline = await screen.findByRole('region', { name: 'Vivier de candidats' });
    expect(within(frenchPipeline).getByText('Page 2 sur 2')).toBeVisible();
    expect(within(frenchPipeline).getByText('21–25 sur 25')).toBeVisible();
    expect(
      within(frenchPipeline).getByRole('button', { name: 'Page de candidats précédente' }),
    ).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Candidate 23' })).toBeVisible();
    expect(screen.getByText('Candidate 23 contract')).toBeVisible();
    await flush();
    expect(calls.length).toBe(before);
  });
});

function forceStackedMissionsLayout(): void {
  const container = document.querySelector('.missions');
  if (!container) {
    throw new Error('Missing missions layout container');
  }
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
}

describe('Stacked master-detail reveal', () => {
  it('opens a process from the candidate name control and focuses it on stacked layouts', async () => {
    serve(world());
    renderWorkspace({ permissions: VIEW });
    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    await showMissionDetailTab('pipeline');
    const pipelineRegion = await screen.findByRole('region', { name: 'Candidate pipeline' });
    forceStackedMissionsLayout();
    fireEvent.click(within(pipelineRegion).getByRole('button', { name: 'Alex Candidate' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 3, name: 'Alex Candidate' })).toHaveFocus(),
    );
  });
});
