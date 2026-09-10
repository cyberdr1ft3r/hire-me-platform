import type {
  ReportingBreakdownsResponse,
  ReportingDrilldownResponse,
  ReportingPipelineResponse,
  ReportingSummary,
  ReportingTrendsResponse,
} from '@hire-me/contracts';

/** The reporting capability that additionally gates the CSV export action. */
export const REPORTING_EXPORT_PERMISSION = 'reporting:recruitment:export';

/**
 * Drilldown page size. The contract allows up to 200; 25 keeps one page
 * scannable and is the size this surface has always requested.
 */
export const DRILLDOWN_PAGE_SIZE = 25;

/** The five filters this surface exposes, exactly as the controls hold them. */
export interface ReportingFilterValues {
  clientId: string;
  end: string;
  missionId: string;
  recruiterUserId: string;
  start: string;
}

export const EMPTY_REPORTING_FILTERS: ReportingFilterValues = {
  clientId: '',
  end: '',
  missionId: '',
  recruiterUserId: '',
  start: '',
};

export interface ReportingQueryValues {
  clientId?: string;
  end?: string;
  missionId?: string;
  recruiterUserId?: string;
  start?: string;
}

/**
 * Turns the control values into the query the existing reporting client already
 * accepted. An empty control is omitted rather than sent as an empty value, so
 * the server keeps applying exactly the filters it applied before.
 */
export function toReportingQuery(filters: ReportingFilterValues): ReportingQueryValues {
  const toIso = (value: string): string | undefined =>
    value ? new Date(value).toISOString() : undefined;
  return {
    start: toIso(filters.start),
    end: toIso(filters.end),
    clientId: filters.clientId || undefined,
    missionId: filters.missionId || undefined,
    recruiterUserId: filters.recruiterUserId || undefined,
  };
}

export interface ReportingData {
  breakdowns: ReportingBreakdownsResponse;
  drilldown: ReportingDrilldownResponse;
  pipeline: ReportingPipelineResponse;
  summary: ReportingSummary;
  trends: ReportingTrendsResponse;
}

/**
 * The three states the report itself can be in. They are deliberately distinct
 * so loading, a failed request, and a genuinely empty result never share the
 * same blank area.
 */
export type ReportingState =
  { status: 'error' } | { status: 'loading' } | { data: ReportingData; status: 'ready' };

/** Local state of the drilldown while a single page is being replaced. */
export type ReportingTableState = 'error' | 'idle' | 'loading';

export type ReportingExportFeedback = { filename: string; tone: 'success' } | { tone: 'danger' };
