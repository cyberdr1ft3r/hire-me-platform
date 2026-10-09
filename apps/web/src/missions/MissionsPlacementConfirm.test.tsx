import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionsPanel } from './MissionsPanel.js';
import {
  MISSION_A_ID,
  MISSION_B_ID,
  jsonResponse,
  mockMissionApi,
  syntheticMission,
  syntheticOffer,
  syntheticProcess,
} from './mission-test-data.js';
import { showMissionDetailTab } from './mission-test-navigation.js';

const ACTOR_ID = '12121212-1212-4121-8121-121212121212';
const PROCESS_A = syntheticProcess(MISSION_A_ID, 'Alex Candidate', { clientVisible: true });
const PROCESS_B = syntheticProcess(MISSION_B_ID, 'Bea Candidate', { clientVisible: true });

const PLACEMENT_PERMISSIONS = [
  'missions:view',
  'mission_candidates:view',
  'offers:view',
  'offers:record_response',
  'placements:view',
  'placements:confirm',
  'placement_commercial_eligibility:view',
] as const;

function renderPanel(
  permissions: readonly string[] = PLACEMENT_PERMISSIONS,
  overrides: Partial<ComponentProps<typeof MissionsPanel>> = {},
) {
  return render(
    <I18nProvider initialLocale="en">
      <MissionsPanel
        accessToken="token"
        actorUserId={ACTOR_ID}
        initialMissionId={null}
        onSelectionChange={() => undefined}
        permissions={[...permissions]}
        {...overrides}
      />
    </I18nProvider>,
  );
}

function pipelineHandlers(
  process: typeof PROCESS_A,
  offer = syntheticOffer(process, 'CDI', 'ACCEPTED'),
) {
  return (call: { method: string; path: string; body: Record<string, unknown> | null }) => {
    if (call.path === `/v1/missions/${MISSION_A_ID}/assignments`) {
      return jsonResponse({ assignments: [], pagination: { page: 1, pageSize: 20, total: 0 } });
    }
    if (call.path === `/v1/missions/${MISSION_A_ID}/candidates`) {
      return jsonResponse({
        candidates: [process],
        pagination: { page: 1, pageSize: 20, total: 1 },
      });
    }
    if (call.path.endsWith('/offers') && call.method === 'GET') {
      return jsonResponse({ offer });
    }
    if (call.path.endsWith('/placement') && call.method === 'GET') {
      return jsonResponse({ placement: null });
    }
    if (call.path.endsWith('/offers') && call.method === 'POST') {
      return jsonResponse({ offer });
    }
    return undefined;
  };
}

async function openAcceptedOfferProcess(locale: 'en' | 'fr' = 'en') {
  await showMissionDetailTab('pipeline', locale);
  const processButton =
    locale === 'fr' ? /Ouvrir le processus de Alex/i : /Open the process for Alex/i;
  fireEvent.click(await screen.findByRole('button', { name: processButton }));
  const openLabel = locale === 'fr' ? /^Confirmer le placement$/i : /^Confirm placement$/i;
  await screen.findByRole('button', { name: openLabel });
}

describe('Missions placement confirmation form', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not submit when opening the confirmation form', async () => {
    const confirmCalls: string[] = [];
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path.includes('/confirm-placement')) {
        confirmCalls.push(call.path);
      }
      return undefined;
    });

    renderPanel();
    await screen.findByRole('button', { name: /Mission Alpha/ });
    fireEvent.click(screen.getByRole('button', { name: /Mission Alpha/ }));
    await openAcceptedOfferProcess();
    fireEvent.click(screen.getByRole('button', { name: /^Confirm placement$/i }));
    await screen.findByRole('form', { name: /Confirm placement/i });
    expect(confirmCalls).toHaveLength(0);
  });

  it('cancels without submitting', async () => {
    const confirmCalls: string[] = [];
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path.includes('/confirm-placement')) {
        confirmCalls.push(call.path);
      }
      return undefined;
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    await openAcceptedOfferProcess();
    fireEvent.click(screen.getByRole('button', { name: /^Confirm placement$/i }));
    const form = await screen.findByRole('form', { name: /Confirm placement/i });
    fireEvent.click(within(form).getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('form', { name: /Confirm placement/i })).not.toBeInTheDocument();
    expect(confirmCalls).toHaveLength(0);
  });

  it('requires integration start date and sends UTC midnight ISO to the API', async () => {
    const bodies: Record<string, unknown>[] = [];
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path.includes('/confirm-placement') && call.method === 'POST') {
        bodies.push(call.body ?? {});
        return jsonResponse({
          placement: {
            id: '11111111-1111-4111-8111-111111111111',
            missionId: MISSION_A_ID,
            missionCandidateId: PROCESS_A.id,
            offerVersionId: syntheticOffer(PROCESS_A, 'CDI', 'ACCEPTED').currentVersionId,
            status: 'CONFIRMED',
            integrationStartDate: '2026-09-20T00:00:00.000Z',
            confirmedAt: '2026-09-15T10:00:00.000Z',
            confirmedByUserId: ACTOR_ID,
            eligibleForInvoicing: false,
            invoicingEligibleAt: null,
            operationalNote: 'Note from operator',
            correctionReason: null,
            correctedAt: null,
            correctedByUserId: null,
            closureEligible: false,
            archivedAt: null,
            createdAt: '2026-09-15T10:00:00.000Z',
            updatedAt: '2026-09-15T10:00:00.000Z',
            history: [],
          },
        });
      }
      return undefined;
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    await openAcceptedOfferProcess();
    fireEvent.click(screen.getByRole('button', { name: /^Confirm placement$/i }));
    const form = await screen.findByRole('form', { name: /Confirm placement/i });
    fireEvent.click(within(form).getByRole('button', { name: /^Confirm placement$/i }));
    expect(bodies).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText(/Integration start date/i), {
      target: { value: '2026-09-20' },
    });
    fireEvent.change(within(form).getByLabelText(/Operational note/i), {
      target: { value: 'Note from operator' },
    });
    fireEvent.click(within(form).getByRole('button', { name: /^Confirm placement$/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      integrationStartDate: '2026-09-20T00:00:00.000Z',
      operationalNote: 'Note from operator',
      eligibleForInvoicing: false,
    });
  });

  it('drops a stale form after switching missions before submit', async () => {
    const confirmCalls: string[] = [];
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [
            syntheticMission(MISSION_A_ID, 'Mission Alpha'),
            syntheticMission(MISSION_B_ID, 'Mission Beta'),
          ],
          pagination: { page: 1, pageSize: 20, total: 2 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      if (call.path === `/v1/missions/${MISSION_B_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_B_ID, 'Mission Beta') });
      }
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path === `/v1/missions/${MISSION_B_ID}/candidates`) {
        return jsonResponse({
          candidates: [PROCESS_B],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path.includes('/confirm-placement')) {
        confirmCalls.push(call.path);
      }
      return undefined;
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    await openAcceptedOfferProcess();
    fireEvent.click(screen.getByRole('button', { name: /^Confirm placement$/i }));
    await screen.findByRole('form', { name: /Confirm placement/i });
    fireEvent.click(screen.getByRole('button', { name: /Mission Beta/ }));
    expect(screen.queryByRole('form', { name: /Confirm placement/i })).not.toBeInTheDocument();
    expect(confirmCalls).toHaveLength(0);
  });

  it('renders French confirmation labels', async () => {
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      return undefined;
    });

    render(
      <I18nProvider initialLocale="fr">
        <MissionsPanel
          accessToken="token"
          actorUserId={ACTOR_ID}
          initialMissionId={null}
          onSelectionChange={() => undefined}
          permissions={[...PLACEMENT_PERMISSIONS]}
        />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    await openAcceptedOfferProcess('fr');
    fireEvent.click(screen.getByRole('button', { name: /^Confirmer le placement$/i }));
    expect(
      await screen.findByRole('form', { name: /Confirmer le placement/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Date de début d’intégration/i)).toBeInTheDocument();
  });

  it('does not show invoicing eligibility copy without view permission', async () => {
    const permissions = PLACEMENT_PERMISSIONS.filter(
      (permission) => permission !== 'placement_commercial_eligibility:view',
    );
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      return undefined;
    });

    renderPanel(permissions);
    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    await openAcceptedOfferProcess();
    fireEvent.click(screen.getByRole('button', { name: /^Confirm placement$/i }));
    const form = await screen.findByRole('form', { name: /Confirm placement/i });
    expect(within(form).queryByText(/Invoicing eligibility/i)).not.toBeInTheDocument();
  });
});
