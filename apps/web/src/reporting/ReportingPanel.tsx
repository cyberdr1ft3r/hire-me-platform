import { useEffect, useState } from 'react';

import {
  exportReportingCsv,
  getReportingBreakdowns,
  getReportingDrilldown,
  getReportingPipeline,
  getReportingSummary,
  getReportingTrends,
} from '../api.js';
import { ReportingDashboard } from './ReportingDashboard.js';
import {
  DRILLDOWN_PAGE_SIZE,
  EMPTY_REPORTING_FILTERS,
  REPORTING_EXPORT_PERMISSION,
  toReportingQuery,
  type ReportingExportFeedback,
  type ReportingFilterValues,
  type ReportingState,
  type ReportingTableState,
} from './reporting-state.js';
import { createRequestSequence } from './request-sequence.js';

/**
 * Container for the recruitment reporting surface.
 *
 * It owns everything with a consequence: the authenticated reads, the applied
 * filters, drilldown paging, the CSV export, and the export capability check.
 * `ReportingDashboard` below it is presentation only, so the visual work can
 * change without touching a single request, permission, or filter semantic.
 *
 * The reporting endpoints, their filter meaning, their record scope, and the
 * server-side authorization behind them are unchanged by this component.
 */
export function ReportingPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const canExport = permissions.includes(REPORTING_EXPORT_PERMISSION);
  const [formFilters, setFormFilters] = useState<ReportingFilterValues>(EMPTY_REPORTING_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<ReportingFilterValues>(EMPTY_REPORTING_FILTERS);
  const [report, setReport] = useState<ReportingState>({ status: 'loading' });
  const [tableState, setTableState] = useState<ReportingTableState>('idle');
  const [exportFeedback, setExportFeedback] = useState<ReportingExportFeedback | null>(null);
  /**
   * Two request sequences keep late responses from mixing reports.
   *
   * `reportRequests` advances with every full load, and when the session, the
   * applied filters, or the component itself goes away. `pageRequests` advances
   * with every drilldown page request and whenever a full load starts. A page
   * response may commit only while both still name the request that produced
   * it, so rows fetched for an earlier filter set, an earlier session, or a
   * superseded page can never land beside a newer report's aggregates.
   */
  const [reportRequests] = useState(createRequestSequence);
  const [pageRequests] = useState(createRequestSequence);

  /**
   * One logical load composed of the five reporting reads, exactly as before.
   *
   * The dependency list is deliberately narrow: the report reloads when the
   * session or the applied filters change, and never because the interface
   * language changed. Switching English and French re-renders labels and
   * `Intl` formatting only.
   */
  useEffect(() => {
    const isCurrentReport = reportRequests.next();
    // A page request belongs to the report that was showing when it started.
    pageRequests.invalidate();
    const query = toReportingQuery(appliedFilters);
    setReport({ status: 'loading' });
    setTableState('idle');
    setExportFeedback(null);

    void Promise.all([
      getReportingSummary(accessToken, query),
      getReportingPipeline(accessToken, query),
      getReportingBreakdowns(accessToken, query),
      getReportingTrends(accessToken, { ...query, interval: 'week' }),
      getReportingDrilldown(accessToken, { ...query, page: 1, pageSize: DRILLDOWN_PAGE_SIZE }),
    ])
      .then(([summary, pipeline, breakdowns, trends, drilldown]) => {
        if (!isCurrentReport()) {
          return;
        }
        setReport({
          data: { breakdowns, drilldown, pipeline, summary: summary.summary, trends },
          status: 'ready',
        });
      })
      .catch(() => {
        if (isCurrentReport()) {
          // Deliberately generic: the reporting surface never surfaces backend
          // error text, which could describe records outside the actor's scope.
          setReport({ status: 'error' });
        }
      });

    // Runs when the session or the applied filters change and on unmount, so a
    // superseded load and any page request started under it can no longer commit.
    return () => {
      reportRequests.invalidate();
      pageRequests.invalidate();
    };
  }, [accessToken, appliedFilters, pageRequests, reportRequests]);

  /** Applying filters commits the controls and restarts the report at page 1. */
  function handleApply(): void {
    setAppliedFilters({ ...formFilters });
  }

  function handleReset(): void {
    setFormFilters({ ...EMPTY_REPORTING_FILTERS });
    setAppliedFilters({ ...EMPTY_REPORTING_FILTERS });
  }

  /** Retry reruns the same load path rather than duplicating it. */
  function handleRetry(): void {
    setAppliedFilters((previous) => ({ ...previous }));
  }

  /**
   * Paging replaces the drilldown only. The aggregates already describe the
   * same filtered scope, so refetching them here would be duplicate traffic.
   *
   * Its success and its failure both commit only while this is still the
   * latest page request of the report that is still showing.
   */
  async function handlePageChange(page: number): Promise<void> {
    const isCurrentReport = reportRequests.current();
    const isLatestPage = pageRequests.next();
    const isCurrent = () => isCurrentReport() && isLatestPage();

    setTableState('loading');
    try {
      const drilldown = await getReportingDrilldown(accessToken, {
        ...toReportingQuery(appliedFilters),
        page,
        pageSize: DRILLDOWN_PAGE_SIZE,
      });
      if (!isCurrent()) {
        return;
      }
      setReport((previous) =>
        previous.status === 'ready'
          ? { data: { ...previous.data, drilldown }, status: 'ready' }
          : previous,
      );
      setTableState('idle');
    } catch {
      if (isCurrent()) {
        setTableState('error');
      }
    }
  }

  /**
   * The export is unchanged: the server decides the rows, the content, and the
   * filename, and the client only hands the bytes to the browser.
   *
   * Like the surface it replaced, it exports with the values currently in the
   * filter controls, whether or not they have been applied to the displayed
   * report yet, and it does not reload the dashboard first.
   */
  async function handleExport(): Promise<void> {
    setExportFeedback(null);
    try {
      const { filename, content } = await exportReportingCsv(
        accessToken,
        toReportingQuery(formFilters),
      );
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportFeedback({ filename, tone: 'success' });
    } catch {
      setExportFeedback({ tone: 'danger' });
    }
  }

  return (
    <ReportingDashboard
      canExport={canExport}
      exportFeedback={exportFeedback}
      filters={formFilters}
      onApply={handleApply}
      onExport={() => void handleExport()}
      onFiltersChange={setFormFilters}
      onPageChange={(page) => void handlePageChange(page)}
      onReset={handleReset}
      onRetry={handleRetry}
      report={report}
      tableState={tableState}
    />
  );
}
