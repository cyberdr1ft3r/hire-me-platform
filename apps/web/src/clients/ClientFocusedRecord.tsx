import type { ClientContactSummary, ClientStatus } from '@hire-me/contracts';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { useRecordLeaveGuard } from '../navigation/use-record-leave-guard.js';
import { Button, InlineMessage, StatusBadge } from '../ui/index.js';
import type { ClientAccess } from './client-access.js';
import type {
  ClientProfileValues,
  ContactCreateValues,
  ContactProfileValues,
} from './client-form.js';
import { contactStatusLabelKey, contactStatusTone } from './client-labels.js';
import { ClientRecordOverview } from './ClientRecordOverview.js';
import { ClientRelatedMissions, type ClientMissionsLoad } from './ClientRelatedMissions.js';
import { ClientRecordTabs, type ClientRecordTab } from './ClientRecordTabs.js';
import type {
  ClientDetailState,
  ClientFeedback,
  ContactListState,
  ContactFilterValues,
} from './client-state.js';
import { ContactFilters } from './ContactFilters.js';
import { ContactList } from './ContactList.js';

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
  onCancelClientEdit,
  onCancelContactCreate,
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
  onCancelClientEdit: () => void;
  onCancelContactCreate: () => void;
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
        <ClientContactsSection
          access={access}
          archivedClient={archivedClient}
          archivedContact={archivedContact}
          contactDetailRevealToken={contactDetailRevealToken}
          contactFilters={contactFilters}
          contactHeadingRef={contactHeadingRef}
          contactList={contactList}
          createContactValues={createContactValues}
          editContactValues={editContactValues}
          feedback={feedback}
          filteredContacts={filteredContacts}
          onApplyContactFilters={onApplyContactFilters}
          onArchiveContact={onArchiveContact}
          onCancelContactCreate={onCancelContactCreate}
          onChangeContactStatus={onChangeContactStatus}
          onContactFiltersChange={onContactFiltersChange}
          onContactPage={onContactPage}
          onCreateContact={onCreateContact}
          onCreateContactValuesChange={onCreateContactValuesChange}
          onEditContactValuesChange={onEditContactValuesChange}
          onResetContactFilters={onResetContactFilters}
          onRetryContactList={onRetryContactList}
          onSaveContact={onSaveContact}
          onSelectContact={onSelectContact}
          renderContactFields={renderContactFields}
          selectedContact={selectedContact}
          writesLocked={writesLocked}
        />
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
    <ClientRecordOverview
      access={access}
      client={detailClient}
      clientHeadingRef={clientHeadingRef}
      detailRevealToken={detailRevealToken}
      editClientValues={editClientValues}
      feedback={feedback}
      onArchiveClient={onArchiveClient}
      onCancelClientEdit={onCancelClientEdit}
      onChangeClientStatus={onChangeClientStatus}
      onEditClientValuesChange={onEditClientValuesChange}
      onSaveClient={onSaveClient}
      renderClientFields={renderClientFields}
      writesLocked={writesLocked}
    />
  );

  return (
    <div className="client-record" ref={containerRef}>
      <RecordNav onBack={onBack} />
      <ClientRecordTabs overview={overview} sections={sections} />
    </div>
  );
}

function ClientContactsSection({
  access,
  archivedClient,
  archivedContact,
  contactDetailRevealToken,
  contactFilters,
  contactHeadingRef,
  contactList,
  createContactValues,
  editContactValues,
  feedback,
  filteredContacts,
  onApplyContactFilters,
  onArchiveContact,
  onCancelContactCreate,
  onChangeContactStatus,
  onContactFiltersChange,
  onContactPage,
  onCreateContact,
  onCreateContactValuesChange,
  onEditContactValuesChange,
  onResetContactFilters,
  onRetryContactList,
  onSaveContact,
  onSelectContact,
  renderContactFields,
  selectedContact,
  writesLocked,
}: {
  access: ClientAccess;
  archivedClient: boolean;
  archivedContact: boolean;
  contactDetailRevealToken: number;
  contactFilters: ContactFilterValues;
  contactHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  contactList: ContactListState;
  createContactValues: ContactCreateValues;
  editContactValues: ContactProfileValues | null;
  feedback: ClientFeedback | null;
  filteredContacts: boolean;
  onApplyContactFilters: () => void;
  onArchiveContact: () => void;
  onCancelContactCreate: () => void;
  onChangeContactStatus: (status: 'ACTIVE' | 'INACTIVE') => void;
  onContactFiltersChange: (values: ContactFilterValues) => void;
  onContactPage: (page: number) => void;
  onCreateContact: (event: FormEvent<HTMLFormElement>) => void;
  onCreateContactValuesChange: (values: ContactCreateValues) => void;
  onEditContactValuesChange: (values: ContactProfileValues) => void;
  onResetContactFilters: () => void;
  onRetryContactList: () => void;
  onSaveContact: (event: FormEvent<HTMLFormElement>) => void;
  onSelectContact: (contactId: string) => void;
  renderContactFields: (props: {
    disabled?: boolean;
    onChange: (values: ContactProfileValues) => void;
    values: ContactProfileValues;
  }) => ReactNode;
  selectedContact: ClientContactSummary | null;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [creatingContact, setCreatingContact] = useState(false);
  const canCreate = access.canCreateContacts && !archivedClient;

  useEffect(() => {
    if (feedback?.tone === 'success' && feedback.messageKey === 'clients.feedback.createdContact') {
      setCreatingContact(false);
    }
  }, [feedback]);

  function closeCreate(): void {
    onCancelContactCreate();
    setCreatingContact(false);
  }

  return (
    <section aria-label={t('clients.contacts.listTitle')} className="client-contacts">
      <div className="client-contacts__toolbar">
        <ContactFilters
          busy={contactList.status === 'loading'}
          onChange={onContactFiltersChange}
          onReset={onResetContactFilters}
          onSubmit={onApplyContactFilters}
          showReset={filteredContacts}
          values={contactFilters}
        />
        {canCreate && !creatingContact ? (
          <Button disabled={writesLocked} onClick={() => setCreatingContact(true)} variant="primary">
            {t('clients.contacts.newContact')}
          </Button>
        ) : null}
      </div>
      <ContactList
        filtered={filteredContacts}
        list={contactList}
        onCreateContact={canCreate && !creatingContact ? () => setCreatingContact(true) : undefined}
        onPage={onContactPage}
        onReset={onResetContactFilters}
        onRetry={onRetryContactList}
        onSelect={onSelectContact}
        selectedId={selectedContact?.id ?? null}
      />
      {canCreate && creatingContact ? (
        <form
          aria-label={t('clients.contacts.createTitle')}
          className="client-form client-form--create"
          onSubmit={onCreateContact}
        >
          <h4 className="clients__pane-title">{t('clients.contacts.createTitle')}</h4>
          {renderContactFields({
            onChange: onCreateContactValuesChange,
            values: createContactValues,
          })}
          <div className="client-form__actions">
            <Button disabled={writesLocked} type="submit" variant="primary">
              {t('clients.actions.createContact')}
            </Button>
            <Button disabled={writesLocked} onClick={closeCreate} type="button" variant="secondary">
              {t('common.actions.cancel')}
            </Button>
          </div>
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
            <InlineMessage title={t('clients.lifecycle.contactArchivedNotice')} tone="warning">
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
                disabled={writesLocked || !access.canManageContactStatus || archivedContact}
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
                disabled={writesLocked || !access.canManageContactStatus || archivedContact}
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
