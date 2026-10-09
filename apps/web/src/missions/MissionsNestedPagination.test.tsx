import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionsPanel } from './MissionsPanel.js';
import {
  MISSION_A_ID,
  MISSION_B_ID,
  jsonResponse,
  mockMissionApi,
  serverPage,
  syntheticAssignment,
  syntheticMission,
} from './mission-test-data.js';
import { showMissionDetailTab } from './mission-test-navigation.js';

const VIEW = [
  'missions:view',
  'mission_assignments:view',
  'mission_candidates:view',
  'offers:view',
  'placements:view',
  'clients:view',
  'client_contacts:view',
  'interviews:view',
  'interviews:schedule',
];

function manyAssignments(missionId: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    syntheticAssignment(missionId, `Member ${index + 1}`, {
      id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
      isLead: index === 0,
      role: index === 0 ? 'LEAD_RECRUITER' : 'RECRUITER',
    }),
  );
}

const ACTOR_ID = '12121212-1212-4121-8121-121212121212';

function renderPanel(permissions = VIEW, locale: 'en' | 'fr' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MissionsPanel
        accessToken="token"
        actorUserId={ACTOR_ID}
        initialMissionId={null}
        onSelectionChange={() => undefined}
        permissions={permissions}
      />
    </I18nProvider>,
  );
}

describe('Missions nested pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the next assignment page and keeps earlier rows visible', async () => {
    const assignments = manyAssignments(MISSION_A_ID, 25);
    mockMissionApi((call) => {
      const { method, path } = call;
      if (path === '/v1/missions' && method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (path === `/v1/missions/${MISSION_A_ID}` && method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      if (path === `/v1/missions/${MISSION_A_ID}/assignments` && method === 'GET') {
        return jsonResponse(serverPage('assignments', assignments, call.search));
      }
      if (path === `/v1/missions/${MISSION_A_ID}/candidates`) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await screen.findByRole('button', { name: /Mission Alpha/ });
    fireEvent.click(screen.getByRole('button', { name: /Mission Alpha/ }));
    await showMissionDetailTab('team');
    await screen.findByText('Member 1');
    expect(screen.getByText('Member 20')).toBeInTheDocument();
    expect(screen.queryByText('Member 21')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
    await screen.findByText('Member 21');
    expect(screen.getByText('Member 1')).toBeInTheDocument();
    expect(screen.getByText('25 of 25 shown')).toBeInTheDocument();
  });

  it('ignores a stale assignment response after switching missions', async () => {
    const deferred = {
      resolve: null as null | ((response: Response) => void),
      promise: null as null | Promise<Response>,
    };
    deferred.promise = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });
    mockMissionApi((call) => {
      const { method, path } = call;
      if (path === '/v1/missions' && method === 'GET') {
        return jsonResponse({
          missions: [
            syntheticMission(MISSION_A_ID, 'Mission Alpha'),
            syntheticMission(MISSION_B_ID, 'Mission Beta'),
          ],
          pagination: { page: 1, pageSize: 20, total: 2 },
        });
      }
      if (path === `/v1/missions/${MISSION_A_ID}` && method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      if (path === `/v1/missions/${MISSION_B_ID}` && method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_B_ID, 'Mission Beta') });
      }
      if (path === `/v1/missions/${MISSION_A_ID}/assignments` && method === 'GET') {
        return deferred.promise!;
      }
      if (path === `/v1/missions/${MISSION_B_ID}/assignments` && method === 'GET') {
        return jsonResponse(
          serverPage('assignments', [syntheticAssignment(MISSION_B_ID, 'Beta Only')], call.search),
        );
      }
      if (path.endsWith('/candidates')) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await screen.findByRole('button', { name: /Mission Alpha/ });
    fireEvent.click(screen.getByRole('button', { name: /Mission Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: /Mission Beta/ }));
    await screen.findByText('Beta Only');

    await act(async () => {
      deferred.resolve!(
        jsonResponse(
          serverPage(
            'assignments',
            manyAssignments(MISSION_A_ID, 25),
            new URLSearchParams('page=1&pageSize=20'),
          ),
        ),
      );
      await deferred.promise;
      await Promise.resolve();
    });

    expect(screen.queryByText('Member 1')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Only')).toBeInTheDocument();
  });

  it('passes page parameters when listing mission interviews', async () => {
    const interviewCalls: URLSearchParams[] = [];
    mockMissionApi((call) => {
      const { method, path } = call;
      if (path === '/v1/missions' && method === 'GET') {
        return jsonResponse({
          missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (path === `/v1/missions/${MISSION_A_ID}` && method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
      }
      if (path === `/v1/missions/${MISSION_A_ID}/assignments`) {
        return jsonResponse(
          serverPage('assignments', [syntheticAssignment(MISSION_A_ID, 'Recruiter')], call.search),
        );
      }
      if (path === `/v1/missions/${MISSION_A_ID}/candidates`) {
        return jsonResponse({
          candidates: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              missionId: MISSION_A_ID,
              candidateId: '88888888-8888-4888-8888-888888888888',
              candidate: {
                id: '88888888-8888-4888-8888-888888888888',
                displayName: 'Alex Candidate',
                firstName: 'Alex',
                lastName: 'Candidate',
                email: 'alex@example.test',
                normalizedEmail: 'alex@example.test',
                phone: null,
                city: null,
                country: null,
                currentJobTitle: null,
                professionalSummary: null,
                linkedinUrl: null,
                status: 'ACTIVE',
                source: null,
                sourceDetail: null,
                availabilityNotice: null,
                compensation: null,
                consent: null,
                archivedAt: null,
                createdAt: '2026-09-15T10:00:00.000Z',
                updatedAt: '2026-09-15T10:00:00.000Z',
              },
              responsibleRecruiterUserId: '77777777-7777-4777-8777-777777777777',
              responsibleRecruiterDisplayName: 'Recruiter',
              state: 'NEW',
              rank: null,
              source: 'MANUAL',
              sourceContext: null,
              priority: 'NORMAL',
              internalNotes: null,
              outcomeReason: null,
              clientVisible: true,
              presentedAt: null,
              presentedByUserId: null,
              placementConfirmedAt: null,
              placementConfirmedByUserId: null,
              archivedAt: null,
              createdAt: '2026-09-15T10:00:00.000Z',
              updatedAt: '2026-09-15T10:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1 },
        });
      }
      if (path.endsWith('/offers')) {
        return jsonResponse({ offer: null });
      }
      if (path.endsWith('/placement')) {
        return jsonResponse({ placement: null });
      }
      if (path.endsWith('/interviews')) {
        interviewCalls.push(call.search);
        return jsonResponse({ interviews: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await screen.findByRole('button', { name: /Mission Alpha/ });
    fireEvent.click(screen.getByRole('button', { name: /Mission Alpha/ }));
    await showMissionDetailTab('pipeline');
    fireEvent.click(await screen.findByRole('button', { name: /Open the process for Alex/i }));
    await waitFor(() => expect(interviewCalls.length).toBeGreaterThan(0));
    expect(interviewCalls[0]?.get('page')).toBe('1');
    expect(interviewCalls[0]?.get('pageSize')).toBe('20');
  });
});
