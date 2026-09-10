import { useId } from 'react';
import type { ReportingDistributionEntry } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { isPipelineState, pipelineStateLabelKey } from './reporting-labels.js';

/**
 * Candidate processes by pipeline state, as accessible horizontal bars.
 *
 * The bar is decoration: every row states its localized state name, its count,
 * and its share as text, so the distribution is fully readable without seeing
 * the bar or distinguishing its color. The share is presentation only —
 * `count / (sum of the counts in this distribution)` — and the sum is checked
 * for zero before any division, so it never invents a metric or divides by
 * nothing. Rows are ordered by size for scanning; the underlying state values
 * are unchanged.
 */
export function ReportingPipeline({ entries }: { entries: readonly ReportingDistributionEntry[] }) {
  const { formatNumber, t } = useI18n();
  const headingId = useId();
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const ordered = [...entries].sort(
    (left, right) => right.count - left.count || left.key.localeCompare(right.key),
  );

  return (
    <section aria-labelledby={headingId} className="reporting-panel">
      <div className="reporting-panel__head">
        <h2 id={headingId}>{t('reporting.pipeline.title')}</h2>
      </div>
      <p className="reporting-panel__description">{t('reporting.pipeline.description')}</p>
      {total === 0 ? (
        <p className="reporting-panel__empty">{t('reporting.empty.pipeline')}</p>
      ) : (
        <ul className="reporting-bars">
          {ordered.map((entry) => {
            const share = entry.count / total;
            return (
              <li className="reporting-bars__row" key={entry.key}>
                <span className="reporting-bars__label">
                  {/*
                    The stored state value stays authoritative. Only its label is
                    translated, and an unrecognised value keeps its raw form
                    rather than being guessed at.
                  */}
                  {isPipelineState(entry.key) ? t(pipelineStateLabelKey(entry.key)) : entry.key}
                </span>
                <span className="reporting-bars__count u-tabular">{formatNumber(entry.count)}</span>
                <span className="reporting-bars__share u-tabular">
                  {formatNumber(share, { maximumFractionDigits: 0, style: 'percent' })}
                </span>
                <span aria-hidden="true" className="reporting-bars__track">
                  <span
                    className="reporting-bars__fill"
                    style={{ inlineSize: `${(share * 100).toFixed(1)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
