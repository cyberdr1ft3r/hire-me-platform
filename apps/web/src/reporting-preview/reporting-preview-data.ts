import type { AuthenticatedUser } from '@hire-me/contracts';

import type { ReportingData } from '../reporting/index.js';

/**
 * Synthetic reporting data for the development-only review surface.
 *
 * None of it is real: the identifiers are fixed placeholder UUIDs, the names are
 * obviously invented, and the timestamps are pinned so the preview renders the
 * same formatted output on every machine. It exists so the real dashboard can
 * be reviewed without an API, a database, or any business record.
 */

const WINDOW = { end: '2026-09-01T00:00:00.000Z', start: '2026-06-01T00:00:00.000Z' } as const;

const SCOPE = { authorizedMissionCount: 18, kind: 'broad' } as const;

const FILTERS = {
  clientId: null,
  missionId: null,
  offerStatus: null,
  placementStatus: null,
  pipelineState: null,
  recruiterUserId: null,
  source: null,
} as const;

const CLIENT_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111112',
  '11111111-1111-4111-8111-111111111113',
] as const;

const MISSION_IDS = [
  '22222222-2222-4222-8222-222222222221',
  '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222223',
] as const;

const RECRUITER_IDS = [
  '33333333-3333-4333-8333-333333333331',
  '33333333-3333-4333-8333-333333333332',
] as const;

export const previewUser: AuthenticatedUser = {
  displayName: 'Preview Reviewer',
  email: 'preview@example.test',
  id: '44444444-4444-4444-8444-444444444444',
  permissions: [
    'reporting:recruitment:view',
    'reporting:recruitment:export',
    'missions:view',
    'candidates:view',
    'tasks:view',
  ],
};

/** Weekly buckets across the synthetic window. */
const WEEKS = [
  '2026-06-01T00:00:00.000Z',
  '2026-06-08T00:00:00.000Z',
  '2026-06-15T00:00:00.000Z',
  '2026-06-22T00:00:00.000Z',
  '2026-06-29T00:00:00.000Z',
  '2026-07-06T00:00:00.000Z',
  '2026-07-13T00:00:00.000Z',
  '2026-07-20T00:00:00.000Z',
  '2026-07-27T00:00:00.000Z',
  '2026-08-03T00:00:00.000Z',
  '2026-08-10T00:00:00.000Z',
  '2026-08-17T00:00:00.000Z',
  '2026-08-24T00:00:00.000Z',
];

function series(metric: ReportingData['trends']['series'][number]['metric'], counts: number[]) {
  return {
    metric,
    points: WEEKS.map((bucketStart, index) => ({ bucketStart, count: counts[index] ?? 0 })),
  };
}

const DRILLDOWN_ROWS = [
  [
    'Senior Backend Engineer',
    'Atlas Industries',
    'Nadia Example',
    'PRESENTED_TO_CLIENT',
    'Yasmine Example',
    'Referral',
  ],
  [
    'Senior Backend Engineer',
    'Atlas Industries',
    'Omar Example',
    'CLIENT_INTERVIEW_1',
    'Yasmine Example',
    'Public opportunity',
  ],
  [
    'Data Analyst',
    'Northwind Retail',
    'Sara Example',
    'HR_INTERVIEW_COMPLETED',
    'Karim Example',
    'Public opportunity',
  ],
  ['Data Analyst', 'Northwind Retail', 'Youssef Example', 'CV_TO_REVIEW', 'Karim Example', null],
  [
    'Field Technician',
    'Meridian Logistics',
    'Leila Example',
    'ACCEPTED',
    'Yasmine Example',
    'Direct application',
  ],
  [
    'Field Technician',
    'Meridian Logistics',
    'Hamza Example',
    'CLIENT_REJECTED',
    'Karim Example',
    'Referral',
  ],
  [
    'Site Supervisor',
    'Meridian Logistics',
    'Imane Example',
    'INTEGRATED',
    'Yasmine Example',
    'Direct application',
  ],
  [
    'Site Supervisor',
    'Meridian Logistics',
    'Rachid Example',
    'HR_PRESELECTION',
    'Karim Example',
    null,
  ],
] as const;

export const populatedReportingData: ReportingData = {
  breakdowns: {
    byClient: CLIENT_IDS.map((clientId, index) => ({
      clientId,
      clientName: ['Atlas Industries', 'Northwind Retail', 'Meridian Logistics'][index]!,
      confirmedPlacements: [3, 1, 2][index]!,
      openMissions: [4, 2, 3][index]!,
      totalProcesses: [24, 11, 19][index]!,
    })),
    byMission: MISSION_IDS.map((missionId, index) => ({
      clientId: CLIENT_IDS[index]!,
      clientName: ['Atlas Industries', 'Northwind Retail', 'Meridian Logistics'][index]!,
      confirmedPlacements: [2, 1, 1][index]!,
      missionId,
      missionTitle: ['Senior Backend Engineer', 'Data Analyst', 'Field Technician'][index]!,
      requestedPositions: [3, 2, 4][index]!,
      state: 'CANDIDATE_PRESENTATION' as const,
      totalProcesses: [12, 8, 14][index]!,
    })),
    byRecruiter: RECRUITER_IDS.map((recruiterUserId, index) => ({
      activeProcesses: [17, 12][index]!,
      confirmedPlacements: [4, 2][index]!,
      recruiterDisplayName: ['Yasmine Example', 'Karim Example'][index]!,
      recruiterUserId,
    })),
    filters: FILTERS,
    scope: SCOPE,
    window: WINDOW,
  },
  drilldown: {
    filters: FILTERS,
    pageInfo: { hasNextPage: true, page: 1, pageSize: 25, total: 54 },
    rows: DRILLDOWN_ROWS.map((row, index) => ({
      candidateDisplayName: row[2],
      candidateId: `55555555-5555-4555-8555-00000000000${index}`,
      clientId: CLIENT_IDS[index % CLIENT_IDS.length]!,
      clientName: row[1],
      clientVisible: index % 2 === 0,
      createdAt: '2026-08-24T09:12:00.000Z',
      missionId: MISSION_IDS[index % MISSION_IDS.length]!,
      missionTitle: row[0],
      pipelineState: row[3],
      presentedAt: index % 2 === 0 ? '2026-08-26T14:00:00.000Z' : null,
      processId: `66666666-6666-4666-8666-00000000000${index}`,
      responsibleRecruiterDisplayName: row[4],
      responsibleRecruiterUserId: RECRUITER_IDS[index % RECRUITER_IDS.length]!,
      source: row[5],
      updatedAt: '2026-08-28T16:40:00.000Z',
    })),
    scope: SCOPE,
    window: WINDOW,
  },
  pipeline: {
    distributions: {
      interviewsByStatus: [],
      interviewsByType: [],
      missionsByState: [],
      offersByCurrentStatus: [],
      placementsByStatus: [],
      processesByState: [
        { count: 14, key: 'HR_PRESELECTION' },
        { count: 11, key: 'CV_TO_REVIEW' },
        { count: 9, key: 'PRESENTED_TO_CLIENT' },
        { count: 7, key: 'CLIENT_INTERVIEW_1' },
        { count: 5, key: 'HR_INTERVIEW_COMPLETED' },
        { count: 4, key: 'CLIENT_OFFER' },
        { count: 3, key: 'ACCEPTED' },
        { count: 1, key: 'INTEGRATED' },
      ],
    },
    filters: FILTERS,
    scope: SCOPE,
    window: WINDOW,
  },
  summary: {
    aging: { overdueMissions: 2, stalePipelineProcesses: 6 },
    applications: { newInWindow: 37 },
    filters: FILTERS,
    interviews: {
      byStatus: [],
      byType: [],
      canceled: 3,
      completed: 21,
      scheduled: 8,
    },
    missions: {
      byState: [],
      closed: 5,
      closureEligible: 2,
      open: 9,
      requestedPositions: 21,
      total: 18,
    },
    offers: { accepted: 6, byCurrentStatus: [], rejected: 2, total: 11, withdrawn: 1 },
    pipeline: { byState: [], presentedToClient: 9, totalProcesses: 54 },
    placements: { byStatus: [], confirmed: 6, corrected: 1, requestedPositions: 21 },
    scope: SCOPE,
    window: WINDOW,
  },
  trends: {
    filters: FILTERS,
    interval: 'week',
    scope: SCOPE,
    series: [
      series('processesCreated', [4, 6, 3, 7, 5, 2, 8, 6, 4, 5, 3, 1, 0]),
      series('publicApplications', [3, 5, 2, 6, 4, 3, 5, 4, 2, 1, 3, 2, 1]),
      series('interviewsScheduled', [1, 2, 3, 2, 4, 1, 3, 5, 2, 3, 1, 2, 0]),
      series('offersCreated', [0, 1, 0, 2, 1, 0, 1, 2, 1, 1, 0, 2, 0]),
      series('placementsConfirmed', [0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0]),
    ],
    window: WINDOW,
  },
};

/** The same report shape with nothing in scope, for reviewing empty states. */
export const emptyReportingData: ReportingData = {
  breakdowns: {
    ...populatedReportingData.breakdowns,
    byClient: [],
    byMission: [],
    byRecruiter: [],
  },
  drilldown: {
    ...populatedReportingData.drilldown,
    pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
    rows: [],
  },
  pipeline: {
    ...populatedReportingData.pipeline,
    distributions: { ...populatedReportingData.pipeline.distributions, processesByState: [] },
  },
  summary: {
    ...populatedReportingData.summary,
    aging: { overdueMissions: 0, stalePipelineProcesses: 0 },
    applications: { newInWindow: 0 },
    interviews: { byStatus: [], byType: [], canceled: 0, completed: 0, scheduled: 0 },
    missions: {
      byState: [],
      closed: 0,
      closureEligible: 0,
      open: 0,
      requestedPositions: 0,
      total: 0,
    },
    offers: { accepted: 0, byCurrentStatus: [], rejected: 0, total: 0, withdrawn: 0 },
    pipeline: { byState: [], presentedToClient: 0, totalProcesses: 0 },
    placements: { byStatus: [], confirmed: 0, corrected: 0, requestedPositions: 0 },
  },
  trends: {
    ...populatedReportingData.trends,
    series: populatedReportingData.trends.series.map((entry) => ({
      metric: entry.metric,
      points: [],
    })),
  },
};
