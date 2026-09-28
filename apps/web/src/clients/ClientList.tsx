import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { clientStatusLabelKey, clientStatusTone } from './client-labels.js';
import { ListPagination } from './ListPagination.js';
import type { ClientListState } from './client-state.js';

function formatLocation(city: string | null, country: string | null, notRecorded: string): string {
  const parts = [city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : notRecorded;
}

export function ClientList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: ClientListState;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (clientId: string) => void;
  selectedId: string | null;
}) {
  const { t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="client-list__loading">
        <Skeleton label={t('clients.states.loadingList')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('clients.states.listErrorTitle')} tone="danger">
        <p className="client-message__text">{t('clients.states.listError')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.clients.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('clients.filters.reset')}
          </Button>
        }
        title={t('clients.empty.noMatchesTitle')}
      >
        {t('clients.empty.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t('clients.empty.noClientsTitle')}>
        {t('clients.empty.noClients')}
      </EmptyState>
    );
  }

  return (
    <div className="client-list">
      <p className="client-list__count" role="status">
        {t('common.counts.clients', { count: list.total })}
      </p>
      <ul className="client-list__rows">
        {list.clients.map((client) => {
          const selected = client.id === selectedId;
          return (
            <li
              className={`client-list__row${selected ? ' client-list__row--selected' : ''}`}
              data-selected={selected ? 'true' : undefined}
              key={client.id}
            >
              <button
                aria-current={selected ? 'true' : undefined}
                className="client-list__select"
                onClick={() => onSelect(client.id)}
                type="button"
              >
                <span className="client-list__name">{client.name}</span>
                <StatusBadge tone={clientStatusTone(client.status)}>
                  {t(clientStatusLabelKey(client.status))}
                </StatusBadge>
                <span className="client-list__meta">
                  {client.industry ?? t('clients.notRecorded')}
                </span>
                <span className="client-list__meta">
                  {formatLocation(client.city, client.country, t('clients.notRecorded'))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ListPagination
        labels={{
          next: t('clients.list.pagination.next'),
          page: (values) => t('clients.list.pagination.page', values),
          previous: t('clients.list.pagination.previous'),
          range: (values) => t('clients.list.pagination.range', values),
          region: t('clients.list.pagination.region'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}
