import type { ClientContactSummary, ClientStatus, ClientSummary } from '@hire-me/contracts';
import type { FormEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  archiveClient,
  archiveClientContact,
  createClient,
  createClientContact,
  getClient,
  listClientContacts,
  listClients,
  updateClient,
  updateClientContact,
  updateClientContactStatus,
  updateClientStatus,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { resolveClientAccess } from './client-access.js';
import {
  clientSummaryToProfileValues,
  contactSummaryToProfileValues,
  toClientCreateRequest,
  toClientUpdateRequest,
  toContactCreateRequest,
  toContactUpdateRequest,
  type ClientCreateValues,
  type ClientProfileValues,
  type ContactCreateValues,
  type ContactProfileValues,
} from './client-form.js';
import { clientStatusLabelKey } from './client-labels.js';
import {
  CLIENT_LIST_PAGE_SIZE,
  CONTACT_LIST_PAGE_SIZE,
  EMPTY_CLIENT_FILTERS,
  EMPTY_CONTACT_FILTERS,
  FIRST_CLIENT_PAGE,
  FIRST_CONTACT_PAGE,
  pageCount,
  type ClientDetailState,
  type ClientFeedback,
  type ClientListQuery,
  type ClientListState,
  type ClientPendingAction,
  type ContactListQuery,
  type ContactListState,
} from './client-state.js';
import { ClientsWorkspace } from './ClientsWorkspace.js';

const EMPTY_CREATE_CLIENT: ClientCreateValues = {
  name: '',
  industry: '',
  website: '',
  mainPhone: '',
  country: '',
  city: '',
  commercialSummary: '',
};

const EMPTY_CREATE_CONTACT: ContactCreateValues = {
  displayName: '',
  email: '',
  phone: '',
  roleTitle: '',
};

export function ClientsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const { t } = useI18n();
  const access = resolveClientAccess(permissions);

  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const contactRequest = useRef(0);
  const contextGeneration = useRef(0);
  const contactContextGeneration = useRef(0);
  const writeInFlight = useRef(false);
  const selectedClientRef = useRef<string | null>(null);
  const selectedContactRef = useRef<string | null>(null);
  const appliedClientQueryRef = useRef<ClientListQuery>(FIRST_CLIENT_PAGE);
  const appliedContactQueryRef = useRef<ContactListQuery>(FIRST_CONTACT_PAGE);
  const sessionToken = useRef(accessToken);

  useLayoutEffect(() => {
    sessionToken.current = accessToken;
  }, [accessToken]);

  const principal = permissions.join(' ');
  const [session, setSession] = useState({ key: 0, principal, token: accessToken });

  const [clientFilters, setClientFilters] = useState(EMPTY_CLIENT_FILTERS);
  const [appliedClientQuery, setAppliedClientQuery] = useState(FIRST_CLIENT_PAGE);
  const [clientList, setClientList] = useState<ClientListState>({ status: 'loading' });
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientDetail, setClientDetail] = useState<ClientDetailState>({ status: 'idle' });
  const [editClientValues, setEditClientValues] = useState<ClientProfileValues | null>(null);
  const [createClientValues, setCreateClientValues] = useState(EMPTY_CREATE_CLIENT);

  const [contactFilters, setContactFilters] = useState(EMPTY_CONTACT_FILTERS);
  const [appliedContactQuery, setAppliedContactQuery] = useState(FIRST_CONTACT_PAGE);
  const [contactList, setContactList] = useState<ContactListState>({ status: 'idle' });
  const [selectedContact, setSelectedContact] = useState<ClientContactSummary | null>(null);
  const [editContactValues, setEditContactValues] = useState<ContactProfileValues | null>(null);
  const [createContactValues, setCreateContactValues] = useState(EMPTY_CREATE_CONTACT);

  const [feedback, setFeedback] = useState<ClientFeedback | null>(null);
  const [pending, setPending] = useState<ClientPendingAction | null>(null);

  if (session.token !== accessToken || session.principal !== principal) {
    const firstClientPage: ClientListQuery = { filters: { ...EMPTY_CLIENT_FILTERS }, page: 1 };
    listRequest.current += 1;
    detailRequest.current += 1;
    contactRequest.current += 1;
    contextGeneration.current += 1;
    contactContextGeneration.current += 1;
    selectedClientRef.current = null;
    selectedContactRef.current = null;
    appliedClientQueryRef.current = firstClientPage;
    appliedContactQueryRef.current = FIRST_CONTACT_PAGE;
    setSession({ key: session.key + 1, principal, token: accessToken });
    setClientFilters(EMPTY_CLIENT_FILTERS);
    setAppliedClientQuery(firstClientPage);
    setClientList({ status: 'loading' });
    setSelectedClientId(null);
    setClientDetail({ status: 'idle' });
    setEditClientValues(null);
    setCreateClientValues(EMPTY_CREATE_CLIENT);
    setContactFilters(EMPTY_CONTACT_FILTERS);
    setAppliedContactQuery(FIRST_CONTACT_PAGE);
    setContactList({ status: 'idle' });
    setSelectedContact(null);
    setEditContactValues(null);
    setCreateContactValues(EMPTY_CREATE_CONTACT);
    setFeedback(null);
  }

  useEffect(() => {
    void loadClientList(appliedClientQuery);
    return () => {
      listRequest.current += 1;
    };
  }, [accessToken, appliedClientQuery]);

  useEffect(() => {
    if (!selectedClientId || !access.canViewContacts) {
      contactRequest.current += 1;
      setContactList({ status: 'idle' });
      return;
    }
    void loadContactList(selectedClientId, appliedContactQuery);
    return () => {
      contactRequest.current += 1;
    };
  }, [accessToken, access.canViewContacts, appliedContactQuery, selectedClientId]);

  function beginWrite(action: ClientPendingAction): boolean {
    if (writeInFlight.current) {
      return false;
    }
    writeInFlight.current = true;
    setPending(action);
    return true;
  }

  function endWrite(): void {
    writeInFlight.current = false;
    setPending(null);
  }

  function captureClientContext(clientId: string): () => boolean {
    const generation = contextGeneration.current;
    return () => contextGeneration.current === generation && selectedClientRef.current === clientId;
  }

  function captureContactContext(clientId: string, contactId: string): () => boolean {
    const clientGeneration = contextGeneration.current;
    const contactGeneration = contactContextGeneration.current;
    return () =>
      contextGeneration.current === clientGeneration &&
      contactContextGeneration.current === contactGeneration &&
      selectedClientRef.current === clientId &&
      selectedContactRef.current === contactId;
  }

  /** Creation only commits selection when the user has not moved to another client meanwhile. */
  function captureSelectionContext(): () => boolean {
    const generation = contextGeneration.current;
    const clientId = selectedClientRef.current;
    return () => contextGeneration.current === generation && selectedClientRef.current === clientId;
  }

  function refreshClientListAfterWrite(startedSession: string): void {
    if (startedSession !== sessionToken.current) {
      return;
    }
    void loadClientList(appliedClientQueryRef.current, true);
  }

  function refreshContactListAfterWrite(startedSession: string, clientId: string): void {
    if (startedSession !== sessionToken.current || selectedClientRef.current !== clientId) {
      return;
    }
    void loadContactList(clientId, appliedContactQueryRef.current, true);
  }

  function commitClientDetail(client: ClientSummary, isCurrent: () => boolean): void {
    if (!isCurrent()) {
      return;
    }
    setClientDetail({ status: 'ready', client });
    setEditClientValues(clientSummaryToProfileValues(client));
  }

  function commitContactDetail(contact: ClientContactSummary, isCurrent: () => boolean): void {
    if (!isCurrent()) {
      return;
    }
    setSelectedContact(contact);
    setEditContactValues(contactSummaryToProfileValues(contact));
  }

  async function loadClientList(query: ClientListQuery, quiet = false): Promise<void> {
    const request = ++listRequest.current;
    if (!quiet) {
      setClientList({ status: 'loading' });
    }
    try {
      const response = await listClients({
        accessToken,
        page: query.page,
        pageSize: CLIENT_LIST_PAGE_SIZE,
        search: query.filters.search.trim() || undefined,
        status: query.filters.status || undefined,
        industry: query.filters.industry.trim() || undefined,
      });
      if (request !== listRequest.current) {
        return;
      }
      const { page, pageSize, total } = response.pagination;
      if (response.clients.length === 0 && total > 0 && page > 1) {
        const nextQuery = {
          ...query,
          page: Math.min(page - 1, pageCount(total, pageSize)),
        };
        appliedClientQueryRef.current = nextQuery;
        setAppliedClientQuery(nextQuery);
        return;
      }
      setClientList({
        clients: response.clients,
        page,
        pageSize,
        status: 'ready',
        total,
      });
      if (
        selectedClientRef.current &&
        !response.clients.some((client) => client.id === selectedClientRef.current)
      ) {
        void loadClientDetail(selectedClientRef.current, true);
      }
    } catch {
      if (request === listRequest.current && !quiet) {
        setClientList({ status: 'error' });
      }
    }
  }

  async function loadClientDetail(clientId: string, quiet = false): Promise<void> {
    const generation = contextGeneration.current;
    const request = ++detailRequest.current;
    if (!quiet) {
      setClientDetail({ status: 'loading' });
    }
    try {
      const response = await getClient(accessToken, clientId);
      if (request !== detailRequest.current || selectedClientRef.current !== clientId) {
        return;
      }
      if (generation !== contextGeneration.current) {
        return;
      }
      setClientDetail({ status: 'ready', client: response.client });
      setEditClientValues(clientSummaryToProfileValues(response.client));
    } catch {
      if (request === detailRequest.current && selectedClientRef.current === clientId) {
        setClientDetail({ status: 'error' });
      }
    }
  }

  async function loadContactList(
    clientId: string,
    query: ContactListQuery,
    quiet = false,
  ): Promise<void> {
    const generation = contextGeneration.current;
    const request = ++contactRequest.current;
    if (!quiet) {
      setContactList({ status: 'loading' });
    }
    try {
      const response = await listClientContacts({
        accessToken,
        clientId,
        page: query.page,
        pageSize: CONTACT_LIST_PAGE_SIZE,
        search: query.filters.search.trim() || undefined,
        status: query.filters.status || undefined,
      });
      if (
        request !== contactRequest.current ||
        selectedClientRef.current !== clientId ||
        generation !== contextGeneration.current
      ) {
        return;
      }
      const { page, pageSize, total } = response.pagination;
      if (response.contacts.length === 0 && total > 0 && page > 1) {
        const nextQuery = {
          ...query,
          page: Math.min(page - 1, pageCount(total, pageSize)),
        };
        appliedContactQueryRef.current = nextQuery;
        setAppliedContactQuery(nextQuery);
        return;
      }
      setContactList({
        contacts: response.contacts,
        page,
        pageSize,
        status: 'ready',
        total,
      });
      if (
        selectedContactRef.current &&
        !response.contacts.some((contact) => contact.id === selectedContactRef.current)
      ) {
        selectedContactRef.current = null;
        setSelectedContact(null);
        setEditContactValues(null);
      }
    } catch {
      if (request === contactRequest.current && selectedClientRef.current === clientId && !quiet) {
        setContactList({ status: 'error' });
      }
    }
  }

  function selectClient(clientId: string): void {
    contextGeneration.current += 1;
    contactContextGeneration.current += 1;
    contactRequest.current += 1;
    detailRequest.current += 1;
    selectedClientRef.current = clientId;
    selectedContactRef.current = null;
    setSelectedClientId(clientId);
    setSelectedContact(null);
    setEditContactValues(null);
    setContactFilters(EMPTY_CONTACT_FILTERS);
    appliedContactQueryRef.current = FIRST_CONTACT_PAGE;
    setAppliedContactQuery(FIRST_CONTACT_PAGE);
    setFeedback(null);
    void loadClientDetail(clientId);
  }

  function selectContact(contactId: string): void {
    if (contactList.status !== 'ready') {
      return;
    }
    const contact = contactList.contacts.find((entry) => entry.id === contactId) ?? null;
    contactContextGeneration.current += 1;
    selectedContactRef.current = contactId;
    setSelectedContact(contact);
    setEditContactValues(contact ? contactSummaryToProfileValues(contact) : null);
  }

  function applyClientFilters(): void {
    const next: ClientListQuery = { filters: clientFilters, page: 1 };
    appliedClientQueryRef.current = next;
    setAppliedClientQuery(next);
  }

  function resetClientFilters(): void {
    setClientFilters(EMPTY_CLIENT_FILTERS);
    appliedClientQueryRef.current = FIRST_CLIENT_PAGE;
    setAppliedClientQuery(FIRST_CLIENT_PAGE);
  }

  function applyContactFilters(): void {
    const next: ContactListQuery = { filters: contactFilters, page: 1 };
    appliedContactQueryRef.current = next;
    setAppliedContactQuery(next);
  }

  function resetContactFilters(): void {
    setContactFilters(EMPTY_CONTACT_FILTERS);
    appliedContactQueryRef.current = FIRST_CONTACT_PAGE;
    setAppliedContactQuery(FIRST_CONTACT_PAGE);
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!access.canCreateClients || !beginWrite('createClient')) {
      return;
    }
    const isCurrent = captureSelectionContext();
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const created = await createClient(
        accessToken,
        toClientCreateRequest(createClientValues, access.canSeeCommercial),
      );
      refreshClientListAfterWrite(startedSession);
      if (isCurrent()) {
        setCreateClientValues(EMPTY_CREATE_CLIENT);
        setFeedback({ tone: 'success', messageKey: 'clients.feedback.createdClient' });
        selectClient(created.client.id);
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.createClient' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleSaveClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId || !editClientValues || !access.canUpdateClients) {
      return;
    }
    const clientId = selectedClientId;
    if (!beginWrite('updateClient')) {
      return;
    }
    const isCurrent = captureClientContext(clientId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const updated = await updateClient(
        accessToken,
        clientId,
        toClientUpdateRequest(editClientValues, access.canSeeCommercial),
      );
      refreshClientListAfterWrite(startedSession);
      if (isCurrent()) {
        commitClientDetail(updated.client, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'clients.feedback.updatedClient' });
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.updateClient' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleChangeClientStatus(status: ClientStatus): Promise<void> {
    if (!selectedClientId || !access.canManageClientStatus || writeInFlight.current) {
      return;
    }
    const clientId = selectedClientId;
    const label = t(clientStatusLabelKey(status));
    if (!window.confirm(t('clients.lifecycle.confirmStatusClient', { status: label }))) {
      return;
    }
    if (!beginWrite('lifecycle')) {
      return;
    }
    const isCurrent = captureClientContext(clientId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const updated = await updateClientStatus(accessToken, clientId, { status });
      refreshClientListAfterWrite(startedSession);
      if (isCurrent()) {
        commitClientDetail(updated.client, isCurrent);
        setFeedback({
          tone: 'success',
          messageKey: 'clients.feedback.statusChangedClient',
          values: { status: label },
        });
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.statusClient' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleArchiveClient(): Promise<void> {
    if (!selectedClientId || !access.canArchiveClients || writeInFlight.current) {
      return;
    }
    const clientId = selectedClientId;
    if (!window.confirm(t('clients.lifecycle.confirmArchiveClient'))) {
      return;
    }
    if (!beginWrite('lifecycle')) {
      return;
    }
    const isCurrent = captureClientContext(clientId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const archived = await archiveClient(accessToken, clientId);
      refreshClientListAfterWrite(startedSession);
      if (isCurrent()) {
        commitClientDetail(archived.client, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'clients.feedback.archivedClient' });
      }
      if (access.canViewContacts) {
        refreshContactListAfterWrite(startedSession, clientId);
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.archiveClient' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId || !access.canCreateContacts) {
      return;
    }
    const clientId = selectedClientId;
    if (!beginWrite('createContact')) {
      return;
    }
    const isCurrent = captureClientContext(clientId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const created = await createClientContact(
        accessToken,
        clientId,
        toContactCreateRequest(createContactValues),
      );
      refreshContactListAfterWrite(startedSession, clientId);
      if (isCurrent()) {
        setCreateContactValues(EMPTY_CREATE_CONTACT);
        contactContextGeneration.current += 1;
        selectedContactRef.current = created.contact.id;
        commitContactDetail(created.contact, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'clients.feedback.createdContact' });
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.createContact' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleSaveContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId || !selectedContact || !editContactValues || !access.canUpdateContacts) {
      return;
    }
    const clientId = selectedClientId;
    const contactId = selectedContact.id;
    if (!beginWrite('updateContact')) {
      return;
    }
    const isCurrent = captureContactContext(clientId, contactId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const updated = await updateClientContact(
        accessToken,
        clientId,
        contactId,
        toContactUpdateRequest(editContactValues),
      );
      refreshContactListAfterWrite(startedSession, clientId);
      if (isCurrent()) {
        commitContactDetail(updated.contact, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'clients.feedback.updatedContact' });
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.updateContact' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleChangeContactStatus(status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (
      !selectedClientId ||
      !selectedContact ||
      !access.canManageContactStatus ||
      writeInFlight.current
    ) {
      return;
    }
    const clientId = selectedClientId;
    const contactId = selectedContact.id;
    const label = t(`clients.contactStatus.${status}`);
    if (!window.confirm(t('clients.lifecycle.confirmStatusContact', { status: label }))) {
      return;
    }
    if (!beginWrite('lifecycle')) {
      return;
    }
    const isCurrent = captureContactContext(clientId, contactId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const updated = await updateClientContactStatus(accessToken, clientId, contactId, { status });
      refreshContactListAfterWrite(startedSession, clientId);
      if (isCurrent()) {
        commitContactDetail(updated.contact, isCurrent);
        setFeedback({
          tone: 'success',
          messageKey: 'clients.feedback.statusChangedContact',
          values: { status: label },
        });
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.statusContact' });
      }
    } finally {
      endWrite();
    }
  }

  async function handleArchiveContact(): Promise<void> {
    if (
      !selectedClientId ||
      !selectedContact ||
      !access.canArchiveContacts ||
      writeInFlight.current
    ) {
      return;
    }
    const clientId = selectedClientId;
    const contactId = selectedContact.id;
    if (!window.confirm(t('clients.lifecycle.confirmArchiveContact'))) {
      return;
    }
    if (!beginWrite('lifecycle')) {
      return;
    }
    const isCurrent = captureContactContext(clientId, contactId);
    const startedSession = sessionToken.current;
    setFeedback(null);
    try {
      const archived = await archiveClientContact(accessToken, clientId, contactId);
      refreshContactListAfterWrite(startedSession, clientId);
      if (isCurrent()) {
        commitContactDetail(archived.contact, isCurrent);
        setFeedback({ tone: 'success', messageKey: 'clients.feedback.archivedContact' });
      }
    } catch {
      if (isCurrent()) {
        setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.archiveContact' });
      }
    } finally {
      endWrite();
    }
  }

  return (
    <ClientsWorkspace
      key={session.key}
      access={access}
      appliedClientFilters={appliedClientQuery.filters}
      appliedContactFilters={appliedContactQuery.filters}
      clientDetail={clientDetail}
      clientFilters={clientFilters}
      clientList={clientList}
      contactFilters={contactFilters}
      contactList={contactList}
      createClientValues={createClientValues}
      createContactValues={createContactValues}
      editClientValues={editClientValues}
      editContactValues={editContactValues}
      feedback={feedback}
      onApplyClientFilters={applyClientFilters}
      onApplyContactFilters={applyContactFilters}
      onArchiveClient={() => void handleArchiveClient()}
      onArchiveContact={() => void handleArchiveContact()}
      onChangeClientStatus={(status) => void handleChangeClientStatus(status)}
      onChangeContactStatus={(status) => void handleChangeContactStatus(status)}
      onClientFiltersChange={setClientFilters}
      onClientPage={(page) => {
        const next = { ...appliedClientQuery, page };
        appliedClientQueryRef.current = next;
        setAppliedClientQuery(next);
      }}
      onContactFiltersChange={setContactFilters}
      onContactPage={(page) => {
        const next = { ...appliedContactQuery, page };
        appliedContactQueryRef.current = next;
        setAppliedContactQuery(next);
      }}
      onCreateClient={(event) => void handleCreateClient(event)}
      onCreateClientValuesChange={setCreateClientValues}
      onCreateContact={(event) => void handleCreateContact(event)}
      onCreateContactValuesChange={setCreateContactValues}
      onEditClientValuesChange={setEditClientValues}
      onEditContactValuesChange={setEditContactValues}
      onResetClientFilters={resetClientFilters}
      onResetContactFilters={resetContactFilters}
      onRetryClientDetail={() => {
        if (selectedClientId) {
          void loadClientDetail(selectedClientId);
        }
      }}
      onRetryClientList={() => void loadClientList(appliedClientQuery)}
      onRetryContactList={() => {
        if (selectedClientId) {
          void loadContactList(selectedClientId, appliedContactQuery);
        }
      }}
      onSaveClient={(event) => void handleSaveClient(event)}
      onSaveContact={(event) => void handleSaveContact(event)}
      onSelectClient={selectClient}
      onSelectContact={selectContact}
      selectedClientId={selectedClientId}
      selectedContact={selectedContact}
      writesLocked={pending !== null}
    />
  );
}
