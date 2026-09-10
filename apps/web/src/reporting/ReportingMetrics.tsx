import type { ReportingSummary } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';

/**
 * The KPI band.
 *
 * Six primary metrics carry the recruitment funnel from open work to confirmed
 * placements; six supporting metrics stay available at a lower visual weight
 * rather than competing as twelve equal tiles.
 *
 * Every value is read straight from the reporting summary. Nothing is derived,
 * no rate is invented, and no ordinary number is colored merely for being
 * positive: the only semantic treatment is on overdue missions, which is a real
 * warning and still says so in its own label.
 */
export function ReportingMetrics({ summary }: { summary: ReportingSummary }) {
  const { formatNumber, t } = useI18n();

  const primary = [
    { label: t('reporting.metrics.openMissions'), value: summary.missions.open },
    { label: t('reporting.metrics.candidateProcesses'), value: summary.pipeline.totalProcesses },
    { label: t('reporting.metrics.presentedToClient'), value: summary.pipeline.presentedToClient },
    { label: t('reporting.metrics.interviewsCompleted'), value: summary.interviews.completed },
    { label: t('reporting.metrics.offersAccepted'), value: summary.offers.accepted },
    { label: t('reporting.metrics.confirmedPlacements'), value: summary.placements.confirmed },
  ];

  const supporting: { label: string; tone?: 'warning'; value: number }[] = [
    { label: t('reporting.metrics.totalMissions'), value: summary.missions.total },
    {
      label: t('reporting.metrics.requestedPositions'),
      value: summary.missions.requestedPositions,
    },
    { label: t('reporting.metrics.closureEligible'), value: summary.missions.closureEligible },
    { label: t('reporting.metrics.interviewsScheduled'), value: summary.interviews.scheduled },
    { label: t('reporting.metrics.newApplications'), value: summary.applications.newInWindow },
    {
      label: t('reporting.metrics.overdueMissions'),
      tone: summary.aging.overdueMissions > 0 ? 'warning' : undefined,
      value: summary.aging.overdueMissions,
    },
  ];

  return (
    <div className="reporting-metrics">
      <dl aria-label={t('reporting.metrics.primaryRegion')} className="reporting-metrics__band">
        {primary.map((metric) => (
          <div className="reporting-metrics__tile" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd className="u-tabular">{formatNumber(metric.value)}</dd>
          </div>
        ))}
      </dl>
      <dl
        aria-label={t('reporting.metrics.secondaryRegion')}
        className="reporting-metrics__supporting"
      >
        {supporting.map((metric) => (
          <div className="reporting-metrics__item" data-tone={metric.tone} key={metric.label}>
            <dt>{metric.label}</dt>
            <dd className="u-tabular">{formatNumber(metric.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
