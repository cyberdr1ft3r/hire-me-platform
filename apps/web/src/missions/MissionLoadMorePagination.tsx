import { useI18n } from '../i18n/index.js';
import { Button } from '../ui/index.js';
import type { AccumulatedListState } from './mission-accumulated-list.js';
import { hasMoreAccumulated } from './mission-accumulated-list.js';

export function MissionLoadMorePagination({
  labels,
  list,
  onLoadMore,
  onRetryLoadMore,
}: {
  labels: {
    loadMore: string;
    loadMoreFailed: string;
    progress: (values: { loaded: number; total: number }) => string;
    region: string;
  };
  list: AccumulatedListState<unknown>;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
}) {
  const { t } = useI18n();
  const hasMore = hasMoreAccumulated(list);
  if (list.total === 0 && !list.loadMoreFailed) {
    return null;
  }

  return (
    <nav aria-label={labels.region} className="mission-load-more">
      <p className="mission-load-more__state u-tabular">
        {labels.progress({ loaded: list.items.length, total: list.total })}
      </p>
      {hasMore ? (
        <Button disabled={list.loadingMore} onClick={onLoadMore} size="compact" variant="secondary">
          {labels.loadMore}
        </Button>
      ) : null}
      {list.loadMoreFailed ? (
        <>
          <p className="mission-message__text" role="alert">
            {labels.loadMoreFailed}
          </p>
          <Button onClick={onRetryLoadMore} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </>
      ) : null}
    </nav>
  );
}
