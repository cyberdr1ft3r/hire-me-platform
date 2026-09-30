import { ListPagination } from '../clients/ListPagination.js';
import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { documentSourceTone, documentStatusTone } from './document-labels.js';
import type { DocumentListState } from './document-state.js';
import { ContextSummary } from './DocumentContextTrail.js';

export function DocumentList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: DocumentListState;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (documentId: string) => void;
  selectedId: string | null;
}) {
  const { formatDate, t } = useI18n();

  if (list.status === 'loading') {
    return (
      <div aria-busy="true">
        <Skeleton label={t('documents.states.loadingList')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('documents.states.listErrorTitle')} tone="danger">
        <p className="document-message__text">{t('documents.states.listError')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.documents.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('documents.filters.reset')}
          </Button>
        }
        title={t('documents.empty.noMatchesTitle')}
      >
        {t('documents.empty.noMatches')}
      </EmptyState>
    ) : (
      <EmptyState title={t('documents.empty.noDocumentsTitle')}>
        {t('documents.empty.noDocuments')}
      </EmptyState>
    );
  }

  return (
    <div className="document-list">
      <p aria-live="polite" className="document-list__count">
        {t('documents.list.count', { count: list.total })}
      </p>
      <table aria-label={t('documents.list.region')} className="document-table">
        <thead>
          <tr>
            <th scope="col">{t('documents.list.columns.document')}</th>
            <th scope="col">{t('documents.list.columns.type')}</th>
            <th scope="col">{t('documents.list.columns.relatedTo')}</th>
            <th scope="col">{t('documents.list.columns.source')}</th>
            <th scope="col">{t('documents.list.columns.version')}</th>
            <th scope="col">{t('documents.list.columns.status')}</th>
            <th scope="col">{t('documents.list.columns.updated')}</th>
          </tr>
        </thead>
        <tbody>
          {list.documents.map((document) => {
            const selected = document.id === selectedId;
            const current = document.currentVersion;
            return (
              <tr data-selected={selected ? 'true' : undefined} key={document.id}>
                <th scope="row">
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className="document-table__select"
                    onClick={() => onSelect(document.id)}
                    type="button"
                  >
                    {document.title}
                  </button>
                  {current ? (
                    <span className="document-table__filename">{current.filename}</span>
                  ) : null}
                </th>
                <td data-label={t('documents.list.columns.type')}>
                  {t(`documents.types.${document.documentType}`)}
                </td>
                <td data-label={t('documents.list.columns.relatedTo')}>
                  <ContextSummary display={document.contextDisplay} />
                </td>
                <td data-label={t('documents.list.columns.source')}>
                  {current ? (
                    <StatusBadge tone={documentSourceTone(current.source)}>
                      {t(`documents.source.${current.source}`)}
                    </StatusBadge>
                  ) : (
                    <span className="document-muted">{t('documents.list.noFile')}</span>
                  )}
                </td>
                <td className="u-tabular" data-label={t('documents.list.columns.version')}>
                  {current
                    ? t('documents.list.versionNumber', { number: current.versionNumber })
                    : '—'}
                </td>
                <td data-label={t('documents.list.columns.status')}>
                  <StatusBadge tone={documentStatusTone(document.status)}>
                    {t(`documents.status.${document.status}`)}
                  </StatusBadge>
                </td>
                <td className="u-tabular" data-label={t('documents.list.columns.updated')}>
                  <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ListPagination
        labels={{
          next: t('documents.list.pagination.next'),
          page: (values) => t('documents.list.pagination.page', values),
          previous: t('documents.list.pagination.previous'),
          range: (values) => t('documents.list.pagination.range', values),
          region: t('documents.list.pagination.region'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}
