import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, PageHeader, Skeleton } from '../ui/index.js';
import { ReportingDrilldown } from './ReportingDrilldown.js';
import { ReportingFilters } from './ReportingFilters.js';
import { ReportingMetrics } from './ReportingMetrics.js';
import { ReportingPipeline } from './ReportingPipeline.js';
import { ReportingTrends } from './ReportingTrends.js';
import type {
  ReportingExportFeedback,
  ReportingFilterValues,
  ReportingState,
  ReportingTableState,
} from './reporting-state.js';

export interface ReportingDashboardProps {
  canExport: boolean;
  exportFeedback: ReportingExportFeedback | null;
  filters: ReportingFilterValues;
  onApply: () => void;
  onExport: () => void;
  onFiltersChange: (filters: ReportingFilterValues) => void;
  onPageChange: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  report: ReportingState;
  tableState: ReportingTableState;
}

/**
 * The recruitment reporting presentation.
 *
 * It performs no request and holds no permission logic: what it can render is
 * decided entirely by its props, which is what lets the synthetic review
 * surface show the real dashboard without an API or any business data.
 */
export function ReportingDashboard({
  canExport,
  exportFeedback,
  filters,
  onApply,
  onExport,
  onFiltersChange,
  onPageChange,
  onReset,
  onRetry,
  report,
  tableState,
}: ReportingDashboardProps) {
  const { formatDate, t } = useI18n();
  const ready = report.status === 'ready' ? report.data : null;

  return (
    <div className="reporting">
      <PageHeader
        description={t('reporting.header.description')}
        eyebrow={t('reporting.header.eyebrow')}
        metadata={
          ready ? (
            <>
              <span>
                {/*
                  The window arrives as ISO timestamps. Formatting it in UTC
                  keeps the printed dates identical on every machine instead of
                  shifting with the reviewer's own timezone.
                */}
                {t('reporting.header.window', {
                  end: formatDate(ready.summary.window.end, { timeZone: 'UTC' }),
                  start: formatDate(ready.summary.window.start, { timeZone: 'UTC' }),
                })}
              </span>
              <span>
                {t('reporting.header.scope', {
                  scope: t(`domain.reportingScope.${ready.summary.scope.kind}`),
                })}
              </span>
            </>
          ) : undefined
        }
        primaryAction={
          // Without the export capability the action does not exist. It is never
          // rendered in a disabled form, which would still disclose it.
          canExport ? <Button onClick={onExport}>{t('reporting.export.action')}</Button> : undefined
        }
        title={t('reporting.header.title')}
      />

      <ReportingFilters
        busy={report.status === 'loading'}
        clients={ready?.breakdowns.byClient ?? []}
        missions={ready?.breakdowns.byMission ?? []}
        onApply={onApply}
        onChange={onFiltersChange}
        onReset={onReset}
        recruiters={ready?.breakdowns.byRecruiter ?? []}
        values={filters}
      />

      {exportFeedback ? (
        <InlineMessage
          announce
          title={t('reporting.feedback.exportTitle')}
          tone={exportFeedback.tone}
        >
          {exportFeedback.tone === 'success'
            ? t('reporting.feedback.exportSuccess', { filename: exportFeedback.filename })
            : t('reporting.feedback.exportError')}
        </InlineMessage>
      ) : null}

      {report.status === 'error' ? (
        <InlineMessage announce title={t('reporting.states.errorTitle')} tone="danger">
          <p className="reporting__message-text">{t('reporting.states.error')}</p>
          <Button onClick={onRetry} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </InlineMessage>
      ) : null}

      {report.status === 'loading' ? (
        <div aria-busy="true" className="reporting__loading">
          <Skeleton label={t('reporting.states.loading')} />
          {/*
            Placeholders only. No metric is rendered while its value is unknown,
            so the band never shows a zero that is really "not loaded yet".
          */}
          <div aria-hidden="true" className="reporting__placeholder-band">
            <span className="reporting__placeholder-tile" />
            <span className="reporting__placeholder-tile" />
            <span className="reporting__placeholder-tile" />
            <span className="reporting__placeholder-tile" />
            <span className="reporting__placeholder-tile" />
            <span className="reporting__placeholder-tile" />
          </div>
          <div aria-hidden="true" className="reporting__placeholder-block" />
          <div aria-hidden="true" className="reporting__placeholder-block" />
        </div>
      ) : null}

      {ready ? (
        <>
          <ReportingMetrics summary={ready.summary} />
          <ReportingPipeline entries={ready.pipeline.distributions.processesByState} />
          <ReportingTrends series={ready.trends.series} />
          <ReportingDrilldown
            drilldown={ready.drilldown}
            onPageChange={onPageChange}
            state={tableState}
          />
        </>
      ) : null}
    </div>
  );
}
