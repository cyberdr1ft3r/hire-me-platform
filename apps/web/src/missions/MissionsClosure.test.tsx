import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionLifecycle } from './MissionLifecycle.js';
import { MissionsPanel } from './MissionsPanel.js';
import { resolveMissionAccess } from './mission-access.js';
import { CLOSURE_REASON_BY_STATE } from './mission-labels.js';
import {
  MISSION_A_ID,
  MISSION_B_ID,
  jsonResponse,
  mockMissionApi,
  syntheticMission,
} from './mission-test-data.js';

const ACTOR_ID = '12121212-1212-4121-8121-121212121212';

const CLOSE_ACCESS = resolveMissionAccess([
  'missions:view',
  'missions:closure:manage',
  'missions:status:manage',
]);

function renderLifecycle(
  mission = syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'ACTIVE' }),
  overrides: Partial<ComponentProps<typeof MissionLifecycle>> = {},
) {
  const onClose = vi.fn();
  const view = render(
    <I18nProvider initialLocale="en">
      <MissionLifecycle
        access={CLOSE_ACCESS}
        mission={mission}
        onArchive={() => undefined}
        onClose={onClose}
        onMove={() => undefined}
        writesLocked={false}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onClose, ...view };
}

function closureSelect() {
  const form = screen.getByRole('form', { name: /Close mission/i });
  return within(form).getByRole('combobox', { name: /Closure outcome/i });
}

function closureOptions(): string[] {
  return within(closureSelect())
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('Mission closure lifecycle UX', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers only cancel from an early lifecycle state', () => {
    renderLifecycle(syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'DRAFT' }));
    expect(closureOptions()).toEqual(['Canceled']);
    expect(screen.queryByText(/Closed without recruitment/i)).not.toBeInTheDocument();
  });

  it('offers server-valid mid-pipeline closure outcomes', () => {
    renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'CANDIDATE_PRESENTATION' }),
    );
    expect(closureOptions()).toEqual(['Canceled', 'Closed without recruitment']);
  });

  it('offers successful recruitment closure only from probation monitoring', () => {
    const { unmount } = renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', {
        state: 'PROBATION_MONITORING',
        numberOfPositions: 2,
        filledPlacementCount: 2,
      }),
    );
    expect(closureOptions()).toEqual(['Closed with recruitment']);
    unmount();
    renderLifecycle(syntheticMission(MISSION_A_ID, 'Mission Beta', { state: 'OFFER_SENT' }));
    expect(closureOptions()).not.toContain('Closed with recruitment');
  });

  it('offers deadline-expired closure only where the server allows it', () => {
    const { unmount } = renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'CANDIDATE_SOURCING' }),
    );
    expect(closureOptions()).toEqual(['Canceled', 'Deadline expired']);
    unmount();
    renderLifecycle(syntheticMission(MISSION_A_ID, 'Mission Beta', { state: 'ACTIVE' }));
    expect(closureOptions()).toEqual(['Canceled']);
  });

  it('omits impossible closure states from the select', () => {
    renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'CLIENT_INTERVIEWS' }),
    );
    expect(closureOptions()).toEqual(['Canceled']);
    expect(screen.queryByText(/Deadline expired/i)).not.toBeInTheDocument();
  });

  it('updates the derived closure reason when the outcome changes', () => {
    renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'CANDIDATE_SOURCING' }),
    );
    const form = screen.getByRole('form', { name: /Close mission/i });
    expect(within(form).getByText(/Closed or canceled by the client/i)).toBeInTheDocument();
    fireEvent.change(closureSelect(), { target: { value: 'DEADLINE_EXPIRED_WITHOUT_RENEWAL' } });
    expect(within(form).getByText(/Deadline expired without renewal/i)).toBeInTheDocument();
    expect(within(form).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('resets an invalid selected outcome when mission state changes', () => {
    const { rerender } = renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'OFFER_SENT' }),
    );
    fireEvent.change(closureSelect(), { target: { value: 'DEADLINE_EXPIRED_WITHOUT_RENEWAL' } });
    expect((closureSelect() as HTMLSelectElement).value).toBe('DEADLINE_EXPIRED_WITHOUT_RENEWAL');
    rerender(
      <I18nProvider initialLocale="en">
        <MissionLifecycle
          access={CLOSE_ACCESS}
          mission={syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'ACTIVE' })}
          onArchive={() => undefined}
          onClose={() => undefined}
          onMove={() => undefined}
          writesLocked={false}
        />
      </I18nProvider>,
    );
    expect((closureSelect() as HTMLSelectElement).value).toBe('CANCELED');
  });

  it('does not render a closure form when no outcome is legal', () => {
    renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'WAITING_FOR_CLIENT_INFORMATION' }),
    );
    expect(screen.queryByRole('form', { name: /Close mission/i })).not.toBeInTheDocument();
  });

  it('submits the selected state, derived reason payload fields, and filled count', () => {
    const { onClose } = renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', {
        state: 'CANDIDATE_SOURCING',
        numberOfPositions: 3,
        filledPlacementCount: 1,
      }),
    );
    fireEvent.change(closureSelect(), { target: { value: 'DEADLINE_EXPIRED_WITHOUT_RENEWAL' } });
    fireEvent.change(screen.getByLabelText(/Filled positions/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Close mission$/i }));
    expect(onClose).toHaveBeenCalledWith({
      state: 'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
      filledPlacementCount: 2,
    });
    expect(CLOSURE_REASON_BY_STATE.DEADLINE_EXPIRED_WITHOUT_RENEWAL).toBe(
      'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
    );
  });

  it('blocks recruitment closure when filled count is below planned positions', () => {
    const { onClose } = renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', {
        state: 'PROBATION_MONITORING',
        numberOfPositions: 2,
        filledPlacementCount: 1,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Filled positions/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Close mission$/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/every planned position to be filled/i)).toBeInTheDocument();
  });

  it('blocks duplicate submission while writes are locked', () => {
    const { onClose } = renderLifecycle(
      syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'ACTIVE' }),
      { writesLocked: true },
    );
    expect(screen.getByRole('button', { name: /^Close mission$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Close mission$/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders French closure labels', () => {
    render(
      <I18nProvider initialLocale="fr">
        <MissionLifecycle
          access={CLOSE_ACCESS}
          mission={syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'ACTIVE' })}
          onArchive={() => undefined}
          onClose={() => undefined}
          onMove={() => undefined}
          writesLocked={false}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('form', { name: /Clôturer la mission/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Issue de la clôture/i)).toBeInTheDocument();
  });

  it('does not submit a stale closure outcome after switching missions in the panel', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const closeBodies: Record<string, unknown>[] = [];
    const missionAlpha = syntheticMission(MISSION_A_ID, 'Mission Alpha', { state: 'OFFER_SENT' });
    const missionBeta = syntheticMission(MISSION_B_ID, 'Mission Beta', { state: 'ACTIVE' });

    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') {
        return jsonResponse({
          missions: [missionAlpha, missionBeta],
          pagination: { page: 1, pageSize: 20, total: 2 },
        });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: missionAlpha });
      }
      if (call.path === `/v1/missions/${MISSION_B_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: missionBeta });
      }
      if (call.path.endsWith('/assignments')) {
        return jsonResponse({ assignments: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (call.path.endsWith('/candidates')) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (call.path.endsWith('/public-opportunity') && call.method === 'GET') {
        return jsonResponse({ publicOpportunity: null });
      }
      if (call.path.endsWith('/applications')) {
        return jsonResponse({ applications: [] });
      }
      if (call.path.endsWith('/close') && call.method === 'POST') {
        closeBodies.push(call.body ?? {});
        return jsonResponse({
          mission: syntheticMission(MISSION_B_ID, 'Mission Beta', { state: 'CANCELED' }),
        });
      }
      return undefined;
    });

    render(
      <I18nProvider initialLocale="en">
        <MissionsPanel
          accessToken="token"
          actorUserId={ACTOR_ID}
          initialMissionId={null}
          onSelectionChange={() => undefined}
          permissions={['missions:view', 'missions:closure:manage', 'mission_assignments:view']}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    const alphaForm = await screen.findByRole('form', { name: /Close mission/i });
    fireEvent.change(within(alphaForm).getByRole('combobox', { name: /Closure outcome/i }), {
      target: { value: 'DEADLINE_EXPIRED_WITHOUT_RENEWAL' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Mission Beta/ }));
    const betaForm = await screen.findByRole('form', { name: /Close mission/i });
    expect(within(betaForm).getByRole('combobox')).toHaveValue('CANCELED');
    fireEvent.click(within(betaForm).getByRole('button', { name: /^Close mission$/i }));
    await waitFor(() => expect(closeBodies).toHaveLength(1));
    expect(closeBodies[0]).toMatchObject({
      state: 'CANCELED',
      closureReason: CLOSURE_REASON_BY_STATE.CANCELED,
    });
    expect(closeBodies[0]?.state).not.toBe('DEADLINE_EXPIRED_WITHOUT_RENEWAL');
  });
});
