import type { ClientSummary } from '@hire-me/contracts';

import { ListPagination } from './ListPagination.js';
import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { clientStatusLabelKey, clientStatusTone } from './client-labels.js';
import type { ClientListState } from './client-state.js';

function formatLocation(
  city: string | null,
  country: string | null,
  notRecorded: string,
): string {
  const parts = [city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : notRecorded;
}

/**
 * The client directory: one server page of matches as a full-width table.
 *
 * Each row opens the quick preview from list data only. The previewed row carries
 * `aria-current` and a visible inline-start bar. Commercial fields never appear here.
 */
export function ClientDirectory({
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
  list: ClientListState;
  onPage: (page: number) => void;
  onPreview: (client: ClientSummary) => void;
  onReset: () => void;
  onRetry: () => void;
  previewId: string | null;
  tableLabelId: string;
}) {
  const { formatDate, t } = useI18n();
  const notRecorded = t('clients.notRecorded');

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="client-directory__loading">
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
    <div className="client-directory">
      <p className="client-directory__count" role="status">
        {t('common.counts.clients', { count: list.total })}
      </p>
      <table aria-labelledby={tableLabelId} className="client-directory__table">
        <thead>
          <tr>
            <th scope="col">{t('clients.directory.columns.client')}</th>
            <th data-column="status" scope="col">
              {t('clients.fields.status')}
            </th>
            <th data-column="industry" scope="col">
              {t('clients.fields.industry')}
            </th>
            <th data-column="location" scope="col">
              {t('clients.fields.location')}
            </th>
            <th data-column="phone" scope="col">
              {t('clients.fields.mainPhone')}
            </th>
            <th data-column="updated" scope="col">
              {t('clients.directory.columns.updated')}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.clients.map((client) => {
            const previewed = client.id === previewId;
            return (
              <tr
                className="client-directory__row"
                data-previewed={previewed ? 'true' : undefined}
                key={client.id}
              >
                <th scope="row">
                  <button
                    aria-current={previewed ? 'true' : undefined}
                    className="client-directory__open"
                    data-client-id={client.id}
                    onClick={() => onPreview(client)}
                    type="button"
                  >
                    {client.name}
                  </button>
                </th>
                <td data-column="status">
                  <StatusBadge tone={clientStatusTone(client.status)}>
                    {t(clientStatusLabelKey(client.status))}
                  </StatusBadge>
                </td>
                <td data-column="industry">{client.industry?.trim() || notRecorded}</td>
                <td data-column="location">
                  {formatLocation(client.city, client.country, notRecorded)}
                </td>
                <td data-column="phone">{client.mainPhone?.trim() || notRecorded}</td>
                <td className="u-tabular" data-column="updated">
                  {formatDate(client.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
