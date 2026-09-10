import { useId } from 'react';
import type { ReportingDrilldownResponse } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage } from '../ui/index.js';
import { isPipelineState, pipelineStateLabelKey } from './reporting-labels.js';
import type { ReportingTableState } from './reporting-state.js';

export interface ReportingDrilldownProps {
  drilldown: ReportingDrilldownResponse;
  onPageChange: (page: number) => void;
  state: ReportingTableState;
}

/**
 * The dense drilldown table.
 *
 * It shows only the operational fields the reporting contract already exposes.
 * Paging is real: `page`, `pageSize`, `total`, and `hasNextPage` come from the
 * server, the buttons request the neighbouring page with the same filters
 * applied, and applying new filters restarts the report at page 1.
 */
export function ReportingDrilldown({ drilldown, onPageChange, state }: ReportingDrilldownProps) {
  const { formatDate, t } = useI18n();
  const headingId = useId();
  const { hasNextPage, page, total } = drilldown.pageInfo;
  const busy = state === 'loading';
  const showPagination = page > 1 || hasNextPage;

  return (
    <section aria-labelledby={headingId} className="reporting-panel">
      <div className="reporting-panel__head">
        <h2 id={headingId}>{t('reporting.table.title')}</h2>
        <p className="reporting-panel__count u-tabular">
          {t('common.pagination.results', { count: total })}
        </p>
      </div>

      {state === 'error' ? (
        <InlineMessage announce title={t('reporting.states.tableErrorTitle')} tone="danger">
          {t('reporting.states.tableError')}
        </InlineMessage>
      ) : null}
      {busy ? (
        <p className="reporting-panel__status" role="status">
          {t('reporting.states.loadingTable')}
        </p>
      ) : null}

      {drilldown.rows.length === 0 ? (
        <p className="reporting-panel__empty">{t('reporting.empty.table')}</p>
      ) : (
        <div aria-busy={busy || undefined} className="reporting-table__scroll u-table-scroll">
          <table aria-labelledby={headingId} className="reporting-table">
            <thead>
              <tr>
                <th scope="col">{t('reporting.table.mission')}</th>
                <th scope="col">{t('reporting.table.client')}</th>
                <th scope="col">{t('reporting.table.candidate')}</th>
                <th scope="col">{t('reporting.table.state')}</th>
                <th scope="col">{t('reporting.table.recruiter')}</th>
                <th scope="col">{t('reporting.table.source')}</th>
                <th scope="col">{t('reporting.table.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.rows.map((row) => (
                <tr key={row.processId}>
                  <td>{row.missionTitle}</td>
                  <td>{row.clientName}</td>
                  <td>{row.candidateDisplayName}</td>
                  <td>
                    {isPipelineState(row.pipelineState)
                      ? t(pipelineStateLabelKey(row.pipelineState))
                      : row.pipelineState}
                  </td>
                  <td>{row.responsibleRecruiterDisplayName}</td>
                  <td>{row.source ?? t('reporting.table.noSource')}</td>
                  <td className="u-tabular">{formatDate(row.updatedAt, { timeZone: 'UTC' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPagination ? (
        <nav aria-label={t('reporting.pagination.region')} className="reporting-pagination">
          <Button
            disabled={page <= 1 || busy}
            onClick={() => onPageChange(page - 1)}
            size="compact"
            variant="secondary"
          >
            {t('reporting.pagination.previous')}
          </Button>
          <span className="reporting-pagination__page u-tabular">
            {t('reporting.pagination.page', { page })}
          </span>
          <Button
            disabled={!hasNextPage || busy}
            onClick={() => onPageChange(page + 1)}
            size="compact"
            variant="secondary"
          >
            {t('reporting.pagination.next')}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
