import { useI18n } from '../i18n/index.js';
import { Button, EmptyState, InlineMessage, Skeleton, StatusBadge } from '../ui/index.js';
import { contactStatusLabelKey, contactStatusTone } from './client-labels.js';
import { ListPagination } from './ListPagination.js';
import type { ContactListState } from './client-state.js';

export function ContactList({
  filtered,
  list,
  onPage,
  onReset,
  onRetry,
  onSelect,
  selectedId,
}: {
  filtered: boolean;
  list: ContactListState;
  onPage: (page: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (contactId: string) => void;
  selectedId: string | null;
}) {
  const { t } = useI18n();

  if (list.status === 'idle') {
    return null;
  }

  if (list.status === 'loading') {
    return (
      <div aria-busy="true" className="client-list__loading">
        <Skeleton label={t('clients.states.loadingContacts')} />
      </div>
    );
  }

  if (list.status === 'error') {
    return (
      <InlineMessage announce title={t('clients.states.contactsError')} tone="danger">
        <p className="client-message__text">{t('clients.states.contactsError')}</p>
        <Button onClick={onRetry} size="compact" variant="secondary">
          {t('common.actions.retry')}
        </Button>
      </InlineMessage>
    );
  }

  if (list.contacts.length === 0) {
    return filtered ? (
      <EmptyState
        action={
          <Button onClick={onReset} size="compact" variant="secondary">
            {t('clients.contactFilters.reset')}
          </Button>
        }
        title={t('clients.contacts.emptyTitle')}
      >
        {t('clients.contacts.empty')}
      </EmptyState>
    ) : (
      <EmptyState title={t('clients.contacts.emptyTitle')}>
        {t('clients.contacts.empty')}
      </EmptyState>
    );
  }

  return (
    <div className="client-list client-list--contacts">
      <p className="client-list__count" role="status">
        {t('common.counts.contacts', { count: list.total })}
      </p>
      <ul className="client-list__rows">
        {list.contacts.map((contact) => {
          const selected = contact.id === selectedId;
          return (
            <li
              className={`client-list__row${selected ? ' client-list__row--selected' : ''}`}
              data-selected={selected ? 'true' : undefined}
              key={contact.id}
            >
              <button
                aria-current={selected ? 'true' : undefined}
                className="client-list__select"
                onClick={() => onSelect(contact.id)}
                type="button"
              >
                <span className="client-list__name">{contact.displayName}</span>
                <StatusBadge tone={contactStatusTone(contact.status)}>
                  {t(contactStatusLabelKey(contact.status))}
                </StatusBadge>
                <span className="client-list__meta">
                  {contact.roleTitle ?? t('clients.notRecorded')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ListPagination
        labels={{
          next: t('clients.contactList.pagination.next'),
          page: (values) => t('clients.contactList.pagination.page', values),
          previous: t('clients.contactList.pagination.previous'),
          range: (values) => t('clients.contactList.pagination.range', values),
          region: t('clients.contactList.pagination.region'),
        }}
        onPage={onPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
    </div>
  );
}
