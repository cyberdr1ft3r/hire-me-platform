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
  DocumentGenerationRequest,
  DocumentGenerationResponse,
  DocumentVersion,
  GeneratedVersionProvenance,
  InvoiceSummary,
  PurchaseOrderSummary,
  QuotationSummary,
  ClientReceivableSummary,
  ExpenseSummary,
  OverdueReceivableListResponse,
  PaymentDetail,
  PaymentSummary,
  ProfitabilityContext,
  ProfitabilitySummary,
} from '@hire-me/contracts';

import {
  archiveCommercialContract,
  archiveInvoice,
  archivePurchaseOrder,
  archiveQuotation,
  cancelInvoice,
  assignAdminRole,
  createCommercialContract,
  createInvoice,
  createAdminUser,
  createPurchaseOrder,
  createQuotation,
  fetchHealthStatus,
  fetchMeWithRefresh,
  getAdminUser,
  issueInvoice,
  listCommercialContracts,
  listInvoices,
  listDocumentVersions,
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
  updateCommercialContractStatus,
  updatePurchaseOrderStatus,
  updateQuotationStatus,
  refresh,
  downloadDocumentVersion,
  generateContractDocument,
  generateInvoiceDocument,
  generatePurchaseOrderDocument,
  generateQuotationDocument,
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
} from './api.js';
import {
  canAccessInternalRoute,
  isDeferredEnglishRoute,
  pathToRoute,
  routeToPath,
  type InternalRoute,
} from './navigation/internal-navigation.js';
import { recordNavigationIntent } from './navigation/record-deep-links.js';
import { AppShell } from './ui/shell/AppShell.js';
import { I18nProvider, LegacyEnglishContent, useI18n } from './i18n/index.js';
import { InternalHome } from './ui/shell/InternalHome.js';
import { ReportingPanel } from './reporting/index.js';
import { CandidatesPanel } from './candidates/index.js';
import { ClientsPanel } from './clients/ClientsPanel.js';
import { DocumentsPanel } from './documents/index.js';
import { MissionsPanel } from './missions/index.js';
import { TrainingPanel } from './training/index.js';
import { formatAdminRoleName } from './admin/role-labels.js';
import { TasksPanel } from './tasks/index.js';
import {
  PublicOpportunitiesPanel,
  PublicOpportunityDetailPanel,
} from './public-opportunities/index.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

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
  const [location, setLocation] = useState(() => ({
    route: pathToRoute(window.location.pathname),
    search: window.location.search,
  }));
  const route = location.route;

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
    const handlePopState = () =>
      setLocation({
        route: pathToRoute(window.location.pathname),
        search: window.location.search,
      });
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
    const path = routeToPath(nextRoute);
    window.history.pushState({}, '', path);
    setLocation({ route: nextRoute, search: '' });
  }

  function navigateToPath(path: string): void {
    window.history.pushState({}, '', path);
    setLocation({
      route: pathToRoute(new URL(path, window.location.origin).pathname),
      search: new URL(path, window.location.origin).search,
    });
  }

  function replaceRecordIntent(path: string): void {
    window.history.replaceState({}, '', path);
    setLocation({
      route: pathToRoute(new URL(path, window.location.origin).pathname),
      search: new URL(path, window.location.origin).search,
    });
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
  const recordIntent = recordNavigationIntent(route, location.search);
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
        routeContent = (
          <CandidatesPanel
            accessToken={accessToken}
            initialCandidateId={recordIntent.candidateId}
            onSelectionChange={(candidateId) =>
              replaceRecordIntent(`/candidates?candidate=${encodeURIComponent(candidateId)}`)
            }
            permissions={user.permissions}
          />
        );
        break;
      case 'missions':
        routeContent = (
          <MissionsPanel
            accessToken={accessToken}
            actorUserId={user.id}
            initialMissionId={recordIntent.missionId}
            onSelectionChange={(missionId) =>
              replaceRecordIntent(`/missions?mission=${encodeURIComponent(missionId)}`)
            }
            permissions={user.permissions}
          />
        );
        break;
      case 'tasks':
        routeContent = <TasksPanel accessToken={accessToken} user={user} />;
        break;
      case 'documents':
        routeContent = <DocumentsPanel accessToken={accessToken} permissions={user.permissions} />;
        break;
      case 'training':
        routeContent = (
          <TrainingPanel
            accessToken={accessToken}
            actorUserId={user.id}
            permissions={user.permissions}
          />
        );
        break;
      case 'reporting':
        routeContent = (
          <ReportingPanel
            accessToken={accessToken}
            onNavigate={navigateToPath}
            permissions={user.permissions}
          />
        );
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
  const { t } = useI18n();
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
                  <td>
                    {adminUser.roles.map((role) => formatAdminRoleName(t, role)).join(', ') ||
                      'None'}
                  </td>
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
                        {formatAdminRoleName(t, role.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Assign role</button>
              </form>

              <ul>
                {selectedUser.roles.map((roleName) => (
                  <li key={roleName}>
                    {formatAdminRoleName(t, roleName)}{' '}
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

function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}

function optionalFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : undefined;
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
