import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  ReportingBreakdownsResponse,
  ReportingDrilldownResponse,
  ReportingPipelineResponse,
  ReportingSummaryResponse,
  ReportingTrendsResponse,
} from '@hire-me/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api.js';
import { I18nProvider } from '../i18n/index.js';
import { ReportingPanel } from './ReportingPanel.js';

/**
 * Deterministic race tests for the reporting container.
 *
 * The reporting client is replaced with functions that return promises the
 * test settles by hand, in exactly the order each scenario needs. Each test
 * then awaits the very promise the component awaited, which queues its own
 * continuation behind the component's, so every stale-response assertion runs
 * only after the stale callback has already had its chance to commit. There
 * are no timers and no sleeps.
 */

vi.mock('../api.js', () => ({
  exportReportingCsv: vi.fn(),
  getReportingBreakdowns: vi.fn(),
  getReportingDrilldown: vi.fn(),
  getReportingPipeline: vi.fn(),
  getReportingSummary: vi.fn(),
  getReportingTrends: vi.fn(),
}));

type Endpoint = 'breakdowns' | 'drilldown' | 'pipeline' | 'summary' | 'trends';

interface ReportingQueryArgument {
  clientId?: string;
  page?: number;
}

interface PendingRequest {
  accessToken: string;
  endpoint: Endpoint;
  promise: Promise<unknown>;
  query: ReportingQueryArgument;
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
}

const TOKEN_A = 'synthetic-session-a';
const TOKEN_B = 'synthetic-session-b';
const CLIENT_B = '11111111-1111-4111-8111-11111111111b';
const PERMISSIONS = ['reporting:recruitment:view'];

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

let pending: PendingRequest[] = [];

function track(endpoint: Endpoint) {
  return (accessToken: string, query: ReportingQueryArgument = {}) => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<unknown>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    pending.push({ accessToken, endpoint, promise, query, reject, resolve });
    return promise;
  };
}

/** Removes and returns the single outstanding request that matches. */
function take(endpoint: Endpoint, matches: (request: PendingRequest) => boolean): PendingRequest {
  const candidates = pending.filter((request) => request.endpoint === endpoint && matches(request));
  expect(candidates).toHaveLength(1);
  const request = candidates[0]!;
  pending = pending.filter((entry) => entry !== request);
  return request;
}

function summaryResponse(openMissions: number): ReportingSummaryResponse {
  return {
    summary: {
      aging: { overdueMissions: 0, stalePipelineProcesses: 0 },
      applications: { newInWindow: 1 },
      filters: FILTERS,
      interviews: { byStatus: [], byType: [], canceled: 0, completed: 1, scheduled: 1 },
      missions: {
        byState: [],
        closed: 0,
        closureEligible: 0,
        open: openMissions,
        requestedPositions: 2,
        total: openMissions,
      },
      offers: { accepted: 1, byCurrentStatus: [], rejected: 0, total: 1, withdrawn: 0 },
      pipeline: { byState: [], presentedToClient: 1, totalProcesses: 2 },
      placements: { byStatus: [], confirmed: 1, corrected: 0, requestedPositions: 2 },
      scope: SCOPE,
      window: WINDOW,
    },
  };
}

function pipelineResponse(): ReportingPipelineResponse {
  return {
    distributions: {
      interviewsByStatus: [],
      interviewsByType: [],
      missionsByState: [],
      offersByCurrentStatus: [],
      placementsByStatus: [],
      processesByState: [{ count: 2, key: 'HR_PRESELECTION' }],
    },
    filters: FILTERS,
    scope: SCOPE,
    window: WINDOW,
  };
}

function breakdownsResponse(): ReportingBreakdownsResponse {
  return {
    byClient: [
      {
        clientId: CLIENT_B,
        clientName: 'Client B',
        confirmedPlacements: 0,
        openMissions: 1,
        totalProcesses: 1,
      },
    ],
    byMission: [],
    byRecruiter: [],
    filters: FILTERS,
    scope: SCOPE,
    window: WINDOW,
  };
}

function trendsResponse(): ReportingTrendsResponse {
  return {
    filters: FILTERS,
    interval: 'week',
    scope: SCOPE,
    series: [
      { metric: 'processesCreated', points: [] },
      { metric: 'publicApplications', points: [] },
      { metric: 'interviewsScheduled', points: [] },
      { metric: 'offersCreated', points: [] },
      { metric: 'placementsConfirmed', points: [] },
    ],
    window: WINDOW,
  };
}

function drilldownResponse(page: number, candidate: string): ReportingDrilldownResponse {
  return {
    filters: FILTERS,
    pageInfo: { hasNextPage: true, page, pageSize: 25, total: 60 },
    rows: [
      {
        candidateDisplayName: candidate,
        candidateId: '55555555-5555-4555-8555-555555555555',
        clientId: '11111111-1111-4111-8111-111111111111',
        clientName: 'Atlas Industries',
        clientVisible: true,
        createdAt: '2026-08-24T09:12:00.000Z',
        missionId: '22222222-2222-4222-8222-222222222222',
        missionTitle: 'Senior Backend Engineer',
        pipelineState: 'PRESENTED_TO_CLIENT',
        presentedAt: null,
        processId: `66666666-6666-4666-8666-${String(page).padStart(12, '0')}`,
        responsibleRecruiterDisplayName: 'Yasmine Example',
        responsibleRecruiterUserId: '33333333-3333-4333-8333-333333333333',
        source: 'Referral',
        updatedAt: '2026-08-28T16:40:00.000Z',
      },
    ],
    scope: SCOPE,
    window: WINDOW,
  };
}

/** Settles the five reads of one full report load, identified by `matches`. */
async function resolveFullLoad(
  matches: (request: PendingRequest) => boolean,
  openMissions: number,
  candidate: string,
): Promise<void> {
  const summary = take('summary', matches);
  const pipeline = take('pipeline', matches);
  const breakdowns = take('breakdowns', matches);
  const trends = take('trends', matches);
  const drilldown = take('drilldown', (request) => matches(request) && request.query.page === 1);

  await act(async () => {
    summary.resolve(summaryResponse(openMissions));
    pipeline.resolve(pipelineResponse());
    breakdowns.resolve(breakdownsResponse());
    trends.resolve(trendsResponse());
    drilldown.resolve(drilldownResponse(1, candidate));
    // Awaiting the same five promises queues this continuation behind the
    // component's own, so the load has committed when it resumes.
    await Promise.all([summary, pipeline, breakdowns, trends, drilldown].map((r) => r.promise));
  });
  expect(screen.getByText(candidate)).toBeVisible();
}

const isFilterSetA = (request: PendingRequest) => request.query.clientId === undefined;
const isFilterSetB = (request: PendingRequest) => request.query.clientId === CLIENT_B;

function primaryMetrics() {
  return within(screen.getByLabelText('Key recruitment metrics'));
}

/** A/page1 ready, then Next clicked, leaving A/page2 pending. */
async function startStalePageRequest(): Promise<PendingRequest> {
  await resolveFullLoad(isFilterSetA, 7, 'A page 1 candidate');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const stalePage = take(
    'drilldown',
    (request) => isFilterSetA(request) && request.query.page === 2,
  );
  expect(screen.getByText('Loading drilldown rows…')).toBeInTheDocument();
  return stalePage;
}

/** Applies filter set B and settles its complete five-read load. */
async function applyFilterSetB(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Client'), { target: { value: CLIENT_B } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await resolveFullLoad(isFilterSetB, 77, 'B page 1 candidate');
}

function expectReportBIntact(): void {
  expect(screen.getByText('B page 1 candidate')).toBeVisible();
  expect(primaryMetrics().getByText('77')).toBeVisible();
  expect(screen.getByText('Page 1')).toBeVisible();
  // The table is idle: no pending-page status, no error, and paging usable.
  expect(screen.queryByText('Loading drilldown rows…')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
}

beforeEach(() => {
  pending = [];
  vi.mocked(api.getReportingSummary).mockImplementation(track('summary') as never);
  vi.mocked(api.getReportingPipeline).mockImplementation(track('pipeline') as never);
  vi.mocked(api.getReportingBreakdowns).mockImplementation(track('breakdowns') as never);
  vi.mocked(api.getReportingTrends).mockImplementation(track('trends') as never);
  vi.mocked(api.getReportingDrilldown).mockImplementation(track('drilldown') as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('reporting drilldown stale-response guard', () => {
  it('never lets an older page response replace the rows of a newer report', async () => {
    render(
      <I18nProvider initialLocale="en">
        <ReportingPanel accessToken={TOKEN_A} permissions={PERMISSIONS} />
      </I18nProvider>,
    );

    const stalePage = await startStalePageRequest();
    await applyFilterSetB();

    await act(async () => {
      stalePage.resolve(drilldownResponse(2, 'A page 2 candidate'));
      await stalePage.promise;
    });

    expect(screen.queryByText('A page 2 candidate')).toBeNull();
    expect(screen.queryByText('A page 1 candidate')).toBeNull();
    expectReportBIntact();
  });

  it('never lets an older page failure mark a newer report as failed', async () => {
    render(
      <I18nProvider initialLocale="en">
        <ReportingPanel accessToken={TOKEN_A} permissions={PERMISSIONS} />
      </I18nProvider>,
    );

    const stalePage = await startStalePageRequest();
    await applyFilterSetB();

    await act(async () => {
      stalePage.reject(new Error('stale page request failed'));
      await stalePage.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Unable to load this page of reporting rows.')).toBeNull();
    expectReportBIntact();
  });

  it('discards a pending page request when the session changes', async () => {
    const { rerender } = render(
      <I18nProvider initialLocale="en">
        <ReportingPanel accessToken={TOKEN_A} permissions={PERMISSIONS} />
      </I18nProvider>,
    );

    const stalePage = await startStalePageRequest();

    rerender(
      <I18nProvider initialLocale="en">
        <ReportingPanel accessToken={TOKEN_B} permissions={PERMISSIONS} />
      </I18nProvider>,
    );
    await resolveFullLoad((request) => request.accessToken === TOKEN_B, 77, 'B page 1 candidate');

    await act(async () => {
      stalePage.resolve(drilldownResponse(2, 'A page 2 candidate'));
      await stalePage.promise;
    });

    expect(stalePage.accessToken).toBe(TOKEN_A);
    expect(screen.queryByText('A page 2 candidate')).toBeNull();
    expectReportBIntact();
  });

  it('still commits the current page request of the current report', async () => {
    render(
      <I18nProvider initialLocale="en">
        <ReportingPanel accessToken={TOKEN_A} permissions={PERMISSIONS} />
      </I18nProvider>,
    );

    const currentPage = await startStalePageRequest();
    await act(async () => {
      currentPage.resolve(drilldownResponse(2, 'A page 2 candidate'));
      await currentPage.promise;
    });

    expect(screen.getByText('A page 2 candidate')).toBeVisible();
    expect(screen.getByText('Page 2')).toBeVisible();
    expect(screen.queryByText('Loading drilldown rows…')).toBeNull();
    expect(primaryMetrics().getByText('7')).toBeVisible();
  });
});
