import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '@hire-me/contracts';

import { I18nProvider } from '../i18n/index.js';
import type { Locale } from '../i18n/index.js';
import { AppShell } from '../ui/shell/AppShell.js';
import { ReportingPanel } from './ReportingPanel.js';

/**
 * Reporting behaviour tests.
 *
 * They exercise the real container against a stubbed `fetch`, so the assertions
 * cover what the surface actually asks the API for, what it renders from the
 * answer, and what it refuses to render — not CSS details.
 */

const ACCESS_TOKEN = 'synthetic-reporting-token';
const VIEW_ONLY = ['reporting:recruitment:view'];
const VIEW_AND_EXPORT = ['reporting:recruitment:view', 'reporting:recruitment:export'];

const WINDOW = { end: '2026-09-01T00:00:00.000Z', start: '2026-06-01T00:00:00.000Z' };
const SCOPE = { authorizedMissionCount: 4, kind: 'broad' as const };
const FILTERS = {
  clientId: null,
  missionId: null,
  offerStatus: null,
  placementStatus: null,
  pipelineState: null,
  recruiterUserId: null,
  source: null,
};

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const MISSION_ID = '22222222-2222-4222-8222-222222222222';
const RECRUITER_ID = '33333333-3333-4333-8333-333333333333';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function summaryBody() {
  return {
    summary: {
      aging: { overdueMissions: 3, stalePipelineProcesses: 5 },
      applications: { newInWindow: 12 },
      filters: FILTERS,
      interviews: { byStatus: [], byType: [], canceled: 1, completed: 9, scheduled: 4 },
      missions: {
        byState: [],
        closed: 2,
        closureEligible: 1,
        open: 7,
        requestedPositions: 15,
        total: 9,
      },
      offers: { accepted: 5, byCurrentStatus: [], rejected: 1, total: 8, withdrawn: 0 },
      pipeline: { byState: [], presentedToClient: 6, totalProcesses: 40 },
      placements: { byStatus: [], confirmed: 4, corrected: 0, requestedPositions: 15 },
      scope: SCOPE,
      window: WINDOW,
    },
  };
}

function pipelineBody(
  processesByState = [
    { count: 30, key: 'HR_PRESELECTION' },
    { count: 10, key: 'PRESENTED_TO_CLIENT' },
  ],
) {
  return {
    distributions: {
      interviewsByStatus: [],
      interviewsByType: [],
      missionsByState: [],
      offersByCurrentStatus: [],
      placementsByStatus: [],
      processesByState,
    },
    filters: FILTERS,
    scope: SCOPE,
    window: WINDOW,
  };
}

function breakdownsBody() {
  return {
    byClient: [
      {
        clientId: CLIENT_ID,
        clientName: 'Atlas Industries',
        confirmedPlacements: 2,
        openMissions: 3,
        totalProcesses: 20,
      },
    ],
    byMission: [
      {
        clientId: CLIENT_ID,
        clientName: 'Atlas Industries',
        confirmedPlacements: 1,
        missionId: MISSION_ID,
        missionTitle: 'Senior Backend Engineer',
        requestedPositions: 2,
        state: 'CANDIDATE_PRESENTATION',
        totalProcesses: 12,
      },
    ],
    byRecruiter: [
      {
        activeProcesses: 9,
        confirmedPlacements: 3,
        recruiterDisplayName: 'Yasmine Example',
        recruiterUserId: RECRUITER_ID,
      },
    ],
    filters: FILTERS,
    scope: SCOPE,
    window: WINDOW,
  };
}

function trendsBody(empty = false) {
  const points = empty
    ? []
    : [
        { bucketStart: '2026-06-01T00:00:00.000Z', count: 4 },
        { bucketStart: '2026-06-08T00:00:00.000Z', count: 7 },
      ];
  return {
    filters: FILTERS,
    interval: 'week',
    scope: SCOPE,
    series: [
      { metric: 'processesCreated', points },
      { metric: 'publicApplications', points: [] },
      { metric: 'interviewsScheduled', points: [] },
      { metric: 'offersCreated', points: [] },
      { metric: 'placementsConfirmed', points: [] },
    ],
    window: WINDOW,
  };
}

function drilldownRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    candidateDisplayName: `Candidate ${String(index)}`,
    candidateId: `55555555-5555-4555-8555-00000000000${String(index)}`,
    clientId: CLIENT_ID,
    clientName: 'Atlas Industries',
    clientVisible: true,
    createdAt: '2026-08-24T09:12:00.000Z',
    missionId: MISSION_ID,
    missionTitle: 'Senior Backend Engineer',
    pipelineState: 'PRESENTED_TO_CLIENT',
    presentedAt: '2026-08-26T14:00:00.000Z',
    processId: `66666666-6666-4666-8666-00000000000${String(index)}`,
    responsibleRecruiterDisplayName: 'Yasmine Example',
    responsibleRecruiterUserId: RECRUITER_ID,
    source: 'Referral',
    updatedAt: '2026-08-28T16:40:00.000Z',
    ...overrides,
  };
}

function drilldownBody({
  hasNextPage = true,
  page = 1,
  rows = [drilldownRow(1), drilldownRow(2)],
  total = 40,
}: { hasNextPage?: boolean; page?: number; rows?: unknown[]; total?: number } = {}) {
  return {
    filters: FILTERS,
    pageInfo: { hasNextPage, page, pageSize: 25, total },
    rows,
    scope: SCOPE,
    window: WINDOW,
  };
}

interface StubOptions {
  drilldownPages?: Record<number, ReturnType<typeof drilldownBody>>;
  emptyPipeline?: boolean;
  emptyTrends?: boolean;
  failDrilldownPages?: boolean;
  failExport?: boolean;
  failReads?: boolean;
}

function stubReportingApi(options: StubOptions = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);

    if (url.includes('/export.csv')) {
      if (options.failExport) {
        return Promise.resolve(new Response('{}', { status: 400 }));
      }
      return Promise.resolve(
        new Response('processId\r\nrow', {
          headers: {
            'Content-Disposition': 'attachment; filename="recruitment-report-20260901.csv"',
            'Content-Type': 'text/csv; charset=utf-8',
          },
        }),
      );
    }
    if (options.failReads) {
      return Promise.resolve(new Response('{}', { status: 500 }));
    }
    if (url.includes('/summary')) {
      return Promise.resolve(jsonResponse(summaryBody()));
    }
    if (url.includes('/pipeline')) {
      return Promise.resolve(jsonResponse(pipelineBody(options.emptyPipeline ? [] : undefined)));
    }
    if (url.includes('/breakdowns')) {
      return Promise.resolve(jsonResponse(breakdownsBody()));
    }
    if (url.includes('/trends')) {
      return Promise.resolve(jsonResponse(trendsBody(options.emptyTrends)));
    }
    if (url.includes('/drilldown')) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      if (page > 1 && options.failDrilldownPages) {
        return Promise.resolve(new Response('{}', { status: 500 }));
      }
      return Promise.resolve(
        jsonResponse(options.drilldownPages?.[page] ?? drilldownBody({ page })),
      );
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

function renderReporting(permissions: string[] = VIEW_ONLY, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <ReportingPanel accessToken={ACCESS_TOKEN} permissions={permissions} />
    </I18nProvider>,
  );
}

function requestedUrls(fetchMock: ReturnType<typeof stubReportingApi>): string[] {
  return fetchMock.mock.calls.map(([input]) =>
    input instanceof Request ? input.url : String(input),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('recruitment reporting dashboard', () => {
  it('shows a loading state without inventing zero values, then the report', async () => {
    stubReportingApi();
    renderReporting();

    expect(screen.getByText('Loading recruitment reporting…')).toBeInTheDocument();
    // No metric is rendered while its value is unknown.
    expect(screen.queryByText('Open missions')).toBeNull();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recruitment reporting' }),
    ).toBeVisible();
    expect(screen.getByText('Open missions')).toBeVisible();
    expect(screen.queryByText('Loading recruitment reporting…')).toBeNull();
  });

  it('loads the report once, from the five existing reporting reads', async () => {
    const fetchMock = stubReportingApi();
    renderReporting();
    await screen.findByText('Open missions');

    const urls = requestedUrls(fetchMock);
    expect(urls.filter((url) => url.includes('/summary'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/pipeline'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/breakdowns'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/trends'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/drilldown'))).toHaveLength(1);
    expect(urls.some((url) => url.includes('interval=week'))).toBe(true);
    expect(urls.some((url) => url.includes('page=1') && url.includes('pageSize=25'))).toBe(true);
  });

  it('keeps the reporting header, KPI hierarchy, and window metadata', async () => {
    stubReportingApi();
    renderReporting();
    await screen.findByText('Open missions');

    expect(screen.getByText('Recruitment')).toBeVisible();
    expect(
      screen.getByText('Monitor recruitment activity, pipeline movement, and placement outcomes.'),
    ).toBeVisible();
    expect(screen.getByText('Window 1 Jun 2026 to 1 Sept 2026')).toBeVisible();
    expect(screen.getByText('Reporting on all missions')).toBeVisible();

    const primary = screen.getByLabelText('Key recruitment metrics');
    expect(within(primary).getByText('Confirmed placements')).toBeVisible();
    const supporting = screen.getByLabelText('Supporting recruitment metrics');
    expect(within(supporting).getByText('Overdue missions')).toBeVisible();
  });

  it('localizes pipeline state labels without changing the stored value', async () => {
    stubReportingApi();
    renderReporting();
    await screen.findByText('Open missions');

    expect(screen.getByText('Pipeline distribution')).toBeVisible();
    expect(screen.getAllByText('Presented to client').length).toBeGreaterThan(0);
    expect(screen.getByText('HR preselection')).toBeVisible();
    // The raw enum value is never shown where a human label exists.
    expect(screen.queryByText('HR_PRESELECTION')).toBeNull();
  });

  it('localizes trend metric names and keeps every weekly count available as text', async () => {
    stubReportingApi();
    renderReporting();
    await screen.findByText('Open missions');

    expect(screen.getByText('Weekly trends')).toBeVisible();
    expect(screen.getAllByText('Processes created').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Placements confirmed').length).toBeGreaterThan(0);
    expect(screen.queryByText('processesCreated')).toBeNull();

    const table = screen.getByRole('table', {
      name: 'Weekly counts for every trend metric',
    });
    expect(within(table).getByRole('rowheader', { name: '1 Jun 2026' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: '8 Jun 2026' })).toBeInTheDocument();
  });

  it('renders the drilldown as a real table with column headers', async () => {
    stubReportingApi();
    renderReporting();
    await screen.findByText('Open missions');

    const table = screen.getByRole('table', { name: 'Candidate process drilldown' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent ?? '');
    expect(headers).toEqual([
      'Mission',
      'Client',
      'Candidate',
      'Pipeline state',
      'Recruiter',
      'Source',
      'Updated',
    ]);
    expect(screen.getByText('Candidate 1')).toBeVisible();
    expect(screen.getByText('40 results')).toBeVisible();
  });

  it('pages the drilldown without refetching the aggregates', async () => {
    const fetchMock = stubReportingApi({
      drilldownPages: {
        1: drilldownBody({ page: 1 }),
        2: drilldownBody({
          hasNextPage: false,
          page: 2,
          rows: [drilldownRow(9)],
        }),
      },
    });
    renderReporting();
    await screen.findByText('Candidate 1');

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Candidate 9')).toBeVisible();
    expect(screen.getByText('Page 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();

    const urls = requestedUrls(fetchMock);
    expect(urls.filter((url) => url.includes('/drilldown'))).toHaveLength(2);
    // Paging replaces the table only; the aggregates already cover the same scope.
    expect(urls.filter((url) => url.includes('/summary'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/trends'))).toHaveLength(1);
  });

  it('applies filters with the values the controls hold and restarts at page 1', async () => {
    const fetchMock = stubReportingApi({
      drilldownPages: {
        1: drilldownBody({ page: 1 }),
        2: drilldownBody({ hasNextPage: false, page: 2, rows: [drilldownRow(9)] }),
      },
    });
    renderReporting();
    await screen.findByText('Candidate 1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2');

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: CLIENT_ID } });
    fireEvent.change(screen.getByLabelText('Mission'), { target: { value: MISSION_ID } });
    fireEvent.change(screen.getByLabelText('Recruiter'), { target: { value: RECRUITER_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await screen.findByText('Page 1');

    const summaryCalls = requestedUrls(fetchMock).filter((url) => url.includes('/summary'));
    expect(summaryCalls).toHaveLength(2);
    const applied = summaryCalls[1] ?? '';
    expect(applied).toContain('start=2026-07-01T00%3A00%3A00.000Z');
    expect(applied).toContain(`clientId=${CLIENT_ID}`);
    expect(applied).toContain(`missionId=${MISSION_ID}`);
    expect(applied).toContain(`recruiterUserId=${RECRUITER_ID}`);

    const lastDrilldown = requestedUrls(fetchMock)
      .filter((url) => url.includes('/drilldown'))
      .at(-1);
    expect(lastDrilldown).toContain('page=1');
    expect(lastDrilldown).toContain(`clientId=${CLIENT_ID}`);
  });

  it('resets the controls and reloads the default report', async () => {
    const fetchMock = stubReportingApi();
    renderReporting();
    await screen.findByText('Candidate 1');

    fireEvent.change(screen.getByLabelText('Client'), { target: { value: CLIENT_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => {
      expect(requestedUrls(fetchMock).filter((url) => url.includes('/summary'))).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    await waitFor(() => {
      expect(requestedUrls(fetchMock).filter((url) => url.includes('/summary'))).toHaveLength(3);
    });
    expect(screen.getByLabelText('Client')).toHaveValue('');
    expect(
      requestedUrls(fetchMock)
        .filter((url) => url.includes('/summary'))
        .at(-1),
    ).not.toContain('clientId=');
  });

  it('switches language on the mounted dashboard without refetching the report', async () => {
    const fetchMock = stubReportingApi();
    const user: AuthenticatedUser = {
      displayName: 'Reporting Reviewer',
      email: 'reviewer@example.test',
      id: '44444444-4444-4444-8444-444444444444',
      permissions: VIEW_ONLY,
    };
    // One mount for the whole test: the real shell and its real language
    // control drive the locale while the same ReportingPanel stays mounted.
    render(
      <I18nProvider initialLocale="en">
        <AppShell
          apiState={{ message: 'ok', status: 'ready' }}
          currentRoute="reporting"
          onLogout={() => undefined}
          onNavigate={() => undefined}
          onRefreshUser={() => undefined}
          user={user}
        >
          <ReportingPanel accessToken={ACCESS_TOKEN} permissions={VIEW_ONLY} />
        </AppShell>
      </I18nProvider>,
    );
    await screen.findByText('Candidate 1');
    const table = screen.getByRole('table', { name: 'Candidate process drilldown' });

    const reportingReads = () =>
      requestedUrls(fetchMock).filter((url) => url.includes('/v1/reporting/recruitment/'));
    const readsBefore = reportingReads();
    expect(readsBefore).toHaveLength(5);

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    expect(await screen.findByText('Missions ouvertes')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Rapports de recrutement' }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');

    // The same table element is still in the document, now under its French
    // name, and still showing the rows that were loaded in English.
    expect(table.isConnected).toBe(true);
    expect(screen.getByRole('table', { name: 'Détail des processus candidats' })).toBe(table);
    expect(within(table).getByText('Candidate 1')).toBeVisible();
    expect(screen.queryByText('Chargement des rapports de recrutement…')).toBeNull();

    // A language change is a re-render only: none of the five reads repeats.
    expect(reportingReads()).toEqual(readsBefore);
    for (const endpoint of ['/summary', '/pipeline', '/breakdowns', '/trends', '/drilldown']) {
      expect(reportingReads().filter((url) => url.includes(endpoint))).toHaveLength(1);
    }
  });

  it('renders the whole dashboard in French', async () => {
    stubReportingApi();
    renderReporting(VIEW_AND_EXPORT, 'fr');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rapports de recrutement' }),
    ).toBeVisible();
    expect(screen.getByText('Recrutement')).toBeVisible();
    expect(screen.getByText('Missions ouvertes')).toBeVisible();
    expect(screen.getByText('Répartition du pipeline')).toBeVisible();
    expect(screen.getByText('Tendances hebdomadaires')).toBeVisible();
    expect(screen.getByText('Détail des processus candidats')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Appliquer les filtres' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exporter en CSV' })).toBeVisible();
    expect(screen.getByLabelText('Date de début')).toBeInTheDocument();
    expect(screen.getAllByText('Présenté au client').length).toBeGreaterThan(0);
  });

  it('shows a safe generic error with a retry that reruns the same load', async () => {
    const fetchMock = stubReportingApi({ failReads: true });
    renderReporting();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load recruitment reporting.');
    // No backend status, endpoint, or message text is disclosed.
    expect(alert).not.toHaveTextContent('500');
    expect(screen.queryByText('Open missions')).toBeNull();

    fetchMock.mockRestore();
    stubReportingApi();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Open missions')).toBeVisible();
  });

  it('localizes the safe error message in French', async () => {
    stubReportingApi({ failReads: true });
    renderReporting(VIEW_ONLY, 'fr');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les rapports de recrutement.',
    );
  });

  it('distinguishes an empty result from loading and from failure', async () => {
    stubReportingApi({
      drilldownPages: {
        1: drilldownBody({ hasNextPage: false, page: 1, rows: [], total: 0 }),
      },
      emptyPipeline: true,
      emptyTrends: true,
    });
    renderReporting();
    await screen.findByText('Open missions');

    expect(screen.getByText('No candidate processes in the selected scope.')).toBeVisible();
    expect(screen.getByText('No recruitment activity was recorded in this window.')).toBeVisible();
    expect(screen.getByText('No candidate processes match the selected filters.')).toBeVisible();
    // An empty result is not an error and never implies missing authorization.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Loading recruitment reporting…')).toBeNull();
  });

  it('hides the export action entirely without the export capability', async () => {
    stubReportingApi();
    renderReporting(VIEW_ONLY);
    await screen.findByText('Open missions');

    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });

  it('exports the server-provided file and reports success in the active language', async () => {
    const fetchMock = stubReportingApi();
    const createObjectURL = vi.fn(() => 'blob:reporting');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    renderReporting(VIEW_AND_EXPORT, 'fr');
    await screen.findByText('Missions ouvertes');

    fireEvent.click(screen.getByRole('button', { name: 'Exporter en CSV' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'recruitment-report-20260901.csv exporté.',
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:reporting');
    expect(requestedUrls(fetchMock).some((url) => url.includes('/export.csv'))).toBe(true);
  });

  it('exports with the filter controls as they stand, without applying or reloading', async () => {
    const fetchMock = stubReportingApi();
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:reporting'),
      revokeObjectURL: vi.fn(),
    });
    renderReporting(VIEW_AND_EXPORT);
    await screen.findByText('Candidate 1');

    // Edit two controls but never press Apply.
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: CLIENT_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Exported recruitment-report-20260901.csv.',
    );

    // As on the surface this redesign replaced, the export uses the values in
    // the controls, including edits that have not been applied yet.
    const exportRequest = requestedUrls(fetchMock).find((url) => url.includes('/export.csv'));
    expect(exportRequest).toContain(`clientId=${CLIENT_ID}`);
    expect(exportRequest).toContain('start=2026-07-01T00%3A00%3A00.000Z');

    // Exporting does not reload the dashboard, so the displayed report keeps
    // describing the filters it was loaded with.
    for (const endpoint of ['/summary', '/pipeline', '/breakdowns', '/trends', '/drilldown']) {
      expect(requestedUrls(fetchMock).filter((url) => url.includes(endpoint))).toHaveLength(1);
    }
    expect(requestedUrls(fetchMock).find((url) => url.includes('/summary'))).not.toContain(
      'clientId=',
    );
    expect(screen.getByText('Candidate 1')).toBeVisible();
    expect(screen.getByText('Window 1 Jun 2026 to 1 Sept 2026')).toBeVisible();
    expect(screen.getByLabelText('Client')).toHaveValue(CLIENT_ID);
  });

  it('reports a failed export without replacing the dashboard', async () => {
    stubReportingApi({ failExport: true });
    renderReporting(VIEW_AND_EXPORT);
    await screen.findByText('Open missions');

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to export recruitment reporting CSV.',
    );
    expect(screen.getByText('Open missions')).toBeVisible();
  });

  it('reports a failed page change without discarding the loaded report', async () => {
    stubReportingApi({ failDrilldownPages: true });
    renderReporting();
    await screen.findByText('Candidate 1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load this page of reporting rows.',
    );
    expect(screen.getByText('Open missions')).toBeVisible();
    expect(screen.getByText('Candidate 1')).toBeVisible();
  });
});
