import type {
  AdminPermission,
  AdminRole,
  AdminRoleName,
  AdminUserDetail,
  AdminUserStatus,
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
import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { UnsavedInputScope } from '../navigation/UnsavedInputScope.js';
import {
  Button,
  DirectoryPage,
  InlineMessage,
  PageState,
  StatusBadge,
  TextField,
} from '../ui/index.js';
import {
  adminSectionPath,
  canAccessAdminSection,
  visibleAdminSections,
  type AdminSection,
} from './admin-sections.js';
import { BillingSettingsPanel } from './BillingSettingsPanel.js';
import { PermissionGroups } from './PermissionGroups.js';
import { adminStatusTone, formatAdminRoleName } from './role-labels.js';
import './admin.css';

const sectionLabels: Record<AdminSection, PlainMessageKey> = {
  billing: 'admin.sections.billing.title',
  users: 'admin.sections.users.title',
  access: 'admin.sections.access.title',
};

const statusLabels: Record<AdminUserStatus, PlainMessageKey> = {
  ACTIVE: 'admin.users.status.ACTIVE',
  SUSPENDED: 'admin.users.status.SUSPENDED',
  ARCHIVED: 'admin.users.status.ARCHIVED',
};

function UserAdministrationPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: readonly string[];
}) {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const createWrite = useTrackedFormWrite();
  const updateWrite = useTrackedFormWrite();
  const roleWrite = useTrackedFormWrite();
  const canCreate = permissions.includes('users:create');
  const canUpdate = permissions.includes('users:update');
  const canManageRoles = permissions.includes('users:roles:manage');
  const canManageStatus = permissions.includes('users:status:manage');
  const canRevokeSessions = permissions.includes('users:sessions:revoke');
  const canViewRoles = permissions.includes('roles:view');
  const shouldLoadRoles = canManageRoles && canViewRoles;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    const requests: Promise<unknown>[] = [
      listAdminUsers({ accessToken, pageSize: 20 }).then((response) => {
        if (active) setUsers(response.users);
      }),
    ];
    if (shouldLoadRoles) {
      requests.push(
        listAdminRoles(accessToken).then((response) => {
          if (active) setRoles(response.roles);
        }),
      );
    }
    void Promise.all(requests)
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, shouldLoadRoles]);

  async function loadUsers(nextSearch = search, nextStatus = statusFilter): Promise<void> {
    const response = await listAdminUsers({
      accessToken,
      search: nextSearch || undefined,
      status: nextStatus || undefined,
      pageSize: 20,
    });
    setUsers(response.users);
    setLoadError(false);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await loadUsers(search, statusFilter);
    } catch {
      setLoadError(true);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const saved = await createWrite.track(async () => {
      const formData = new FormData(form);
      const created = await createAdminUser(accessToken, {
        displayName: formValue(formData, 'displayName'),
        email: formValue(formData, 'email'),
        initialPassword: formValue(formData, 'initialPassword'),
        locale: formValue(formData, 'locale', 'en'),
      });
      form.reset();
      setSelectedUser(created.user);
      setMessage(t('admin.users.feedback.created'));
      await loadUsers();
    });
    if (!saved) setMessage(t('admin.users.feedback.failed'));
  }

  async function selectUser(userId: string): Promise<void> {
    try {
      const response = await getAdminUser(accessToken, userId);
      setSelectedUser(response.user);
      setMessage(null);
    } catch {
      setMessage(t('admin.users.feedback.failed'));
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) return;
    const formData = new FormData(event.currentTarget);
    const user = selectedUser;
    const saved = await updateWrite.track(async () => {
      const updated = await updateAdminUser(accessToken, user.id, {
        displayName: formValue(formData, 'displayName', user.displayName),
        locale: formValue(formData, 'locale', user.locale),
      });
      setSelectedUser(updated.user);
      setMessage(t('admin.users.feedback.updated'));
      await loadUsers();
    });
    if (!saved) setMessage(t('admin.users.feedback.failed'));
  }

  async function handleAssignRole(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) return;
    const formData = new FormData(event.currentTarget);
    const user = selectedUser;
    const saved = await roleWrite.track(async () => {
      const roleName = formValue(formData, 'roleName') as AdminRoleName;
      const updated = await assignAdminRole(accessToken, user.id, { roleName });
      setSelectedUser(updated.user);
      setMessage(t('admin.users.feedback.roleAssigned'));
      await loadUsers();
    });
    if (!saved) setMessage(t('admin.users.feedback.failed'));
  }

  async function removeRole(roleName: AdminRoleName): Promise<void> {
    if (!selectedUser || !window.confirm(t('admin.users.confirmRemoveRole'))) return;
    try {
      const updated = await removeAdminRole(accessToken, selectedUser.id, roleName);
      setSelectedUser(updated.user);
      setMessage(t('admin.users.feedback.roleRemoved'));
      await loadUsers();
    } catch {
      setMessage(t('admin.users.feedback.failed'));
    }
  }

  async function changeStatus(status: AdminUserStatus): Promise<void> {
    if (
      !selectedUser ||
      !window.confirm(t('admin.users.confirmStatus', { status: t(statusLabels[status]) }))
    )
      return;
    try {
      const updated = await updateAdminUserStatus(accessToken, selectedUser.id, { status });
      setSelectedUser(updated.user);
      setMessage(t('admin.users.feedback.statusChanged'));
      await loadUsers();
    } catch {
      setMessage(t('admin.users.feedback.failed'));
    }
  }

  async function revokeOneSession(sessionId: string): Promise<void> {
    if (!selectedUser || !window.confirm(t('admin.users.confirmSession'))) return;
    try {
      const response = await revokeAdminSession(accessToken, selectedUser.id, sessionId);
      setSelectedUser({ ...selectedUser, sessions: response.sessions });
      setMessage(t('admin.users.feedback.sessionRevoked'));
    } catch {
      setMessage(t('admin.users.feedback.failed'));
    }
  }

  async function revokeAllSessions(): Promise<void> {
    if (!selectedUser || !window.confirm(t('admin.users.confirmAllSessions'))) return;
    try {
      const response = await revokeAllAdminSessions(accessToken, selectedUser.id);
      setSelectedUser({ ...selectedUser, sessions: response.sessions, activeSessionCount: 0 });
      setMessage(t('admin.users.feedback.sessionsRevoked'));
      await loadUsers();
    } catch {
      setMessage(t('admin.users.feedback.failed'));
    }
  }

  return (
    <section aria-labelledby="admin-users-title" className="admin-section">
      <div className="admin-section__heading">
        <h2 id="admin-users-title">{t('admin.sections.users.title')}</h2>
        <p>{t('admin.sections.users.description')}</p>
      </div>
      <form
        aria-label={t('admin.users.filters.region')}
        className="inline-form"
        data-unsaved-guard="ignore"
        onSubmit={(event) => void handleSearch(event)}
      >
        <label>
          {t('admin.users.filters.search')}
          <input
            className="ui-field__control"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            name="search"
          />
        </label>
        <label>
          {t('admin.users.filters.status')}
          <select
            className="ui-field__control"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value)}
            name="status"
          >
            <option value="">{t('admin.users.filters.anyStatus')}</option>
            {Object.entries(statusLabels).map(([status, key]) => (
              <option key={status} value={status}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" type="submit">
          {t('admin.users.filters.submit')}
        </Button>
      </form>

      {loading ? <PageState kind="loading" title={t('admin.users.loading')} /> : null}
      {loadError ? (
        <PageState
          action={
            <Button variant="secondary" type="button" onClick={() => void loadUsers()}>
              {t('common.actions.retry')}
            </Button>
          }
          kind="error"
          title={t('admin.users.errorTitle')}
        >
          <p>{t('admin.users.errorMessage')}</p>
        </PageState>
      ) : null}

      {!loading && !loadError ? (
        <div className="admin-grid">
          <section aria-label={t('admin.users.listRegion')}>
            {users.length ? (
              <div
                className="admin-table-scroll"
                role="region"
                aria-label={t('admin.users.listRegion')}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.users.columns.name')}</th>
                      <th>{t('admin.users.columns.status')}</th>
                      <th>{t('admin.users.columns.roles')}</th>
                      <th>{t('admin.users.columns.sessions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((adminUser) => (
                      <tr key={adminUser.id}>
                        <td>
                          <Button
                            aria-current={selectedUser?.id === adminUser.id ? 'true' : undefined}
                            variant="secondary"
                            type="button"
                            onClick={() => void selectUser(adminUser.id)}
                          >
                            {adminUser.displayName}
                          </Button>
                        </td>
                        <td>
                          <StatusBadge tone={adminStatusTone(adminUser.status)}>
                            {t(statusLabels[adminUser.status])}
                          </StatusBadge>
                        </td>
                        <td>
                          {adminUser.roles.map((role) => formatAdminRoleName(t, role)).join(', ') ||
                            t('admin.users.none')}
                        </td>
                        <td>{adminUser.activeSessionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageState kind="empty" title={t('admin.users.emptyTitle')}>
                {t('admin.users.emptyMessage')}
              </PageState>
            )}

            {canCreate ? (
              <UnsavedInputScope
                failureSignal={createWrite.failures || null}
                savedSignal={createWrite.saves || null}
                writePending={createWrite.pending}
              >
                <form
                  className="stacked-form"
                  aria-label={t('admin.users.create.title')}
                  onSubmit={(event) => void handleCreate(event)}
                >
                  <h3>{t('admin.users.create.title')}</h3>
                  <TextField
                    label={t('admin.users.fields.displayName')}
                    name="displayName"
                    required
                  />
                  <TextField
                    label={t('admin.users.fields.email')}
                    name="email"
                    type="email"
                    required
                  />
                  <TextField
                    label={t('admin.users.fields.locale')}
                    name="locale"
                    defaultValue="en"
                    required
                  />
                  <TextField
                    label={t('admin.users.fields.initialPassword')}
                    name="initialPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                  <Button type="submit">{t('admin.users.create.submit')}</Button>
                </form>
              </UnsavedInputScope>
            ) : null}
          </section>

          <section aria-label={t('admin.users.detailRegion')}>
            {selectedUser ? (
              <>
                <h3>{selectedUser.displayName}</h3>
                <p>{selectedUser.email}</p>
                <StatusBadge tone={adminStatusTone(selectedUser.status)}>
                  {t(statusLabels[selectedUser.status])}
                </StatusBadge>

                {canUpdate ? (
                  <UnsavedInputScope
                    failureSignal={updateWrite.failures || null}
                    savedSignal={updateWrite.saves || null}
                    writePending={updateWrite.pending}
                  >
                    <form
                      key={selectedUser.id}
                      className="stacked-form"
                      onSubmit={(event) => void handleUpdate(event)}
                    >
                      <TextField
                        name="displayName"
                        label={t('admin.users.fields.displayName')}
                        defaultValue={selectedUser.displayName}
                      />
                      <TextField
                        name="locale"
                        label={t('admin.users.fields.locale')}
                        defaultValue={selectedUser.locale}
                      />
                      <Button variant="secondary" type="submit">
                        {t('admin.users.actions.update')}
                      </Button>
                    </form>
                  </UnsavedInputScope>
                ) : null}

                {canManageStatus ? (
                  <div className="action-row" aria-label={t('admin.users.actions.statusRegion')}>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void changeStatus('ACTIVE')}
                    >
                      {t('admin.users.actions.reactivate')}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void changeStatus('SUSPENDED')}
                    >
                      {t('admin.users.actions.suspend')}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void changeStatus('ARCHIVED')}
                    >
                      {t('admin.users.actions.archive')}
                    </Button>
                  </div>
                ) : null}

                {canManageRoles && canViewRoles && roles.length ? (
                  <UnsavedInputScope
                    failureSignal={roleWrite.failures || null}
                    savedSignal={roleWrite.saves || null}
                    writePending={roleWrite.pending}
                  >
                    <form
                      className="inline-form"
                      onSubmit={(event) => void handleAssignRole(event)}
                    >
                      <label>
                        {t('admin.users.fields.role')}
                        <select name="roleName" required>
                          {roles.map((role) => (
                            <option key={role.id} value={role.name}>
                              {formatAdminRoleName(t, role.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button variant="secondary" type="submit">
                        {t('admin.users.actions.assignRole')}
                      </Button>
                    </form>
                  </UnsavedInputScope>
                ) : null}

                <ul className="admin-role-list">
                  {selectedUser.roles.map((roleName) => (
                    <li key={roleName}>
                      <span>{formatAdminRoleName(t, roleName)}</span>
                      {canManageRoles ? (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => void removeRole(roleName)}
                        >
                          {t('admin.users.actions.removeRole')}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <h3>{t('admin.users.sessions.title')}</h3>
                {canRevokeSessions && selectedUser.sessions.length ? (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void revokeAllSessions()}
                  >
                    {t('admin.users.sessions.revokeAll')}
                  </Button>
                ) : null}
                {selectedUser.sessions.length ? (
                  <ul className="admin-session-list">
                    {selectedUser.sessions.map((session) => (
                      <li key={session.id}>
                        <span>{session.createdAt}</span>
                        {canRevokeSessions ? (
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => void revokeOneSession(session.id)}
                          >
                            {t('admin.users.sessions.revoke')}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('admin.users.sessions.empty')}</p>
                )}

                <h3>{t('admin.users.effectivePermissions')}</h3>
                <PermissionGroups
                  codes={selectedUser.effectivePermissions}
                  emptyLabel={t('admin.users.none')}
                />
              </>
            ) : (
              <PageState kind="empty" title={t('admin.users.selectTitle')}>
                {t('admin.users.selectMessage')}
              </PageState>
            )}
            {message ? <p role="status">{message}</p> : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AccessAdministrationPanel({
  accessToken,
  permissions: actorPermissions,
}: {
  accessToken: string;
  permissions: readonly string[];
}) {
  const { t } = useI18n();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [catalog, setCatalog] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canViewRoles = actorPermissions.includes('roles:view');
  const canViewPermissions = actorPermissions.includes('permissions:view');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const requests: Promise<unknown>[] = [];
    if (canViewRoles) {
      requests.push(
        listAdminRoles(accessToken).then((response) => {
          if (active) setRoles(response.roles);
        }),
      );
    }
    if (canViewPermissions) {
      requests.push(
        listAdminPermissions(accessToken).then((response) => {
          if (active) setCatalog(response.permissions);
        }),
      );
    }
    void Promise.all(requests)
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, canViewPermissions, canViewRoles]);

  return (
    <section aria-labelledby="admin-access-title" className="admin-section">
      <div className="admin-section__heading">
        <h2 id="admin-access-title">{t('admin.sections.access.title')}</h2>
        <p>{t('admin.sections.access.description')}</p>
      </div>
      {loading ? <PageState kind="loading" title={t('admin.access.loading')} /> : null}
      {error ? (
        <PageState kind="error" title={t('admin.access.errorTitle')}>
          <p>{t('admin.access.errorMessage')}</p>
        </PageState>
      ) : null}
      {!loading && !error ? (
        <div className="admin-access-grid">
          {canViewRoles ? (
            <section aria-labelledby="admin-role-catalog-title">
              <h3 id="admin-role-catalog-title">{t('admin.access.rolesTitle')}</h3>
              {roles.length ? (
                <div className="admin-role-catalog">
                  {roles.map((role) => (
                    <article key={role.id}>
                      <h4>{formatAdminRoleName(t, role.name)}</h4>
                      <p>{role.description}</p>
                      <PermissionGroups
                        codes={role.permissions.map((permission) => permission.code)}
                        emptyLabel={t('admin.access.empty')}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <PageState kind="empty" title={t('admin.access.empty')} />
              )}
            </section>
          ) : null}
          {canViewPermissions ? (
            <section aria-labelledby="admin-permission-catalog-title">
              <h3 id="admin-permission-catalog-title">{t('admin.access.permissionsTitle')}</h3>
              <PermissionGroups
                codes={catalog.map((permission) => permission.code)}
                emptyLabel={t('admin.access.empty')}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function AdminPanel({
  accessToken,
  onNavigateSection,
  permissions = ['users:view'],
  section,
}: {
  accessToken: string;
  onNavigateSection?: (section: AdminSection) => void;
  permissions?: readonly string[];
  section?: AdminSection | null;
}) {
  const { t } = useI18n();
  const visibleSections = visibleAdminSections(permissions);
  const activeSection = section ?? visibleSections[0] ?? null;
  const requestedSectionDenied = Boolean(section && !canAccessAdminSection(section, permissions));

  return (
    <DirectoryPage
      className="admin-workspace"
      description={t('admin.header.description')}
      eyebrow={t('admin.header.eyebrow')}
      title={t('admin.header.title')}
      toolbar={
        visibleSections.length ? (
          <nav aria-label={t('admin.navigation.label')} className="admin-section-nav">
            <ul>
              {visibleSections.map((item) => (
                <li key={item}>
                  <a
                    aria-current={
                      !requestedSectionDenied && activeSection === item ? 'page' : undefined
                    }
                    href={adminSectionPath(item)}
                    onClick={(event) => {
                      if (!onNavigateSection) return;
                      event.preventDefault();
                      onNavigateSection(item);
                    }}
                  >
                    {t(sectionLabels[item])}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : undefined
      }
    >
      {requestedSectionDenied || !activeSection ? (
        <InlineMessage announce title={t('admin.denied.title')} tone="danger">
          {t('admin.denied.message')}
        </InlineMessage>
      ) : activeSection === 'billing' ? (
        <BillingSettingsPanel
          accessToken={accessToken}
          canManage={permissions.includes('billing_settings:manage')}
        />
      ) : activeSection === 'users' ? (
        <UserAdministrationPanel accessToken={accessToken} permissions={permissions} />
      ) : (
        <AccessAdministrationPanel accessToken={accessToken} permissions={permissions} />
      )}
    </DirectoryPage>
  );
}

function useTrackedFormWrite() {
  const [pending, setPending] = useState(false);
  const [saves, setSaves] = useState(0);
  const [failures, setFailures] = useState(0);
  async function track(write: () => Promise<void>): Promise<boolean> {
    setPending(true);
    try {
      await write();
      setSaves((count) => count + 1);
      return true;
    } catch {
      setFailures((count) => count + 1);
      return false;
    } finally {
      setPending(false);
    }
  }
  return { failures, pending, saves, track };
}

function formValue(formData: FormData, name: string, fallback = ''): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : fallback;
}
