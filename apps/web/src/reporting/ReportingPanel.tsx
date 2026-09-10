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
   * One logical load composed of the five reporting reads, exactly as before.
   *
   * The dependency list is deliberately narrow: the report reloads when the
   * session or the applied filters change, and never because the interface
   * language changed. Switching English and French re-renders labels and
   * `Intl` formatting only.
   */
  useEffect(() => {
    let active = true;
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
        if (!active) {
          return;
        }
        setReport({
          data: { breakdowns, drilldown, pipeline, summary: summary.summary, trends },
          status: 'ready',
        });
      })
      .catch(() => {
        if (active) {
          // Deliberately generic: the reporting surface never surfaces backend
          // error text, which could describe records outside the actor's scope.
          setReport({ status: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, appliedFilters]);

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
   */
  async function handlePageChange(page: number): Promise<void> {
    setTableState('loading');
    try {
      const drilldown = await getReportingDrilldown(accessToken, {
        ...toReportingQuery(appliedFilters),
        page,
        pageSize: DRILLDOWN_PAGE_SIZE,
      });
      setReport((previous) =>
        previous.status === 'ready'
          ? { data: { ...previous.data, drilldown }, status: 'ready' }
          : previous,
      );
      setTableState('idle');
    } catch {
      setTableState('error');
    }
  }

  /**
   * The export is unchanged: the server decides the rows, the content, and the
   * filename, and the client only hands the bytes to the browser.
   */
  async function handleExport(): Promise<void> {
    setExportFeedback(null);
    try {
      const { filename, content } = await exportReportingCsv(
        accessToken,
        toReportingQuery(appliedFilters),
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
