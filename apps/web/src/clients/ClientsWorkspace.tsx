import type { ClientContactSummary, ClientStatus, ClientSummary } from '@hire-me/contracts';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { useNarrowContainer } from '../layout/index.js';
import {
  Button,
  ContextualActions,
  CreationDrawer,
  DirectoryPage,
  InlineMessage,
  RecordPage,
  TextArea,
  TextField,
  WORKSPACE_SPLIT_MIN_REM,
  WorkspacePane,
  WorkspaceSurface,
  WorkspaceToolbar,
} from '../ui/index.js';
import { ClientDirectory } from './ClientDirectory.js';
import { ClientFilters } from './ClientFilters.js';
import { ClientFocusedRecord } from './ClientFocusedRecord.js';
import type { ClientMissionsLoad } from './ClientRelatedMissions.js';
import { ClientQuickPreview } from './ClientQuickPreview.js';
import type { ClientAccess } from './client-access.js';
import type {
  ClientCreateValues,
  ClientProfileValues,
  ContactCreateValues,
  ContactProfileValues,
} from './client-form.js';
import type {
  ClientDetailState,
  ClientFeedback,
  ClientFilterValues,
  ClientListState,
  ContactFilterValues,
  ContactListState,
} from './client-state.js';
import { hasActiveClientFilters } from './client-state.js';

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

/**
 * Entity Workspace v2.0 (Issue #204): full-width directory, quick preview, focused record.
 */
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
  loadMissions,
  onApplyClientFilters,
  onApplyContactFilters,
  onArchiveClient,
  onArchiveContact,
  onCancelClientEdit,
  onCancelContactCreate,
  onChangeClientStatus,
  onChangeContactStatus,
  onClientFiltersChange,
  onClientPage,
  onClosePreview,
  onCloseRecord,
  onContactFiltersChange,
  onContactPage,
  onCreateClient,
  onCreateClientValuesChange,
  onCreateContact,
  onCreateContactValuesChange,
  onEditClientValuesChange,
  onEditContactValuesChange,
  onNavigatePath,
  onOpenRecord,
  onPreview,
  onResetClientFilters,
  onResetContactFilters,
  onRetryClientDetail,
  onRetryClientList,
  onRetryContactList,
  onSaveClient,
  onSaveContact,
  onSelectContact,
  clientDetailRevealToken,
  contactDetailRevealToken,
  previewClient,
  recordClientId,
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
  loadMissions: ClientMissionsLoad | null;
  onApplyClientFilters: () => void;
  onApplyContactFilters: () => void;
  onArchiveClient: () => void;
  onArchiveContact: () => void;
  onCancelClientEdit: () => void;
  onCancelContactCreate: () => void;
  onChangeClientStatus: (status: ClientStatus) => void;
  onChangeContactStatus: (status: 'ACTIVE' | 'INACTIVE') => void;
  onClientFiltersChange: (values: ClientFilterValues) => void;
  onClientPage: (page: number) => void;
  onClosePreview: () => void;
  onCloseRecord: () => void;
  onContactFiltersChange: (values: ContactFilterValues) => void;
  onContactPage: (page: number) => void;
  onCreateClient: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onCreateClientValuesChange: (values: ClientCreateValues) => void;
  onCreateContact: (event: FormEvent<HTMLFormElement>) => void;
  onCreateContactValuesChange: (values: ContactCreateValues) => void;
  onEditClientValuesChange: (values: ClientProfileValues) => void;
  onEditContactValuesChange: (values: ContactProfileValues) => void;
  onNavigatePath?: (path: string) => void;
  onOpenRecord: (clientId: string) => void;
  onPreview: (client: ClientSummary) => void;
  onResetClientFilters: () => void;
  onResetContactFilters: () => void;
  onRetryClientDetail: () => void;
  onRetryClientList: () => void;
  onRetryContactList: () => void;
  onSaveClient: (event: FormEvent<HTMLFormElement>) => void;
  onSaveContact: (event: FormEvent<HTMLFormElement>) => void;
  onSelectContact: (contactId: string) => void;
  clientDetailRevealToken: number;
  contactDetailRevealToken: number;
  previewClient: ClientSummary | null;
  recordClientId: string | null;
  selectedContact: ClientContactSummary | null;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const directoryRef = useRef<HTMLDivElement>(null);
  const listHeadingId = useId();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const clientHeadingRef = useRef<HTMLHeadingElement>(null);
  const contactHeadingRef = useRef<HTMLHeadingElement>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const recordOpen = recordClientId !== null;
  const narrow = useNarrowContainer(directoryRef, WORKSPACE_SPLIT_MIN_REM.preview);
  const sidePreview = previewClient && !narrow ? previewClient : null;
  const focusRowAfterRender = useRef<string | null>(null);
  const lastRecordId = useRef<string | null>(null);
  const focusListAfterPage = useRef(false);

  if (recordClientId) {
    lastRecordId.current = recordClientId;
  }

  useEffect(() => {
    if (!focusListAfterPage.current || clientList.status === 'loading') {
      return;
    }
    focusListAfterPage.current = false;
    listHeadingRef.current?.focus();
  }, [clientList]);

  useEffect(() => {
    if (recordOpen || !lastRecordId.current) {
      return;
    }
    focusRowAfterRender.current = lastRecordId.current;
    lastRecordId.current = null;
  }, [recordOpen]);

  useEffect(() => {
    const id = focusRowAfterRender.current;
    if (!id || recordOpen) {
      return;
    }
    focusRowAfterRender.current = null;
    const row = directoryRef.current?.querySelector<HTMLButtonElement>(
      `button[data-client-id="${CSS.escape(id)}"]`,
    );
    (row ?? listHeadingRef.current)?.focus();
  });

  function closePreview(): void {
    if (previewClient) {
      focusRowAfterRender.current = previewClient.id;
    }
    onClosePreview();
  }

  function changePage(page: number): void {
    focusListAfterPage.current = true;
    onClientPage(page);
  }

  const primaryAction = access.canCreateClients ? (
    <ContextualActions
      primary={
        <Button
          aria-haspopup="dialog"
          disabled={writesLocked}
          onClick={() => setCreatingClient(true)}
        >
          <span aria-hidden="true">+ </span>
          {t('clients.actions.newClient')}
        </Button>
      }
    />
  ) : undefined;

  const notices =
    access.readOnly || feedback ? (
      <>
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
      </>
    ) : undefined;

  const pageProps = {
    compact: true,
    description: t('clients.header.description'),
    eyebrow: t('clients.header.eyebrow'),
    notices,
    primaryAction,
    title: t('clients.header.title'),
  };

  return (
    <>
      {recordOpen ? (
        <RecordPage {...pageProps} className="clients ui-workspace-page" data-view="record">
          <ClientFocusedRecord
            access={access}
            appliedContactFilters={appliedContactFilters}
            clientDetail={clientDetail}
            clientHeadingRef={clientHeadingRef}
            contactDetailRevealToken={contactDetailRevealToken}
            contactFilters={contactFilters}
            contactHeadingRef={contactHeadingRef}
            contactList={contactList}
            createContactValues={createContactValues}
            detailRevealToken={clientDetailRevealToken}
            editClientValues={editClientValues}
            editContactValues={editContactValues}
            feedback={feedback}
            loadMissions={loadMissions}
            onApplyContactFilters={onApplyContactFilters}
            onArchiveClient={onArchiveClient}
            onArchiveContact={onArchiveContact}
            onBack={onCloseRecord}
            onCancelClientEdit={onCancelClientEdit}
            onCancelContactCreate={onCancelContactCreate}
            onChangeClientStatus={onChangeClientStatus}
            onChangeContactStatus={onChangeContactStatus}
            onContactFiltersChange={onContactFiltersChange}
            onContactPage={onContactPage}
            onCreateContact={onCreateContact}
            onCreateContactValuesChange={onCreateContactValuesChange}
            onEditClientValuesChange={onEditClientValuesChange}
            onEditContactValuesChange={onEditContactValuesChange}
            onNavigatePath={onNavigatePath}
            onResetContactFilters={onResetContactFilters}
            onRetryClientDetail={onRetryClientDetail}
            onRetryContactList={onRetryContactList}
            onSaveClient={onSaveClient}
            onSaveContact={onSaveContact}
            onSelectContact={onSelectContact}
            renderClientFields={(props) => <ClientEditFields {...props} />}
            renderContactFields={(props) => <ContactFields {...props} />}
            selectedContact={selectedContact}
            writesLocked={writesLocked}
          />
        </RecordPage>
      ) : (
        <DirectoryPage
          {...pageProps}
          className="clients ui-workspace-page"
          data-view="directory"
          layout="fill"
        >
          <WorkspaceSurface
            className="clients__workspace"
            ref={directoryRef}
            split="preview"
            view={sidePreview ? undefined : 'list'}
          >
            <WorkspacePane
              aria-labelledby={listHeadingId}
              className="clients__list-pane"
              kind="list"
              toolbar={
                <WorkspaceToolbar
                  heading={
                    <h2
                      className="clients__pane-title"
                      id={listHeadingId}
                      ref={listHeadingRef}
                      tabIndex={-1}
                    >
                      {t('clients.directory.title')}
                    </h2>
                  }
                >
                  <ClientFilters
                    appliedValues={appliedClientFilters}
                    busy={clientList.status === 'loading'}
                    onChange={onClientFiltersChange}
                    onReset={onResetClientFilters}
                    onSubmit={onApplyClientFilters}
                    showReset={hasActiveClientFilters(appliedClientFilters)}
                    total={clientList.status === 'ready' ? clientList.total : undefined}
                    values={clientFilters}
                  />
                </WorkspaceToolbar>
              }
            >
              <ClientDirectory
                filtered={hasActiveClientFilters(appliedClientFilters)}
                list={clientList}
                onPage={changePage}
                onPreview={onPreview}
                onReset={onResetClientFilters}
                onRetry={onRetryClientList}
                previewId={previewClient?.id ?? null}
                tableLabelId={listHeadingId}
              />
            </WorkspacePane>
            {sidePreview ? (
              <WorkspacePane as="div" className="clients__preview-pane" kind="detail">
                <ClientQuickPreview
                  client={sidePreview}
                  key={sidePreview.id}
                  onClose={closePreview}
                  onOpenRecord={() => onOpenRecord(sidePreview.id)}
                />
              </WorkspacePane>
            ) : null}
          </WorkspaceSurface>
        </DirectoryPage>
      )}

      {!recordOpen && previewClient && narrow ? (
        <ClientQuickPreview
          client={previewClient}
          key={previewClient.id}
          onClose={closePreview}
          onOpenRecord={() => onOpenRecord(previewClient.id)}
          presentation="sheet"
        />
      ) : null}

      {access.canCreateClients && creatingClient ? (
        <ClientCreateDrawer
          failure={
            feedback && feedback.tone !== 'success' ? (
              <InlineMessage announce title={t('common.actions.retry')} tone="danger">
                <p className="client-message__text">{formatClientFeedback(t, feedback)}</p>
              </InlineMessage>
            ) : null
          }
          includeCommercial={access.canSeeCommercial}
          onChange={onCreateClientValuesChange}
          onClose={() => setCreatingClient(false)}
          onCreate={onCreateClient}
          values={createClientValues}
          writesLocked={writesLocked}
        />
      ) : null}
    </>
  );
}

function blankClient(values: ClientCreateValues): ClientCreateValues {
  return Object.fromEntries(Object.keys(values).map((key) => [key, ''])) as ClientCreateValues;
}

function ClientCreateDrawer({
  failure,
  includeCommercial,
  onChange,
  onClose,
  onCreate,
  values,
  writesLocked,
}: {
  failure: ReactNode;
  includeCommercial: boolean;
  onChange: (values: ClientCreateValues) => void;
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  values: ClientCreateValues;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const dirty = Object.values(values).some((value) => value.trim() !== '');

  function discard(): void {
    onChange(blankClient(values));
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    if (submitting || writesLocked) {
      event.preventDefault();
      return;
    }
    setAttempted(true);
    setSubmitting(true);
    const created = await onCreate(event);
    setSubmitting(false);
    if (created) onClose();
  }

  return (
    <CreationDrawer
      dirty={dirty}
      error={attempted && !submitting ? failure : null}
      formId={formId}
      onClose={discard}
      submitDisabled={writesLocked}
      submitLabel={t('clients.actions.createClient')}
      submitting={submitting}
      title={t('clients.actions.newClient')}
    >
      <form
        aria-label={t('clients.actions.createClient')}
        className="client-form"
        id={formId}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <ClientCreateFields
          includeCommercial={includeCommercial}
          onChange={onChange}
          values={values}
        />
      </form>
    </CreationDrawer>
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
