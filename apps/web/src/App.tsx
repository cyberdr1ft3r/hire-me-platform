import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type {
  AdminPermission,
  AdminRole,
  AdminRoleName,
  AdminUserDetail,
  AdminUserSummary,
  AuthenticatedUser,
  CommercialContractSummary,
  DocumentDetail,
  DocumentSummary,
  DocumentType,
  DocumentGenerationRequest,
  DocumentGenerationResponse,
  DocumentVersion,
  GeneratedVersionProvenance,
  InvoiceSummary,
  CandidateEvaluation,
  ClientContactSummary,
  ClientSummary,
  InterviewSummary,
  MissionAssignmentSummary,
  MissionCandidateState,
  MissionCandidateSummary,
  MissionLifecycleState,
  MissionSummary,
  MissionPlacement,
  OfferAggregate,
  InternalPublicApplicationSummary,
  InternalPublicOpportunity,
  PurchaseOrderSummary,
  QuotationSummary,
  ClientReceivableSummary,
  ExpenseSummary,
  OverdueReceivableListResponse,
  PaymentDetail,
  PaymentSummary,
  ProfitabilityContext,
  ProfitabilitySummary,
  TrainingEnrollmentSummary,
  TrainingParticipationSummary,
  TrainingProgramSummary,
  TrainingSessionSummary,
} from '@hire-me/contracts';

import {
  archiveClient,
  archiveClientContact,
  archiveCommercialContract,
  archiveInvoice,
  archiveMission,
  archiveDocument,
  archiveMissionAssignment,
  archiveInterview,
  archivePurchaseOrder,
  archiveQuotation,
  cancelInterview,
  cancelInvoice,
  assignAdminRole,
  completeInterview,
  createClient,
  createClientContact,
  createCommercialContract,
  createInvoice,
  createMission,
  createDocument,
  createMissionAssignment,
  createEvaluation,
  createAdminUser,
  createPurchaseOrder,
  createQuotation,
  fetchHealthStatus,
  fetchMeWithRefresh,
  finalizeEvaluation,
  getClient,
  getMission,
  getDocument,
  getInternalPublicOpportunity,
  getAdminUser,
  issueInvoice,
  listClientContacts,
  listClients,
  listCommercialContracts,
  listInvoices,
  listMissionAssignments,
  listMissions,
  listDocuments,
  listDocumentVersions,
  listInternalPublicApplications,
  listEvaluations,
  listInterviews,
  listAdminPermissions,
  listAdminRoles,
  listAdminUsers,
  listPurchaseOrders,
  listQuotations,
  login,
  logout,
  removeAdminRole,
  revokeAdminSession,
  revokeAllAdminSessions,
  updateAdminUser,
  updateAdminUserStatus,
  updateClient,
  updateClientContact,
  updateClientContactStatus,
  updateClientStatus,
  updateCommercialContractStatus,
  updateMission,
  updateDocument,
  updateMissionAssignment,
  updateMissionStatus,
  updateInternalPublicOpportunity,
  updatePurchaseOrderStatus,
  updateQuotationStatus,
  closeMission,
  confirmMissionCandidatePlacement,
  correctMissionCandidatePlacement,
  createMissionCandidateOffer,
  createMissionCandidate,
  getMissionCandidateOffers,
  getMissionCandidatePlacement,
  setMissionLeadRecruiter,
  scheduleInterview,
  listMissionCandidates,
  presentMissionCandidate,
  postponeInterview,
  refresh,
  rescheduleInterview,
  transferMissionCandidate,
  transitionMissionCandidate,
  markMissionCandidateOfferSent,
  recordMissionCandidateOfferResponse,
  reviseMissionCandidateOffer,
  withdrawMissionCandidateOffer,
  addDocumentVersion,
  downloadDocumentVersion,
  generateContractDocument,
  generateInvoiceDocument,
  generatePurchaseOrderDocument,
  generateQuotationDocument,
  generateTrainingCertificateDocument,
  allocatePayment,
  archiveExpense,
  createExpense,
  createPayment,
  getClientReceivables,
  getPayment,
  getProfitability,
  listExpenses,
  listOverdueReceivables,
  listPayments,
  reversePaymentAllocation,
  archiveTrainingParticipation,
  archiveTrainingProgram,
  archiveTrainingSession,
  cancelTrainingSession,
  correctTrainingAttendance,
  createTrainingEnrollment,
  createTrainingParticipation,
  createTrainingProgram,
  createTrainingSession,
  listTrainingEnrollments,
  listTrainingParticipations,
  listTrainingPrograms,
  listTrainingSessions,
  rescheduleTrainingSession,
  updateTrainingAttendance,
  updateTrainingEnrollmentCertificateStatus,
  updateTrainingEnrollmentStatus,
  updateTrainingProgramStatus,
  updateTrainingSessionStatus,
  withdrawTrainingEnrollment,
} from './api.js';
import {
  canAccessInternalRoute,
  isDeferredEnglishRoute,
  pathToRoute,
  routeToPath,
  type InternalRoute,
} from './navigation/internal-navigation.js';
import { AppShell } from './ui/shell/AppShell.js';
import { I18nProvider, LegacyEnglishContent, useI18n } from './i18n/index.js';
import { InternalHome } from './ui/shell/InternalHome.js';
import { ReportingPanel } from './reporting/index.js';
import { CandidatesPanel } from './candidates/index.js';
import { TasksPanel } from './tasks/index.js';
import {
  PublicOpportunitiesPanel,
  PublicOpportunityDetailPanel,
} from './public-opportunities/index.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

type CreatableDocumentType = Exclude<DocumentType, 'LEGACY_CONTRACT'>;

/**
 * One localization provider wraps the whole application, so the public
 * opportunity routes below share the authenticated workspace's active locale
 * and its stored preference without a second architecture.
 */
export function App() {
  return (
    <I18nProvider>
      <AppRoutes />
    </I18nProvider>
  );
}

function AppRoutes() {
  const { t } = useI18n();
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [route, setRoute] = useState<InternalRoute>(() => pathToRoute(window.location.pathname));

  useEffect(() => {
    let isMounted = true;

    fetchHealthStatus()
      .then((health) => {
        if (isMounted) {
          setApiState({
            status: 'ready',
            message: `${health.service} is ${health.status}`,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setApiState({
            status: 'error',
            message: 'API health status is unavailable',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let isMounted = true;

    refresh()
      .then((auth) => {
        if (isMounted) {
          setAccessToken(auth.accessToken);
          setUser(auth.user);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError(null);

    const formData = new FormData(event.currentTarget);
    const emailValue = formData.get('email');
    const passwordValue = formData.get('password');
    const email = typeof emailValue === 'string' ? emailValue : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';

    try {
      const auth = await login(email, password);
      setAccessToken(auth.accessToken);
      setUser(auth.user);
    } catch {
      setAuthError(t('auth.failed'));
    }
  }

  async function handleRefreshUser(): Promise<void> {
    if (!accessToken) {
      return;
    }

    try {
      const { accessToken: nextAccessToken, me } = await fetchMeWithRefresh(accessToken);
      setAccessToken(nextAccessToken);
      setUser(me.user);
    } catch {
      setAccessToken(null);
      setUser(null);
    }
  }

  async function handleLogout(): Promise<void> {
    if (accessToken) {
      await logout(accessToken);
    }
    setAccessToken(null);
    setUser(null);
    navigate('home');
  }

  function navigate(nextRoute: InternalRoute): void {
    setRoute(nextRoute);
    window.history.pushState({}, '', routeToPath(nextRoute));
  }

  // The public opportunity pages are bilingual and share the locale provider and
  // the saved preference, so they carry no English boundary. They stay outside
  // the internal shell and are matched on the same URLs as always.
  const publicOpportunityMatch = window.location.pathname.match(/^\/opportunities\/([^/]+)$/);
  if (window.location.pathname === '/opportunities') {
    return <PublicOpportunitiesPanel />;
  }
  if (publicOpportunityMatch?.[1]) {
    // Keyed by slug, so a different opportunity never inherits another's form.
    return (
      <PublicOpportunityDetailPanel
        key={publicOpportunityMatch[1]}
        publicSlug={publicOpportunityMatch[1]}
      />
    );
  }

  if (!user || !accessToken) {
    return (
      <main className="shell login-shell">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Hire Me Platform</p>
          <h1 id="page-title">{t('auth.title')}</h1>
          <p>{t('auth.subtitle')}</p>
        </section>
        <form
          className="auth-panel"
          aria-label={t('auth.formRegion')}
          onSubmit={(event) => {
            void handleLogin(event);
          }}
        >
          <h2>{t('auth.heading')}</h2>
          <label>
            {t('auth.email')}
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            {t('auth.password')}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">{t('auth.submit')}</button>
          {authError ? <p role="alert">{authError}</p> : null}
        </form>
        <div className="login-health" aria-live="polite" aria-label={t('auth.apiStatusRegion')}>
          <span aria-hidden="true" className={`status-dot status-dot--${apiState.status}`} />
          <span>{apiState.status === 'loading' ? t('auth.checkingApi') : apiState.message}</span>
        </div>
      </main>
    );
  }

  const canOpenRoute = canAccessInternalRoute(route, user.permissions);
  let routeContent: ReactNode;

  if (!canOpenRoute) {
    routeContent = (
      <section className="admin-panel" aria-label={t('access.deniedRegion')}>
        <h2>{t('access.deniedTitle')}</h2>
        <p role="alert">{t('access.deniedMessage')}</p>
      </section>
    );
  } else {
    switch (route) {
      case 'admin':
        routeContent = <AdminPanel accessToken={accessToken} />;
        break;
      case 'clients':
        routeContent = <ClientsPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'candidates':
        routeContent = <CandidatesPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'missions':
        routeContent = <MissionsPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'tasks':
        routeContent = <TasksPanel accessToken={accessToken} user={user} />;
        break;
      case 'documents':
        routeContent = <DocumentsPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'training':
        routeContent = <TrainingPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'reporting':
        routeContent = <ReportingPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'commercial':
        routeContent = <CommercialPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'accounting':
        routeContent = <AccountingPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      default:
        routeContent = <InternalHome user={user} />;
    }
  }

  if (canOpenRoute && isDeferredEnglishRoute(route)) {
    // The shell around this module is translated, but the module itself is not
    // yet. Say so, rather than letting French chrome imply French content.
    routeContent = <LegacyEnglishContent>{routeContent}</LegacyEnglishContent>;
  }

  return (
    <AppShell
      apiState={apiState}
      currentRoute={route}
      onLogout={handleLogout}
      onNavigate={navigate}
      onRefreshUser={handleRefreshUser}
      user={user}
    >
      {routeContent}
    </AppShell>
  );
}

function AdminPanel({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadCatalog();
    void loadUsers();
  }, []);

  async function loadCatalog(): Promise<void> {
    const [roleList, permissionList] = await Promise.all([
      listAdminRoles(accessToken),
      listAdminPermissions(accessToken),
    ]);
    setRoles(roleList.roles);
    setPermissions(permissionList.permissions);
  }

  async function loadUsers(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listAdminUsers({
      accessToken,
      search: nextSearch,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setUsers(response.users);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadUsers(search, statusFilter);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const created = await createAdminUser(accessToken, {
      displayName: formValue(formData, 'displayName'),
      email: formValue(formData, 'email'),
      initialPassword: formValue(formData, 'initialPassword'),
      locale: formValue(formData, 'locale', 'en'),
    });
    form.reset();
    setSelectedUser(created.user);
    setMessage('User created.');
    await loadUsers();
  }

  async function selectUser(userId: string): Promise<void> {
    const response = await getAdminUser(accessToken, userId);
    setSelectedUser(response.user);
    setMessage(null);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateAdminUser(accessToken, selectedUser.id, {
      displayName: formValue(formData, 'displayName', selectedUser.displayName),
      locale: formValue(formData, 'locale', selectedUser.locale),
    });
    setSelectedUser(updated.user);
    setMessage('User updated.');
    await loadUsers();
  }

  async function handleAssignRole(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const roleName = formValue(formData, 'roleName') as AdminRoleName;
    const updated = await assignAdminRole(accessToken, selectedUser.id, { roleName });
    setSelectedUser(updated.user);
    setMessage('Role assigned.');
    await loadUsers();
  }

  async function removeRole(roleName: string): Promise<void> {
    if (!selectedUser || !window.confirm(`Remove ${roleName} from this user?`)) {
      return;
    }
    const updated = await removeAdminRole(accessToken, selectedUser.id, roleName);
    setSelectedUser(updated.user);
    setMessage('Role removed.');
    await loadUsers();
  }

  async function changeStatus(status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'): Promise<void> {
    if (!selectedUser || !window.confirm(`Change this user status to ${status}?`)) {
      return;
    }
    const updated = await updateAdminUserStatus(accessToken, selectedUser.id, { status });
    setSelectedUser(updated.user);
    setMessage(`Status changed to ${status}.`);
    await loadUsers();
  }

  async function revokeOneSession(sessionId: string): Promise<void> {
    if (!selectedUser || !window.confirm('Revoke this selected refresh session?')) {
      return;
    }
    const response = await revokeAdminSession(accessToken, selectedUser.id, sessionId);
    setSelectedUser({ ...selectedUser, sessions: response.sessions });
    setMessage('Session revoked.');
  }

  async function revokeAllSessions(): Promise<void> {
    if (!selectedUser || !window.confirm('Revoke all active refresh sessions for this user?')) {
      return;
    }
    const response = await revokeAllAdminSessions(accessToken, selectedUser.id);
    setSelectedUser({ ...selectedUser, sessions: response.sessions, activeSessionCount: 0 });
    setMessage('All sessions revoked.');
    await loadUsers();
  }

  return (
    <section className="admin-panel" aria-label="Administration">
      <div className="admin-grid">
        <section aria-label="User administration">
          <h2>Administration</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                name="status"
              >
                <option value="">Any</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit">Search users</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((adminUser) => (
                <tr key={adminUser.id}>
                  <td>
                    <button type="button" onClick={() => void selectUser(adminUser.id)}>
                      {adminUser.displayName}
                    </button>
                  </td>
                  <td>{adminUser.status}</td>
                  <td>{adminUser.roles.join(', ') || 'None'}</td>
                  <td>{adminUser.activeSessionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="stacked-form"
            aria-label="Create internal user"
            onSubmit={(event) => void handleCreate(event)}
          >
            <h3>Create internal user</h3>
            <input name="displayName" placeholder="Display name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="locale" placeholder="Locale" defaultValue="en" required />
            <input
              name="initialPassword"
              type="password"
              placeholder="Initial password"
              autoComplete="new-password"
              required
            />
            <button type="submit">Create user</button>
          </form>
        </section>

        <section aria-label="Selected user detail">
          {selectedUser ? (
            <>
              <h2>{selectedUser.displayName}</h2>
              <p>{selectedUser.email}</p>
              <p>Status: {selectedUser.status}</p>
              <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                <input
                  name="displayName"
                  aria-label="Display name"
                  defaultValue={selectedUser.displayName}
                />
                <input name="locale" aria-label="Locale" defaultValue={selectedUser.locale} />
                <button type="submit">Update profile</button>
              </form>

              <div className="action-row">
                <button type="button" onClick={() => void changeStatus('ACTIVE')}>
                  Reactivate
                </button>
                <button type="button" onClick={() => void changeStatus('SUSPENDED')}>
                  Suspend
                </button>
                <button type="button" onClick={() => void changeStatus('ARCHIVED')}>
                  Archive
                </button>
              </div>

              <form className="inline-form" onSubmit={(event) => void handleAssignRole(event)}>
                <label>
                  Role
                  <select name="roleName" required>
                    {roles.map((role) => (
                      <option key={role.id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Assign role</button>
              </form>

              <ul>
                {selectedUser.roles.map((roleName) => (
                  <li key={roleName}>
                    {roleName}{' '}
                    <button type="button" onClick={() => void removeRole(roleName)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <h3>Active sessions</h3>
              <button type="button" onClick={() => void revokeAllSessions()}>
                Revoke all sessions
              </button>
              <ul>
                {selectedUser.sessions.map((session) => (
                  <li key={session.id}>
                    {session.createdAt}{' '}
                    <button type="button" onClick={() => void revokeOneSession(session.id)}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>

              <h3>Effective permissions</h3>
              <p>{selectedUser.effectivePermissions.join(', ') || 'None'}</p>
            </>
          ) : (
            <p>Select a user to inspect safe profile, roles, permissions, and sessions.</p>
          )}
          {message ? <p role="status">{message}</p> : null}
        </section>
      </div>

      <section aria-label="Permission catalog">
        <h2>Permission catalog</h2>
        <p>{permissions.map((permission) => permission.code).join(', ')}</p>
      </section>
    </section>
  );
}

function ClientsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [contacts, setContacts] = useState<ClientContactSummary[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [selectedContact, setSelectedContact] = useState<ClientContactSummary | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSeeCommercial = permissions.includes('commercial_data:access');
  const canCreateClients = permissions.includes('clients:create');
  const canUpdateClients = permissions.includes('clients:update');
  const canManageClientStatus = permissions.includes('clients:status:manage');
  const canArchiveClients = permissions.includes('clients:archive');
  const canViewContacts = permissions.includes('client_contacts:view');
  const canCreateContacts = permissions.includes('client_contacts:create');
  const canUpdateContacts = permissions.includes('client_contacts:update');
  const canManageContactStatus = permissions.includes('client_contacts:status:manage');
  const canArchiveContacts = permissions.includes('client_contacts:archive');

  useEffect(() => {
    void loadClients();
  }, []);

  async function loadClients(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listClients({
      accessToken,
      search: nextSearch,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setClients(response.clients);
  }

  async function loadContacts(clientId: string): Promise<void> {
    if (!canViewContacts) {
      setContacts([]);
      return;
    }

    const response = await listClientContacts({ accessToken, clientId, pageSize: 20 });
    setContacts(response.contacts);
  }

  async function handleClientSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadClients(search, statusFilter);
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const created = await createClient(accessToken, {
        name: formValue(formData, 'name'),
        industry: optionalFormValue(formData, 'industry'),
        website: optionalFormValue(formData, 'website'),
        mainPhone: optionalFormValue(formData, 'mainPhone'),
        country: optionalFormValue(formData, 'country'),
        city: optionalFormValue(formData, 'city'),
        ...(canSeeCommercial
          ? { commercialSummary: optionalFormValue(formData, 'commercialSummary') }
          : {}),
      });
      form.reset();
      setSelectedClient(created.client);
      setContacts([]);
      setMessage('Client created.');
      await loadClients();
      if (canViewContacts) {
        await loadContacts(created.client.id);
      }
    } catch {
      setError('Client could not be created.');
    }
  }

  async function selectClient(clientId: string): Promise<void> {
    setError(null);
    const [client] = await Promise.all([
      getClient(accessToken, clientId),
      canViewContacts ? loadContacts(clientId) : Promise.resolve(),
    ]);
    setSelectedClient(client.client);
    setSelectedContact(null);
    setMessage(null);
  }

  async function handleUpdateClient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClient) {
      return;
    }
    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      const updated = await updateClient(accessToken, selectedClient.id, {
        name: formValue(formData, 'name', selectedClient.name),
        industry: nullableFormValue(formData, 'industry'),
        website: nullableFormValue(formData, 'website'),
        mainPhone: nullableFormValue(formData, 'mainPhone'),
        country: nullableFormValue(formData, 'country'),
        city: nullableFormValue(formData, 'city'),
        ...(canSeeCommercial
          ? { commercialSummary: nullableFormValue(formData, 'commercialSummary') }
          : {}),
      });
      setSelectedClient(updated.client);
      setMessage('Client updated.');
      await loadClients();
    } catch {
      setError('Client could not be updated.');
    }
  }

  async function changeClientStatus(status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (!selectedClient || !window.confirm(`Change this client status to ${status}?`)) {
      return;
    }
    const updated = await updateClientStatus(accessToken, selectedClient.id, { status });
    setSelectedClient(updated.client);
    setMessage(`Client status changed to ${status}.`);
    await loadClients();
  }

  async function archiveSelectedClient(): Promise<void> {
    if (!selectedClient || !window.confirm('Archive this client and its contacts?')) {
      return;
    }
    const archived = await archiveClient(accessToken, selectedClient.id);
    setSelectedClient(archived.client);
    setMessage('Client archived.');
    await loadClients();
    if (canViewContacts) {
      await loadContacts(archived.client.id);
    }
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClient || !canCreateContacts) {
      return;
    }
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const created = await createClientContact(accessToken, selectedClient.id, {
        displayName: formValue(formData, 'displayName'),
        email: formValue(formData, 'email'),
        phone: optionalFormValue(formData, 'phone'),
        roleTitle: optionalFormValue(formData, 'roleTitle'),
      });
      form.reset();
      setSelectedContact(created.contact);
      setMessage('Client contact created.');
      if (canViewContacts) {
        await loadContacts(selectedClient.id);
      }
    } catch {
      setError('Client contact could not be created.');
    }
  }

  async function handleUpdateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedClient || !selectedContact || !canUpdateContacts) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateClientContact(accessToken, selectedClient.id, selectedContact.id, {
      displayName: formValue(formData, 'displayName', selectedContact.displayName),
      email: formValue(formData, 'email', selectedContact.email),
      phone: nullableFormValue(formData, 'phone'),
      roleTitle: nullableFormValue(formData, 'roleTitle'),
    });
    setSelectedContact(updated.contact);
    setMessage('Client contact updated.');
    if (canViewContacts) {
      await loadContacts(selectedClient.id);
    }
  }

  async function changeContactStatus(status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    if (
      !selectedClient ||
      !selectedContact ||
      !canManageContactStatus ||
      !window.confirm(`Change this contact status to ${status}?`)
    ) {
      return;
    }
    const updated = await updateClientContactStatus(
      accessToken,
      selectedClient.id,
      selectedContact.id,
      { status },
    );
    setSelectedContact(updated.contact);
    setMessage(`Contact status changed to ${status}.`);
    if (canViewContacts) {
      await loadContacts(selectedClient.id);
    }
  }

  async function archiveSelectedContact(): Promise<void> {
    if (
      !selectedClient ||
      !selectedContact ||
      !canArchiveContacts ||
      !window.confirm('Archive this client contact?')
    ) {
      return;
    }
    const archived = await archiveClientContact(accessToken, selectedClient.id, selectedContact.id);
    setSelectedContact(archived.contact);
    setMessage('Client contact archived.');
    if (canViewContacts) {
      await loadContacts(selectedClient.id);
    }
  }

  return (
    <section className="admin-panel" aria-label="Clients">
      <div className="admin-grid">
        <section aria-label="Client list">
          <h2>Clients</h2>
          <form className="inline-form" onSubmit={(event) => void handleClientSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                name="status"
              >
                <option value="">Any</option>
                <option value="PROSPECT">Prospect</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit">Search clients</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Industry</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <button type="button" onClick={() => void selectClient(client.id)}>
                      {client.name}
                    </button>
                  </td>
                  <td>{client.status}</td>
                  <td>{client.industry ?? 'None'}</td>
                  <td>{[client.city, client.country].filter(Boolean).join(', ') || 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="stacked-form"
            aria-label="Create client"
            onSubmit={(event) => void handleCreateClient(event)}
          >
            <h3>Create client</h3>
            <input name="name" placeholder="Client name" required />
            <input name="industry" placeholder="Industry" />
            <input name="website" placeholder="Website" />
            <input name="mainPhone" placeholder="Main phone" />
            <input name="country" placeholder="Country" />
            <input name="city" placeholder="City" />
            {canSeeCommercial ? (
              <textarea name="commercialSummary" placeholder="Commercial summary" />
            ) : null}
            <button type="submit" disabled={!canCreateClients}>
              Create client
            </button>
          </form>
        </section>

        <section aria-label="Client detail">
          {selectedClient ? (
            <>
              <h2>{selectedClient.name}</h2>
              <p>Status: {selectedClient.status}</p>
              <form className="stacked-form" onSubmit={(event) => void handleUpdateClient(event)}>
                <input name="name" aria-label="Client name" defaultValue={selectedClient.name} />
                <input
                  name="industry"
                  aria-label="Industry"
                  defaultValue={selectedClient.industry ?? ''}
                />
                <input
                  name="website"
                  aria-label="Website"
                  defaultValue={selectedClient.website ?? ''}
                />
                <input
                  name="mainPhone"
                  aria-label="Main phone"
                  defaultValue={selectedClient.mainPhone ?? ''}
                />
                <input
                  name="country"
                  aria-label="Country"
                  defaultValue={selectedClient.country ?? ''}
                />
                <input name="city" aria-label="City" defaultValue={selectedClient.city ?? ''} />
                {canSeeCommercial ? (
                  <textarea
                    name="commercialSummary"
                    aria-label="Commercial summary"
                    defaultValue={selectedClient.commercial?.commercialSummary ?? ''}
                  />
                ) : null}
                <button
                  type="submit"
                  disabled={!canUpdateClients || selectedClient.status === 'ARCHIVED'}
                >
                  Update client
                </button>
              </form>

              <div className="action-row">
                <button
                  type="button"
                  disabled={!canManageClientStatus}
                  onClick={() => void changeClientStatus('PROSPECT')}
                >
                  Prospect
                </button>
                <button
                  type="button"
                  disabled={!canManageClientStatus}
                  onClick={() => void changeClientStatus('ACTIVE')}
                >
                  Active
                </button>
                <button
                  type="button"
                  disabled={!canManageClientStatus}
                  onClick={() => void changeClientStatus('INACTIVE')}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  disabled={!canArchiveClients}
                  onClick={() => void archiveSelectedClient()}
                >
                  Archive client
                </button>
              </div>

              {canViewContacts ? (
                <>
                  <h3>Contacts</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => (
                        <tr key={contact.id}>
                          <td>
                            <button type="button" onClick={() => setSelectedContact(contact)}>
                              {contact.displayName}
                            </button>
                          </td>
                          <td>{contact.status}</td>
                          <td>{contact.roleTitle ?? 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              {canCreateContacts ? (
                <form
                  className="stacked-form"
                  aria-label="Create client contact"
                  onSubmit={(event) => void handleCreateContact(event)}
                >
                  <h3>Create contact</h3>
                  <input name="displayName" placeholder="Contact name" required />
                  <input name="email" type="email" placeholder="Contact email" required />
                  <input name="phone" placeholder="Phone" />
                  <input name="roleTitle" placeholder="Role title" />
                  <button type="submit" disabled={selectedClient.status === 'ARCHIVED'}>
                    Create contact
                  </button>
                </form>
              ) : null}

              {selectedContact ? (
                <form
                  className="stacked-form"
                  aria-label="Selected client contact"
                  onSubmit={(event) => void handleUpdateContact(event)}
                >
                  <h3>{selectedContact.displayName}</h3>
                  <input
                    name="displayName"
                    aria-label="Contact name"
                    defaultValue={selectedContact.displayName}
                  />
                  <input
                    name="email"
                    type="email"
                    aria-label="Contact email"
                    defaultValue={selectedContact.email}
                  />
                  <input
                    name="phone"
                    aria-label="Contact phone"
                    defaultValue={selectedContact.phone ?? ''}
                  />
                  <input
                    name="roleTitle"
                    aria-label="Contact role title"
                    defaultValue={selectedContact.roleTitle ?? ''}
                  />
                  <button
                    type="submit"
                    disabled={!canUpdateContacts || selectedContact.status === 'ARCHIVED'}
                  >
                    Update contact
                  </button>
                  <div className="action-row">
                    <button
                      type="button"
                      disabled={!canManageContactStatus}
                      onClick={() => void changeContactStatus('ACTIVE')}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      disabled={!canManageContactStatus}
                      onClick={() => void changeContactStatus('INACTIVE')}
                    >
                      Inactive
                    </button>
                    <button
                      type="button"
                      disabled={!canArchiveContacts}
                      onClick={() => void archiveSelectedContact()}
                    >
                      Archive contact
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <p>Select a client to inspect its profile, lifecycle, and contacts.</p>
          )}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}

function MissionsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [assignments, setAssignments] = useState<MissionAssignmentSummary[]>([]);
  const [candidateProcesses, setCandidateProcesses] = useState<MissionCandidateSummary[]>([]);
  const [offersByProcessId, setOffersByProcessId] = useState<Record<string, OfferAggregate | null>>(
    {},
  );
  const [placementsByProcessId, setPlacementsByProcessId] = useState<
    Record<string, MissionPlacement | null>
  >({});
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<CandidateEvaluation[]>([]);
  const [publicOpportunity, setPublicOpportunity] = useState<InternalPublicOpportunity | null>(
    null,
  );
  const [publicApplications, setPublicApplications] = useState<InternalPublicApplicationSummary[]>(
    [],
  );
  const [selectedMission, setSelectedMission] = useState<MissionSummary | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const canCreate = permissions.includes('missions:create');
  const canUpdate = permissions.includes('missions:update');
  const canManageStatus = permissions.includes('missions:status:manage');
  const canClose = permissions.includes('missions:closure:manage');
  const canArchive = permissions.includes('missions:archive');
  const canViewAssignments = permissions.includes('mission_assignments:view');
  const canManageAssignments = permissions.includes('mission_assignments:manage');
  const canViewProcesses = permissions.includes('mission_candidates:view');
  const canCreateProcesses = permissions.includes('mission_candidates:create');
  const canTransitionProcesses = permissions.includes('mission_candidates:transition');
  const canTransferProcesses = permissions.includes('mission_candidates:transfer');
  const canPresentProcesses = permissions.includes('mission_candidates:present');
  const canViewInterviews = permissions.includes('interviews:view');
  const canScheduleInterviews = permissions.includes('interviews:schedule');
  const canRescheduleInterviews = permissions.includes('interviews:reschedule');
  const canCompleteInterviews = permissions.includes('interviews:complete');
  const canCancelInterviews = permissions.includes('interviews:cancel');
  const canArchiveInterviews = permissions.includes('interviews:archive');
  const canViewEvaluations = permissions.includes('evaluations:view');
  const canCreateEvaluations = permissions.includes('evaluations:create');
  const canFinalizeEvaluations = permissions.includes('evaluations:finalize');
  const canViewPublicOpportunity = permissions.includes('public_opportunities:view');
  const canManagePublicOpportunity = permissions.includes('public_opportunities:manage');
  const canPublishPublicOpportunity = permissions.includes('public_opportunities:publish');
  const canViewPublicApplications = permissions.includes('public_applications:view');
  const canViewOffers = permissions.includes('offers:view');
  const canCreateOffers = permissions.includes('offers:create');
  const canUpdateOffers = permissions.includes('offers:update');
  const canSendOffers = permissions.includes('offers:send_or_mark_sent');
  const canRecordOfferResponses = permissions.includes('offers:record_response');
  const canWithdrawOffers = permissions.includes('offers:withdraw');
  const canViewPlacements = permissions.includes('placements:view');
  const canConfirmPlacements = permissions.includes('placements:confirm');
  const canCorrectPlacements = permissions.includes('placements:correct');
  const canViewPlacementCommercialEligibility = permissions.includes(
    'placement_commercial_eligibility:view',
  );

  useEffect(() => {
    void loadMissions();
  }, []);

  async function loadMissions(nextSearch = search, nextState = stateFilter): Promise<void> {
    const response = await listMissions({
      accessToken,
      search: nextSearch || undefined,
      state: nextState || undefined,
      pageSize: 20,
    });
    setMissions(response.missions);
  }

  async function selectMission(missionId: string): Promise<void> {
    const response = await getMission(accessToken, missionId);
    setSelectedMission(response.mission);
    setMessage(null);
    setActiveProcessId(null);
    setInterviews([]);
    setActiveInterviewId(null);
    setEvaluations([]);
    setPublicOpportunity(null);
    setPublicApplications([]);
    setOffersByProcessId({});
    setPlacementsByProcessId({});
    if (canViewAssignments) {
      const assignmentResponse = await listMissionAssignments(accessToken, missionId);
      setAssignments(assignmentResponse.assignments);
    }
    if (canViewProcesses) {
      const processResponse = await listMissionCandidates(accessToken, missionId);
      setCandidateProcesses(processResponse.candidates);
    }
    if (canViewPublicOpportunity) {
      const opportunityResponse = await getInternalPublicOpportunity(accessToken, missionId);
      setPublicOpportunity(opportunityResponse.publicOpportunity);
    }
    if (canViewPublicApplications) {
      const applicationResponse = await listInternalPublicApplications(accessToken, missionId);
      setPublicApplications(applicationResponse.applications);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadMissions(search, stateFilter);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const created = await createMission(accessToken, {
      clientId: formValue(formData, 'clientId'),
      title: formValue(formData, 'title'),
      description: optionalFormValue(formData, 'description'),
      requirements: optionalFormValue(formData, 'requirements'),
      priority: formValue(formData, 'priority', 'NORMAL') as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      numberOfPositions: Number(formValue(formData, 'numberOfPositions', '1')),
      location: optionalFormValue(formData, 'location'),
      workArrangement: optionalFormValue(formData, 'workArrangement'),
      engagementType: optionalFormValue(formData, 'engagementType'),
    });
    form.reset();
    setSelectedMission(created.mission);
    setMessage('Mission created.');
    await loadMissions();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateMission(accessToken, selectedMission.id, {
      title: formValue(formData, 'title', selectedMission.title),
      priority: formValue(formData, 'priority', selectedMission.priority) as
        'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      numberOfPositions: Number(
        formValue(formData, 'numberOfPositions', String(selectedMission.numberOfPositions)),
      ),
      location: nullableFormValue(formData, 'location'),
      workArrangement: nullableFormValue(formData, 'workArrangement'),
      engagementType: nullableFormValue(formData, 'engagementType'),
    });
    setSelectedMission(updated.mission);
    setMessage('Mission updated.');
    await loadMissions();
  }

  async function changeState(state: MissionLifecycleState): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const updated = await updateMissionStatus(accessToken, selectedMission.id, { state });
    setSelectedMission(updated.mission);
    setMessage(`Mission moved to ${state}.`);
    await loadMissions();
  }

  async function closeSelectedMission(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await closeMission(accessToken, selectedMission.id, {
      state: formValue(formData, 'state') as
        | 'CLOSED_WITH_RECRUITMENT'
        | 'CLOSED_WITHOUT_RECRUITMENT'
        | 'CANCELED'
        | 'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
      closureReason: formValue(formData, 'closureReason') as
        | 'CLIENT_CLOSED_OR_CANCELED'
        | 'CLOSED_WITHOUT_RECRUITMENT'
        | 'DEADLINE_EXPIRED_WITHOUT_RENEWAL'
        | 'POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED',
      filledPlacementCount: Number(
        formValue(formData, 'filledPlacementCount', String(selectedMission.filledPlacementCount)),
      ),
    });
    setSelectedMission(updated.mission);
    setMessage('Mission closed.');
    await loadMissions();
  }

  async function archiveSelectedMission(): Promise<void> {
    if (!selectedMission || !window.confirm('Archive this recruitment mission?')) {
      return;
    }
    const archived = await archiveMission(accessToken, selectedMission.id);
    setSelectedMission(archived.mission);
    setAssignments([]);
    setCandidateProcesses([]);
    setMessage('Mission archived.');
    await loadMissions();
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const isLead = formData.get('isLead') === 'on';
    await createMissionAssignment(accessToken, selectedMission.id, {
      userId: formValue(formData, 'userId'),
      role: isLead
        ? 'LEAD_RECRUITER'
        : (formValue(formData, 'role', 'RECRUITER') as 'RECRUITER' | 'SOURCER' | 'CONTRIBUTOR'),
      isLead,
    });
    form.reset();
    await selectMission(selectedMission.id);
    setMessage('Assignment created.');
  }

  async function makeLead(assignmentId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await setMissionLeadRecruiter(accessToken, selectedMission.id, { assignmentId });
    await selectMission(selectedMission.id);
    setMessage('Lead recruiter changed.');
  }

  async function deactivateAssignment(assignmentId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await updateMissionAssignment(accessToken, selectedMission.id, assignmentId, {
      status: 'INACTIVE',
    });
    await selectMission(selectedMission.id);
    setMessage('Assignment deactivated.');
  }

  async function archiveSelectedAssignment(assignmentId: string): Promise<void> {
    if (!selectedMission || !window.confirm('Archive this mission assignment?')) {
      return;
    }
    await archiveMissionAssignment(accessToken, selectedMission.id, assignmentId);
    await selectMission(selectedMission.id);
    setMessage('Assignment archived.');
  }

  async function handleCreateProcess(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createMissionCandidate(accessToken, selectedMission.id, {
      candidateId: formValue(formData, 'candidateId'),
      responsibleRecruiterUserId: formValue(formData, 'responsibleRecruiterUserId'),
      source: optionalFormValue(formData, 'source'),
      sourceContext: optionalFormValue(formData, 'sourceContext'),
      priority: formValue(formData, 'priority', 'NORMAL') as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
      internalNotes: optionalFormValue(formData, 'internalNotes'),
    });
    form.reset();
    await selectMission(selectedMission.id);
    setMessage('Candidate linked to mission.');
  }

  async function moveProcess(
    processId: string,
    currentState: MissionCandidateState,
    nextState: MissionCandidateState,
  ): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await transitionMissionCandidate(accessToken, selectedMission.id, processId, {
      state: nextState,
      reason: 'Updated from the protected mission workspace.',
      skip: isOptionalProcessSkip(currentState, nextState),
    });
    await selectMission(selectedMission.id);
    setMessage(`Candidate process moved to ${nextState}.`);
  }

  async function transferProcess(
    event: FormEvent<HTMLFormElement>,
    processId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    await transferMissionCandidate(accessToken, selectedMission.id, processId, {
      responsibleRecruiterUserId: formValue(formData, 'responsibleRecruiterUserId'),
      reason: formValue(formData, 'reason'),
    });
    await selectMission(selectedMission.id);
    setMessage('Responsible recruiter transferred.');
  }

  async function presentProcess(processId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await presentMissionCandidate(accessToken, selectedMission.id, processId, {
      reason: 'Explicit client presentation approved.',
    });
    await selectMission(selectedMission.id);
    setMessage('Candidate presented to client.');
  }

  async function loadOfferPlacement(processId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    if (canViewOffers) {
      const offerResponse = await getMissionCandidateOffers(
        accessToken,
        selectedMission.id,
        processId,
      );
      setOffersByProcessId((current) => ({ ...current, [processId]: offerResponse.offer }));
    }
    if (canViewPlacements) {
      const placementResponse = await getMissionCandidatePlacement(
        accessToken,
        selectedMission.id,
        processId,
      );
      setPlacementsByProcessId((current) => ({
        ...current,
        [processId]: placementResponse.placement,
      }));
    }
    setMessage('Offer and placement details loaded.');
  }

  async function handleCreateOffer(
    event: FormEvent<HTMLFormElement>,
    processId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission || !canCreateOffers) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await createMissionCandidateOffer(accessToken, selectedMission.id, processId, {
      offeredSalaryAmountCents: optionalNumber(formData, 'offeredSalaryAmountCents'),
      offeredSalaryCurrency: optionalFormValue(formData, 'offeredSalaryCurrency'),
      contractType: optionalFormValue(formData, 'contractType'),
      proposedStartDate: optionalDateTimeFormValue(formData, 'proposedStartDate') ?? undefined,
      probationPeriod: optionalFormValue(formData, 'probationPeriod'),
      clientFacingRemarks: optionalFormValue(formData, 'clientFacingRemarks'),
      internalRecruiterRemarks: optionalFormValue(formData, 'internalRecruiterRemarks'),
    });
    form.reset();
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer draft created.');
  }

  async function reviseOffer(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canUpdateOffers) {
      return;
    }
    const currentVersion = offer.versions.find((version) => version.id === offer.currentVersionId);
    const response = await reviseMissionCandidateOffer(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      {
        reason: 'Offer revised from the protected mission workspace.',
        offeredSalaryAmountCents: currentVersion?.offeredSalaryAmountCents ?? undefined,
        offeredSalaryCurrency: currentVersion?.offeredSalaryCurrency ?? undefined,
        contractType: currentVersion?.contractType ?? undefined,
        clientFacingRemarks: currentVersion?.clientFacingRemarks ?? undefined,
        internalRecruiterRemarks: currentVersion?.internalRecruiterRemarks ?? undefined,
      },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer revised into a new version.');
  }

  async function markOfferSent(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canSendOffers) {
      return;
    }
    const response = await markMissionCandidateOfferSent(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      { reason: 'Offer sent by staff.' },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer marked as sent.');
  }

  async function recordOfferResponse(
    processId: string,
    offer: OfferAggregate,
    status: 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED',
  ): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canRecordOfferResponses) {
      return;
    }
    const response = await recordMissionCandidateOfferResponse(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      {
        status,
        reason:
          status === 'REJECTED'
            ? 'Candidate rejected the offer.'
            : `Offer response recorded as ${status}.`,
      },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage(`Offer response recorded as ${status}.`);
  }

  async function withdrawOffer(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canWithdrawOffers) {
      return;
    }
    const response = await withdrawMissionCandidateOffer(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      { reason: 'Offer withdrawn by staff.' },
    );
    setOffersByProcessId((current) => ({ ...current, [processId]: response.offer }));
    setMessage('Offer withdrawn.');
  }

  async function confirmPlacement(processId: string, offer: OfferAggregate): Promise<void> {
    if (!selectedMission || !offer.currentVersionId || !canConfirmPlacements) {
      return;
    }
    const response = await confirmMissionCandidatePlacement(
      accessToken,
      selectedMission.id,
      processId,
      offer.currentVersionId,
      {
        integrationStartDate: new Date().toISOString(),
        eligibleForInvoicing: false,
        operationalNote: 'Placement confirmed from the protected mission workspace.',
      },
    );
    await selectMission(selectedMission.id);
    setPlacementsByProcessId((current) => ({ ...current, [processId]: response.placement }));
    await loadMissions();
    setMessage('Placement confirmed from accepted offer.');
  }

  async function correctPlacement(processId: string): Promise<void> {
    if (!selectedMission || !canCorrectPlacements) {
      return;
    }
    const response = await correctMissionCandidatePlacement(
      accessToken,
      selectedMission.id,
      processId,
      {
        reason: 'ADMINISTRATIVE_ERROR',
        comment: 'Placement corrected from the protected mission workspace.',
      },
    );
    await selectMission(selectedMission.id);
    setPlacementsByProcessId((current) => ({ ...current, [processId]: response.placement }));
    await loadMissions();
    setMessage('Placement correction recorded.');
  }

  async function loadProcessInterviews(processId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const response = await listInterviews(accessToken, selectedMission.id, processId);
    setActiveProcessId(processId);
    setInterviews(response.interviews);
    setActiveInterviewId(null);
    setEvaluations([]);
    setMessage('Interviews loaded.');
  }

  async function handleScheduleInterview(
    event: FormEvent<HTMLFormElement>,
    processId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await scheduleInterview(accessToken, selectedMission.id, processId, {
      type: formValue(formData, 'type') as
        'HR' | 'TECHNICAL' | 'INTERNAL_VALIDATION' | 'CLIENT_INTERVIEW_1' | 'CLIENT_INTERVIEW_2',
      scheduledStartAt: dateTimeFormValue(formData, 'scheduledStartAt'),
      scheduledEndAt: optionalDateTimeFormValue(formData, 'scheduledEndAt'),
      timezone: formValue(formData, 'timezone', 'UTC'),
      format: formValue(formData, 'format', 'VIDEO') as 'ONSITE' | 'PHONE' | 'VIDEO' | 'OTHER',
      location: optionalFormValue(formData, 'location'),
      meetingUrl: optionalFormValue(formData, 'meetingUrl'),
      organizerUserId: formValue(formData, 'organizerUserId'),
      internalUserParticipantIds: csvValues(formData, 'internalUserParticipantIds'),
      clientContactParticipantIds: csvValues(formData, 'clientContactParticipantIds'),
      externalParticipants: [],
    });
    form.reset();
    await loadProcessInterviews(processId);
    setMessage('Interview scheduled.');
  }

  async function updateInterviewStatus(
    processId: string,
    interviewId: string,
    action: 'postpone' | 'complete' | 'cancel' | 'archive',
  ): Promise<void> {
    if (!selectedMission) {
      return;
    }
    if (action === 'postpone') {
      await postponeInterview(accessToken, selectedMission.id, processId, interviewId, {
        reason: 'Updated from the protected mission workspace.',
      });
    } else if (action === 'complete') {
      await completeInterview(accessToken, selectedMission.id, processId, interviewId, {
        outcome: 'Completed from the protected mission workspace.',
      });
    } else if (action === 'cancel') {
      await cancelInterview(accessToken, selectedMission.id, processId, interviewId, {
        reason: 'Canceled from the protected mission workspace.',
      });
    } else {
      await archiveInterview(accessToken, selectedMission.id, processId, interviewId);
    }
    await loadProcessInterviews(processId);
    setMessage(`Interview ${action} action completed.`);
  }

  async function handleRescheduleInterview(
    event: FormEvent<HTMLFormElement>,
    processId: string,
    interviewId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    await rescheduleInterview(accessToken, selectedMission.id, processId, interviewId, {
      scheduledStartAt: dateTimeFormValue(formData, 'scheduledStartAt'),
      scheduledEndAt: optionalDateTimeFormValue(formData, 'scheduledEndAt'),
      timezone: formValue(formData, 'timezone', 'UTC'),
      reason: formValue(formData, 'reason'),
    });
    await loadProcessInterviews(processId);
    setMessage('Interview rescheduled.');
  }

  async function loadInterviewEvaluations(processId: string, interviewId: string): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const response = await listEvaluations(accessToken, selectedMission.id, processId, interviewId);
    setActiveProcessId(processId);
    setActiveInterviewId(interviewId);
    setEvaluations(response.evaluations);
    setMessage('Evaluations loaded.');
  }

  async function handleCreateEvaluation(
    event: FormEvent<HTMLFormElement>,
    processId: string,
    interviewId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!selectedMission) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createEvaluation(accessToken, selectedMission.id, processId, interviewId, {
      evaluationType: formValue(formData, 'evaluationType', 'INTERNAL_HR') as
        'INTERNAL_HR' | 'INTERNAL_TECHNICAL' | 'CLIENT',
      overallScore: optionalNumber(formData, 'overallScore'),
      communicationScore: optionalNumber(formData, 'communicationScore'),
      technicalScore: optionalNumber(formData, 'technicalScore'),
      roleFitScore: optionalNumber(formData, 'roleFitScore'),
      cultureFitScore: optionalNumber(formData, 'cultureFitScore'),
      motivationScore: optionalNumber(formData, 'motivationScore'),
      salaryAlignmentScore: optionalNumber(formData, 'salaryAlignmentScore'),
      recommendation: formValue(formData, 'recommendation', 'NEUTRAL') as
        'STRONG_YES' | 'YES' | 'NEUTRAL' | 'NO' | 'STRONG_NO',
      strengths: optionalFormValue(formData, 'strengths'),
      weaknesses: optionalFormValue(formData, 'weaknesses'),
      risks: optionalFormValue(formData, 'risks'),
      comment: optionalFormValue(formData, 'comment'),
      finalOpinion: formData.get('finalOpinion') === 'on',
      clientVisible: false,
    });
    form.reset();
    await loadInterviewEvaluations(processId, interviewId);
    await loadProcessInterviews(processId);
    setMessage('Evaluation saved.');
  }

  async function finalizeSelectedEvaluation(
    processId: string,
    interviewId: string,
    evaluationId: string,
  ): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await finalizeEvaluation(accessToken, selectedMission.id, processId, interviewId, evaluationId);
    await loadInterviewEvaluations(processId, interviewId);
    setMessage('Evaluation finalized.');
  }

  async function handlePublicOpportunityUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedMission || !publicOpportunity || !canManagePublicOpportunity) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateInternalPublicOpportunity(accessToken, selectedMission.id, {
      publicTitle: formValue(formData, 'publicTitle', publicOpportunity.publicTitle),
      publicSummary: nullableFormValue(formData, 'publicSummary'),
      publicDescription: nullableFormValue(formData, 'publicDescription'),
      publicLocation: nullableFormValue(formData, 'publicLocation'),
      publicWorkArrangement: nullableFormValue(formData, 'publicWorkArrangement'),
      publicEngagementType: nullableFormValue(formData, 'publicEngagementType'),
      publicExperienceLevel: nullableFormValue(formData, 'publicExperienceLevel'),
      publicSkills: nullableFormValue(formData, 'publicSkills'),
      publicationStartsAt: optionalDateTimeFormValue(formData, 'publicationStartsAt') ?? null,
      applicationDeadline: optionalDateTimeFormValue(formData, 'applicationDeadline') ?? null,
      showClientName: formData.get('showClientName') === 'on',
      showSalary: formData.get('showSalary') === 'on',
      cvRequired: formData.get('cvRequired') === 'on',
      certificationsEnabled: formData.get('certificationsEnabled') === 'on',
      certificationsRequired: formData.get('certificationsRequired') === 'on',
      diplomasEnabled: formData.get('diplomasEnabled') === 'on',
      diplomasRequired: formData.get('diplomasRequired') === 'on',
      additionalAttachmentsEnabled: formData.get('additionalAttachmentsEnabled') === 'on',
    });
    setPublicOpportunity(updated.publicOpportunity);
    setMessage('Public opportunity configuration saved.');
  }

  async function updatePublicOpportunityPublication(
    input: Parameters<typeof updateInternalPublicOpportunity>[2],
    successMessage: string,
  ): Promise<void> {
    if (!selectedMission || !publicOpportunity || !canPublishPublicOpportunity) {
      return;
    }
    const updated = await updateInternalPublicOpportunity(accessToken, selectedMission.id, input);
    setPublicOpportunity(updated.publicOpportunity);
    setMessage(successMessage);
  }

  async function copyPublicOpportunityLink(): Promise<void> {
    if (!publicOpportunity) {
      return;
    }
    const publicUrl = `${window.location.origin}/opportunities/${publicOpportunity.publicSlug}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Public link copied.');
    } catch {
      setMessage('Public link could not be copied.');
    }
  }

  return (
    <section className="admin-panel" aria-label="Missions">
      <div className="admin-grid">
        <section aria-label="Recruitment mission list">
          <h2>Missions</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              State
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.currentTarget.value)}
                name="state"
              >
                <option value="">Any</option>
                {missionStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Search missions</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Client</th>
                <th>State</th>
                <th>Positions</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <tr key={mission.id}>
                  <td>
                    <button type="button" onClick={() => void selectMission(mission.id)}>
                      {mission.title}
                    </button>
                  </td>
                  <td>{mission.clientName}</td>
                  <td>{mission.state}</td>
                  <td>
                    {mission.filledPlacementCount}/{mission.numberOfPositions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {canCreate ? (
            <form
              className="stacked-form"
              aria-label="Create recruitment mission"
              onSubmit={(event) => void handleCreate(event)}
            >
              <h3>Create mission</h3>
              <input name="clientId" placeholder="Client id" required />
              <input name="title" placeholder="Title" required />
              <textarea name="description" placeholder="Description" />
              <textarea name="requirements" placeholder="Requirements" />
              <select name="priority" defaultValue="NORMAL">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <input name="numberOfPositions" type="number" min="1" defaultValue="1" />
              <input name="location" placeholder="Location" />
              <input name="workArrangement" placeholder="Work arrangement" />
              <input name="engagementType" placeholder="Engagement type" />
              <button type="submit">Create mission</button>
            </form>
          ) : null}
        </section>

        <section aria-label="Selected mission detail">
          {selectedMission ? (
            <>
              <h2>{selectedMission.title}</h2>
              <p>{selectedMission.clientName}</p>
              <p>
                {selectedMission.state} - {selectedMission.priority} -{' '}
                {selectedMission.filledPlacementCount}/{selectedMission.numberOfPositions}
              </p>
              {selectedMission.commercial ? <p>Commercial fields visible.</p> : null}
              {canUpdate ? (
                <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                  <input name="title" defaultValue={selectedMission.title} />
                  <select name="priority" defaultValue={selectedMission.priority}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <input
                    name="numberOfPositions"
                    type="number"
                    min="1"
                    defaultValue={selectedMission.numberOfPositions}
                  />
                  <input name="location" defaultValue={selectedMission.location ?? ''} />
                  <input
                    name="workArrangement"
                    defaultValue={selectedMission.workArrangement ?? ''}
                  />
                  <input
                    name="engagementType"
                    defaultValue={selectedMission.engagementType ?? ''}
                  />
                  <button type="submit">Update mission</button>
                </form>
              ) : null}

              {canManageStatus ? (
                <div className="action-row" aria-label="Mission lifecycle actions">
                  {nextMissionStates(selectedMission.state).map((state) => (
                    <button key={state} type="button" onClick={() => void changeState(state)}>
                      {state}
                    </button>
                  ))}
                </div>
              ) : null}

              {canClose ? (
                <form
                  className="stacked-form"
                  onSubmit={(event) => void closeSelectedMission(event)}
                >
                  <h3>Close mission</h3>
                  <select name="state" defaultValue="CLOSED_WITHOUT_RECRUITMENT">
                    <option value="CLOSED_WITH_RECRUITMENT">Closed with recruitment</option>
                    <option value="CLOSED_WITHOUT_RECRUITMENT">Closed without recruitment</option>
                    <option value="CANCELED">Canceled</option>
                    <option value="DEADLINE_EXPIRED_WITHOUT_RENEWAL">Deadline expired</option>
                  </select>
                  <select name="closureReason" defaultValue="CLOSED_WITHOUT_RECRUITMENT">
                    <option value="POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED">
                      Positions filled
                    </option>
                    <option value="CLOSED_WITHOUT_RECRUITMENT">No recruitment</option>
                    <option value="CLIENT_CLOSED_OR_CANCELED">Client canceled</option>
                    <option value="DEADLINE_EXPIRED_WITHOUT_RENEWAL">Deadline expired</option>
                  </select>
                  <input
                    name="filledPlacementCount"
                    type="number"
                    min="0"
                    defaultValue={selectedMission.filledPlacementCount}
                  />
                  <button type="submit">Close mission</button>
                </form>
              ) : null}

              {canArchive ? (
                <button type="button" onClick={() => void archiveSelectedMission()}>
                  Archive mission
                </button>
              ) : null}

              {canViewPublicOpportunity && publicOpportunity ? (
                <section aria-label="Public opportunity controls">
                  <h3>Public opportunity</h3>
                  <p>
                    {publicOpportunity.status} -{' '}
                    {publicOpportunity.applicationLinkEnabled
                      ? 'application link enabled'
                      : 'application link disabled'}{' '}
                    - {publicOpportunity.listedOnWebsite ? 'listed' : 'unlisted'}
                  </p>
                  <p>
                    Public link:{' '}
                    <a href={`/opportunities/${publicOpportunity.publicSlug}`}>
                      {`${window.location.origin}/opportunities/${publicOpportunity.publicSlug}`}
                    </a>
                  </p>
                  <div className="action-row">
                    <a
                      className="button-link"
                      href={`/opportunities/${publicOpportunity.publicSlug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open public preview
                    </a>
                    <button type="button" onClick={() => void copyPublicOpportunityLink()}>
                      Copy public link
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          {
                            status: 'OPEN',
                            applicationLinkEnabled: true,
                          },
                          'Application link enabled.',
                        )
                      }
                    >
                      Enable applications
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          { applicationLinkEnabled: false },
                          'Application link disabled.',
                        )
                      }
                    >
                      Disable applications
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          { listedOnWebsite: true },
                          'Opportunity listed on website.',
                        )
                      }
                    >
                      List on website
                    </button>
                    <button
                      type="button"
                      disabled={!canPublishPublicOpportunity}
                      onClick={() =>
                        void updatePublicOpportunityPublication(
                          { listedOnWebsite: false },
                          'Opportunity unlisted from website.',
                        )
                      }
                    >
                      Unlist from website
                    </button>
                  </div>
                  <form
                    className="stacked-form"
                    aria-label="Edit public opportunity"
                    onSubmit={(event) => void handlePublicOpportunityUpdate(event)}
                  >
                    <input
                      name="publicTitle"
                      defaultValue={publicOpportunity.publicTitle}
                      disabled={!canManagePublicOpportunity}
                    />
                    <textarea
                      name="publicSummary"
                      placeholder="Public summary"
                      defaultValue={publicOpportunity.publicSummary ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <textarea
                      name="publicDescription"
                      placeholder="Public description"
                      defaultValue={publicOpportunity.publicDescription ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicLocation"
                      placeholder="Public location"
                      defaultValue={publicOpportunity.publicLocation ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicWorkArrangement"
                      placeholder="Work arrangement"
                      defaultValue={publicOpportunity.publicWorkArrangement ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicEngagementType"
                      placeholder="Contract type"
                      defaultValue={publicOpportunity.publicEngagementType ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <input
                      name="publicExperienceLevel"
                      placeholder="Experience level"
                      defaultValue={publicOpportunity.publicExperienceLevel ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <textarea
                      name="publicSkills"
                      placeholder="Public skills"
                      defaultValue={publicOpportunity.publicSkills ?? ''}
                      disabled={!canManagePublicOpportunity}
                    />
                    <label>
                      Publication start
                      <input
                        name="publicationStartsAt"
                        type="datetime-local"
                        defaultValue={dateTimeInputValue(publicOpportunity.publicationStartsAt)}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Application deadline
                      <input
                        name="applicationDeadline"
                        type="datetime-local"
                        defaultValue={dateTimeInputValue(publicOpportunity.applicationDeadline)}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Show client name
                      <input
                        name="showClientName"
                        type="checkbox"
                        defaultChecked={publicOpportunity.showClientName}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Show salary
                      <input
                        name="showSalary"
                        type="checkbox"
                        defaultChecked={publicOpportunity.showSalary}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      CV required
                      <input
                        name="cvRequired"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.cvRequired}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Certifications enabled
                      <input
                        name="certificationsEnabled"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.certificationsEnabled}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Certifications required
                      <input
                        name="certificationsRequired"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.certificationsRequired}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Diplomas enabled
                      <input
                        name="diplomasEnabled"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.diplomasEnabled}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Diplomas required
                      <input
                        name="diplomasRequired"
                        type="checkbox"
                        defaultChecked={publicOpportunity.uploadRequirements.diplomasRequired}
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <label>
                      Additional files enabled
                      <input
                        name="additionalAttachmentsEnabled"
                        type="checkbox"
                        defaultChecked={
                          publicOpportunity.uploadRequirements.additionalAttachmentsEnabled
                        }
                        disabled={!canManagePublicOpportunity}
                      />
                    </label>
                    <button type="submit" disabled={!canManagePublicOpportunity}>
                      Save public opportunity
                    </button>
                  </form>
                </section>
              ) : null}

              {canViewPublicApplications ? (
                <section aria-label="Public applications">
                  <h3>Public applications</h3>
                  {publicApplications.length > 0 ? (
                    <ul>
                      {publicApplications.map((application) => (
                        <li key={application.id}>
                          {application.submittedFullName} - {application.submittedEmail} -{' '}
                          {application.fileCount} files -{' '}
                          {new Date(application.submittedAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No public applications submitted for this mission.</p>
                  )}
                </section>
              ) : null}

              {canViewAssignments ? (
                <>
                  <h3>Assignments</h3>
                  <ul>
                    {assignments.map((assignment) => (
                      <li key={assignment.id}>
                        {assignment.userDisplayName} - {assignment.role} - {assignment.status}
                        {assignment.isLead ? ' - lead' : ''}
                        {canManageAssignments ? (
                          <>
                            <button type="button" onClick={() => void makeLead(assignment.id)}>
                              Make lead
                            </button>
                            <button
                              type="button"
                              onClick={() => void deactivateAssignment(assignment.id)}
                            >
                              Deactivate
                            </button>
                            <button
                              type="button"
                              onClick={() => void archiveSelectedAssignment(assignment.id)}
                            >
                              Archive
                            </button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {canManageAssignments ? (
                <form
                  className="stacked-form"
                  aria-label="Create mission assignment"
                  onSubmit={(event) => void handleCreateAssignment(event)}
                >
                  <input name="userId" placeholder="Internal user id" required />
                  <select name="role" defaultValue="RECRUITER">
                    <option value="RECRUITER">Recruiter</option>
                    <option value="SOURCER">Sourcer</option>
                    <option value="CONTRIBUTOR">Contributor</option>
                  </select>
                  <label>
                    Lead recruiter
                    <input name="isLead" type="checkbox" />
                  </label>
                  <button type="submit">Assign user</button>
                </form>
              ) : null}

              {canViewProcesses ? (
                <>
                  <h3>Candidate processes</h3>
                  <ul>
                    {candidateProcesses.map((process) => (
                      <li key={process.id}>
                        {process.candidate.displayName} - {process.state} - responsible:{' '}
                        {process.responsibleRecruiterDisplayName}
                        {process.clientVisible ? ' - client visible' : ' - internal only'}
                        {process.placementConfirmedAt ? ' - placement confirmed' : ''}
                        {canTransitionProcesses ? (
                          <div className="action-row">
                            {nextProcessStates(process.state).map((state) => (
                              <button
                                key={state}
                                type="button"
                                onClick={() => void moveProcess(process.id, process.state, state)}
                              >
                                {state}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {canPresentProcesses ? (
                          <button type="button" onClick={() => void presentProcess(process.id)}>
                            Present to client
                          </button>
                        ) : null}
                        {canViewOffers || canViewPlacements ? (
                          <section aria-label="Offer and placement controls">
                            <h4>Offer and placement</h4>
                            <button
                              type="button"
                              onClick={() => void loadOfferPlacement(process.id)}
                            >
                              Load offer and placement
                            </button>
                            {canViewOffers ? (
                              <>
                                {offersByProcessId[process.id] ? (
                                  <div>
                                    <p>
                                      Current offer:{' '}
                                      {offersByProcessId[process.id]?.versions.find(
                                        (version) =>
                                          version.id ===
                                          offersByProcessId[process.id]?.currentVersionId,
                                      )?.status ?? 'none'}{' '}
                                      - versions {offersByProcessId[process.id]?.versions.length}
                                    </p>
                                    <div className="action-row">
                                      <button
                                        type="button"
                                        disabled={!canUpdateOffers}
                                        onClick={() =>
                                          void reviseOffer(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Revise offer
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canSendOffers}
                                        onClick={() =>
                                          void markOfferSent(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Mark sent
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'NEGOTIATING',
                                          )
                                        }
                                      >
                                        Negotiating
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'ACCEPTED',
                                          )
                                        }
                                      >
                                        Accepted
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'REJECTED',
                                          )
                                        }
                                      >
                                        Rejected
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canRecordOfferResponses}
                                        onClick={() =>
                                          void recordOfferResponse(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                            'EXPIRED',
                                          )
                                        }
                                      >
                                        Expired
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canWithdrawOffers}
                                        onClick={() =>
                                          void withdrawOffer(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Withdraw
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canConfirmPlacements}
                                        onClick={() =>
                                          void confirmPlacement(
                                            process.id,
                                            offersByProcessId[process.id]!,
                                          )
                                        }
                                      >
                                        Confirm placement
                                      </button>
                                    </div>
                                  </div>
                                ) : canCreateOffers ? (
                                  <form
                                    className="inline-form"
                                    aria-label="Create offer draft"
                                    onSubmit={(event) => void handleCreateOffer(event, process.id)}
                                  >
                                    <input
                                      name="offeredSalaryAmountCents"
                                      type="number"
                                      min="0"
                                      placeholder="Salary cents"
                                    />
                                    <input
                                      name="offeredSalaryCurrency"
                                      placeholder="Currency"
                                      defaultValue="MAD"
                                    />
                                    <input name="contractType" placeholder="Contract type" />
                                    <input
                                      name="proposedStartDate"
                                      type="datetime-local"
                                      aria-label="Proposed start date"
                                    />
                                    <input name="probationPeriod" placeholder="Probation" />
                                    <input
                                      name="clientFacingRemarks"
                                      placeholder="Client-facing remarks"
                                    />
                                    <input
                                      name="internalRecruiterRemarks"
                                      placeholder="Internal remarks"
                                    />
                                    <button type="submit">Create offer draft</button>
                                  </form>
                                ) : (
                                  <p>No offer loaded for this process.</p>
                                )}
                              </>
                            ) : null}
                            {canViewPlacements ? (
                              <div>
                                <p>
                                  Placement:{' '}
                                  {placementsByProcessId[process.id]?.status ?? 'not confirmed'}
                                  {placementsByProcessId[process.id]?.closureEligible
                                    ? ' - closure eligible'
                                    : ''}
                                  {canViewPlacementCommercialEligibility &&
                                  placementsByProcessId[process.id]?.eligibleForInvoicing
                                    ? ' - invoicing eligible'
                                    : ''}
                                </p>
                                <button
                                  type="button"
                                  disabled={
                                    !canCorrectPlacements ||
                                    placementsByProcessId[process.id]?.status !== 'CONFIRMED'
                                  }
                                  onClick={() => void correctPlacement(process.id)}
                                >
                                  Correct placement
                                </button>
                              </div>
                            ) : null}
                          </section>
                        ) : null}
                        {canTransferProcesses ? (
                          <form
                            className="inline-form"
                            onSubmit={(event) => void transferProcess(event, process.id)}
                          >
                            <input
                              name="responsibleRecruiterUserId"
                              placeholder="New recruiter user id"
                              required
                            />
                            <input name="reason" placeholder="Transfer reason" required />
                            <button type="submit">Transfer</button>
                          </form>
                        ) : null}
                        {canViewInterviews ? (
                          <button
                            type="button"
                            onClick={() => void loadProcessInterviews(process.id)}
                          >
                            Interviews
                          </button>
                        ) : null}
                        {canScheduleInterviews ? (
                          <form
                            className="stacked-form"
                            aria-label="Schedule interview"
                            onSubmit={(event) => void handleScheduleInterview(event, process.id)}
                          >
                            <select name="type" defaultValue="HR">
                              <option value="HR">HR</option>
                              <option value="TECHNICAL">Technical</option>
                              <option value="INTERNAL_VALIDATION">Internal validation</option>
                              <option value="CLIENT_INTERVIEW_1">Client interview 1</option>
                              <option value="CLIENT_INTERVIEW_2">Client interview 2</option>
                            </select>
                            <input name="scheduledStartAt" type="datetime-local" required />
                            <input name="scheduledEndAt" type="datetime-local" />
                            <input name="timezone" placeholder="Timezone" defaultValue="UTC" />
                            <select name="format" defaultValue="VIDEO">
                              <option value="VIDEO">Video</option>
                              <option value="PHONE">Phone</option>
                              <option value="ONSITE">Onsite</option>
                              <option value="OTHER">Other</option>
                            </select>
                            <input
                              name="organizerUserId"
                              placeholder="Organizer user id"
                              required
                            />
                            <input name="location" placeholder="Location" />
                            <input name="meetingUrl" placeholder="Meeting URL" />
                            <input
                              name="internalUserParticipantIds"
                              placeholder="Internal participant ids, comma separated"
                            />
                            <input
                              name="clientContactParticipantIds"
                              placeholder="Client contact ids, comma separated"
                            />
                            <button type="submit">Schedule interview</button>
                          </form>
                        ) : null}
                        {activeProcessId === process.id && interviews.length > 0 ? (
                          <ul>
                            {interviews.map((interview) => (
                              <li key={interview.id}>
                                {interview.type} - {interview.status} -{' '}
                                {new Date(interview.scheduledStartAt).toLocaleString()}
                                <div className="action-row">
                                  {canCompleteInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'complete',
                                        )
                                      }
                                    >
                                      Complete
                                    </button>
                                  ) : null}
                                  {canRescheduleInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'postpone',
                                        )
                                      }
                                    >
                                      Postpone
                                    </button>
                                  ) : null}
                                  {canCancelInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'cancel',
                                        )
                                      }
                                    >
                                      Cancel
                                    </button>
                                  ) : null}
                                  {canArchiveInterviews ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateInterviewStatus(
                                          process.id,
                                          interview.id,
                                          'archive',
                                        )
                                      }
                                    >
                                      Archive
                                    </button>
                                  ) : null}
                                  {canViewEvaluations ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void loadInterviewEvaluations(process.id, interview.id)
                                      }
                                    >
                                      Evaluations
                                    </button>
                                  ) : null}
                                </div>
                                {canRescheduleInterviews ? (
                                  <form
                                    className="inline-form"
                                    onSubmit={(event) =>
                                      void handleRescheduleInterview(
                                        event,
                                        process.id,
                                        interview.id,
                                      )
                                    }
                                  >
                                    <input name="scheduledStartAt" type="datetime-local" required />
                                    <input name="scheduledEndAt" type="datetime-local" />
                                    <input name="timezone" defaultValue="UTC" />
                                    <input name="reason" placeholder="Reason" required />
                                    <button type="submit">Reschedule</button>
                                  </form>
                                ) : null}
                                {activeInterviewId === interview.id ? (
                                  <>
                                    <ul>
                                      {evaluations.map((evaluation) => (
                                        <li key={evaluation.id}>
                                          {evaluation.evaluationType} - {evaluation.status}
                                          {evaluation.redacted ? ' - redacted' : ''}
                                          {evaluation.comment ? ` - ${evaluation.comment}` : ''}
                                          {canFinalizeEvaluations &&
                                          evaluation.status === 'DRAFT' ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void finalizeSelectedEvaluation(
                                                  process.id,
                                                  interview.id,
                                                  evaluation.id,
                                                )
                                              }
                                            >
                                              Finalize
                                            </button>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                    {canCreateEvaluations ? (
                                      <form
                                        className="stacked-form"
                                        aria-label="Create evaluation"
                                        onSubmit={(event) =>
                                          void handleCreateEvaluation(
                                            event,
                                            process.id,
                                            interview.id,
                                          )
                                        }
                                      >
                                        <select name="evaluationType" defaultValue="INTERNAL_HR">
                                          <option value="INTERNAL_HR">Internal HR</option>
                                          <option value="INTERNAL_TECHNICAL">
                                            Internal technical
                                          </option>
                                          <option value="CLIENT">Client</option>
                                        </select>
                                        <select name="recommendation" defaultValue="NEUTRAL">
                                          <option value="STRONG_YES">Strong yes</option>
                                          <option value="YES">Yes</option>
                                          <option value="NEUTRAL">Neutral</option>
                                          <option value="NO">No</option>
                                          <option value="STRONG_NO">Strong no</option>
                                        </select>
                                        <input name="overallScore" type="number" min="1" max="5" />
                                        <input
                                          name="communicationScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Communication"
                                        />
                                        <input
                                          name="technicalScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Technical"
                                        />
                                        <input
                                          name="roleFitScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Role fit"
                                        />
                                        <input
                                          name="cultureFitScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Culture fit"
                                        />
                                        <input
                                          name="motivationScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Motivation"
                                        />
                                        <input
                                          name="salaryAlignmentScore"
                                          type="number"
                                          min="1"
                                          max="5"
                                          placeholder="Salary alignment"
                                        />
                                        <textarea name="strengths" placeholder="Strengths" />
                                        <textarea name="weaknesses" placeholder="Weaknesses" />
                                        <textarea name="risks" placeholder="Risks" />
                                        <textarea name="comment" placeholder="Comment" />
                                        <label>
                                          Final opinion
                                          <input name="finalOpinion" type="checkbox" />
                                        </label>
                                        <button type="submit">Save evaluation</button>
                                      </form>
                                    ) : null}
                                  </>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {canCreateProcesses ? (
                <form
                  className="stacked-form"
                  aria-label="Link candidate to mission"
                  onSubmit={(event) => void handleCreateProcess(event)}
                >
                  <h3>Link candidate</h3>
                  <input name="candidateId" placeholder="Candidate id" required />
                  <input
                    name="responsibleRecruiterUserId"
                    placeholder="Responsible recruiter user id"
                    required
                  />
                  <select name="priority" defaultValue="NORMAL">
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <input name="source" placeholder="Source" />
                  <textarea name="sourceContext" placeholder="Source context" />
                  <textarea name="internalNotes" placeholder="Internal notes" />
                  <button type="submit">Link candidate</button>
                </form>
              ) : null}
              {message ? <p role="status">{message}</p> : null}
            </>
          ) : (
            <p>Select a mission.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function nextProcessStates(state: MissionCandidateState): MissionCandidateState[] {
  const transitions: Partial<Record<MissionCandidateState, MissionCandidateState[]>> = {
    NEW: ['CV_TO_REVIEW', 'WITHDRAWN'],
    CV_TO_REVIEW: ['HR_PRESELECTION', 'WAITING', 'CANDIDATE_REJECTED', 'TALENT_POOL'],
    HR_PRESELECTION: ['HR_INTERVIEW_SCHEDULED', 'WAITING', 'CANDIDATE_REJECTED', 'TALENT_POOL'],
    HR_INTERVIEW_SCHEDULED: ['HR_INTERVIEW_COMPLETED', 'POSTPONED'],
    HR_INTERVIEW_COMPLETED: ['TECHNICAL_TEST', 'INTERNAL_VALIDATION'],
    TECHNICAL_TEST: ['INTERNAL_VALIDATION'],
    INTERNAL_VALIDATION: ['PRESENTED_TO_CLIENT', 'WAITING', 'CANDIDATE_REJECTED'],
    PRESENTED_TO_CLIENT: ['CLIENT_INTERVIEW_1', 'CLIENT_REJECTED'],
    CLIENT_INTERVIEW_1: ['CLIENT_INTERVIEW_2', 'CLIENT_OFFER', 'CLIENT_REJECTED'],
    CLIENT_INTERVIEW_2: ['CLIENT_OFFER', 'CLIENT_REJECTED'],
    CLIENT_OFFER: ['ACCEPTED', 'CANDIDATE_REJECTED', 'WITHDRAWN'],
    ACCEPTED: [],
    INTEGRATED: ['PROBATION_COMPLETED'],
    PROBATION_COMPLETED: ['PROCESS_COMPLETED'],
    WAITING: ['CV_TO_REVIEW', 'HR_PRESELECTION', 'PRESENTED_TO_CLIENT', 'WITHDRAWN'],
    POSTPONED: ['HR_INTERVIEW_SCHEDULED', 'CLIENT_INTERVIEW_1', 'CLIENT_INTERVIEW_2'],
  };
  return transitions[state] ?? [];
}

function isOptionalProcessSkip(
  currentState: MissionCandidateState,
  nextState: MissionCandidateState,
): boolean {
  return (
    (currentState === 'HR_INTERVIEW_COMPLETED' && nextState === 'INTERNAL_VALIDATION') ||
    (currentState === 'CLIENT_INTERVIEW_1' && nextState === 'CLIENT_OFFER')
  );
}

const missionStates: MissionLifecycleState[] = [
  'DRAFT',
  'INTERNAL_VALIDATION',
  'ACTIVE',
  'JOB_DESCRIPTION_APPROVED',
  'CANDIDATE_SOURCING',
  'HR_PRESELECTION',
  'HR_INTERVIEWS',
  'TECHNICAL_TESTS',
  'CANDIDATE_PRESENTATION',
  'CLIENT_INTERVIEWS',
  'FINAL_SELECTION',
  'OFFER_SENT',
  'CANDIDATE_INTEGRATED',
  'PROBATION_MONITORING',
  'WAITING_FOR_CLIENT_INFORMATION',
  'PAUSED',
];

function nextMissionStates(state: MissionLifecycleState): MissionLifecycleState[] {
  const transitions: Partial<Record<MissionLifecycleState, MissionLifecycleState[]>> = {
    DRAFT: ['INTERNAL_VALIDATION', 'PAUSED'],
    INTERNAL_VALIDATION: ['ACTIVE', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    ACTIVE: ['JOB_DESCRIPTION_APPROVED', 'PAUSED'],
    JOB_DESCRIPTION_APPROVED: ['CANDIDATE_SOURCING', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    CANDIDATE_SOURCING: ['HR_PRESELECTION', 'PAUSED'],
    HR_PRESELECTION: ['HR_INTERVIEWS', 'PAUSED'],
    HR_INTERVIEWS: ['TECHNICAL_TESTS', 'PAUSED'],
    TECHNICAL_TESTS: ['CANDIDATE_PRESENTATION', 'PAUSED'],
    CANDIDATE_PRESENTATION: ['CLIENT_INTERVIEWS', 'WAITING_FOR_CLIENT_INFORMATION', 'PAUSED'],
    CLIENT_INTERVIEWS: ['FINAL_SELECTION', 'PAUSED'],
    FINAL_SELECTION: ['OFFER_SENT', 'PAUSED'],
    OFFER_SENT: ['CANDIDATE_INTEGRATED', 'PAUSED'],
    CANDIDATE_INTEGRATED: ['PROBATION_MONITORING'],
    WAITING_FOR_CLIENT_INFORMATION: [
      'INTERNAL_VALIDATION',
      'JOB_DESCRIPTION_APPROVED',
      'CANDIDATE_PRESENTATION',
    ],
    PAUSED: ['INTERNAL_VALIDATION', 'ACTIVE', 'CANDIDATE_SOURCING', 'HR_PRESELECTION'],
  };
  return transitions[state] ?? [];
}

/**
 * Issue #49 generation controls.
 *
 * Rendered only when the actor holds `documents:generate` plus the source-domain read
 * capability the API re-checks, so a hidden source never shows a generation control.
 * Downloads always go through the protected document version endpoint; no storage key
 * or direct file URL is ever exposed to the browser.
 */
function GenerationControls({
  accessToken,
  label,
  canGenerate,
  canViewHistory,
  eligible,
  generate,
}: {
  accessToken: string;
  label: string;
  canGenerate: boolean;
  canViewHistory: boolean;
  eligible: boolean;
  generate: (body: DocumentGenerationRequest) => Promise<DocumentGenerationResponse>;
}) {
  const [provenance, setProvenance] = useState<GeneratedVersionProvenance | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');

  if (!canGenerate) {
    return null;
  }

  async function run(outputFamily: 'PDF' | 'WORD'): Promise<void> {
    setError(null);
    setStatus(null);
    try {
      const result = await generate({
        outputFamily,
        language,
        idempotencyKey: generationIdempotencyKey(),
      });
      setProvenance(result.generated);
      setStatus(
        `${label} ${outputFamily} version ${result.generated.versionNumber} generated from template ${result.generated.templateId} v${result.generated.templateVersion} (${result.generated.language}).`,
      );
      if (canViewHistory) {
        // Version history needs documents:view. Without it the generation still
        // succeeded, so the control degrades instead of surfacing a failed fetch.
        const history = await listDocumentVersions(accessToken, result.generated.documentId);
        setVersions(history.versions);
      }
    } catch {
      setError(`Unable to generate ${label}.`);
    }
  }

  async function download(versionId: string, filename: string): Promise<void> {
    if (!provenance) {
      return;
    }
    setError(null);
    try {
      const blob = await downloadDocumentVersion(accessToken, provenance.documentId, versionId);
      downloadBlob(blob, filename);
      setStatus(`Downloaded ${filename} through the protected document endpoint.`);
    } catch {
      setError(`Unable to download ${filename}.`);
    }
  }

  return (
    <div className="generation-controls">
      <label>
        {`Language (${label})`}
        <select
          aria-label={`Generation language (${label})`}
          value={language}
          onChange={(event) => setLanguage(event.currentTarget.value === 'en' ? 'en' : 'fr')}
        >
          <option value="fr">fr</option>
          <option value="en">en</option>
        </select>
      </label>
      <button type="button" disabled={!eligible} onClick={() => void run('PDF')}>
        {`Generate PDF (${label})`}
      </button>
      <button type="button" disabled={!eligible} onClick={() => void run('WORD')}>
        {`Generate Word (${label})`}
      </button>
      {provenance ? (
        <button
          type="button"
          disabled={!eligible}
          onClick={() => void run(provenance.outputFamily)}
        >
          {`Regenerate (${label})`}
        </button>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {versions.length > 0 ? (
        <ul aria-label={`Generated versions (${label})`}>
          {versions.map((version) => (
            <li key={version.id}>
              <span>
                {`v${version.versionNumber} ${version.mimeType} ${version.templateId ?? ''} ${
                  version.generationLanguage ?? ''
                }`}
              </span>
              <button type="button" onClick={() => void download(version.id, version.filename)}>
                {`Download v${version.versionNumber}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Hands a blob obtained from a protected API endpoint to the browser as a download.
 *
 * The object URL is revoked immediately after the click, and the temporary anchor is
 * removed, so no blob reference or storage identity lingers in the document.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Bounded, per-request idempotency key. Regeneration deliberately uses a new key. */
function generationIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `gen-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function CommercialPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [contracts, setContracts] = useState<CommercialContractSummary[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const canSeeCommercialAmounts = permissions.includes('commercial_data:access');
  const canManageQuotations = canSeeCommercialAmounts && permissions.includes('quotations:manage');
  const canManageContracts = canSeeCommercialAmounts && permissions.includes('contracts:manage');
  const canManagePurchaseOrders =
    canSeeCommercialAmounts && permissions.includes('purchase_orders:manage');
  const canManageInvoices = canSeeCommercialAmounts && permissions.includes('invoices:manage');
  const canGenerate = permissions.includes('documents:generate') && canSeeCommercialAmounts;
  const canViewDocumentHistory = permissions.includes('documents:view');
  const canGenerateQuotation = canGenerate && permissions.includes('quotations:view');
  const canGenerateContract = canGenerate && permissions.includes('contracts:view');
  const canGeneratePurchaseOrder = canGenerate && permissions.includes('purchase_orders:view');
  const canGenerateInvoice = canGenerate && permissions.includes('invoices:view');

  useEffect(() => {
    void loadCommercialRecords();
  }, []);

  async function loadCommercialRecords(): Promise<void> {
    const [quotationList, contractList, purchaseOrderList, invoiceList] = await Promise.all([
      listQuotations(accessToken, { pageSize: 10 }),
      listCommercialContracts(accessToken, { pageSize: 10 }),
      listPurchaseOrders(accessToken, { pageSize: 10 }),
      listInvoices(accessToken, { pageSize: 10 }),
    ]);
    setQuotations(quotationList.quotations);
    setContracts(contractList.contracts);
    setPurchaseOrders(purchaseOrderList.purchaseOrders);
    setInvoices(invoiceList.invoices);
  }

  async function handleQuotationCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createQuotation(accessToken, {
      reference: formValue(formData, 'reference'),
      clientId: formValue(formData, 'clientId'),
      recruitmentMissionId: optionalFormValue(formData, 'recruitmentMissionId'),
      currency: formValue(formData, 'currency', 'MAD'),
      lines: [
        {
          description: formValue(formData, 'description'),
          quantity: optionalNumber(formData, 'quantity') ?? 1,
          unitPriceCents: optionalNumber(formData, 'unitPriceCents') ?? 0,
          taxRateBps: optionalNumber(formData, 'taxRateBps') ?? 0,
        },
      ],
    });
    form.reset();
    setMessage('Quotation created.');
    await loadCommercialRecords();
  }

  async function handleContractCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCommercialContract(accessToken, {
      reference: formValue(formData, 'reference'),
      businessType: formValue(formData, 'businessType') as 'RECRUITMENT' | 'TRAINING',
      clientId: formValue(formData, 'clientId'),
      recruitmentMissionId: optionalFormValue(formData, 'recruitmentMissionId'),
      sourceQuotationId: optionalFormValue(formData, 'sourceQuotationId'),
      currency: formValue(formData, 'currency', 'MAD'),
      contractValueCents: optionalNumber(formData, 'contractValueCents') ?? 0,
      taxCents: optionalNumber(formData, 'taxCents') ?? 0,
      termsSummary: optionalFormValue(formData, 'termsSummary'),
    });
    form.reset();
    setMessage('Contract created.');
    await loadCommercialRecords();
  }

  async function handlePurchaseOrderCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createPurchaseOrder(accessToken, {
      reference: formValue(formData, 'reference'),
      clientId: formValue(formData, 'clientId'),
      recruitmentMissionId: optionalFormValue(formData, 'recruitmentMissionId'),
      quotationId: optionalFormValue(formData, 'quotationId'),
      contractId: optionalFormValue(formData, 'contractId'),
      currency: formValue(formData, 'currency', 'MAD'),
      amountCents: optionalNumber(formData, 'amountCents') ?? 0,
      taxCents: optionalNumber(formData, 'taxCents') ?? 0,
    });
    form.reset();
    setMessage('Purchase order created.');
    await loadCommercialRecords();
  }

  async function handleInvoiceCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const description = optionalFormValue(formData, 'description');
    await createInvoice(accessToken, {
      reference: formValue(formData, 'reference'),
      clientId: formValue(formData, 'clientId'),
      recruitmentMissionId: optionalFormValue(formData, 'recruitmentMissionId'),
      missionPlacementId: optionalFormValue(formData, 'missionPlacementId'),
      quotationId: optionalFormValue(formData, 'quotationId'),
      contractId: optionalFormValue(formData, 'contractId'),
      purchaseOrderId: optionalFormValue(formData, 'purchaseOrderId'),
      currency: formValue(formData, 'currency', 'MAD'),
      dueDate: optionalDateTimeFormValue(formData, 'dueDate'),
      lines: description
        ? [
            {
              description,
              quantity: optionalNumber(formData, 'quantity') ?? 1,
              unitPriceCents: optionalNumber(formData, 'unitPriceCents') ?? 0,
              taxRateBps: optionalNumber(formData, 'taxRateBps') ?? 0,
            },
          ]
        : undefined,
    });
    form.reset();
    setMessage('Invoice created.');
    await loadCommercialRecords();
  }

  async function setQuotationStatus(
    id: string,
    status: 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED',
  ): Promise<void> {
    await updateQuotationStatus(accessToken, id, { status });
    setMessage(`Quotation ${status.toLowerCase()}.`);
    await loadCommercialRecords();
  }

  async function setContractStatus(
    id: string,
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELED',
  ): Promise<void> {
    await updateCommercialContractStatus(accessToken, id, { status });
    setMessage(`Contract ${status.toLowerCase()}.`);
    await loadCommercialRecords();
  }

  async function setPurchaseOrderStatus(
    id: string,
    status: 'RECEIVED' | 'CANCELED',
  ): Promise<void> {
    await updatePurchaseOrderStatus(accessToken, id, { status });
    setMessage(`Purchase order ${status.toLowerCase()}.`);
    await loadCommercialRecords();
  }

  async function archiveCommercialRecord(
    archiveAction: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    await archiveAction();
    setMessage(successMessage);
    await loadCommercialRecords();
  }

  return (
    <section className="admin-panel" aria-label="Commercial">
      <div className="admin-grid">
        <section aria-label="Commercial records">
          <h2>Commercial</h2>
          <button type="button" onClick={() => void loadCommercialRecords()}>
            Refresh commercial records
          </button>
          {message ? <p role="status">{message}</p> : null}
          <CommercialTable
            title="Quotations"
            records={quotations.map((record) => ({
              id: record.id,
              reference: record.reference,
              status: record.status,
              amount: commercialAmount(record),
              actions: (
                <>
                  <GenerationControls
                    accessToken={accessToken}
                    label={`Quotation ${record.reference}`}
                    canViewHistory={canViewDocumentHistory}
                    eligible={['ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(record.status)}
                    canGenerate={canGenerateQuotation}
                    generate={(body) => generateQuotationDocument(accessToken, record.id, body)}
                  />
                  {canManageQuotations && record.status === 'DRAFT' ? (
                    <button
                      type="button"
                      onClick={() => void setQuotationStatus(record.id, 'ISSUED')}
                    >
                      Issue
                    </button>
                  ) : null}
                  {canManageQuotations && record.status === 'ISSUED' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void setQuotationStatus(record.id, 'ACCEPTED')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => void setQuotationStatus(record.id, 'REJECTED')}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {canManageQuotations && record.status !== 'ISSUED' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void archiveCommercialRecord(
                          () => archiveQuotation(accessToken, record.id),
                          'Quotation archived.',
                        )
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </>
              ),
            }))}
          />
          <CommercialTable
            title="Contracts"
            records={contracts.map((record) => ({
              id: record.id,
              reference: `${record.reference} (${record.businessType})`,
              status: record.status,
              amount: commercialAmount(record),
              actions: (
                <>
                  <GenerationControls
                    accessToken={accessToken}
                    label={`Contract ${record.reference}`}
                    canViewHistory={canViewDocumentHistory}
                    eligible={record.status !== 'CANCELED' && record.status !== 'ARCHIVED'}
                    canGenerate={canGenerateContract}
                    generate={(body) => generateContractDocument(accessToken, record.id, body)}
                  />
                  {canManageContracts && record.status === 'DRAFT' ? (
                    <button
                      type="button"
                      onClick={() => void setContractStatus(record.id, 'ACTIVE')}
                    >
                      Activate
                    </button>
                  ) : null}
                  {canManageContracts && record.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => void setContractStatus(record.id, 'COMPLETED')}
                    >
                      Complete
                    </button>
                  ) : null}
                  {canManageContracts && record.status !== 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void archiveCommercialRecord(
                          () => archiveCommercialContract(accessToken, record.id),
                          'Contract archived.',
                        )
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </>
              ),
            }))}
          />
          <CommercialTable
            title="Purchase orders"
            records={purchaseOrders.map((record) => ({
              id: record.id,
              reference: record.reference,
              status: record.status,
              amount: commercialAmount(record),
              actions: (
                <>
                  <GenerationControls
                    accessToken={accessToken}
                    label={`Purchase order ${record.reference}`}
                    canViewHistory={canViewDocumentHistory}
                    eligible={record.status !== 'CANCELED' && record.status !== 'ARCHIVED'}
                    canGenerate={canGeneratePurchaseOrder}
                    generate={(body) => generatePurchaseOrderDocument(accessToken, record.id, body)}
                  />
                  {canManagePurchaseOrders && record.status === 'DRAFT' ? (
                    <button
                      type="button"
                      onClick={() => void setPurchaseOrderStatus(record.id, 'RECEIVED')}
                    >
                      Receive
                    </button>
                  ) : null}
                  {canManagePurchaseOrders && record.status !== 'RECEIVED' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void archiveCommercialRecord(
                          () => archivePurchaseOrder(accessToken, record.id),
                          'Purchase order archived.',
                        )
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </>
              ),
            }))}
          />
          <CommercialTable
            title="Invoices"
            records={invoices.map((record) => ({
              id: record.id,
              reference: record.reference,
              status: record.status,
              amount: commercialAmount(record),
              actions: (
                <>
                  <GenerationControls
                    accessToken={accessToken}
                    label={`Invoice ${record.reference}`}
                    canViewHistory={canViewDocumentHistory}
                    eligible={record.status === 'ISSUED'}
                    canGenerate={canGenerateInvoice}
                    generate={(body) => generateInvoiceDocument(accessToken, record.id, body)}
                  />
                  {canManageInvoices && record.status === 'DRAFT' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void issueInvoice(accessToken, record.id, {}).then(() =>
                          loadCommercialRecords(),
                        )
                      }
                    >
                      Issue
                    </button>
                  ) : null}
                  {canManageInvoices && record.status !== 'CANCELED' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void cancelInvoice(accessToken, record.id, {
                          reason: 'Canceled from internal workspace.',
                        }).then(() => loadCommercialRecords())
                      }
                    >
                      Cancel
                    </button>
                  ) : null}
                  {canManageInvoices && record.status !== 'ISSUED' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void archiveCommercialRecord(
                          () => archiveInvoice(accessToken, record.id),
                          'Invoice archived.',
                        )
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </>
              ),
            }))}
          />
        </section>

        <section aria-label="Commercial create forms">
          {canManageQuotations ? (
            <form
              className="stacked-form"
              aria-label="Create quotation"
              onSubmit={(event) => void handleQuotationCreate(event)}
            >
              <h3>Create quotation</h3>
              <input name="reference" placeholder="Reference" required />
              <input name="clientId" placeholder="Client id" required />
              <input name="recruitmentMissionId" placeholder="Mission id" />
              <input name="currency" placeholder="MAD" defaultValue="MAD" required />
              <input name="description" placeholder="Line description" required />
              <input
                name="quantity"
                type="number"
                min="1"
                placeholder="Quantity"
                defaultValue="1"
              />
              <input
                name="unitPriceCents"
                type="number"
                min="0"
                placeholder="Unit price cents"
                required
              />
              <input
                name="taxRateBps"
                type="number"
                min="0"
                placeholder="Tax bps"
                defaultValue="0"
              />
              <button type="submit">Create quotation</button>
            </form>
          ) : null}

          {canManageContracts ? (
            <form
              className="stacked-form"
              aria-label="Create contract"
              onSubmit={(event) => void handleContractCreate(event)}
            >
              <h3>Create contract</h3>
              <input name="reference" placeholder="Reference" required />
              <select name="businessType" defaultValue="RECRUITMENT">
                <option value="RECRUITMENT">Recruitment</option>
                <option value="TRAINING">Training</option>
              </select>
              <input name="clientId" placeholder="Client id" required />
              <input name="recruitmentMissionId" placeholder="Mission id" />
              <input name="sourceQuotationId" placeholder="Accepted quotation id" />
              <input name="currency" placeholder="MAD" defaultValue="MAD" required />
              <input
                name="contractValueCents"
                type="number"
                min="0"
                placeholder="Contract value cents"
                required
              />
              <input
                name="taxCents"
                type="number"
                min="0"
                placeholder="Tax cents"
                defaultValue="0"
              />
              <textarea name="termsSummary" placeholder="Terms summary" />
              <button type="submit">Create contract</button>
            </form>
          ) : null}

          {canManagePurchaseOrders ? (
            <form
              className="stacked-form"
              aria-label="Create purchase order"
              onSubmit={(event) => void handlePurchaseOrderCreate(event)}
            >
              <h3>Create purchase order</h3>
              <input name="reference" placeholder="Reference" required />
              <input name="clientId" placeholder="Client id" required />
              <input name="recruitmentMissionId" placeholder="Mission id" />
              <input name="quotationId" placeholder="Quotation id" />
              <input name="contractId" placeholder="Contract id" />
              <input name="currency" placeholder="MAD" defaultValue="MAD" required />
              <input name="amountCents" type="number" min="0" placeholder="Amount cents" required />
              <input
                name="taxCents"
                type="number"
                min="0"
                placeholder="Tax cents"
                defaultValue="0"
              />
              <button type="submit">Create purchase order</button>
            </form>
          ) : null}

          {canManageInvoices ? (
            <form
              className="stacked-form"
              aria-label="Create invoice"
              onSubmit={(event) => void handleInvoiceCreate(event)}
            >
              <h3>Create invoice</h3>
              <input name="reference" placeholder="Reference" required />
              <input name="clientId" placeholder="Client id" required />
              <input name="recruitmentMissionId" placeholder="Mission id" />
              <input name="missionPlacementId" placeholder="Placement id" />
              <input name="quotationId" placeholder="Quotation id" />
              <input name="contractId" placeholder="Contract id" />
              <input name="purchaseOrderId" placeholder="Purchase order id" />
              <input name="currency" placeholder="MAD" defaultValue="MAD" required />
              <input name="dueDate" type="datetime-local" />
              <input name="description" placeholder="Fallback line description" />
              <input
                name="quantity"
                type="number"
                min="1"
                placeholder="Quantity"
                defaultValue="1"
              />
              <input name="unitPriceCents" type="number" min="0" placeholder="Unit price cents" />
              <input
                name="taxRateBps"
                type="number"
                min="0"
                placeholder="Tax bps"
                defaultValue="0"
              />
              <button type="submit">Create invoice</button>
            </form>
          ) : null}

          {!canSeeCommercialAmounts ? <p>Commercial amounts are hidden for this account.</p> : null}
        </section>
      </div>
    </section>
  );
}

function CommercialTable({
  title,
  records,
}: {
  title: string;
  records: Array<{
    id: string;
    reference: string;
    status: string;
    amount: string;
    actions: ReactNode;
  }>;
}) {
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Status</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{record.reference}</td>
              <td>{record.status}</td>
              <td>{record.amount}</td>
              <td>{record.actions}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 ? <p>No records.</p> : null}
    </section>
  );
}

function commercialAmount(
  record: QuotationSummary | CommercialContractSummary | PurchaseOrderSummary | InvoiceSummary,
): string {
  return record.amounts
    ? `${record.amounts.currency} ${(record.amounts.totalCents / 100).toFixed(2)}`
    : 'Hidden';
}

const documentTypes: DocumentType[] = [
  'CONTRAT_RECRUTEMENT',
  'CONTRAT_FORMATION',
  'JOB_DESCRIPTION',
  'INTERVIEW_REPORT',
  'CANDIDATE_SUMMARY',
  'HR_DOCUMENT',
  'CLIENT_FILE',
  'OTHER',
];
const creatableDocumentTypes = documentTypes.filter(
  (type): type is CreatableDocumentType => type !== 'LEGACY_CONTRACT',
);

function DocumentsPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const canCreate = permissions.includes('documents:create');
  const canAddVersion = permissions.includes('documents:versions:create');
  const canUpdate = permissions.includes('documents:update');
  const canArchive = permissions.includes('documents:archive');
  const canDownload = permissions.includes('documents:download');

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function loadDocuments(nextSearch = search, nextType = typeFilter): Promise<void> {
    const response = await listDocuments({
      accessToken,
      search: nextSearch,
      documentType: nextType || undefined,
      pageSize: 20,
    });
    setDocuments(response.documents);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadDocuments(search, typeFilter);
  }

  async function selectDocument(documentId: string): Promise<void> {
    const response = await getDocument(accessToken, documentId);
    setSelectedDocument(response.document);
    setVersions(response.document.versions);
    setMessage(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = firstFile(formData, 'versionFile');
    const created = await createDocument(accessToken, {
      title: formValue(formData, 'title'),
      documentType: formValue(formData, 'documentType') as CreatableDocumentType,
      visibility: 'INTERNAL_ONLY',
      ownerUserId: optionalFormValue(formData, 'ownerUserId'),
      context: {
        clientId: optionalFormValue(formData, 'clientId'),
        candidateId: optionalFormValue(formData, 'candidateId'),
        recruitmentMissionId: optionalFormValue(formData, 'recruitmentMissionId'),
        missionCandidateId: optionalFormValue(formData, 'missionCandidateId'),
        interviewId: optionalFormValue(formData, 'interviewId'),
      },
      version: file ? await documentFileInput(file) : undefined,
    });
    form.reset();
    setSelectedDocument(created.document);
    setVersions(created.document.versions);
    setMessage('Document registered.');
    await loadDocuments();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedDocument) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateDocument(accessToken, selectedDocument.id, {
      title: formValue(formData, 'title', selectedDocument.title),
      visibility: formValue(formData, 'visibility', selectedDocument.visibility) as
        'INTERNAL_ONLY' | 'ASSIGNED_ONLY' | 'CLIENT_SHARED' | 'PRIVATE',
      ownerUserId: nullableFormValue(formData, 'ownerUserId'),
    });
    setSelectedDocument(updated.document);
    setVersions(updated.document.versions);
    setMessage('Document metadata updated.');
    await loadDocuments();
  }

  async function handleAddVersion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedDocument) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = firstFile(formData, 'versionFile');
    if (!file) {
      setMessage('Choose a file to add.');
      return;
    }
    const updated = await addDocumentVersion(
      accessToken,
      selectedDocument.id,
      await documentFileInput(file),
    );
    form.reset();
    setSelectedDocument(updated.document);
    setVersions(updated.document.versions);
    setMessage('Document version added.');
    await loadDocuments();
  }

  async function refreshVersions(): Promise<void> {
    if (!selectedDocument) {
      return;
    }
    const response = await listDocumentVersions(accessToken, selectedDocument.id);
    setVersions(response.versions);
  }

  async function archiveSelected(): Promise<void> {
    if (!selectedDocument || !window.confirm('Archive this document?')) {
      return;
    }
    const archived = await archiveDocument(accessToken, selectedDocument.id);
    setSelectedDocument(archived.document);
    setVersions(archived.document.versions);
    setMessage('Document archived.');
    await loadDocuments();
  }

  async function downloadVersion(versionId: string): Promise<void> {
    if (!selectedDocument) {
      return;
    }
    await downloadDocumentVersion(accessToken, selectedDocument.id, versionId);
    setMessage('Download requested.');
  }

  return (
    <section className="admin-panel" aria-label="Documents">
      <div className="admin-grid">
        <section aria-label="Document list">
          <h2>Documents</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.currentTarget.value)}
                name="documentType"
              >
                <option value="">Any</option>
                {creatableDocumentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Search documents</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <button type="button" onClick={() => void selectDocument(document.id)}>
                      {document.title}
                    </button>
                  </td>
                  <td>{document.documentType}</td>
                  <td>{document.status}</td>
                  <td>{document.currentVersionId ? 'Current file' : 'No file'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {canCreate ? (
            <form
              className="stacked-form"
              aria-label="Register document"
              onSubmit={(event) => void handleCreate(event)}
            >
              <h3>Register document</h3>
              <input name="title" placeholder="Document title" required />
              <select name="documentType" defaultValue="CONTRAT_RECRUTEMENT">
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input name="ownerUserId" placeholder="Owner user id" />
              <input name="clientId" placeholder="Client id" />
              <input name="candidateId" placeholder="Candidate id" />
              <input name="recruitmentMissionId" placeholder="Recruitment mission id" />
              <input name="missionCandidateId" placeholder="Mission candidate id" />
              <input name="interviewId" placeholder="Interview id" />
              <input name="versionFile" type="file" />
              <button type="submit">Register document</button>
            </form>
          ) : null}
        </section>

        <section aria-label="Document detail">
          {selectedDocument ? (
            <>
              <h2>{selectedDocument.title}</h2>
              <p>
                {selectedDocument.documentType} - {selectedDocument.status}
              </p>
              <dl>
                <dt>Client</dt>
                <dd>{selectedDocument.context.clientId ?? 'None'}</dd>
                <dt>Candidate</dt>
                <dd>{selectedDocument.context.candidateId ?? 'None'}</dd>
                <dt>Mission</dt>
                <dd>{selectedDocument.context.recruitmentMissionId ?? 'None'}</dd>
              </dl>

              {canUpdate ? (
                <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                  <h3>Metadata</h3>
                  <input name="title" defaultValue={selectedDocument.title} />
                  <select name="visibility" defaultValue={selectedDocument.visibility}>
                    <option value="INTERNAL_ONLY">Internal only</option>
                    <option value="ASSIGNED_ONLY">Assigned only</option>
                    <option value="CLIENT_SHARED">Client shared</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                  <input
                    name="ownerUserId"
                    placeholder="Owner user id"
                    defaultValue={selectedDocument.ownerUserId ?? ''}
                  />
                  <button type="submit">Update metadata</button>
                </form>
              ) : null}

              <section aria-label="Document versions">
                <h3>Versions</h3>
                <button type="button" onClick={() => void refreshVersions()}>
                  Refresh versions
                </button>
                <ul>
                  {versions.map((version) => (
                    <li key={version.id}>
                      v{version.versionNumber} - {version.filename} - {version.mimeType}
                      {canDownload ? (
                        <button type="button" onClick={() => void downloadVersion(version.id)}>
                          Download
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              {canAddVersion ? (
                <form
                  className="stacked-form"
                  aria-label="Add document version"
                  onSubmit={(event) => void handleAddVersion(event)}
                >
                  <h3>Add version</h3>
                  <input name="versionFile" type="file" required />
                  <button type="submit">Add version</button>
                </form>
              ) : null}

              {canArchive ? (
                <button type="button" onClick={() => void archiveSelected()}>
                  Archive document
                </button>
              ) : null}
              {message ? <p role="status">{message}</p> : null}
            </>
          ) : (
            <p>Select a document.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}

function optionalFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : undefined;
}

function csvValues(formData: FormData, name: string): string[] {
  return formValue(formData, name)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function optionalNumber(formData: FormData, name: string): number | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? Number(value) : undefined;
}

function dateTimeFormValue(formData: FormData, name: string): string {
  return new Date(formValue(formData, name)).toISOString();
}

function optionalDateTimeFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? new Date(value).toISOString() : undefined;
}

function dateTimeInputValue(value: string | null): string {
  return value ? value.slice(0, 16) : '';
}

function nullableFormValue(formData: FormData, name: string): string | null {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : null;
}

function firstFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

async function documentFileInput(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    base64Content: btoa(binary),
  };
}

const trainingProgramStatuses: TrainingProgramSummary['status'][] = [
  'PROGRAM_DRAFT',
  'PROGRAM_ACTIVE',
  'PROGRAM_CLOSED',
  'PROGRAM_ARCHIVED',
];

const trainingSessionStatusActions: TrainingSessionSummary['status'][] = [
  'SESSION_SCHEDULED',
  'SESSION_IN_PROGRESS',
  'SESSION_COMPLETED',
  'SESSION_POSTPONED',
];

type TrainingEnrollmentStatusAction = Exclude<TrainingEnrollmentSummary['status'], 'CANCELED'>;
type TrainingAttendanceStatusAction = Exclude<
  TrainingParticipationSummary['status'],
  'PARTICIPATION_ARCHIVED'
>;

const trainingEnrollmentStatuses: TrainingEnrollmentStatusAction[] = [
  'APPROVAL_PENDING',
  'APPROVED',
  'PAYMENT_PENDING',
  'ENROLLED',
  'EVALUATED',
  'INDIVIDUAL_COACHING',
  'CERTIFICATE_ISSUED',
  'SATISFACTION_RECORDED',
  'FOLLOW_UP',
  'CLOSED',
  'REJECTED',
];

const trainingAttendanceStatuses: TrainingAttendanceStatusAction[] = [
  'ATTENDED',
  'ABSENT',
  'EXCUSED',
  'SESSION_OUTCOME_RECORDED',
];

const trainingParticipantTypes = ['CANDIDATE', 'USER', 'CLIENT_CONTACT', 'EXTERNAL'] as const;

/**
 * Internal training operations workspace.
 *
 * Every control here is gated on the same permission code the API enforces. The UI
 * gate is a convenience only: the server re-checks capability and record scope on
 * every request.
 */
function TrainingPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [programs, setPrograms] = useState<TrainingProgramSummary[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<TrainingProgramSummary | null>(null);
  const [sessions, setSessions] = useState<TrainingSessionSummary[]>([]);
  const [enrollments, setEnrollments] = useState<TrainingEnrollmentSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<TrainingSessionSummary | null>(null);
  const [participations, setParticipations] = useState<TrainingParticipationSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const canManagePrograms = permissions.includes('training_programs:manage');
  const canManageProgramStatus = permissions.includes('training_programs:status:manage');
  const canArchivePrograms = permissions.includes('training_programs:archive');
  const canViewSessions = permissions.includes('training_sessions:view');
  const canManageSessions = permissions.includes('training_sessions:manage');
  const canArchiveSessions = permissions.includes('training_sessions:archive');
  const canViewEnrollments = permissions.includes('training_enrollments:view');
  const canManageEnrollments = permissions.includes('training_enrollments:manage');
  // Generation controls are hidden unless the actor also holds the enrollment read
  // capability the API re-checks, so a hidden enrollment never shows a control.
  const canGenerateCertificate = permissions.includes('documents:generate') && canViewEnrollments;
  const canViewDocumentHistory = permissions.includes('documents:view');
  const canViewParticipation = permissions.includes('training_participation:view');
  const canManageParticipation = permissions.includes('training_participation:manage');
  const canCorrectAttendance = permissions.includes('training_participation:correct');
  const canArchiveParticipation = permissions.includes('training_participation:archive');

  useEffect(() => {
    void loadPrograms();
  }, []);

  async function loadPrograms(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listTrainingPrograms({
      accessToken,
      search: nextSearch || undefined,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setPrograms(response.programs);
  }

  async function handleProgramSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadPrograms(search, statusFilter);
  }

  async function selectProgram(program: TrainingProgramSummary): Promise<void> {
    setSelectedProgram(program);
    setSelectedSession(null);
    setParticipations([]);
    setMessage(null);
    if (canViewSessions) {
      const sessionResponse = await listTrainingSessions({
        accessToken,
        programId: program.id,
        pageSize: 20,
      });
      setSessions(sessionResponse.sessions);
    }
    if (canViewEnrollments) {
      const enrollmentResponse = await listTrainingEnrollments({
        accessToken,
        programId: program.id,
        pageSize: 20,
      });
      setEnrollments(enrollmentResponse.enrollments);
    }
  }

  async function refreshProgram(programId: string): Promise<void> {
    await loadPrograms();
    const sessionResponse = canViewSessions
      ? await listTrainingSessions({ accessToken, programId, pageSize: 20 })
      : null;
    if (sessionResponse) {
      setSessions(sessionResponse.sessions);
    }
    const enrollmentResponse = canViewEnrollments
      ? await listTrainingEnrollments({ accessToken, programId, pageSize: 20 })
      : null;
    if (enrollmentResponse) {
      setEnrollments(enrollmentResponse.enrollments);
    }
  }

  async function handleCreateProgram(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const created = await createTrainingProgram(accessToken, {
      reference: formValue(formData, 'reference'),
      name: formValue(formData, 'name'),
      description: optionalFormValue(formData, 'description'),
      targetAudience: optionalFormValue(formData, 'targetAudience'),
      ownerUserId: optionalFormValue(formData, 'ownerUserId'),
      clientId: optionalFormValue(formData, 'clientId'),
      plannedStartDate: optionalDateTimeFormValue(formData, 'plannedStartDate'),
      plannedEndDate: optionalDateTimeFormValue(formData, 'plannedEndDate'),
    });
    form.reset();
    setMessage('Training program created.');
    await loadPrograms();
    await selectProgram(created.program);
  }

  async function changeProgramStatus(status: string): Promise<void> {
    if (!selectedProgram) {
      return;
    }
    const updated = await updateTrainingProgramStatus(accessToken, selectedProgram.id, {
      status: status as 'PROGRAM_DRAFT' | 'PROGRAM_ACTIVE' | 'PROGRAM_CLOSED',
    });
    setSelectedProgram(updated.program);
    setMessage(`Training program status changed to ${updated.program.status}.`);
    await loadPrograms();
  }

  async function archiveSelectedProgram(): Promise<void> {
    if (!selectedProgram) {
      return;
    }
    const archived = await archiveTrainingProgram(accessToken, selectedProgram.id);
    setSelectedProgram(archived.program);
    setMessage('Training program archived.');
    await loadPrograms();
  }

  async function handleCreateSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProgram) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createTrainingSession(accessToken, selectedProgram.id, {
      title: formValue(formData, 'title'),
      sequence: optionalNumber(formData, 'sequence'),
      scheduledAt: dateTimeFormValue(formData, 'scheduledAt'),
      scheduledEndAt: dateTimeFormValue(formData, 'scheduledEndAt'),
      deliveryMode: (optionalFormValue(formData, 'deliveryMode') ?? undefined) as
        'ONSITE' | 'REMOTE' | 'HYBRID' | undefined,
      trainerUserId: optionalFormValue(formData, 'trainerUserId'),
      location: optionalFormValue(formData, 'location'),
    });
    form.reset();
    setMessage('Training session scheduled.');
    await refreshProgram(selectedProgram.id);
  }

  async function handleRescheduleSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProgram || !selectedSession) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const updated = await rescheduleTrainingSession(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
      {
        scheduledAt: dateTimeFormValue(formData, 'scheduledAt'),
        scheduledEndAt: dateTimeFormValue(formData, 'scheduledEndAt'),
        reason: optionalFormValue(formData, 'reason'),
      },
    );
    form.reset();
    setSelectedSession(updated.session);
    setMessage('Training session rescheduled.');
    await refreshProgram(selectedProgram.id);
  }

  async function changeSessionStatus(status: string): Promise<void> {
    if (!selectedProgram || !selectedSession) {
      return;
    }
    const updated = await updateTrainingSessionStatus(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
      {
        status: status as
          | 'SESSION_PLANNED'
          | 'SESSION_SCHEDULED'
          | 'SESSION_IN_PROGRESS'
          | 'SESSION_COMPLETED'
          | 'SESSION_POSTPONED',
      },
    );
    setSelectedSession(updated.session);
    setMessage(`Training session status changed to ${updated.session.status}.`);
    await refreshProgram(selectedProgram.id);
  }

  async function handleCancelSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProgram || !selectedSession) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const updated = await cancelTrainingSession(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
      { reason: formValue(formData, 'reason') },
    );
    form.reset();
    setSelectedSession(updated.session);
    setMessage('Training session canceled.');
    await refreshProgram(selectedProgram.id);
  }

  async function archiveSelectedSession(): Promise<void> {
    if (!selectedProgram || !selectedSession) {
      return;
    }
    const updated = await archiveTrainingSession(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
    );
    setSelectedSession(updated.session);
    setMessage('Training session archived.');
    await refreshProgram(selectedProgram.id);
  }

  async function selectSession(session: TrainingSessionSummary): Promise<void> {
    setSelectedSession(session);
    setMessage(null);
    if (!canViewParticipation || !selectedProgram) {
      setParticipations([]);
      return;
    }
    const response = await listTrainingParticipations({
      accessToken,
      programId: selectedProgram.id,
      sessionId: session.id,
      pageSize: 20,
    });
    setParticipations(response.participations);
  }

  async function refreshParticipations(): Promise<void> {
    if (!selectedProgram || !selectedSession || !canViewParticipation) {
      return;
    }
    const response = await listTrainingParticipations({
      accessToken,
      programId: selectedProgram.id,
      sessionId: selectedSession.id,
      pageSize: 20,
    });
    setParticipations(response.participations);
  }

  async function handleCreateEnrollment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProgram) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const participantType = formValue(formData, 'participantType') as
      'CANDIDATE' | 'USER' | 'CLIENT_CONTACT' | 'EXTERNAL';
    const participantId = formValue(formData, 'participantId');
    await createTrainingEnrollment(accessToken, selectedProgram.id, {
      participantType,
      candidateId: participantType === 'CANDIDATE' ? participantId : undefined,
      userId: participantType === 'USER' ? participantId : undefined,
      clientContactId: participantType === 'CLIENT_CONTACT' ? participantId : undefined,
      externalTrainingParticipantId: participantType === 'EXTERNAL' ? participantId : undefined,
    });
    form.reset();
    setMessage('Training enrollment created.');
    await refreshProgram(selectedProgram.id);
  }

  async function changeEnrollmentStatus(enrollmentId: string, status: string): Promise<void> {
    if (!selectedProgram) {
      return;
    }
    await updateTrainingEnrollmentStatus(accessToken, selectedProgram.id, enrollmentId, {
      status: status as TrainingEnrollmentStatusAction,
    });
    setMessage(`Training enrollment status changed to ${status}.`);
    await refreshProgram(selectedProgram.id);
  }

  async function withdrawEnrollment(enrollmentId: string): Promise<void> {
    if (!selectedProgram) {
      return;
    }
    const reason = window.prompt('Withdrawal reason');
    if (!reason) {
      return;
    }
    await withdrawTrainingEnrollment(accessToken, selectedProgram.id, enrollmentId, { reason });
    setMessage('Training enrollment withdrawn.');
    await refreshProgram(selectedProgram.id);
  }

  async function handleAddParticipation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProgram || !selectedSession) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createTrainingParticipation(accessToken, selectedProgram.id, selectedSession.id, {
      trainingEnrollmentId: formValue(formData, 'trainingEnrollmentId'),
    });
    form.reset();
    setMessage('Training participation record added.');
    await refreshParticipations();
  }

  async function recordAttendance(participationId: string, status: string): Promise<void> {
    if (!selectedProgram || !selectedSession) {
      return;
    }
    await updateTrainingAttendance(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
      participationId,
      { status: status as TrainingAttendanceStatusAction },
    );
    setMessage(`Attendance recorded as ${status}.`);
    await refreshParticipations();
  }

  async function correctAttendance(participationId: string, status: string): Promise<void> {
    if (!selectedProgram || !selectedSession) {
      return;
    }
    const correctionReason = window.prompt('Attendance correction reason');
    if (!correctionReason) {
      return;
    }
    await correctTrainingAttendance(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
      participationId,
      { status: status as TrainingAttendanceStatusAction, correctionReason },
    );
    setMessage('Attendance corrected.');
    await refreshParticipations();
  }

  async function setCertificateApplicability(
    enrollmentId: string,
    certificateStatus: 'NOT_APPLICABLE' | 'PENDING',
  ): Promise<void> {
    if (!selectedProgram) {
      return;
    }
    await updateTrainingEnrollmentCertificateStatus(accessToken, selectedProgram.id, enrollmentId, {
      certificateStatus,
    });
    setMessage(`Certificate applicability set to ${certificateStatus}.`);
    await refreshProgram(selectedProgram.id);
  }

  async function archiveParticipation(participationId: string): Promise<void> {
    if (!selectedProgram || !selectedSession) {
      return;
    }
    await archiveTrainingParticipation(
      accessToken,
      selectedProgram.id,
      selectedSession.id,
      participationId,
    );
    setMessage('Participation archived.');
    await refreshParticipations();
  }

  return (
    <section className="admin-panel" aria-label="Training">
      <div className="admin-grid">
        <section aria-label="Training program list">
          <h2>Training</h2>
          <form className="inline-form" onSubmit={(event) => void handleProgramSearch(event)}>
            <label>
              Search
              <input
                name="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <label>
              Status
              <select
                name="status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
              >
                <option value="">Any</option>
                {trainingProgramStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Filter programs</button>
          </form>

          <ul>
            {programs.map((program) => (
              <li key={program.id}>
                <button type="button" onClick={() => void selectProgram(program)}>
                  {program.reference} — {program.name} ({program.status})
                </button>
              </li>
            ))}
          </ul>

          {canManagePrograms ? (
            <form onSubmit={(event) => void handleCreateProgram(event)}>
              <h3>Create training program</h3>
              <label>
                Reference
                <input name="reference" required />
              </label>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Description
                <input name="description" />
              </label>
              <label>
                Target audience
                <input name="targetAudience" />
              </label>
              <label>
                Owner user ID
                <input name="ownerUserId" />
              </label>
              <label>
                Client ID
                <input name="clientId" />
              </label>
              <label>
                Planned start
                <input name="plannedStartDate" type="datetime-local" />
              </label>
              <label>
                Planned end
                <input name="plannedEndDate" type="datetime-local" />
              </label>
              <button type="submit">Create training program</button>
            </form>
          ) : null}
        </section>

        <section aria-label="Training program detail">
          {selectedProgram ? (
            <>
              <h3>
                {selectedProgram.reference} — {selectedProgram.name}
              </h3>
              <p>Status: {selectedProgram.status}</p>
              <p>Client context: {selectedProgram.clientId ?? 'None'}</p>

              {canManageProgramStatus ? (
                <div className="action-row">
                  {(['PROGRAM_ACTIVE', 'PROGRAM_CLOSED'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void changeProgramStatus(status)}
                    >
                      Set {status}
                    </button>
                  ))}
                </div>
              ) : null}
              {canArchivePrograms ? (
                <button type="button" onClick={() => void archiveSelectedProgram()}>
                  Archive training program
                </button>
              ) : null}

              {canViewSessions ? (
                <section aria-label="Training sessions">
                  <h3>Sessions</h3>
                  <ul>
                    {sessions.map((session) => (
                      <li key={session.id}>
                        <button type="button" onClick={() => void selectSession(session)}>
                          {session.title} — {session.status} ({session.scheduledAt})
                        </button>
                      </li>
                    ))}
                  </ul>

                  {canManageSessions ? (
                    <form onSubmit={(event) => void handleCreateSession(event)}>
                      <h4>Schedule session</h4>
                      <label>
                        Title
                        <input name="title" required />
                      </label>
                      <label>
                        Sequence
                        <input name="sequence" type="number" min="1" />
                      </label>
                      <label>
                        Start
                        <input name="scheduledAt" type="datetime-local" required />
                      </label>
                      <label>
                        End
                        <input name="scheduledEndAt" type="datetime-local" required />
                      </label>
                      <label>
                        Delivery mode
                        <select name="deliveryMode" defaultValue="ONSITE">
                          <option value="ONSITE">ONSITE</option>
                          <option value="REMOTE">REMOTE</option>
                          <option value="HYBRID">HYBRID</option>
                        </select>
                      </label>
                      <label>
                        Trainer user ID
                        <input name="trainerUserId" />
                      </label>
                      <label>
                        Location
                        <input name="location" />
                      </label>
                      <button type="submit">Schedule training session</button>
                    </form>
                  ) : null}
                </section>
              ) : null}

              {canViewEnrollments ? (
                <section aria-label="Training enrollments">
                  <h3>Enrollments</h3>
                  <ul>
                    {enrollments.map((enrollment) => (
                      <li key={enrollment.id}>
                        {enrollment.participantType} — {enrollment.status}
                        {enrollment.certificateReady ? ' — certificate ready' : ''}
                        {enrollment.certificateReady && selectedProgram ? (
                          <GenerationControls
                            accessToken={accessToken}
                            label={`Certificate ${enrollment.id}`}
                            canGenerate={canGenerateCertificate}
                            canViewHistory={canViewDocumentHistory}
                            eligible={enrollment.certificateReady}
                            generate={(body) =>
                              generateTrainingCertificateDocument(
                                accessToken,
                                selectedProgram.id,
                                enrollment.id,
                                body,
                              )
                            }
                          />
                        ) : null}
                        {canManageEnrollments ? (
                          <span className="action-row">
                            <select
                              aria-label={`Set enrollment status ${enrollment.id}`}
                              defaultValue=""
                              onChange={(event) => {
                                const next = event.currentTarget.value;
                                if (next) {
                                  void changeEnrollmentStatus(enrollment.id, next);
                                }
                              }}
                            >
                              <option value="">Change status</option>
                              {trainingEnrollmentStatuses.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void withdrawEnrollment(enrollment.id)}
                            >
                              Withdraw
                            </button>
                            <select
                              aria-label={`Set certificate applicability ${enrollment.id}`}
                              defaultValue=""
                              onChange={(event) => {
                                const next = event.currentTarget.value;
                                if (next) {
                                  void setCertificateApplicability(
                                    enrollment.id,
                                    next as 'NOT_APPLICABLE' | 'PENDING',
                                  );
                                }
                              }}
                            >
                              <option value="">Certificate applicability</option>
                              <option value="PENDING">PENDING</option>
                              <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                            </select>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {canManageEnrollments ? (
                    <form onSubmit={(event) => void handleCreateEnrollment(event)}>
                      <h4>Enroll participant</h4>
                      <label>
                        Participant type
                        <select name="participantType" defaultValue="CANDIDATE">
                          {trainingParticipantTypes.map((participantType) => (
                            <option key={participantType} value={participantType}>
                              {participantType}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Participant ID
                        <input name="participantId" required />
                      </label>
                      <button type="submit">Create training enrollment</button>
                    </form>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : (
            <p>Select a training program to see sessions, enrollment, and attendance.</p>
          )}
        </section>

        <section aria-label="Training session attendance">
          {selectedSession ? (
            <>
              <h3>{selectedSession.title}</h3>
              <p>Status: {selectedSession.status}</p>
              <p>Reschedules: {selectedSession.rescheduleCount}</p>

              {canManageSessions ? (
                <>
                  <div className="action-row">
                    {trainingSessionStatusActions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void changeSessionStatus(status)}
                      >
                        Set {status}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={(event) => void handleRescheduleSession(event)}>
                    <h4>Reschedule session</h4>
                    <label>
                      New start
                      <input name="scheduledAt" type="datetime-local" required />
                    </label>
                    <label>
                      New end
                      <input name="scheduledEndAt" type="datetime-local" required />
                    </label>
                    <label>
                      Reason
                      <input name="reason" />
                    </label>
                    <button type="submit">Reschedule training session</button>
                  </form>
                  <form onSubmit={(event) => void handleCancelSession(event)}>
                    <h4>Cancel session</h4>
                    <label>
                      Cancellation reason
                      <input name="reason" required />
                    </label>
                    <button type="submit">Cancel training session</button>
                  </form>
                </>
              ) : null}
              {canArchiveSessions ? (
                <button type="button" onClick={() => void archiveSelectedSession()}>
                  Archive training session
                </button>
              ) : null}

              {canViewParticipation ? (
                <section aria-label="Session participation">
                  <h4>Attendance</h4>
                  <ul>
                    {participations.map((participation) => (
                      <li key={participation.id}>
                        {participation.trainingEnrollmentId} — {participation.status}
                        {participation.correctionCount > 0
                          ? ` — corrections: ${participation.correctionCount}`
                          : ''}
                        {canManageParticipation ? (
                          <select
                            aria-label={`Record attendance ${participation.id}`}
                            defaultValue=""
                            onChange={(event) => {
                              const next = event.currentTarget.value;
                              if (next) {
                                void recordAttendance(participation.id, next);
                              }
                            }}
                          >
                            <option value="">Record attendance</option>
                            {trainingAttendanceStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {canArchiveParticipation ? (
                          <button
                            type="button"
                            onClick={() => void archiveParticipation(participation.id)}
                          >
                            Archive participation
                          </button>
                        ) : null}
                        {canCorrectAttendance ? (
                          <select
                            aria-label={`Correct attendance ${participation.id}`}
                            defaultValue=""
                            onChange={(event) => {
                              const next = event.currentTarget.value;
                              if (next) {
                                void correctAttendance(participation.id, next);
                              }
                            }}
                          >
                            <option value="">Correct attendance</option>
                            {trainingAttendanceStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {canManageParticipation ? (
                    <form onSubmit={(event) => void handleAddParticipation(event)}>
                      <label>
                        Enrollment ID
                        <input name="trainingEnrollmentId" required />
                      </label>
                      <button type="submit">Add participation record</button>
                    </form>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : (
            <p>Select a training session to manage attendance.</p>
          )}
        </section>
      </div>

      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

const paymentMethods = ['BANK_TRANSFER', 'CHECK', 'CASH', 'CARD', 'DIRECT_DEBIT', 'OTHER'] as const;
const expenseCategories = [
  'RECRUITMENT_SOURCING',
  'TRAINING_DELIVERY',
  'TRAVEL',
  'SUBCONTRACTING',
  'SOFTWARE',
  'MARKETING',
  'OFFICE',
  'OTHER',
] as const;

/** Amounts arrive as null whenever the caller lacks commercial data access. */
function formatCents(cents: number | null | undefined, currency?: string): string {
  if (cents === null || cents === undefined) {
    return 'hidden';
  }
  return `${(cents / 100).toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

/**
 * Internal accounting workspace.
 *
 * Every control is gated on the same permission code the API enforces, and amounts
 * simply arrive redacted when the caller lacks commercial data access. The UI gate is
 * a convenience: the server re-checks capability, commercial data access, and record
 * scope on every request.
 */
function AccountingPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentDetail | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [receivables, setReceivables] = useState<ClientReceivableSummary | null>(null);
  const [overdue, setOverdue] = useState<OverdueReceivableListResponse['rows']>([]);
  const [profitability, setProfitability] = useState<ProfitabilitySummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canViewPayments = permissions.includes('payments:view');
  const canManagePayments = permissions.includes('payments:manage');
  const canCorrectPayments = permissions.includes('payments:correct');
  const canViewExpenses = permissions.includes('expenses:view');
  const canManageExpenses = permissions.includes('expenses:manage');
  const canViewBalances = permissions.includes('client_balances:view');
  const canViewProfitability = permissions.includes('profitability:view');

  useEffect(() => {
    void loadPayments();
    void loadExpenses();
  }, []);

  async function loadPayments(): Promise<void> {
    if (!canViewPayments) {
      return;
    }
    const response = await listPayments(accessToken, { pageSize: 20 });
    setPayments(response.payments);
  }

  async function loadExpenses(): Promise<void> {
    if (!canViewExpenses) {
      return;
    }
    const response = await listExpenses(accessToken, { pageSize: 20 });
    setExpenses(response.expenses);
  }

  async function selectPayment(paymentId: string): Promise<void> {
    const response = await getPayment(accessToken, paymentId);
    setSelectedPayment(response.payment);
    setMessage(null);
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const created = await createPayment(accessToken, {
      reference: formValue(formData, 'reference'),
      clientId: formValue(formData, 'clientId'),
      receivedDate: dateTimeFormValue(formData, 'receivedDate'),
      currency: formValue(formData, 'currency').toUpperCase(),
      amountCents: Number(formValue(formData, 'amountCents')),
      method: formValue(formData, 'method') as (typeof paymentMethods)[number],
      externalReference: optionalFormValue(formData, 'externalReference'),
    });
    form.reset();
    setSelectedPayment(created.payment);
    setMessage('Payment recorded.');
    await loadPayments();
  }

  async function handleAllocate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPayment) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await allocatePayment(accessToken, selectedPayment.id, {
      invoiceId: formValue(formData, 'invoiceId'),
      amountCents: Number(formValue(formData, 'amountCents')),
      idempotencyKey: optionalFormValue(formData, 'idempotencyKey'),
    });
    form.reset();
    setSelectedPayment(result.payment);
    setMessage('Payment allocated to the invoice.');
    await loadPayments();
  }

  async function handleReverseAllocation(allocationId: string): Promise<void> {
    if (!selectedPayment) {
      return;
    }
    const reversalReason = window.prompt('Allocation reversal reason');
    if (!reversalReason) {
      return;
    }
    const result = await reversePaymentAllocation(accessToken, selectedPayment.id, allocationId, {
      reversalReason,
    });
    setSelectedPayment(result.payment);
    setMessage('Allocation reversed.');
    await loadPayments();
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createExpense(accessToken, {
      reference: formValue(formData, 'reference'),
      expenseDate: dateTimeFormValue(formData, 'expenseDate'),
      category: formValue(formData, 'category') as (typeof expenseCategories)[number],
      currency: formValue(formData, 'currency').toUpperCase(),
      amountCents: Number(formValue(formData, 'amountCents')),
      clientId: optionalFormValue(formData, 'clientId'),
      vendorLabel: optionalFormValue(formData, 'vendorLabel'),
    });
    form.reset();
    setMessage('Expense recorded.');
    await loadExpenses();
  }

  async function handleArchiveExpense(expenseId: string): Promise<void> {
    await archiveExpense(accessToken, expenseId);
    setMessage('Expense archived.');
    await loadExpenses();
  }

  async function handleLoadReceivables(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await getClientReceivables(accessToken, formValue(formData, 'clientId'));
    setReceivables(response.receivables);
    const overdueResponse = await listOverdueReceivables(accessToken, {
      clientId: formValue(formData, 'clientId'),
    });
    setOverdue(overdueResponse.rows);
  }

  async function handleLoadProfitability(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await getProfitability(
      accessToken,
      formValue(formData, 'context') as ProfitabilityContext,
      formValue(formData, 'contextId'),
    );
    setProfitability(response.profitability);
  }

  return (
    <section className="admin-panel" aria-label="Accounting">
      <div className="admin-grid">
        <section aria-label="Payments">
          <h2>Accounting</h2>
          <h3>Payments</h3>
          <ul>
            {payments.map((payment) => (
              <li key={payment.id}>
                <button type="button" onClick={() => void selectPayment(payment.id)}>
                  {payment.reference} — {payment.status} —{' '}
                  {formatCents(payment.amounts?.amountCents, payment.amounts?.currency)}
                </button>
              </li>
            ))}
          </ul>

          {canManagePayments ? (
            <form onSubmit={(event) => void handleCreatePayment(event)}>
              <h4>Record payment</h4>
              <label>
                Reference
                <input name="reference" required />
              </label>
              <label>
                Client ID
                <input name="clientId" required />
              </label>
              <label>
                Received date
                <input name="receivedDate" type="datetime-local" required />
              </label>
              <label>
                Currency
                <input name="currency" defaultValue="MAD" required />
              </label>
              <label>
                Amount in cents
                <input name="amountCents" type="number" min="1" required />
              </label>
              <label>
                Method
                <select name="method" defaultValue="BANK_TRANSFER">
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                External reference
                <input name="externalReference" />
              </label>
              <button type="submit">Record payment</button>
            </form>
          ) : null}
        </section>

        <section aria-label="Payment allocation">
          {selectedPayment ? (
            <>
              <h3>{selectedPayment.reference}</h3>
              <p>
                Unallocated:{' '}
                {formatCents(
                  selectedPayment.amounts?.unallocatedCents,
                  selectedPayment.amounts?.currency,
                )}
              </p>
              <ul>
                {selectedPayment.allocations.map((allocation) => (
                  <li key={allocation.id}>
                    {allocation.invoiceId} — {allocation.status} —{' '}
                    {formatCents(allocation.amountCents)}
                    {canManagePayments && allocation.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        onClick={() => void handleReverseAllocation(allocation.id)}
                      >
                        Reverse allocation
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canManagePayments ? (
                <form onSubmit={(event) => void handleAllocate(event)}>
                  <h4>Allocate to invoice</h4>
                  <label>
                    Invoice ID
                    <input name="invoiceId" required />
                  </label>
                  <label>
                    Amount in cents
                    <input name="amountCents" type="number" min="1" required />
                  </label>
                  <label>
                    Idempotency key
                    <input name="idempotencyKey" />
                  </label>
                  <button type="submit">Allocate payment</button>
                </form>
              ) : null}
              {canCorrectPayments ? <p>Payment correction is available for this account.</p> : null}
            </>
          ) : (
            <p>Select a payment to manage its invoice allocations.</p>
          )}
        </section>

        <section aria-label="Expenses">
          <h3>Expenses</h3>
          <ul>
            {expenses.map((expense) => (
              <li key={expense.id}>
                {expense.reference} — {expense.category} —{' '}
                {formatCents(expense.amounts?.amountCents, expense.amounts?.currency)}
                {canManageExpenses && !expense.archivedAt ? (
                  <button type="button" onClick={() => void handleArchiveExpense(expense.id)}>
                    Archive expense
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {canManageExpenses ? (
            <form onSubmit={(event) => void handleCreateExpense(event)}>
              <h4>Record expense</h4>
              <label>
                Reference
                <input name="reference" required />
              </label>
              <label>
                Expense date
                <input name="expenseDate" type="datetime-local" required />
              </label>
              <label>
                Category
                <select name="category" defaultValue="RECRUITMENT_SOURCING">
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Currency
                <input name="currency" defaultValue="MAD" required />
              </label>
              <label>
                Amount in cents
                <input name="amountCents" type="number" min="1" required />
              </label>
              <label>
                Client ID
                <input name="clientId" />
              </label>
              <label>
                Vendor
                <input name="vendorLabel" />
              </label>
              <button type="submit">Record expense</button>
            </form>
          ) : null}
        </section>

        {canViewBalances ? (
          <section aria-label="Client balances">
            <h3>Client balances</h3>
            <form className="inline-form" onSubmit={(event) => void handleLoadReceivables(event)}>
              <label>
                Client ID
                <input name="clientId" required />
              </label>
              <button type="submit">Load receivables</button>
            </form>
            {receivables ? (
              <table>
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th>Invoiced</th>
                    <th>Allocated</th>
                    <th>Outstanding</th>
                    <th>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.totalsByCurrency.map((row) => (
                    <tr key={row.currency}>
                      <td>{row.currency}</td>
                      <td>{formatCents(row.invoicedCents)}</td>
                      <td>{formatCents(row.allocatedCents)}</td>
                      <td>{formatCents(row.outstandingCents)}</td>
                      <td>{formatCents(row.overdueOutstandingCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <h4>Overdue receivables</h4>
            <ul>
              {overdue.map((row) => (
                <li key={row.invoiceId}>
                  {row.reference} — {row.daysOverdue} days —{' '}
                  {formatCents(row.amounts?.outstandingCents, row.amounts?.currency)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {canViewProfitability ? (
          <section aria-label="Profitability">
            <h3>Profitability</h3>
            <form className="inline-form" onSubmit={(event) => void handleLoadProfitability(event)}>
              <label>
                Context
                <select name="context" defaultValue="CLIENT">
                  <option value="CLIENT">CLIENT</option>
                  <option value="RECRUITMENT_MISSION">RECRUITMENT_MISSION</option>
                  <option value="PLACEMENT">PLACEMENT</option>
                </select>
              </label>
              <label>
                Context ID
                <input name="contextId" required />
              </label>
              <button type="submit">Load profitability</button>
            </form>
            {profitability ? (
              <>
                <p>Revenue policy: {profitability.revenuePolicy}</p>
                <ul>
                  {profitability.totalsByCurrency.map((row) => (
                    <li key={row.currency}>
                      {row.currency}: revenue {formatCents(row.revenueCents)}, expenses{' '}
                      {formatCents(row.expenseCents)}, margin {formatCents(row.marginCents)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
