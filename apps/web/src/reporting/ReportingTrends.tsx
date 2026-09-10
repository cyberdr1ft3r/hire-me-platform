import { useId } from 'react';
import type { ReportingTrendSeries } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';

/** Geometry of one weekly bar column, in the chart's own user units. */
const COLUMN_WIDTH = 4;
const BAR_WIDTH = 2;
const CHART_HEIGHT = 24;
/**
 * Smallest drawn height for a non-zero week. Without it a single event beside a
 * busy week would round to an invisible sliver; it is a legibility floor on the
 * bar only, and the exact counts remain in the text alternative.
 */
const MINIMUM_BAR = 0.75;

/**
 * Weekly recruitment trends as small multiples: one labelled row per metric.
 *
 * Giving each metric its own labelled row means color never carries meaning on
 * its own — the label identifies the series and the chart palette only supports
 * it. Every series is drawn against one shared maximum, so the rows stay
 * comparable instead of each being stretched to its own scale, and the complete
 * weekly counts are available as a real table for assistive technology.
 *
 * There is no charting dependency, no gradient, and no animation, so nothing
 * here needs to opt out of reduced motion.
 */
export function ReportingTrends({ series }: { series: readonly ReportingTrendSeries[] }) {
  const { formatDate, formatNumber, t } = useI18n();
  const headingId = useId();

  const buckets = [
    ...new Set(series.flatMap((entry) => entry.points.map((point) => point.bucketStart))),
  ].sort();
  const maximum = Math.max(
    0,
    ...series.flatMap((entry) => entry.points.map((point) => point.count)),
  );
  const chartWidth = Math.max(buckets.length * COLUMN_WIDTH, COLUMN_WIDTH);

  function countAt(entry: ReportingTrendSeries, bucketStart: string): number {
    return entry.points.find((point) => point.bucketStart === bucketStart)?.count ?? 0;
  }

  return (
    <section aria-labelledby={headingId} className="reporting-panel">
      <div className="reporting-panel__head">
        <h2 id={headingId}>{t('reporting.trends.title')}</h2>
      </div>
      <p className="reporting-panel__description">{t('reporting.trends.description')}</p>
      {maximum === 0 ? (
        <p className="reporting-panel__empty">{t('reporting.empty.trends')}</p>
      ) : (
        <>
          <ul className="reporting-trends">
            {series.map((entry, index) => {
              const total = entry.points.reduce((sum, point) => sum + point.count, 0);
              return (
                <li className="reporting-trends__row" data-series={index + 1} key={entry.metric}>
                  <div className="reporting-trends__meta">
                    <span className="reporting-trends__label">
                      {t(`domain.trendMetric.${entry.metric}`)}
                    </span>
                    <span className="reporting-trends__total u-tabular">
                      {t('reporting.trends.total', { total })}
                    </span>
                  </div>
                  {/*
                    The bars restate the table below them, so they are hidden
                    from assistive technology rather than announced twice.
                  */}
                  <svg
                    aria-hidden="true"
                    className="reporting-trends__chart"
                    preserveAspectRatio="none"
                    viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                  >
                    {buckets.map((bucketStart, column) => {
                      const count = countAt(entry, bucketStart);
                      const height =
                        count === 0 ? 0 : Math.max(MINIMUM_BAR, (count / maximum) * CHART_HEIGHT);
                      return (
                        <rect
                          height={height}
                          key={bucketStart}
                          width={BAR_WIDTH}
                          x={column * COLUMN_WIDTH}
                          y={CHART_HEIGHT - height}
                        />
                      );
                    })}
                  </svg>
                </li>
              );
            })}
          </ul>
          {/*
            The bars restate this table, so the exact weekly counts stay
            available to assistive technology without being drawn twice. The
            wrapper carries the visually-hidden treatment because a table box
            does not honour `overflow` and would not collapse on its own.
          */}
          <div className="sr-only">
            <table>
              <caption>{t('reporting.trends.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('reporting.trends.weekColumn')}</th>
                  {series.map((entry) => (
                    <th key={entry.metric} scope="col">
                      {t(`domain.trendMetric.${entry.metric}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((bucketStart) => (
                  <tr key={bucketStart}>
                    <th scope="row">{formatDate(bucketStart, { timeZone: 'UTC' })}</th>
                    {series.map((entry) => (
                      <td key={entry.metric}>{formatNumber(countAt(entry, bucketStart))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
