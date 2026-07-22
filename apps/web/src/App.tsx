import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AdminPermission,
  AdminRole,
  AdminRoleName,
  AdminUserDetail,
  AdminUserSummary,
  AuthenticatedUser,
  CandidateDetail,
  CandidateSummary,
  ClientContactSummary,
  ClientSummary,
  MissionAssignmentSummary,
  MissionLifecycleState,
  MissionSummary,
} from '@hire-me/contracts';

import {
  archiveCandidate,
  archiveClient,
  archiveClientContact,
  archiveMission,
  archiveMissionAssignment,
  assignAdminRole,
  createCandidate,
  createCandidateEducation,
  createCandidateLanguage,
  createCandidateSkill,
  createCandidateWorkExperience,
  createClient,
  createClientContact,
  createMission,
  createMissionAssignment,
  createAdminUser,
  fetchHealthStatus,
  fetchMeWithRefresh,
  getClient,
  getCandidate,
  getMission,
  getAdminUser,
  listCandidates,
  listClientContacts,
  listClients,
  listMissionAssignments,
  listMissions,
  listAdminPermissions,
  listAdminRoles,
  listAdminUsers,
  login,
  logout,
  removeAdminRole,
  revokeAdminSession,
  revokeAllAdminSessions,
  updateAdminUser,
  updateAdminUserStatus,
  updateCandidate,
  updateCandidateStatus,
  updateClient,
  updateClientContact,
  updateClientContactStatus,
  updateClientStatus,
  updateMission,
  updateMissionAssignment,
  updateMissionStatus,
  closeMission,
  setMissionLeadRecruiter,
  refresh,
} from './api.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

type Route = 'home' | 'admin' | 'clients' | 'candidates' | 'missions';

const ADMIN_ROUTE_PERMISSION = 'users:view';
const CLIENTS_ROUTE_PERMISSION = 'clients:view';
const CANDIDATES_ROUTE_PERMISSION = 'candidates:view';
const MISSIONS_ROUTE_PERMISSION = 'missions:view';

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() =>
    window.location.pathname === '/admin'
      ? 'admin'
      : window.location.pathname === '/clients'
        ? 'clients'
        : window.location.pathname === '/candidates'
          ? 'candidates'
          : window.location.pathname === '/missions'
            ? 'missions'
            : 'home',
  );

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
      setAuthError('Authentication failed.');
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

  function navigate(nextRoute: Route): void {
    setRoute(nextRoute);
    window.history.pushState(
      {},
      '',
      nextRoute === 'admin'
        ? '/admin'
        : nextRoute === 'clients'
          ? '/clients'
          : nextRoute === 'candidates'
            ? '/candidates'
            : nextRoute === 'missions'
              ? '/missions'
              : '/',
    );
  }

  const canOpenAdmin = Boolean(user?.permissions.includes(ADMIN_ROUTE_PERMISSION));
  const canOpenClients = Boolean(user?.permissions.includes(CLIENTS_ROUTE_PERMISSION));
  const canOpenCandidates = Boolean(user?.permissions.includes(CANDIDATES_ROUTE_PERMISSION));
  const canOpenMissions = Boolean(user?.permissions.includes(MISSIONS_ROUTE_PERMISSION));

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Hire Me Platform</p>
        <h1 id="page-title">Recruitment operations workspace</h1>
        <p>The monorepo foundation is ready for product modules after the next approved tasks.</p>
      </section>

      <section className="status-panel" aria-live="polite" aria-label="API status">
        <span className={`status-dot status-dot--${apiState.status}`} />
        <div>
          <h2>API health</h2>
          <p>
            {apiState.status === 'loading' ? 'Checking API health status...' : apiState.message}
          </p>
        </div>
      </section>

      {user ? (
        <section className="auth-panel" aria-label="Authenticated workspace">
          <div>
            <h2>Signed in</h2>
            <p>{user.displayName}</p>
          </div>
          <div className="action-row">
            <button
              type="button"
              onClick={() => {
                void handleRefreshUser();
              }}
            >
              Refresh profile
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('admin');
              }}
            >
              Administration
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('clients');
              }}
            >
              Clients
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('candidates');
              }}
            >
              Candidates
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('missions');
              }}
            >
              Missions
            </button>
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
            >
              Logout
            </button>
          </div>
        </section>
      ) : (
        <form
          className="auth-panel"
          aria-label="Login"
          onSubmit={(event) => {
            void handleLogin(event);
          }}
        >
          <h2>Sign in</h2>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Login</button>
          {authError ? <p role="alert">{authError}</p> : null}
        </form>
      )}

      {route === 'admin' && user && accessToken ? (
        canOpenAdmin ? (
          <AdminPanel accessToken={accessToken} />
        ) : (
          <section className="admin-panel" aria-label="Administration">
            <h2>Administration</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'clients' && user && accessToken ? (
        canOpenClients ? (
          <ClientsPanel accessToken={accessToken} permissions={user.permissions} />
        ) : (
          <section className="admin-panel" aria-label="Clients">
            <h2>Clients</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'candidates' && user && accessToken ? (
        canOpenCandidates ? (
          <CandidatesPanel accessToken={accessToken} permissions={user.permissions} />
        ) : (
          <section className="admin-panel" aria-label="Candidates">
            <h2>Candidates</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
      {route === 'missions' && user && accessToken ? (
        canOpenMissions ? (
          <MissionsPanel accessToken={accessToken} permissions={user.permissions} />
        ) : (
          <section className="admin-panel" aria-label="Missions">
            <h2>Missions</h2>
            <p role="alert">Permission denied.</p>
          </section>
        )
      ) : null}
    </main>
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

function CandidatesPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: string[];
}) {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateDetail | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreate = permissions.includes('candidates:create');
  const canUpdate = permissions.includes('candidates:update');
  const canManageStatus = permissions.includes('candidates:status:manage');
  const canArchive = permissions.includes('candidates:archive');
  const canManageProfile = permissions.includes('candidate_profile:manage');
  const canSeeCompensation = permissions.includes('candidate_compensation:view');
  const canSeeConsent = permissions.includes('candidate_consent:view');

  useEffect(() => {
    void loadCandidates();
  }, []);

  async function loadCandidates(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listCandidates({
      accessToken,
      search: nextSearch,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setCandidates(response.candidates);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadCandidates(search, statusFilter);
  }

  async function selectCandidate(candidateId: string): Promise<void> {
    const response = await getCandidate(accessToken, candidateId);
    setSelectedCandidate(response.candidate);
    setMessage(null);
    setError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const created = await createCandidate(accessToken, {
        displayName: formValue(formData, 'displayName'),
        email: optionalFormValue(formData, 'email'),
        phone: optionalFormValue(formData, 'phone'),
        city: optionalFormValue(formData, 'city'),
        country: optionalFormValue(formData, 'country'),
        currentJobTitle: optionalFormValue(formData, 'currentJobTitle'),
        source: optionalFormValue(formData, 'source'),
      });
      form.reset();
      setSelectedCandidate(created.candidate);
      setMessage('Candidate created.');
      await loadCandidates();
    } catch {
      setError('Candidate could not be created.');
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const updated = await updateCandidate(accessToken, selectedCandidate.id, {
      displayName: formValue(formData, 'displayName', selectedCandidate.displayName),
      email: nullableFormValue(formData, 'email'),
      phone: nullableFormValue(formData, 'phone'),
      city: nullableFormValue(formData, 'city'),
      country: nullableFormValue(formData, 'country'),
      currentJobTitle: nullableFormValue(formData, 'currentJobTitle'),
      professionalSummary: nullableFormValue(formData, 'professionalSummary'),
      source: nullableFormValue(formData, 'source'),
    });
    setSelectedCandidate(updated.candidate);
    setMessage('Candidate updated.');
    await loadCandidates();
  }

  async function changeStatus(status: 'ACTIVE' | 'INACTIVE' | 'TALENT_POOL'): Promise<void> {
    if (!selectedCandidate || !window.confirm(`Change this candidate status to ${status}?`)) {
      return;
    }
    const updated = await updateCandidateStatus(accessToken, selectedCandidate.id, { status });
    setSelectedCandidate(updated.candidate);
    setMessage(`Candidate status changed to ${status}.`);
    await loadCandidates();
  }

  async function archiveSelected(): Promise<void> {
    if (!selectedCandidate || !window.confirm('Archive this candidate profile?')) {
      return;
    }
    const archived = await archiveCandidate(accessToken, selectedCandidate.id);
    setSelectedCandidate(archived.candidate);
    setMessage('Candidate archived.');
    await loadCandidates();
  }

  async function handleAddSkill(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateSkill(accessToken, selectedCandidate.id, {
      name: formValue(formData, 'name'),
      level: optionalFormValue(formData, 'level'),
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Skill added.');
  }

  async function handleAddLanguage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateLanguage(accessToken, selectedCandidate.id, {
      language: formValue(formData, 'language'),
      proficiency: formValue(formData, 'proficiency'),
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Language added.');
  }

  async function handleAddExperience(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateWorkExperience(accessToken, selectedCandidate.id, {
      employer: formValue(formData, 'employer'),
      title: formValue(formData, 'title'),
      startDate: optionalFormValue(formData, 'startDate'),
      endDate: optionalFormValue(formData, 'endDate'),
      isCurrent: formData.get('isCurrent') === 'on',
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Experience added.');
  }

  async function handleAddEducation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCandidate) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await createCandidateEducation(accessToken, selectedCandidate.id, {
      institution: formValue(formData, 'institution'),
      qualification: formValue(formData, 'qualification'),
      field: optionalFormValue(formData, 'field'),
    });
    form.reset();
    await selectCandidate(selectedCandidate.id);
    setMessage('Education added.');
  }

  return (
    <section className="admin-panel" aria-label="Candidates">
      <div className="admin-grid">
        <section aria-label="Candidate list">
          <h2>Candidates</h2>
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
                <option value="INACTIVE">Inactive</option>
                <option value="TALENT_POOL">Talent pool</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <button type="submit">Search candidates</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Title</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <button type="button" onClick={() => void selectCandidate(candidate.id)}>
                      {candidate.displayName}
                    </button>
                  </td>
                  <td>{candidate.status}</td>
                  <td>{candidate.currentJobTitle ?? 'None'}</td>
                  <td>
                    {[candidate.city, candidate.country].filter(Boolean).join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            className="stacked-form"
            aria-label="Create candidate"
            onSubmit={(event) => void handleCreate(event)}
          >
            <h3>Create candidate</h3>
            <input name="displayName" placeholder="Candidate name" required />
            <input name="email" type="email" placeholder="Candidate email" />
            <input name="phone" placeholder="Phone" />
            <input name="currentJobTitle" placeholder="Current job title" />
            <input name="city" placeholder="City" />
            <input name="country" placeholder="Country" />
            <input name="source" placeholder="Source" />
            <button type="submit" disabled={!canCreate}>
              Create candidate
            </button>
          </form>
        </section>

        <section aria-label="Candidate detail">
          {selectedCandidate ? (
            <>
              <h2>{selectedCandidate.displayName}</h2>
              <p>Status: {selectedCandidate.status}</p>
              <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                <input
                  name="displayName"
                  aria-label="Candidate name"
                  defaultValue={selectedCandidate.displayName}
                />
                <input
                  name="email"
                  type="email"
                  aria-label="Candidate email"
                  defaultValue={selectedCandidate.email ?? ''}
                />
                <input
                  name="phone"
                  aria-label="Candidate phone"
                  defaultValue={selectedCandidate.phone ?? ''}
                />
                <input
                  name="currentJobTitle"
                  aria-label="Current job title"
                  defaultValue={selectedCandidate.currentJobTitle ?? ''}
                />
                <input name="city" aria-label="City" defaultValue={selectedCandidate.city ?? ''} />
                <input
                  name="country"
                  aria-label="Country"
                  defaultValue={selectedCandidate.country ?? ''}
                />
                <input
                  name="source"
                  aria-label="Source"
                  defaultValue={selectedCandidate.source ?? ''}
                />
                <textarea
                  name="professionalSummary"
                  aria-label="Professional summary"
                  defaultValue={selectedCandidate.professionalSummary ?? ''}
                />
                <button
                  type="submit"
                  disabled={!canUpdate || selectedCandidate.status === 'ARCHIVED'}
                >
                  Update candidate
                </button>
              </form>

              <div className="action-row">
                <button
                  type="button"
                  disabled={!canManageStatus}
                  onClick={() => void changeStatus('ACTIVE')}
                >
                  Active
                </button>
                <button
                  type="button"
                  disabled={!canManageStatus}
                  onClick={() => void changeStatus('INACTIVE')}
                >
                  Inactive
                </button>
                <button
                  type="button"
                  disabled={!canManageStatus}
                  onClick={() => void changeStatus('TALENT_POOL')}
                >
                  Talent pool
                </button>
                <button type="button" disabled={!canArchive} onClick={() => void archiveSelected()}>
                  Archive candidate
                </button>
              </div>

              {canSeeCompensation ? (
                <p>
                  Compensation:{' '}
                  {selectedCandidate.compensation?.salaryExpectationCents
                    ? `${selectedCandidate.compensation.salaryExpectationCents} ${selectedCandidate.compensation.salaryExpectationCurrency ?? ''}`
                    : 'None'}
                </p>
              ) : null}
              {canSeeConsent ? (
                <p>Consent: {selectedCandidate.consent?.consentStatus ?? 'Hidden'}</p>
              ) : null}

              <h3>Skills</h3>
              <p>{selectedCandidate.skills.map((skill) => skill.name).join(', ') || 'None'}</p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddSkill(event)}>
                  <input name="name" placeholder="Skill" required />
                  <input name="level" placeholder="Level" />
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add skill
                  </button>
                </form>
              ) : null}

              <h3>Languages</h3>
              <p>
                {selectedCandidate.languages
                  .map((language) => `${language.language} ${language.proficiency}`)
                  .join(', ') || 'None'}
              </p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddLanguage(event)}>
                  <input name="language" placeholder="Language" required />
                  <input name="proficiency" placeholder="Proficiency" required />
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add language
                  </button>
                </form>
              ) : null}

              <h3>Experience</h3>
              <p>
                {selectedCandidate.workExperiences
                  .map((experience) => `${experience.title} at ${experience.employer}`)
                  .join(', ') || 'None'}
              </p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddExperience(event)}>
                  <input name="employer" placeholder="Employer" required />
                  <input name="title" placeholder="Title" required />
                  <input name="startDate" placeholder="Start date" />
                  <input name="endDate" placeholder="End date" />
                  <label>
                    Current
                    <input name="isCurrent" type="checkbox" />
                  </label>
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add experience
                  </button>
                </form>
              ) : null}

              <h3>Education</h3>
              <p>
                {selectedCandidate.education
                  .map((education) => education.qualification)
                  .join(', ') || 'None'}
              </p>
              {canManageProfile ? (
                <form className="inline-form" onSubmit={(event) => void handleAddEducation(event)}>
                  <input name="institution" placeholder="Institution" required />
                  <input name="qualification" placeholder="Qualification" required />
                  <input name="field" placeholder="Field" />
                  <button type="submit" disabled={selectedCandidate.status === 'ARCHIVED'}>
                    Add education
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <p>Select a candidate to inspect profile, lifecycle, and structured data.</p>
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
    if (canViewAssignments) {
      const assignmentResponse = await listMissionAssignments(accessToken, missionId);
      setAssignments(assignmentResponse.assignments);
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

function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}

function optionalFormValue(formData: FormData, name: string): string | undefined {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : undefined;
}

function nullableFormValue(formData: FormData, name: string): string | null {
  const value = formValue(formData, name).trim();
  return value.length > 0 ? value : null;
}
