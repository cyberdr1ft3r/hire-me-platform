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
 * The candidate list as compact, scannable rows rather than cards.
 *
 * Each row names the candidate with a real button, so selection is keyboard
 * reachable and announced by name alone; the whole row is its pointer target.
 * The selected row carries `aria-current` plus a visible inline-start bar, so
 * selection never relies on color.
 *
 * The list is one server page of the matches. Previous and next move between
 * pages; the page and range are stated in text.
 *
 * Only ordinary summary fields appear here. Compensation and consent are never
 * shown in the list, whatever the actor's permissions.
 */
export function CandidateList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: CandidateListState;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (candidateId: string) => void;
  selectedId: string | null;
}) {
  const { formatDate, t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="candidate-list__loading">
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
    <div className="candidate-list">
      <p className="candidate-list__count" role="status">
        {t('common.counts.candidates', { count: list.total })}
      </p>
      <ul className="candidate-list__rows">
        {list.candidates.map((candidate) => {
          const selected = candidate.id === selectedId;
          const headline = [
            candidate.currentJobTitle?.trim(),
            formatCandidateLocation(candidate.city, candidate.country),
          ].filter(Boolean);
          return (
            <li
              className="candidate-list__row"
              data-selected={selected ? 'true' : undefined}
              key={candidate.id}
            >
              <div className="candidate-list__primary">
                <button
                  aria-current={selected ? 'true' : undefined}
                  className="candidate-list__select"
                  onClick={() => onSelect(candidate.id)}
                  type="button"
                >
                  {candidate.displayName}
                </button>
                <StatusBadge tone={candidateStatusTone(candidate.status)}>
                  {t(candidateStatusLabelKey(candidate.status))}
                </StatusBadge>
              </div>
              {headline.length > 0 ? (
                <p className="candidate-list__headline">{headline.join(' · ')}</p>
              ) : null}
              <p className="candidate-list__meta">
                {candidate.source ? <span>{candidateSourceLabel(candidate.source, t)}</span> : null}
                <span>
                  {t('candidate.list.updated', { date: formatDate(candidate.updatedAt) })}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      <CandidatePagination list={list} onPage={onPage} />
    </div>
  );
}

function CandidatePagination({
  list,
  onPage,
}: {
  list: Extract<CandidateListState, { status: 'ready' }>;
  onPage: (page: number) => void;
}) {
  const { formatNumber, t } = useI18n();
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
