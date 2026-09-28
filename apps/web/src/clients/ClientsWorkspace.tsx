import type { ClientContactSummary, ClientStatus } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import {
  Button,
  InlineMessage,
  PageHeader,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
import { ClientFilters } from './ClientFilters.js';
import { ClientList } from './ClientList.js';
import { ContactFilters } from './ContactFilters.js';
import { ContactList } from './ContactList.js';
import type { ClientAccess } from './client-access.js';
import type {
  ClientCreateValues,
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
import type {
  ClientDetailState,
  ClientFeedback,
  ClientFilterValues,
  ClientListState,
  ContactFilterValues,
  ContactListState,
} from './client-state.js';

const CLIENT_LIFECYCLE: readonly ClientStatus[] = ['PROSPECT', 'ACTIVE', 'INACTIVE'];

function formatClientFeedback(
  t: ReturnType<typeof useI18n>['t'],
  feedback: ClientFeedback,
): string {
  if (feedback.tone === 'success' && feedback.values) {
    return t(feedback.messageKey, feedback.values as never);
  }
  const plain = t as (key: ClientFeedback['messageKey']) => string;
  return plain(feedback.messageKey);
}

export function ClientsWorkspace({
  access,
  appliedClientFilters,
  appliedContactFilters,
  clientDetail,
  clientFilters,
  clientList,
  contactFilters,
  contactList,
  createClientValues,
  createContactValues,
  editClientValues,
  editContactValues,
  feedback,
  onApplyClientFilters,
  onApplyContactFilters,
  onArchiveClient,
  onArchiveContact,
  onChangeClientStatus,
  onChangeContactStatus,
  onClientFiltersChange,
  onClientPage,
  onContactFiltersChange,
  onContactPage,
  onCreateClient,
  onCreateClientValuesChange,
  onCreateContact,
  onCreateContactValuesChange,
  onEditClientValuesChange,
  onEditContactValuesChange,
  onResetClientFilters,
  onResetContactFilters,
  onRetryClientDetail,
  onRetryClientList,
  onRetryContactList,
  onSaveClient,
  onSaveContact,
  onSelectClient,
  onSelectContact,
  selectedClientId,
  selectedContact,
  writesLocked,
}: {
  access: ClientAccess;
  appliedClientFilters: ClientFilterValues;
  appliedContactFilters: ContactFilterValues;
  clientDetail: ClientDetailState;
  clientFilters: ClientFilterValues;
  clientList: ClientListState;
  contactFilters: ContactFilterValues;
  contactList: ContactListState;
  createClientValues: ClientCreateValues;
  createContactValues: ContactCreateValues;
  editClientValues: ClientProfileValues | null;
  editContactValues: ContactProfileValues | null;
  feedback: ClientFeedback | null;
  onApplyClientFilters: () => void;
  onApplyContactFilters: () => void;
  onArchiveClient: () => void;
  onArchiveContact: () => void;
  onChangeClientStatus: (status: ClientStatus) => void;
  onChangeContactStatus: (status: 'ACTIVE' | 'INACTIVE') => void;
  onClientFiltersChange: (values: ClientFilterValues) => void;
  onClientPage: (page: number) => void;
  onContactFiltersChange: (values: ContactFilterValues) => void;
  onContactPage: (page: number) => void;
  onCreateClient: (event: FormEvent<HTMLFormElement>) => void;
  onCreateClientValuesChange: (values: ClientCreateValues) => void;
  onCreateContact: (event: FormEvent<HTMLFormElement>) => void;
  onCreateContactValuesChange: (values: ContactCreateValues) => void;
  onEditClientValuesChange: (values: ClientProfileValues) => void;
  onEditContactValuesChange: (values: ContactProfileValues) => void;
  onResetClientFilters: () => void;
  onResetContactFilters: () => void;
  onRetryClientDetail: () => void;
  onRetryClientList: () => void;
  onRetryContactList: () => void;
  onSaveClient: (event: FormEvent<HTMLFormElement>) => void;
  onSaveContact: (event: FormEvent<HTMLFormElement>) => void;
  onSelectClient: (clientId: string) => void;
  onSelectContact: (contactId: string) => void;
  selectedClientId: string | null;
  selectedContact: ClientContactSummary | null;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const listBusy = clientList.status === 'loading';
  const filteredClients =
    appliedClientFilters.search.trim().length > 0 ||
    appliedClientFilters.status !== '' ||
    appliedClientFilters.industry.trim().length > 0;
  const filteredContacts =
    appliedContactFilters.search.trim().length > 0 || appliedContactFilters.status !== '';

  const detailClient =
    clientDetail.status === 'ready'
      ? clientDetail.client
      : selectedClientId && clientList.status === 'ready'
        ? (clientList.clients.find((client) => client.id === selectedClientId) ?? null)
        : null;

  const archivedClient = detailClient?.status === 'ARCHIVED';
  const archivedContact = selectedContact?.status === 'ARCHIVED';

  return (
    <section aria-label={t('clients.region')} className="clients">
      <PageHeader
        description={t('clients.header.description')}
        eyebrow={t('clients.header.eyebrow')}
        title={t('clients.header.title')}
      />
      {access.readOnly ? (
        <InlineMessage title={t('clients.readOnly')} tone="info">
          {t('clients.readOnly')}
        </InlineMessage>
      ) : null}
      {feedback ? (
        <InlineMessage
          announce
          title={
            feedback.tone === 'success'
              ? t('clients.feedback.successTitle')
              : t('common.actions.retry')
          }
          tone={feedback.tone === 'success' ? 'success' : 'danger'}
        >
          <p className="client-message__text">{formatClientFeedback(t, feedback)}</p>
        </InlineMessage>
      ) : null}

      <div className="clients__workspace">
        <div className="clients__list-pane">
          <h2 className="clients__pane-title">{t('clients.list.title')}</h2>
          <ClientFilters
            busy={listBusy}
            onChange={onClientFiltersChange}
            onReset={onResetClientFilters}
            onSubmit={onApplyClientFilters}
            showReset={filteredClients}
            values={clientFilters}
          />
          <ClientList
            filtered={filteredClients}
            list={clientList}
            onPage={onClientPage}
            onReset={onResetClientFilters}
            onRetry={onRetryClientList}
            onSelect={onSelectClient}
            selectedId={selectedClientId}
          />

          {access.canCreateClients ? (
            <form
              aria-label={t('clients.actions.createClient')}
              className="client-form"
              onSubmit={onCreateClient}
            >
              <h3 className="clients__pane-title">{t('clients.actions.createClient')}</h3>
              <ClientCreateFields
                includeCommercial={access.canSeeCommercial}
                onChange={onCreateClientValuesChange}
                values={createClientValues}
              />
              <Button disabled={writesLocked} type="submit" variant="primary">
                {t('clients.actions.createClient')}
              </Button>
            </form>
          ) : null}
        </div>

        <div className="clients__detail-pane">
          {!selectedClientId ? (
            <p>{t('clients.detail.selectPrompt')}</p>
          ) : clientDetail.status === 'loading' ? (
            <p role="status">{t('clients.states.loadingDetail')}</p>
          ) : clientDetail.status === 'error' ? (
            <InlineMessage announce title={t('clients.states.detailErrorTitle')} tone="danger">
              <p>{t('clients.states.detailError')}</p>
              <Button onClick={onRetryClientDetail} size="compact" variant="secondary">
                {t('common.actions.retry')}
              </Button>
            </InlineMessage>
          ) : detailClient && editClientValues ? (
            <>
              <div className="client-detail__heading">
                <h2 className="clients__pane-title">{detailClient.name}</h2>
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
                <ClientEditFields
                  disabled={!access.canUpdateClients || archivedClient}
                  includeCommercial={access.canSeeCommercial}
                  onChange={onEditClientValuesChange}
                  values={editClientValues}
                />
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
                  {CLIENT_LIFECYCLE.map((status) => (
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

              {access.canViewContacts ? (
                <section aria-label={t('clients.contacts.listTitle')} className="client-contacts">
                  <h3 className="clients__pane-title">{t('clients.contacts.listTitle')}</h3>
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
                      <ContactFields
                        onChange={onCreateContactValuesChange}
                        values={createContactValues}
                      />
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
                      <h4 className="clients__pane-title">{selectedContact.displayName}</h4>
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
                      <ContactFields
                        disabled={!access.canUpdateContacts || archivedContact}
                        onChange={onEditContactValuesChange}
                        values={editContactValues}
                      />
                      <Button
                        disabled={writesLocked || !access.canUpdateContacts || archivedContact}
                        type="submit"
                        variant="primary"
                      >
                        {t('clients.actions.saveContact')}
                      </Button>
                      <div className="client-lifecycle__actions">
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
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ClientCreateFields({
  disabled = false,
  includeCommercial,
  onChange,
  values,
}: {
  disabled?: boolean;
  includeCommercial: boolean;
  onChange: (values: ClientCreateValues) => void;
  values: ClientCreateValues;
}) {
  const { t } = useI18n();
  return (
    <div className="client-form__grid">
      <TextField
        disabled={disabled}
        label={t('clients.fields.name')}
        name="name"
        onChange={(event) => onChange({ ...values, name: event.currentTarget.value })}
        required
        value={values.name}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.industry')}
        name="industry"
        onChange={(event) => onChange({ ...values, industry: event.currentTarget.value })}
        value={values.industry}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.website')}
        name="website"
        onChange={(event) => onChange({ ...values, website: event.currentTarget.value })}
        value={values.website}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.mainPhone')}
        name="mainPhone"
        onChange={(event) => onChange({ ...values, mainPhone: event.currentTarget.value })}
        value={values.mainPhone}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.country')}
        name="country"
        onChange={(event) => onChange({ ...values, country: event.currentTarget.value })}
        value={values.country}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.city')}
        name="city"
        onChange={(event) => onChange({ ...values, city: event.currentTarget.value })}
        value={values.city}
      />
      {includeCommercial ? (
        <TextArea
          disabled={disabled}
          label={t('clients.fields.commercialSummary')}
          name="commercialSummary"
          onChange={(event) =>
            onChange({ ...values, commercialSummary: event.currentTarget.value })
          }
          value={values.commercialSummary}
        />
      ) : null}
    </div>
  );
}

function ClientEditFields({
  disabled,
  includeCommercial,
  onChange,
  values,
}: {
  disabled: boolean;
  includeCommercial: boolean;
  onChange: (values: ClientProfileValues) => void;
  values: ClientProfileValues;
}) {
  return (
    <ClientCreateFields
      disabled={disabled}
      includeCommercial={includeCommercial}
      onChange={onChange}
      values={values}
    />
  );
}

function ContactFields({
  disabled = false,
  onChange,
  values,
}: {
  disabled?: boolean;
  onChange: (values: ContactProfileValues) => void;
  values: ContactProfileValues;
}) {
  const { t } = useI18n();
  return (
    <div className="client-form__grid">
      <TextField
        disabled={disabled}
        label={t('clients.fields.displayName')}
        name="displayName"
        onChange={(event) => onChange({ ...values, displayName: event.currentTarget.value })}
        required
        value={values.displayName}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.email')}
        name="email"
        onChange={(event) => onChange({ ...values, email: event.currentTarget.value })}
        required
        type="email"
        value={values.email}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.phone')}
        name="phone"
        onChange={(event) => onChange({ ...values, phone: event.currentTarget.value })}
        value={values.phone}
      />
      <TextField
        disabled={disabled}
        label={t('clients.fields.roleTitle')}
        name="roleTitle"
        onChange={(event) => onChange({ ...values, roleTitle: event.currentTarget.value })}
        value={values.roleTitle}
      />
    </div>
  );
}
