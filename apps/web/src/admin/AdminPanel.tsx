import type {
  AdminPermission,
  AdminRole,
  AdminRoleName,
  AdminUserDetail,
  AdminUserSummary,
} from '@hire-me/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import {
  assignAdminRole,
  createAdminUser,
  getAdminUser,
  listAdminPermissions,
  listAdminRoles,
  listAdminUsers,
  removeAdminRole,
  revokeAdminSession,
  revokeAllAdminSessions,
  updateAdminUser,
  updateAdminUserStatus,
} from '../api.js';
import { useI18n } from '../i18n/index.js';
import { Button, PageHeader, StatusBadge, TextField } from '../ui/index.js';
import { PermissionGroups } from './PermissionGroups.js';
import { adminStatusTone, formatAdminRoleName } from './role-labels.js';

export function AdminPanel({ accessToken }: { accessToken: string }) {
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
      <PageHeader title="Administration" />
      <div className="admin-grid">
        <section aria-label="User administration">
          <h2>Users</h2>
          <form className="inline-form" onSubmit={(event) => void handleSearch(event)}>
            <label>
              Search
              <input
                className="ui-field__control"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                name="search"
              />
            </label>
            <label>
              Status
              <select
                className="ui-field__control"
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
            <Button variant="secondary" type="submit">
              Search users
            </Button>
          </form>

          <div className="admin-table-scroll" role="region" aria-label="Users" tabIndex={0}>
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
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => void selectUser(adminUser.id)}
                      >
                        {adminUser.displayName}
                      </Button>
                    </td>
                    <td>
                      <StatusBadge tone={adminStatusTone(adminUser.status)}>
                        {adminUser.status}
                      </StatusBadge>
                    </td>
                    <td>
                      {adminUser.roles.map((role) => formatAdminRoleName(t, role)).join(', ') ||
                        'None'}
                    </td>
                    <td>{adminUser.activeSessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            className="stacked-form"
            aria-label="Create internal user"
            onSubmit={(event) => void handleCreate(event)}
          >
            <h3>Create internal user</h3>
            <TextField
              label="Display name"
              name="displayName"
              placeholder="Display name"
              required
            />
            <TextField label="Email" name="email" type="email" placeholder="Email" required />
            <TextField label="Locale" name="locale" defaultValue="en" required />
            <TextField
              label="Initial password"
              name="initialPassword"
              type="password"
              placeholder="Initial password"
              autoComplete="new-password"
              required
            />
            <Button type="submit">Create user</Button>
          </form>
        </section>

        <section aria-label="Selected user detail">
          {selectedUser ? (
            <>
              <h2>{selectedUser.displayName}</h2>
              <p>{selectedUser.email}</p>
              <StatusBadge tone={adminStatusTone(selectedUser.status)}>
                {selectedUser.status}
              </StatusBadge>
              <form className="stacked-form" onSubmit={(event) => void handleUpdate(event)}>
                <TextField
                  name="displayName"
                  label="Display name"
                  defaultValue={selectedUser.displayName}
                />
                <TextField name="locale" label="Locale" defaultValue={selectedUser.locale} />
                <Button variant="secondary" type="submit">
                  Update profile
                </Button>
              </form>

              <div className="action-row">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void changeStatus('ACTIVE')}
                >
                  Reactivate
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void changeStatus('SUSPENDED')}
                >
                  Suspend
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void changeStatus('ARCHIVED')}
                >
                  Archive
                </Button>
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
                <Button variant="secondary" type="submit">
                  Assign role
                </Button>
              </form>

              <ul>
                {selectedUser.roles.map((roleName) => (
                  <li key={roleName}>
                    {formatAdminRoleName(t, roleName)}{' '}
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void removeRole(roleName)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>

              <h3>Active sessions</h3>
              <Button variant="secondary" type="button" onClick={() => void revokeAllSessions()}>
                Revoke all sessions
              </Button>
              <ul>
                {selectedUser.sessions.map((session) => (
                  <li key={session.id}>
                    {session.createdAt}{' '}
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void revokeOneSession(session.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>

              <h3>Effective permissions</h3>
              <PermissionGroups codes={selectedUser.effectivePermissions} />
            </>
          ) : (
            <p>Select a user to inspect safe profile, roles, permissions, and sessions.</p>
          )}
          {message ? <p role="status">{message}</p> : null}
        </section>
      </div>

      <section aria-label="Permission catalog">
        <h2>Permission catalog</h2>
        <PermissionGroups codes={permissions.map((permission) => permission.code)} />
      </section>
    </section>
  );
}

function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}
