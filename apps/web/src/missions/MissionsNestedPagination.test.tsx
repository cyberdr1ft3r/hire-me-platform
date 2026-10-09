import { EvaluationListResponseSchema } from '@hire-me/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/index.js';
import { MissionsPanel } from './MissionsPanel.js';
import {
  CLIENT_ID,
  MISSION_A_ID,
  MISSION_B_ID,
  RECRUITER_ID,
  deferred,
  jsonResponse,
  mockMissionApi,
  serverPage,
  syntheticAssignment,
  syntheticInterview,
  syntheticInterviewDetail,
  syntheticMission,
  syntheticProcess,
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
  'evaluations:view',
];

const ACTOR_ID = '12121212-1212-4121-8121-121212121212';
const PROCESS_A = syntheticProcess(MISSION_A_ID, 'Alex Candidate', { clientVisible: true });
const PROCESS_B = syntheticProcess(MISSION_B_ID, 'Bea Candidate', { clientVisible: true });

function manyAssignments(missionId: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    syntheticAssignment(missionId, `Member ${index + 1}`, {
      id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
      isLead: index === 0,
      role: index === 0 ? 'LEAD_RECRUITER' : 'RECRUITER',
    }),
  );
}

function manyInterviews(process: typeof PROCESS_A, count: number) {
  return Array.from({ length: count }, (_, index) =>
    syntheticInterview(process, `Organizer ${index + 1}`, {
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
    }),
  );
}

function manyEvaluations(count: number, interviewId: string, processId: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
    missionCandidateId: processId,
    interviewId,
    evaluationType: 'INTERNAL_HR' as const,
    status: 'SUBMITTED' as const,
    recommendation: null,
    recommended: null,
    authorDisplayName: `Author ${index + 1}`,
    authorUserId: RECRUITER_ID,
    scores: {
      overall: 4,
      communication: null,
      technical: null,
      roleFit: null,
      cultureFit: null,
      motivation: null,
      salaryAlignment: null,
    },
    strengths: null,
    weaknesses: null,
    risks: null,
    comment: null,
    redacted: false,
    clientVisible: false,
    internalOnly: true,
    finalOpinion: false,
    submittedAt: '2026-09-15T10:00:00.000Z',
    archivedAt: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  }));
}

function syntheticContact(displayName: string, index: number) {
  return {
    id: `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, '0')}`,
    clientId: CLIENT_ID,
    displayName,
    email: `contact${index}@example.test`,
    normalizedEmail: `contact${index}@example.test`,
    phone: null,
    roleTitle: 'Buyer',
    status: 'ACTIVE' as const,
    portalStatus: 'DISABLED' as const,
    archivedAt: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };
}

function renderPanel(
  permissions = VIEW,
  panelOverrides: Partial<ComponentProps<typeof MissionsPanel>> = {},
) {
  return render(
    <I18nProvider initialLocale="en">
      <MissionsPanel
        accessToken="token"
        actorUserId={ACTOR_ID}
        initialMissionId={null}
        onSelectionChange={() => undefined}
        permissions={permissions}
        {...panelOverrides}
      />
    </I18nProvider>,
  );
}

async function selectMissionAlpha(): Promise<void> {
  await screen.findByRole('button', { name: /Mission Alpha/ });
  fireEvent.click(screen.getByRole('button', { name: /Mission Alpha/ }));
}

async function openAlexProcess(): Promise<void> {
  await showMissionDetailTab('pipeline');
  fireEvent.click(await screen.findByRole('button', { name: /Open the process for Alex/i }));
  await screen.findByLabelText(/Schedule an interview/i);
}

function missionListHandler() {
  return jsonResponse({
    missions: [syntheticMission(MISSION_A_ID, 'Mission Alpha')],
    pagination: { page: 1, pageSize: 20, total: 1 },
  });
}

function missionDetailHandler() {
  return jsonResponse({ mission: syntheticMission(MISSION_A_ID, 'Mission Alpha') });
}

function assignmentHandler(
  assignments: unknown[],
  extra?: (call: { search: URLSearchParams }) => Response | undefined,
) {
  return (call: { method: string; path: string; search: URLSearchParams }) => {
    if (call.path === `/v1/missions/${MISSION_A_ID}/assignments` && call.method === 'GET') {
      const special = extra?.(call);
      if (special) return special;
      return jsonResponse(serverPage('assignments', assignments, call.search));
    }
    return undefined;
  };
}

function pipelineHandlers(process: typeof PROCESS_A) {
  return (call: {
    method: string;
    path: string;
    search: URLSearchParams;
    body: Record<string, unknown> | null;
  }) => {
    if (call.path === `/v1/missions/${MISSION_A_ID}/assignments`) {
      return jsonResponse(
        serverPage('assignments', [syntheticAssignment(MISSION_A_ID, 'Recruiter')], call.search),
      );
    }
    if (call.path === `/v1/missions/${MISSION_A_ID}/candidates`) {
      return jsonResponse({
        candidates: [process],
        pagination: { page: 1, pageSize: 20, total: 1 },
      });
    }
    if (call.path.endsWith('/offers')) return jsonResponse({ offer: null });
    if (call.path.endsWith('/placement')) return jsonResponse({ placement: null });
    return undefined;
  };
}

describe('Missions nested pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the next assignment page and keeps earlier rows visible', async () => {
    const assignments = manyAssignments(MISSION_A_ID, 25);
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') return missionListHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      const assignmentsResponse = assignmentHandler(assignments)(call);
      if (assignmentsResponse) return assignmentsResponse;
      if (call.path === `/v1/missions/${MISSION_A_ID}/candidates`) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await showMissionDetailTab('team');
    await screen.findByText('Member 1');
    fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
    await screen.findByText('Member 21');
    expect(screen.getByText('Member 1')).toBeInTheDocument();
    expect(screen.getByText('25 of 25 shown')).toBeInTheDocument();
  });

  it('disables load-more during an in-flight assignment append and avoids duplicate page requests', async () => {
    const assignments = manyAssignments(MISSION_A_ID, 25);
    const page2 = deferred<Response>();
    const pages: string[] = [];
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') return missionListHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}/assignments` && call.method === 'GET') {
        pages.push(call.search.get('page') ?? '');
        if (call.search.get('page') === '2') {
          return page2.promise;
        }
        return jsonResponse(serverPage('assignments', assignments, call.search));
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}/candidates`) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await showMissionDetailTab('team');
    await screen.findByText('Member 20');
    const loadMore = screen.getByRole('button', { name: /Show more/i });
    fireEvent.click(loadMore);
    await waitFor(() => expect(loadMore).toBeDisabled());
    fireEvent.click(loadMore);
    expect(pages.filter((page) => page === '2')).toHaveLength(1);

    await act(async () => {
      page2.resolve(
        jsonResponse(
          serverPage('assignments', assignments, new URLSearchParams('page=2&pageSize=20')),
        ),
      );
      await page2.promise;
      await Promise.resolve();
    });
    await screen.findByText('Member 25');
  });

  it('keeps assignment rows visible on append failure and retries the same page', async () => {
    const assignments = manyAssignments(MISSION_A_ID, 25);
    let page2Attempts = 0;
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') return missionListHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}/assignments` && call.method === 'GET') {
        if (call.search.get('page') === '2') {
          page2Attempts += 1;
          if (page2Attempts === 1) {
            return jsonResponse({ code: 'SERVER_ERROR', message: 'fail' }, 500);
          }
        }
        return jsonResponse(serverPage('assignments', assignments, call.search));
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}/candidates`) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await showMissionDetailTab('team');
    await screen.findByText('Member 20');
    fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(screen.getByText('Member 20')).toBeInTheDocument();
    expect(screen.getByText('20 of 25 shown')).toBeInTheDocument();
    const loadMoreRegion = screen.getByLabelText(/More team members/i);
    const retryLoadMore = within(loadMoreRegion).getByRole('button', { name: /^Try again$/i });
    await waitFor(() => expect(retryLoadMore).not.toBeDisabled());
    fireEvent.click(retryLoadMore);
    await waitFor(() => expect(page2Attempts).toBe(2));
    await screen.findByText('Member 25');
  });

  it('ignores a stale assignment response after switching missions', async () => {
    const late = deferred<Response>();
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
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      if (call.path === `/v1/missions/${MISSION_B_ID}` && call.method === 'GET') {
        return jsonResponse({ mission: syntheticMission(MISSION_B_ID, 'Mission Beta') });
      }
      if (call.path === `/v1/missions/${MISSION_A_ID}/assignments` && call.method === 'GET') {
        return late.promise;
      }
      if (call.path === `/v1/missions/${MISSION_B_ID}/assignments` && call.method === 'GET') {
        return jsonResponse(
          serverPage('assignments', [syntheticAssignment(MISSION_B_ID, 'Beta Only')], call.search),
        );
      }
      if (call.path.endsWith('/candidates')) {
        return jsonResponse({ candidates: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    fireEvent.click(screen.getByRole('button', { name: /Mission Beta/ }));
    await screen.findByText('Beta Only');
    await act(async () => {
      late.resolve(
        jsonResponse(
          serverPage(
            'assignments',
            manyAssignments(MISSION_A_ID, 25),
            new URLSearchParams('page=1&pageSize=20'),
          ),
        ),
      );
      await late.promise;
      await Promise.resolve();
    });
    expect(screen.queryByText('Member 1')).not.toBeInTheDocument();
  });

  it('accumulates interview page 2 and ignores stale old-process responses', async () => {
    const interviewsA = manyInterviews(PROCESS_A, 25);
    const interviewsB = manyInterviews(PROCESS_B, 1);
    const interviewPages: string[] = [];
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
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
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
      if (call.path.includes(`/candidates/${PROCESS_A.id}/interviews`) && call.method === 'GET') {
        interviewPages.push(call.search.get('page') ?? '');
        return jsonResponse(serverPage('interviews', interviewsA, call.search));
      }
      if (call.path.includes(`/candidates/${PROCESS_B.id}/interviews`)) {
        return jsonResponse(serverPage('interviews', interviewsB, call.search));
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await openAlexProcess();
    await screen.findByText(/Organizer 20/);
    expect(screen.getByText('20 of 25 shown')).toBeInTheDocument();
    const interviewLoadMore = within(screen.getByLabelText(/More interviews/i)).getByRole(
      'button',
      {
        name: /Show more/i,
      },
    );
    await waitFor(() => expect(interviewLoadMore).not.toBeDisabled());
    fireEvent.click(interviewLoadMore);
    await waitFor(
      () => expect(interviewPages.filter((page) => page === '2').length).toBeGreaterThan(0),
      {
        onTimeout: () => new Error(`interview pages requested: ${interviewPages.join(',')}`),
      },
    );
    await screen.findByText(/Organizer 21/);

    fireEvent.click(screen.getByRole('button', { name: /Mission Beta/ }));
    await showMissionDetailTab('pipeline');
    fireEvent.click(await screen.findByRole('button', { name: /Open the process for Bea/i }));
    await screen.findByText(/Organizer 1/);
    expect(screen.queryByText(/Organizer 21/)).not.toBeInTheDocument();
  });

  it('accumulates evaluation page 2 and ignores stale old-interview responses', async () => {
    const interviews = manyInterviews(PROCESS_A, 2);
    const interview1 = interviews[0]!;
    const interview2 = interviews[1]!;
    const evaluationsPage2 = manyEvaluations(25, interview1.id, PROCESS_A.id);
    const staleInterview1Evaluations = deferred<Response>();
    let interview1Page1Loads = 0;

    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') return missionListHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path.includes(`/v1/clients/${CLIENT_ID}/contacts`)) {
        return jsonResponse(serverPage('contacts', [], call.search));
      }
      if (call.path.includes('/evaluations') && call.method === 'GET') {
        if (call.path.includes(interview2.id)) {
          return jsonResponse({
            evaluations: [evaluationsPage2[0]!],
            pagination: { page: 1, pageSize: 20, total: 1 },
          });
        }
        if (call.path.includes(interview1.id)) {
          if (call.search.get('page') === '2') {
            return jsonResponse(serverPage('evaluations', evaluationsPage2, call.search));
          }
          interview1Page1Loads += 1;
          if (interview1Page1Loads === 1) {
            const body = serverPage(
              'evaluations',
              evaluationsPage2,
              new URLSearchParams('page=1&pageSize=20'),
            );
            EvaluationListResponseSchema.parse(body);
            return jsonResponse(body);
          }
          return staleInterview1Evaluations.promise;
        }
      }
      if (
        call.path.includes(`/candidates/${PROCESS_A.id}/interviews`) &&
        call.method === 'GET' &&
        !call.path.includes('/evaluations')
      ) {
        return jsonResponse(serverPage('interviews', interviews, call.search));
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await openAlexProcess();
    fireEvent.click((await screen.findAllByRole('button', { name: /^Details:/i }))[0]!);
    await waitFor(() => expect(screen.getAllByText(/By Author 1/).length).toBeGreaterThan(0));
    const evaluationsPagination = await screen.findByLabelText(/More evaluations/i);
    const loadMoreEvaluations = await within(evaluationsPagination).findByRole('button', {
      name: /Show more/i,
    });
    await waitFor(() => expect(loadMoreEvaluations).not.toBeDisabled());
    fireEvent.click(loadMoreEvaluations);
    await waitFor(() =>
      expect(
        within(screen.getByLabelText(/More evaluations/i)).getByText('25 of 25 shown'),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      within(screen.getByRole('row', { name: /Organizer 2/i })).getByRole('button', {
        name: /^Details:/i,
      }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByLabelText(/More evaluations/i)).getByText('1 of 1 shown'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      within(screen.getByRole('row', { name: /Organizer 1/i })).getByRole('button', {
        name: /^Details:/i,
      }),
    );
    fireEvent.click(
      within(screen.getByRole('row', { name: /Organizer 2/i })).getByRole('button', {
        name: /^Details:/i,
      }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByLabelText(/More evaluations/i)).getByText('1 of 1 shown'),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      staleInterview1Evaluations.resolve(
        jsonResponse(
          serverPage('evaluations', evaluationsPage2, new URLSearchParams('page=1&pageSize=20')),
        ),
      );
      await staleInterview1Evaluations.promise;
      await Promise.resolve();
    });
    expect(
      within(screen.getByLabelText(/More evaluations/i)).queryByText('25 of 25 shown'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText(/More evaluations/i)).getByText('1 of 1 shown'),
    ).toBeInTheDocument();
  });

  it('pages client contacts beyond 50 with search and ignores stale search responses', async () => {
    const contacts = Array.from({ length: 55 }, (_, index) =>
      syntheticContact(`Contact ${index + 1}`, index + 1),
    );
    const staleSearch = deferred<Response>();
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') return missionListHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path.includes('/interviews')) {
        return jsonResponse({ interviews: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (call.path.includes(`/v1/clients/${CLIENT_ID}/contacts`)) {
        const search = call.search.get('search') ?? '';
        if (search === 'stale-term') {
          return staleSearch.promise;
        }
        const filtered = contacts.filter((contact) =>
          contact.displayName.toLowerCase().includes(search.toLowerCase()),
        );
        return jsonResponse(
          serverPage('contacts', filtered.length ? filtered : contacts, call.search),
        );
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await openAlexProcess();
    const clientContactsGroup = screen.getByRole('group', { name: /Client contacts/i });
    await within(clientContactsGroup).findByRole('checkbox', { name: /^Contact 20$/i });
    expect(screen.getByText('20 of 55 shown')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByLabelText(/More client contacts/i)).getByRole('button', {
        name: /Show more/i,
      }),
    );
    await within(clientContactsGroup).findByRole('checkbox', { name: /^Contact 21$/i });
    fireEvent.change(screen.getByLabelText(/Search contacts/i), {
      target: { value: 'stale-term' },
    });
    fireEvent.change(screen.getByLabelText(/Search contacts/i), {
      target: { value: 'Contact 55' },
    });
    await within(clientContactsGroup).findByRole('checkbox', { name: /^Contact 55$/i });
    await act(async () => {
      staleSearch.resolve(
        jsonResponse(
          serverPage(
            'contacts',
            [syntheticContact('Stale Ghost', 999)],
            new URLSearchParams('search=stale-term'),
          ),
        ),
      );
      await staleSearch.promise;
      await Promise.resolve();
    });
    expect(screen.queryByRole('checkbox', { name: /Stale Ghost/i })).not.toBeInTheDocument();
    expect(
      within(clientContactsGroup).getByRole('checkbox', { name: /^Contact 55$/i }),
    ).toBeInTheDocument();
  });

  it('keeps client-contact selections across search changes and submits all selected IDs', async () => {
    const contacts = [syntheticContact('Contact Alpha', 1), syntheticContact('Contact Beta', 2)];
    const scheduleBodies: Record<string, unknown>[] = [];
    mockMissionApi((call) => {
      if (call.path === '/v1/missions' && call.method === 'GET') return missionListHandler();
      if (call.path === `/v1/missions/${MISSION_A_ID}` && call.method === 'GET')
        return missionDetailHandler();
      const pipe = pipelineHandlers(PROCESS_A)(call);
      if (pipe) return pipe;
      if (call.path.includes('/interviews') && call.method === 'GET') {
        return jsonResponse({ interviews: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (call.path.includes('/interviews') && call.method === 'POST') {
        scheduleBodies.push(call.body ?? {});
        return jsonResponse({
          interview: syntheticInterviewDetail(PROCESS_A, 'Recruiter'),
        });
      }
      if (call.path.includes(`/v1/clients/${CLIENT_ID}/contacts`)) {
        const search = (call.search.get('search') ?? '').toLowerCase();
        const filtered = contacts.filter((contact) =>
          contact.displayName.toLowerCase().includes(search),
        );
        return jsonResponse(serverPage('contacts', filtered, call.search));
      }
      return undefined;
    });

    renderPanel();
    await selectMissionAlpha();
    await openAlexProcess();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Contact Alpha/i }));
    fireEvent.change(screen.getByLabelText(/Search contacts/i), {
      target: { value: 'Beta' },
    });
    await screen.findByRole('checkbox', { name: /Contact Beta/i });
    fireEvent.click(screen.getByRole('checkbox', { name: /Contact Beta/i }));
    expect(screen.getByLabelText(/Selected client contacts/i)).toHaveTextContent('Contact Alpha');
    expect(screen.getByLabelText(/Selected client contacts/i)).toHaveTextContent('Contact Beta');

    fireEvent.change(
      screen
        .getByLabelText(/Schedule an interview/i)
        .closest('form')!
        .querySelector('[name="scheduledStartAt"]')!,
      {
        target: { value: '2026-12-01T10:00' },
      },
    );
    fireEvent.change(screen.getByLabelText(/Organizer/i), {
      target: { value: RECRUITER_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: /Schedule interview/i }));

    await waitFor(() => expect(scheduleBodies.length).toBe(1));
    expect(scheduleBodies[0]?.clientContactParticipantIds).toEqual(
      expect.arrayContaining([contacts[0]!.id, contacts[1]!.id]),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText(/Selected client contacts/i)).not.toBeInTheDocument(),
    );
  });
});
