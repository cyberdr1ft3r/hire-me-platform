import type { CandidateSummary } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { formatCandidateLocation } from './candidate-format.js';
import {
  candidateSourceLabel,
  candidateStatusLabelKey,
  candidateStatusTone,
} from './candidate-labels.js';
import { candidatePageCount, type CandidateListState } from './candidate-state.js';

/**
 * The candidate directory: one server page of the matches as a full-width table.
 *
 * Each row names the candidate with a real button that opens the quick preview, so
 * the action is keyboard reachable and announced by name alone; the whole row is
 * its pointer target. The previewed row carries `aria-current` and a visible
 * inline-start bar, so the state never relies on color.
 *
 * Columns hold only ordinary summary fields. Compensation and consent are never
 * shown here, whatever the actor's permissions. The order is the server's (newest
 * first); the list API offers no other sort, so none is offered here.
 */
export function CandidateDirectory({
  filtered,
  list,
  onPage,
  onPreview,
  onReset,
  onRetry,
  previewId,
  tableLabelId,
}: {
  filtered: boolean;
  list: CandidateListState;
  onPage: (page: number) => void;
  onPreview: (candidate: CandidateSummary) => void;
  onReset: () => void;
  onRetry: () => void;
  previewId: string | null;
  /** The pane heading that names the table. */
  tableLabelId: string;
}) {
  const { formatDate, formatNumber, t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="candidate-directory__loading">
        <Skeleton label={t('candidate.states.loadingList')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('candidate.states.listErrorTitle')} tone="danger">
        <p className="candidate-message__text">{t('candidate.states.listError')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.candidates.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('candidate.filters.reset')}
          </Button>
        }
        title={t('candidate.empty.noMatchesTitle')}
      >
        {t('candidate.empty.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t('candidate.empty.noCandidatesTitle')}>
        {t('candidate.empty.noCandidates')}
      </EmptyState>
    );
  }

  return (
    <div className="candidate-directory">
      <p className="candidate-directory__count" role="status">
        <span>{t('common.counts.candidates', { count: list.total })}</span>
        <span className="candidate-directory__order">{t('candidate.directory.order')}</span>
      </p>
      <table aria-labelledby={tableLabelId} className="candidate-directory__table">
        <thead>
          <tr>
            <th scope="col">{t('candidate.directory.columns.candidate')}</th>
            <th data-column="title" scope="col">
              {t('candidate.fields.currentJobTitle')}
            </th>
            <th data-column="location" scope="col">
              {t('candidate.fields.location')}
            </th>
            <th data-column="status" scope="col">
              {t('candidate.filters.status')}
            </th>
            <th data-column="source" scope="col">
              {t('candidate.fields.source')}
            </th>
            <th data-column="updated" scope="col">
              {t('candidate.profile.updatedLabel')}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.candidates.map((candidate) => {
            const previewed = candidate.id === previewId;
            const location = formatCandidateLocation(candidate.city, candidate.country);
            return (
              <tr
                className="candidate-directory__row"
                data-previewed={previewed ? 'true' : undefined}
                key={candidate.id}
              >
                <th scope="row">
                  <button
                    aria-current={previewed ? 'true' : undefined}
                    className="candidate-directory__open"
                    data-candidate-id={candidate.id}
                    onClick={() => onPreview(candidate)}
                    type="button"
                  >
                    {candidate.displayName}
                  </button>
                </th>
                <td data-column="title">{candidate.currentJobTitle?.trim() || '—'}</td>
                <td data-column="location">{location || '—'}</td>
                <td data-column="status">
                  <StatusBadge tone={candidateStatusTone(candidate.status)}>
                    {t(candidateStatusLabelKey(candidate.status))}
                  </StatusBadge>
                </td>
                <td data-column="source">
                  {candidate.source ? candidateSourceLabel(candidate.source, t) : '—'}
                </td>
                <td className="u-tabular" data-column="updated">
                  {formatDate(candidate.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <CandidatePagination formatNumber={formatNumber} list={list} onPage={onPage} />
    </div>
  );
}

function CandidatePagination({
  formatNumber,
  list,
  onPage,
}: {
  formatNumber: (value: number) => string;
  list: Extract<CandidateListState, { status: 'ready' }>;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = candidatePageCount(list.total, list.pageSize);
  const first = (list.page - 1) * list.pageSize + 1;
  const last = first + list.candidates.length - 1;

  return (
    <nav aria-label={t('candidate.list.pagination.region')} className="candidate-pagination">
      <p className="candidate-pagination__state u-tabular">
        <span>
          {t('candidate.list.pagination.page', {
            page: formatNumber(list.page),
            pages: formatNumber(pages),
          })}
        </span>
        <span>
          {t('candidate.list.pagination.range', {
            first: formatNumber(first),
            last: formatNumber(last),
            total: formatNumber(list.total),
          })}
        </span>
      </p>
      {pages > 1 ? (
        <div className="candidate-pagination__actions">
          <Button
            disabled={list.page <= 1}
            onClick={() => onPage(list.page - 1)}
            size="compact"
            variant="secondary"
          >
            {t('candidate.list.pagination.previous')}
          </Button>
          <Button
            disabled={list.page >= pages}
            onClick={() => onPage(list.page + 1)}
            size="compact"
            variant="secondary"
          >
            {t('candidate.list.pagination.next')}
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
