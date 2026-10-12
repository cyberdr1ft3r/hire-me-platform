import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionsPanel } from './MissionsPanel.js';
import { resolveMissionAccess } from './mission-access.js';
import { MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS } from './mission-test-personas.js';
import {
  ACTOR_ID,
  MISSION_A_ID,
  jsonResponse,
  mockMissionApi,
  syntheticAssignment,
  syntheticMission,
  syntheticProcess,
} from './mission-test-data.js';
import { showMissionDetailTab } from './mission-test-navigation.js';

describe('Missions read-only evidence persona (#159)', () => {
  const access = resolveMissionAccess(MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS);

  it('marks the canonical bundle as read-only with workspace access', () => {
    expect(access.canView).toBe(true);
    expect(access.readOnly).toBe(true);
  });

  it('enables read surfaces only where explicit read permissions exist', () => {
    expect(access.canViewAssignments).toBe(true);
    expect(access.canViewProcesses).toBe(true);
    expect(access.canViewInterviews).toBe(true);
    expect(access.canViewEvaluations).toBe(true);
    expect(access.canViewOffers).toBe(true);
    expect(access.canViewPlacements).toBe(true);
    expect(access.canViewPublicOpportunity).toBe(true);
    expect(access.canViewPublicApplications).toBe(true);
    expect(access.canViewClients).toBe(false);
    expect(access.canViewCandidates).toBe(false);
    expect(access.canViewPlacementCommercialEligibility).toBe(false);
  });

  it('denies every Missions-area write capability in the bundle', () => {
    expect(access.canCreate).toBe(false);
    expect(access.canUpdate).toBe(false);
    expect(access.canManageStatus).toBe(false);
    expect(access.canClose).toBe(false);
    expect(access.canArchive).toBe(false);
    expect(access.canManageAssignments).toBe(false);
    expect(access.canCreateProcesses).toBe(false);
    expect(access.canTransitionProcesses).toBe(false);
    expect(access.canTransferProcesses).toBe(false);
    expect(access.canPresentProcesses).toBe(false);
    expect(access.canScheduleInterviews).toBe(false);
    expect(access.canRescheduleInterviews).toBe(false);
    expect(access.canCompleteInterviews).toBe(false);
    expect(access.canCancelInterviews).toBe(false);
    expect(access.canArchiveInterviews).toBe(false);
    expect(access.canCreateEvaluations).toBe(false);
    expect(access.canFinalizeEvaluations).toBe(false);
    expect(access.canCreateOffers).toBe(false);
    expect(access.canUpdateOffers).toBe(false);
    expect(access.canSendOffers).toBe(false);
    expect(access.canRecordOfferResponses).toBe(false);
    expect(access.canWithdrawOffers).toBe(false);
    expect(access.canConfirmPlacements).toBe(false);
    expect(access.canCorrectPlacements).toBe(false);
    expect(access.canUpdatePlacementCommercialEligibility).toBe(false);
    expect(access.canManagePublicOpportunity).toBe(false);
    expect(access.canPublishPublicOpportunity).toBe(false);
  });

  it('does not treat commercial eligibility view as an update grant', () => {
    const withView = resolveMissionAccess([
      ...MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS,
      'placement_commercial_eligibility:view',
    ]);
    expect(withView.canViewPlacementCommercialEligibility).toBe(true);
    expect(withView.readOnly).toBe(true);
    expect(withView.canUpdatePlacementCommercialEligibility).toBe(false);
  });

  it('treats commercial eligibility update as not read-only', () => {
    const withUpdate = resolveMissionAccess([
      'missions:view',
      'placement_commercial_eligibility:update',
    ]);
    expect(withUpdate.readOnly).toBe(false);
    expect(withUpdate.canUpdatePlacementCommercialEligibility).toBe(true);
  });
});

describe('Missions read-only evidence persona in the workspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads mission list and detail without write controls', async () => {
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
      if (call.path.endsWith('/assignments')) {
        return jsonResponse({
          assignments: [syntheticAssignment(MISSION_A_ID, 'Recruiter One')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path.endsWith('/candidates')) {
        return jsonResponse({
          candidates: [syntheticProcess(MISSION_A_ID, 'Alex Candidate')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (call.path.endsWith('/public-opportunity') && call.method === 'GET') {
        return jsonResponse({ publicOpportunity: null });
      }
      if (call.path.endsWith('/applications')) {
        return jsonResponse({ applications: [] });
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
          permissions={[...MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS]}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Mission Alpha/ }));
    expect(await screen.findByText('Read-only access')).toBeVisible();
    expect(screen.queryByText('New mission')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save mission' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close mission' })).toBeNull();
    await showMissionDetailTab('team');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    await showMissionDetailTab('pipeline');
    fireEvent.click(await screen.findByRole('button', { name: /Open the process for Alex/i }));
    expect(screen.queryByRole('button', { name: 'Link candidate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule interview' })).toBeNull();
    await showMissionDetailTab('public');
    expect(screen.queryByRole('button', { name: /Publish/i })).toBeNull();
  });
});
