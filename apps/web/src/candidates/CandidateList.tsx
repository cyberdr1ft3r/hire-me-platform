import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { formatCandidateLocation } from './candidate-format.js';
import { candidateStatusLabelKey, candidateStatusTone } from './candidate-labels.js';
import type { CandidateListState } from './candidate-state.js';

/**
 * The candidate list as compact, scannable rows rather than cards.
 *
 * Each row names the candidate with a real button, so selection is keyboard
 * reachable and announced by name alone; the whole row is its pointer target.
 * The selected row carries `aria-current` plus a visible inline-start bar, so
 * selection never relies on color.
 *
 * Only ordinary summary fields appear here. Compensation and consent are never
 * shown in the list, whatever the actor's permissions.
 */
export function CandidateList({
  filtered,
  list,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: CandidateListState;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (candidateId: string) => void;
  selectedId: string | null;
}) {
  const { formatDate, formatNumber, t } = useI18n();

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

  const shown = list.candidates.length;
  const truncated = list.total > shown;

  return (
    <div className="candidate-list">
      <p className="candidate-list__count" role="status">
        {truncated
          ? t('candidate.list.showing', {
              shown: formatNumber(shown),
              total: formatNumber(list.total),
            })
          : t('common.counts.candidates', { count: list.total })}
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
                {candidate.source ? <span>{candidate.source}</span> : null}
                <span>
                  {t('candidate.list.updated', { date: formatDate(candidate.updatedAt) })}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      {truncated ? (
        <p className="candidate-list__hint">
          {t('candidate.list.truncated', { shown: formatNumber(shown) })}
        </p>
      ) : null}
    </div>
  );
}
