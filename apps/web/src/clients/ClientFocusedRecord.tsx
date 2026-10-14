import type { ClientContactSummary, ClientStatus } from '@hire-me/contracts';
import type { FormEvent, ReactNode } from 'react';
import { useRef } from 'react';

import { useI18n } from '../i18n/index.js';
import { useRecordLeaveGuard } from '../navigation/use-record-leave-guard.js';
import { Button, InlineMessage, StatusBadge } from '../ui/index.js';
import type { ClientAccess } from './client-access.js';
import type {
  ClientProfileValues,
  ContactCreateValues,
  ContactProfileValues,
} from './client-form.js';
import {
  clientStatusLabelKey,
  clientStatusTone,
  contactStatusLabelKey,
  contactStatusTone,
} from './client-labels.js';
import { ClientRelatedMissions, type ClientMissionsLoad } from './ClientRelatedMissions.js';
import { ClientRecordTabs, type ClientRecordTab } from './ClientRecordTabs.js';
import type { ClientDetailState, ClientFeedback, ContactListState, ContactFilterValues } from './client-state.js';
import { ContactFilters } from './ContactFilters.js';
import { ContactList } from './ContactList.js';

const CLIENT_LIFECYCLE: readonly ClientStatus[] = ['PROSPECT', 'ACTIVE', 'INACTIVE'];

export function ClientFocusedRecord({
  access,
  appliedContactFilters,
  clientDetail,
  clientHeadingRef,
  contactFilters,
  contactList,
  createContactValues,
  detailRevealToken,
  editClientValues,
  editContactValues,
  feedback,
  loadMissions,
  onArchiveClient,
  onArchiveContact,
  onBack,
  onChangeClientStatus,
  onChangeContactStatus,
  onContactFiltersChange,
  onContactPage,
  onCreateContact,
  onCreateContactValuesChange,
  onEditClientValuesChange,
  onEditContactValuesChange,
  onApplyContactFilters,
  onResetContactFilters,
  onRetryClientDetail,
  onRetryContactList,
  onSaveClient,
  onSaveContact,
  onSelectContact,
  contactDetailRevealToken,
  contactHeadingRef,
  onNavigatePath,
  renderClientFields,
  renderContactFields,
  selectedContact,
  writesLocked,
}: {
  access: ClientAccess;
  appliedContactFilters: ContactFilterValues;
  clientDetail: ClientDetailState;
  clientHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  contactFilters: ContactFilterValues;
  contactList: ContactListState;
  createContactValues: ContactCreateValues;
  detailRevealToken: number;
  editClientValues: ClientProfileValues | null;
  editContactValues: ContactProfileValues | null;
  feedback: ClientFeedback | null;
  loadMissions: ClientMissionsLoad | null;
  onArchiveClient: () => void;
  onArchiveContact: () => void;
  onBack: () => void;
  onChangeClientStatus: (status: ClientStatus) => void;
  onChangeContactStatus: (status: 'ACTIVE' | 'INACTIVE') => void;
  onContactFiltersChange: (values: ContactFilterValues) => void;
  onContactPage: (page: number) => void;
  onCreateContact: (event: FormEvent<HTMLFormElement>) => void;
  onCreateContactValuesChange: (values: ContactCreateValues) => void;
  onEditClientValuesChange: (values: ClientProfileValues) => void;
  onEditContactValuesChange: (values: ContactProfileValues) => void;
  onApplyContactFilters: () => void;
  onResetContactFilters: () => void;
  onRetryClientDetail: () => void;
  onRetryContactList: () => void;
  onSaveClient: (event: FormEvent<HTMLFormElement>) => void;
  onSaveContact: (event: FormEvent<HTMLFormElement>) => void;
  onSelectContact: (contactId: string) => void;
  contactDetailRevealToken: number;
  contactHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  renderClientFields: (props: {
    disabled: boolean;
    includeCommercial: boolean;
    onChange: (values: ClientProfileValues) => void;
    values: ClientProfileValues;
  }) => ReactNode;
  onNavigatePath?: (path: string) => void;
  renderContactFields: (props: {
    disabled?: boolean;
    onChange: (values: ContactProfileValues) => void;
    values: ContactProfileValues;
  }) => ReactNode;
  selectedContact: ClientContactSummary | null;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  useRecordLeaveGuard(containerRef, t('clients.record.discardPrompt'), writesLocked, {
    clearOnSubmit: true,
    failureSignal: feedback?.tone === 'danger' ? feedback : null,
  });

  if (clientDetail.status === 'loading') {
    return (
      <div className="client-record" ref={containerRef}>
        <RecordNav onBack={onBack} />
        <p role="status">{t('clients.states.loadingDetail')}</p>
      </div>
    );
  }

  if (clientDetail.status === 'error') {
    return (
      <div className="client-record" ref={containerRef}>
        <RecordNav onBack={onBack} />
        <InlineMessage announce title={t('clients.states.detailErrorTitle')} tone="danger">
          <p>{t('clients.states.detailError')}</p>
          <Button onClick={onRetryClientDetail} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </InlineMessage>
      </div>
    );
  }

  if (clientDetail.status !== 'ready' || !editClientValues) {
    return null;
  }

  const detailClient = clientDetail.client;
  const archivedClient = detailClient.status === 'ARCHIVED';
  const archivedContact = selectedContact?.status === 'ARCHIVED';
  const filteredContacts =
    appliedContactFilters.search.trim().length > 0 || appliedContactFilters.status !== '';

  const sections: ClientRecordTab[] = [];
  if (access.canViewContacts) {
    sections.push({
        id: 'contacts',
        label: t('clients.contacts.listTitle'),
        render: () => (
          <section aria-label={t('clients.contacts.listTitle')} className="client-contacts">
            <ContactFilters
              busy={contactList.status === 'loading'}
              onChange={onContactFiltersChange}
              onReset={onResetContactFilters}
              onSubmit={onApplyContactFilters}
              showReset={filteredContacts}
              values={contactFilters}
            />
            <ContactList
              filtered={filteredContacts}
              list={contactList}
              onPage={onContactPage}
              onReset={onResetContactFilters}
              onRetry={onRetryContactList}
              onSelect={onSelectContact}
              selectedId={selectedContact?.id ?? null}
            />
            {access.canCreateContacts && !archivedClient ? (
              <form
                aria-label={t('clients.contacts.createTitle')}
                className="client-form"
                onSubmit={onCreateContact}
              >
                <h4 className="clients__pane-title">{t('clients.contacts.createTitle')}</h4>
                {renderContactFields({
                  onChange: onCreateContactValuesChange,
                  values: createContactValues,
                })}
                <Button disabled={writesLocked} type="submit" variant="primary">
                  {t('clients.actions.createContact')}
                </Button>
              </form>
            ) : null}
            {selectedContact && editContactValues ? (
              <form
                aria-label={t('clients.contacts.editTitle')}
                className="client-form"
                onSubmit={onSaveContact}
              >
                <h4
                  className="clients__pane-title client-detail__title"
                  key={contactDetailRevealToken}
                  ref={contactHeadingRef}
                  tabIndex={-1}
                >
                  {selectedContact.displayName}
                </h4>
                {archivedContact ? (
                  <InlineMessage
                    title={t('clients.lifecycle.contactArchivedNotice')}
                    tone="warning"
                  >
                    {t('clients.lifecycle.contactArchivedNotice')}
                  </InlineMessage>
                ) : null}
                <StatusBadge tone={contactStatusTone(selectedContact.status)}>
                  {t(contactStatusLabelKey(selectedContact.status))}
                </StatusBadge>
                {renderContactFields({
                  disabled: !access.canUpdateContacts || archivedContact,
                  onChange: onEditContactValuesChange,
                  values: editContactValues,
                })}
                <Button
                  disabled={writesLocked || !access.canUpdateContacts || archivedContact}
                  type="submit"
                  variant="primary"
                >
                  {t('clients.actions.saveContact')}
                </Button>
                <div className="client-lifecycle__actions">
                  {selectedContact.status !== 'ACTIVE' ? (
                    <Button
                      disabled={
                        writesLocked || !access.canManageContactStatus || archivedContact
                      }
                      onClick={() => onChangeContactStatus('ACTIVE')}
                      size="compact"
                      type="button"
                      variant="secondary"
                    >
                      {t('clients.lifecycle.contactMoveTo.ACTIVE')}
                    </Button>
                  ) : null}
                  {selectedContact.status !== 'INACTIVE' ? (
                    <Button
                      disabled={
                        writesLocked || !access.canManageContactStatus || archivedContact
                      }
                      onClick={() => onChangeContactStatus('INACTIVE')}
                      size="compact"
                      type="button"
                      variant="secondary"
                    >
                      {t('clients.lifecycle.contactMoveTo.INACTIVE')}
                    </Button>
                  ) : null}
                  <Button
                    disabled={writesLocked || !access.canArchiveContacts || archivedContact}
                    onClick={onArchiveContact}
                    size="compact"
                    type="button"
                    variant="danger"
                  >
                    {t('clients.actions.archiveContact')}
                  </Button>
                </div>
              </form>
            ) : (
              <p>{t('clients.contacts.selectPrompt')}</p>
            )}
          </section>
        ),
    });
  }
  if (loadMissions) {
    sections.push({
      id: 'missions',
      label: t('clients.record.sections.missions'),
      render: () => <ClientRelatedMissions load={loadMissions} onNavigatePath={onNavigatePath} />,
    });
  }

  const overview = (
    <>
      <div className="client-detail__heading">
        <h2
          className="clients__pane-title client-detail__title"
          key={detailRevealToken}
          ref={clientHeadingRef}
          tabIndex={-1}
        >
          {detailClient.name}
        </h2>
        <StatusBadge tone={clientStatusTone(detailClient.status)}>
          {t(clientStatusLabelKey(detailClient.status))}
        </StatusBadge>
      </div>
      {archivedClient ? (
        <InlineMessage title={t('clients.lifecycle.archivedNotice')} tone="warning">
          {t('clients.lifecycle.archivedNotice')}
        </InlineMessage>
      ) : null}
      <form
        aria-label={t('clients.detail.workspaceTitle')}
        className="client-form"
        onSubmit={onSaveClient}
      >
        {renderClientFields({
          disabled: !access.canUpdateClients || archivedClient,
          includeCommercial: access.canSeeCommercial,
          onChange: onEditClientValuesChange,
          values: editClientValues,
        })}
        <Button
          disabled={writesLocked || !access.canUpdateClients || archivedClient}
          type="submit"
          variant="primary"
        >
          {t('clients.actions.saveClient')}
        </Button>
      </form>
      <section aria-label={t('clients.detail.lifecycleTitle')} className="client-lifecycle">
        <h3 className="clients__pane-title">{t('clients.detail.lifecycleTitle')}</h3>
        <div className="client-lifecycle__actions">
          {CLIENT_LIFECYCLE.filter((status) => status !== detailClient.status).map((status) => (
            <Button
              disabled={writesLocked || !access.canManageClientStatus || archivedClient}
              key={status}
              onClick={() => onChangeClientStatus(status)}
              size="compact"
              type="button"
              variant="secondary"
            >
              {status === 'PROSPECT'
                ? t('clients.lifecycle.moveTo.PROSPECT')
                : status === 'ACTIVE'
                  ? t('clients.lifecycle.moveTo.ACTIVE')
                  : t('clients.lifecycle.moveTo.INACTIVE')}
            </Button>
          ))}
          <Button
            disabled={writesLocked || !access.canArchiveClients || archivedClient}
            onClick={onArchiveClient}
            size="compact"
            type="button"
            variant="danger"
          >
            {t('clients.actions.archiveClient')}
          </Button>
        </div>
      </section>
    </>
  );

  return (
    <div className="client-record" ref={containerRef}>
      <RecordNav onBack={onBack} />
      <ClientRecordTabs overview={overview} sections={sections} />
    </div>
  );
}

function RecordNav({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('clients.record.navigation')} className="client-record__nav">
      <Button className="client-record__back" onClick={onBack} size="compact" variant="quiet">
        <span aria-hidden="true">←</span> {t('clients.record.back')}
      </Button>
    </nav>
  );
}
