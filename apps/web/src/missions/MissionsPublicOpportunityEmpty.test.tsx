import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { InternalPublicOpportunity } from '@hire-me/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionsPanel } from './MissionsPanel.js';
import {
  MISSION_A_ID,
  MISSION_B_ID,
  deferred,
  jsonResponse,
  mockMissionApi,
  syntheticMission,
  syntheticPublicOpportunity,
  type RecordedCall,
} from './mission-test-data.js';

const ACTOR_ID = '12121212-1212-4121-8121-121212121212';

const PUBLIC_VIEW = ['missions:view', 'public_opportunities:view'];
const PUBLIC_MANAGE = [
  ...PUBLIC_VIEW,
  'public_opportunities:manage',
  'public_opportunities:publish',
];

function Panel({
  locale = 'en',
  permissions,
  ...rest
}: {
  accessToken?: string;
  initialMissionId?: string | null;
  locale?: 'en' | 'fr';
  onSelectionChange?: (missionId: string) => void;
  permissions: string[];
}) {
  return (
    <I18nProvider initialLocale={locale}>
      <MissionsPanel
        accessToken="token-a"
        actorUserId={ACTOR_ID}
        initialMissionId={null}
        onSelectionChange={() => undefined}
        permissions={permissions}
        {...rest}
      />
    </I18nProvider>
  );
}

function worldWithMissions() {
  return {
    missions: [
      syntheticMission(MISSION_A_ID, 'Mission Alpha'),
      syntheticMission(MISSION_B_ID, 'Mission Beta'),
    ],
    assignments: {},
    interviews: {},
    offers: {},
    processes: {},
    userOptions: {},
    publicOpportunities: {} as Record<string, ReturnType<typeof syntheticPublicOpportunity> | null>,
  };
}

type PublicWorld = ReturnType<typeof worldWithMissions>;

function servePublic(
  data: PublicWorld,
  override?: (call: RecordedCall) => Promise<Response> | Response | undefined,
) {
  return mockMissionApi((call) => {
    const special = override?.(call);
    if (special) {
      return special;
    }
    const { method, path } = call;
    if (path === '/v1/missions' && method === 'GET') {
      return jsonResponse({
        missions: data.missions,
        pagination: { page: 1, pageSize: 20, total: data.missions.length },
      });
    }
    let match = /^\/v1\/missions\/([^/]+)$/.exec(path);
    if (match && method === 'GET') {
      const mission = data.missions.find((entry) => entry.id === match![1]);
      return mission
        ? jsonResponse({ mission })
        : jsonResponse({ code: 'MISSION_NOT_FOUND', message: 'Not found' }, 404);
    }
    match = /^\/v1\/missions\/([^/]+)\/public-opportunity$/.exec(path);
    if (match) {
      const missionId = match[1]!;
      const stored = data.publicOpportunities[missionId];
      if (method === 'GET') {
        return stored
          ? jsonResponse({ publicOpportunity: stored })
          : jsonResponse({ code: 'PUBLIC_OPPORTUNITY_NOT_FOUND', message: 'Not found' }, 404);
      }
      if (method === 'PATCH') {
        const body = call.body ?? {};
        const mission = data.missions.find((entry) => entry.id === missionId)!;
        const base =
          stored ??
          syntheticPublicOpportunity(missionId, { status: 'DRAFT', applicationLinkEnabled: false });
        const publicTitle =
          typeof body.publicTitle === 'string'
            ? body.publicTitle
            : (base.publicTitle ?? mission.title);
        const next = syntheticPublicOpportunity(missionId, {
          ...base,
          publicTitle,
          applicationLinkEnabled:
            typeof body.applicationLinkEnabled === 'boolean'
              ? body.applicationLinkEnabled
              : base.applicationLinkEnabled,
          listedOnWebsite:
            typeof body.listedOnWebsite === 'boolean' ? body.listedOnWebsite : base.listedOnWebsite,
          status:
            typeof body.status === 'string' &&
            ['DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'ARCHIVED'].includes(body.status)
              ? (body.status as InternalPublicOpportunity['status'])
              : base.status,
          contentLanguage:
            body.contentLanguage === null ||
            body.contentLanguage === 'en' ||
            body.contentLanguage === 'fr'
              ? body.contentLanguage
              : base.contentLanguage,
        });
        data.publicOpportunities[missionId] = next;
        return jsonResponse({ publicOpportunity: next });
      }
    }
    if (
      /^\/v1\/missions\/[^/]+\/public-opportunity\/applications$/.test(path) &&
      method === 'GET'
    ) {
      return jsonResponse({ applications: [] });
    }
    return undefined;
  });
}

async function selectMission(title: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Missions public opportunity empty state (Issue #114)', () => {
  it('loads an existing public opportunity normally', async () => {
    const data = worldWithMissions();
    data.publicOpportunities[MISSION_A_ID] = syntheticPublicOpportunity(MISSION_A_ID);
    servePublic(data);
    render(<Panel permissions={PUBLIC_VIEW} />);

    await selectMission('Mission Alpha');
    const form = await screen.findByRole('form', { name: 'Edit public opportunity' });
    expect(within(form).getByRole('textbox', { name: 'Public title' })).toHaveValue(
      'Synthetic opportunity',
    );
    expect(
      screen.getByRole('link', { name: /\/opportunities\/synthetic-opportunity/ }),
    ).toBeVisible();
    expect(screen.queryByText('Section unavailable')).toBeNull();
  });

  it('treats GET 404 as the expected empty state', async () => {
    servePublic(worldWithMissions());
    render(<Panel permissions={PUBLIC_MANAGE} />);

    await selectMission('Mission Alpha');
    expect(await screen.findByText('No public opportunity yet')).toBeVisible();
    expect(screen.queryByText('Section unavailable')).toBeNull();
    expect(screen.getByRole('form', { name: 'Edit public opportunity' })).toBeVisible();
  });

  it('renders the EN empty state copy', async () => {
    servePublic(worldWithMissions());
    render(<Panel locale="en" permissions={PUBLIC_VIEW} />);

    await selectMission('Mission Alpha');
    expect(await screen.findByText('No public opportunity yet')).toBeVisible();
    expect(screen.getByText('This mission does not have a public job posting yet.')).toBeVisible();
  });

  it('renders the FR empty state copy', async () => {
    servePublic(worldWithMissions());
    render(<Panel locale="fr" permissions={PUBLIC_VIEW} />);

    await selectMission('Mission Alpha');
    expect(await screen.findByText('Aucune annonce publique pour l’instant')).toBeVisible();
    expect(screen.getByText('Cette mission n’a pas encore d’annonce publique.')).toBeVisible();
  });

  it('lets an authorized actor create the first public opportunity', async () => {
    const data = worldWithMissions();
    const calls = servePublic(data);
    render(<Panel permissions={PUBLIC_MANAGE} />);

    await selectMission('Mission Alpha');
    const form = await screen.findByRole('form', { name: 'Edit public opportunity' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Public title' }), {
      target: { value: 'First public title' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save public opportunity' }));

    await waitFor(() =>
      expect(
        calls.some((call) => call.method === 'PATCH' && call.path.endsWith('/public-opportunity')),
      ).toBe(true),
    );
    await waitFor(() => {
      const savedForm = screen.getByRole('form', { name: 'Edit public opportunity' });
      expect(within(savedForm).getByRole('textbox', { name: 'Public title' })).toHaveValue(
        'First public title',
      );
    });
  });

  it('transitions to ready state after the first successful save', async () => {
    const data = worldWithMissions();
    servePublic(data);
    render(<Panel permissions={PUBLIC_MANAGE} />);

    await selectMission('Mission Alpha');
    fireEvent.click(await screen.findByRole('button', { name: 'Save public opportunity' }));
    expect(await screen.findByText('Public opportunity configuration saved.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enable applications' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: /\/opportunities\/synthetic-opportunity/ }),
    ).toBeVisible();
    expect(screen.queryByText('No public opportunity yet')).toBeNull();
  });

  it('shows read-only empty state without create controls', async () => {
    servePublic(worldWithMissions());
    render(<Panel permissions={PUBLIC_VIEW} />);

    await selectMission('Mission Alpha');
    expect(await screen.findByText('No public opportunity yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save public opportunity' })).toBeNull();
    expect(screen.queryByText('Section unavailable')).toBeNull();
  });

  it('still renders a section error for server failures', async () => {
    servePublic(worldWithMissions(), (call) =>
      call.path.endsWith('/public-opportunity') && call.method === 'GET'
        ? jsonResponse({ code: 'INTERNAL', message: 'fail' }, 500)
        : undefined,
    );
    render(<Panel permissions={PUBLIC_VIEW} />);

    await selectMission('Mission Alpha');
    expect(await screen.findByText('Section unavailable')).toBeVisible();
    expect(screen.queryByText('No public opportunity yet')).toBeNull();
  });

  it('never applies a stale Mission A public-opportunity response to Mission B', async () => {
    const data = worldWithMissions();
    const lateAlphaPublic = deferred<Response>();
    servePublic(data, (call) =>
      call.path === `/v1/missions/${MISSION_A_ID}/public-opportunity` && call.method === 'GET'
        ? lateAlphaPublic.promise
        : undefined,
    );
    render(<Panel permissions={PUBLIC_VIEW} />);

    await selectMission('Mission Alpha');
    await selectMission('Mission Beta');
    expect(await screen.findByText('No public opportunity yet')).toBeVisible();
    expect(screen.queryByText('Mission A posting')).toBeNull();

    await act(async () => {
      lateAlphaPublic.resolve(
        jsonResponse({
          publicOpportunity: syntheticPublicOpportunity(MISSION_A_ID, {
            publicTitle: 'Mission A posting',
          }),
        }),
      );
      await lateAlphaPublic.promise;
    });
    await flush();
    expect(screen.getByRole('heading', { level: 2, name: 'Mission Beta' })).toBeVisible();
    expect(screen.queryByText('Mission A posting')).toBeNull();
    expect(screen.getByText('No public opportunity yet')).toBeVisible();
  });

  it('keeps publication controls available after creation', async () => {
    const data = worldWithMissions();
    servePublic(data);
    render(<Panel permissions={PUBLIC_MANAGE} />);

    await selectMission('Mission Alpha');
    fireEvent.click(await screen.findByRole('button', { name: 'Save public opportunity' }));
    const enable = await screen.findByRole('button', { name: 'Enable applications' });
    fireEvent.click(enable);
    expect(await screen.findByText('Application link enabled.')).toBeVisible();
    expect(screen.getByText('Application link enabled')).toBeVisible();
  });
});
