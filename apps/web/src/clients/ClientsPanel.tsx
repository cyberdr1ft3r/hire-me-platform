import type { ClientContactSummary, ClientStatus } from '@hire-me/contracts';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

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

  const sessionToken = useRef(`clients-${accessToken}`);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const contactRequest = useRef(0);
  const contextGeneration = useRef(0);
  const selectedClientRef = useRef<string | null>(null);
  const appliedClientQueryRef = useRef<ClientListQuery>(FIRST_CLIENT_PAGE);
  const appliedContactQueryRef = useRef<ContactListQuery>(FIRST_CONTACT_PAGE);

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

  useEffect(() => {
    if (sessionToken.current !== `clients-${accessToken}`) {
      sessionToken.current = `clients-${accessToken}`;
      contextGeneration.current += 1;
      listRequest.current += 1;
      detailRequest.current += 1;
      contactRequest.current += 1;
      selectedClientRef.current = null;
      appliedClientQueryRef.current = FIRST_CLIENT_PAGE;
      appliedContactQueryRef.current = FIRST_CONTACT_PAGE;
      setClientFilters(EMPTY_CLIENT_FILTERS);
      setAppliedClientQuery(FIRST_CLIENT_PAGE);
      setClientList({ status: 'loading' });
      setSelectedClientId(null);
      setClientDetail({ status: 'idle' });
      setEditClientValues(null);
      setContactFilters(EMPTY_CONTACT_FILTERS);
      setAppliedContactQuery(FIRST_CONTACT_PAGE);
      setContactList({ status: 'idle' });
      setSelectedContact(null);
      setEditContactValues(null);
      setFeedback(null);
    }
  }, [accessToken]);

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
        // Selected client no longer in current list page; keep selection but refresh detail.
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
        selectedContact &&
        !response.contacts.some((contact) => contact.id === selectedContact.id)
      ) {
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
    contactRequest.current += 1;
    detailRequest.current += 1;
    selectedClientRef.current = clientId;
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
    if (!access.canCreateClients) {
      return;
    }
    setPending('createClient');
    setFeedback(null);
    try {
      const created = await createClient(
        accessToken,
        toClientCreateRequest(createClientValues, access.canSeeCommercial),
      );
      setCreateClientValues(EMPTY_CREATE_CLIENT);
      setFeedback({ tone: 'success', messageKey: 'clients.feedback.createdClient' });
      selectClient(created.client.id);
      appliedClientQueryRef.current = appliedClientQuery;
      void loadClientList(appliedClientQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.createClient' });
    } finally {
      setPending(null);
    }
  }

  async function handleSaveClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId || !editClientValues || !access.canUpdateClients) {
      return;
    }
    setPending('updateClient');
    setFeedback(null);
    try {
      const updated = await updateClient(
        accessToken,
        selectedClientId,
        toClientUpdateRequest(editClientValues, access.canSeeCommercial),
      );
      setClientDetail({ status: 'ready', client: updated.client });
      setEditClientValues(clientSummaryToProfileValues(updated.client));
      setFeedback({ tone: 'success', messageKey: 'clients.feedback.updatedClient' });
      void loadClientList(appliedClientQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.updateClient' });
    } finally {
      setPending(null);
    }
  }

  async function handleChangeClientStatus(status: ClientStatus): Promise<void> {
    if (!selectedClientId || !access.canManageClientStatus) {
      return;
    }
    const label = t(clientStatusLabelKey(status));
    if (!window.confirm(t('clients.lifecycle.confirmStatusClient', { status: label }))) {
      return;
    }
    setPending('lifecycle');
    setFeedback(null);
    try {
      const updated = await updateClientStatus(accessToken, selectedClientId, { status });
      setClientDetail({ status: 'ready', client: updated.client });
      setEditClientValues(clientSummaryToProfileValues(updated.client));
      setFeedback({
        tone: 'success',
        messageKey: 'clients.feedback.statusChangedClient',
        values: { status: label },
      });
      void loadClientList(appliedClientQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.statusClient' });
    } finally {
      setPending(null);
    }
  }

  async function handleArchiveClient(): Promise<void> {
    if (!selectedClientId || !access.canArchiveClients) {
      return;
    }
    if (!window.confirm(t('clients.lifecycle.confirmArchiveClient'))) {
      return;
    }
    setPending('lifecycle');
    setFeedback(null);
    try {
      const archived = await archiveClient(accessToken, selectedClientId);
      setClientDetail({ status: 'ready', client: archived.client });
      setEditClientValues(clientSummaryToProfileValues(archived.client));
      setFeedback({ tone: 'success', messageKey: 'clients.feedback.archivedClient' });
      void loadClientList(appliedClientQuery, true);
      if (access.canViewContacts) {
        void loadContactList(selectedClientId, appliedContactQuery, true);
      }
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.archiveClient' });
    } finally {
      setPending(null);
    }
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId || !access.canCreateContacts) {
      return;
    }
    setPending('createContact');
    setFeedback(null);
    try {
      const created = await createClientContact(
        accessToken,
        selectedClientId,
        toContactCreateRequest(createContactValues),
      );
      setCreateContactValues(EMPTY_CREATE_CONTACT);
      setSelectedContact(created.contact);
      setEditContactValues(contactSummaryToProfileValues(created.contact));
      setFeedback({ tone: 'success', messageKey: 'clients.feedback.createdContact' });
      void loadContactList(selectedClientId, appliedContactQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.createContact' });
    } finally {
      setPending(null);
    }
  }

  async function handleSaveContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClientId || !selectedContact || !editContactValues || !access.canUpdateContacts) {
      return;
    }
    setPending('updateContact');
    setFeedback(null);
    try {
      const updated = await updateClientContact(
        accessToken,
        selectedClientId,
        selectedContact.id,
        toContactUpdateRequest(editContactValues),
      );
      setSelectedContact(updated.contact);
      setEditContactValues(contactSummaryToProfileValues(updated.contact));
      setFeedback({ tone: 'success', messageKey: 'clients.feedback.updatedContact' });
      void loadContactList(selectedClientId, appliedContactQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.updateContact' });
    } finally {
      setPending(null);
    }
  }

  async function handleChangeContactStatus(status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (!selectedClientId || !selectedContact || !access.canManageContactStatus) {
      return;
    }
    const label = t(`clients.contactStatus.${status}`);
    if (!window.confirm(t('clients.lifecycle.confirmStatusContact', { status: label }))) {
      return;
    }
    setPending('lifecycle');
    setFeedback(null);
    try {
      const updated = await updateClientContactStatus(
        accessToken,
        selectedClientId,
        selectedContact.id,
        { status },
      );
      setSelectedContact(updated.contact);
      setEditContactValues(contactSummaryToProfileValues(updated.contact));
      setFeedback({
        tone: 'success',
        messageKey: 'clients.feedback.statusChangedContact',
        values: { status: label },
      });
      void loadContactList(selectedClientId, appliedContactQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.statusContact' });
    } finally {
      setPending(null);
    }
  }

  async function handleArchiveContact(): Promise<void> {
    if (!selectedClientId || !selectedContact || !access.canArchiveContacts) {
      return;
    }
    if (!window.confirm(t('clients.lifecycle.confirmArchiveContact'))) {
      return;
    }
    setPending('lifecycle');
    setFeedback(null);
    try {
      const archived = await archiveClientContact(
        accessToken,
        selectedClientId,
        selectedContact.id,
      );
      setSelectedContact(archived.contact);
      setEditContactValues(contactSummaryToProfileValues(archived.contact));
      setFeedback({ tone: 'success', messageKey: 'clients.feedback.archivedContact' });
      void loadContactList(selectedClientId, appliedContactQuery, true);
    } catch {
      setFeedback({ tone: 'danger', messageKey: 'clients.feedback.failure.archiveContact' });
    } finally {
      setPending(null);
    }
  }

  return (
    <ClientsWorkspace
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
      pending={pending}
      selectedClientId={selectedClientId}
      selectedContact={selectedContact}
    />
  );
}
