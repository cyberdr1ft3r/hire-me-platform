import type {
  AdminRefreshSessionSummary,
  AdminRole,
  AdminRoleName,
  AdminUserDetail,
  AdminUserStatus,
} from '@hire-me/contracts';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import {
  AdminRequestError,
  assignAdminRole,
  listAdminRoles,
  removeAdminRole,
  revokeAdminSession,
  revokeAllAdminSessions,
  updateAdminUserStatus,
} from '../api.js';
import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { Button, Drawer, InlineMessage, PageState, Select, StatusBadge } from '../ui/index.js';
import { PermissionGroups } from './AccessPermissionGroups.js';
import { adminStatusTone, formatAdminRoleName } from './role-labels.js';

export const userStatusLabels = {
  ACTIVE: 'admin.users.status.ACTIVE',
  SUSPENDED: 'admin.users.status.SUSPENDED',
  ARCHIVED: 'admin.users.status.ARCHIVED',
} as const satisfies Record<AdminUserStatus, PlainMessageKey>;

export function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  const { t } = useI18n();
  return <StatusBadge tone={adminStatusTone(status)}>{t(userStatusLabels[status])}</StatusBadge>;
}

type UserAction =
  | { kind: 'status'; status: AdminUserStatus }
  | { kind: 'assign' }
  | { kind: 'remove'; role: AdminRoleName }
  | { kind: 'revoke'; session: AdminRefreshSessionSummary; position: number }
  | { kind: 'revokeAll' };

const statusActions: Record<AdminUserStatus, PlainMessageKey> = {
  ACTIVE: 'admin.users.actions.reactivate',
  SUSPENDED: 'admin.users.actions.suspend',
  ARCHIVED: 'admin.users.actions.archive',
};

const actionLabels = {
  assign: 'admin.users.actions.assignRole',
  remove: 'admin.users.actions.removeRole',
  revoke: 'admin.users.sessions.revoke',
  revokeAll: 'admin.users.sessions.revokeAll',
} as const;

export function UserDetails({
  accessToken,
  onSaved,
  permissions,
  user,
}: {
  accessToken: string;
  onSaved: (user: AdminUserDetail, feedback: PlainMessageKey) => void;
  permissions: readonly string[];
  user: AdminUserDetail;
}) {
  const { t, formatDateTime } = useI18n();
  const [action, setAction] = useState<UserAction | null>(null);
  const accountHeading = useRef<HTMLHeadingElement>(null);
  const canManageStatus = permissions.includes('users:status:manage');
  const canManageRoles = permissions.includes('users:roles:manage');
  const canAssign = canManageRoles && permissions.includes('roles:view');
  const canRevoke = permissions.includes('users:sessions:revoke');
  const targetStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  const localeName =
    user.locale === 'en' || user.locale === 'fr'
      ? t(user.locale === 'en' ? 'admin.users.languages.en' : 'admin.users.languages.fr')
      : user.locale;

  return (
    <>
      <section className="admin-users__detail-section">
        <h4 ref={accountHeading} tabIndex={-1}>
          {t('admin.users.profile.title')}
        </h4>
        <dl className="admin-users__metadata">
          <div>
            <dt>{t('admin.users.filters.status')}</dt>
            <dd>
              <UserStatusBadge status={user.status} />
            </dd>
          </div>
          <div>
            <dt>{t('admin.users.fields.locale')}</dt>
            <dd>{localeName}</dd>
          </div>
          <div>
            <dt>{t('admin.users.profile.lastLogin')}</dt>
            <dd>
              {user.lastLoginAt ? (
                <time dateTime={user.lastLoginAt}>{formatDateTime(user.lastLoginAt)}</time>
              ) : (
                t('admin.users.profile.never')
              )}
            </dd>
          </div>
        </dl>
        {canManageStatus && user.status !== 'ARCHIVED' ? (
          <div
            className="admin-users__actions"
            role="group"
            aria-label={t('admin.users.actions.statusRegion')}
          >
            <Button
              onClick={() => setAction({ kind: 'status', status: targetStatus })}
              variant="secondary"
            >
              {t(statusActions[targetStatus])}
            </Button>
            <Button
              onClick={() => setAction({ kind: 'status', status: 'ARCHIVED' })}
              variant="quiet"
            >
              {t(statusActions.ARCHIVED)}
            </Button>
          </div>
        ) : null}
      </section>
      <section className="admin-users__detail-section">
        <div className="admin-users__heading">
          <h4>{t('admin.users.roles.title')}</h4>
          {canAssign ? (
            <Button onClick={() => setAction({ kind: 'assign' })} variant="secondary">
              {t(actionLabels.assign)}
            </Button>
          ) : null}
        </div>
        {user.roles.length ? (
          <ul className="admin-role-list">
            {user.roles.map((role) => (
              <li key={role}>
                <div>
                  <span>{formatAdminRoleName(t, role)}</span>
                  <small>{t(`admin.roleDescriptions.${role}`)}</small>
                </div>
                {canManageRoles ? (
                  <Button
                    aria-label={t('admin.users.roles.removeLabel', {
                      role: formatAdminRoleName(t, role),
                    })}
                    onClick={() => setAction({ kind: 'remove', role })}
                    variant="quiet"
                  >
                    {t(actionLabels.remove)}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('admin.users.roles.empty')}</p>
        )}
        <details className="admin-access-disclosure admin-users__effective">
          <summary>{t('admin.users.effectivePermissions')}</summary>
          <p>{t('admin.users.effectivePermissionsHint')}</p>
          <PermissionGroups
            entries={user.effectivePermissions.map((code) => ({ code }))}
            emptyLabel={t('admin.users.none')}
          />
        </details>
      </section>
      <section className="admin-users__detail-section">
        <div className="admin-users__heading">
          <h4>{t('admin.users.sessions.title')}</h4>
          {canRevoke && user.sessions.length ? (
            <Button onClick={() => setAction({ kind: 'revokeAll' })} variant="secondary">
              {t(actionLabels.revokeAll)}
            </Button>
          ) : null}
        </div>
        {user.sessions.length ? (
          <ul className="admin-session-list">
            {user.sessions.map((session, index) => (
              <li key={session.id}>
                <div>
                  <time dateTime={session.createdAt}>
                    {t('admin.users.sessions.started', {
                      position: index + 1,
                      date: formatDateTime(session.createdAt),
                    })}
                  </time>
                  <small>
                    {t('admin.users.sessions.expires', { date: formatDateTime(session.expiresAt) })}
                  </small>
                </div>
                {canRevoke ? (
                  <Button
                    aria-label={t('admin.users.sessions.revokeLabel', {
                      position: index + 1,
                      date: formatDateTime(session.createdAt),
                    })}
                    onClick={() => setAction({ kind: 'revoke', session, position: index + 1 })}
                    variant="quiet"
                  >
                    {t(actionLabels.revoke)}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('admin.users.sessions.empty')}</p>
        )}
      </section>
      {action ? (
        <AccountActionDrawer
          accessToken={accessToken}
          action={action}
          onClose={() => setAction(null)}
          onSaved={(next, message) => {
            setAction(null);
            onSaved(next, message);
            requestAnimationFrame(() => {
              if (document.activeElement === document.body) accountHeading.current?.focus();
            });
          }}
          user={user}
        />
      ) : null}
    </>
  );
}

export function actionFailure(error: unknown): PlainMessageKey {
  if (error instanceof AdminRequestError) {
    switch (error.code) {
      case 'LAST_ACTIVE_SUPER_ADMIN_PROTECTED':
        return 'admin.users.feedback.lastAdmin';
      case 'UNSAFE_SELF_DEMOTION':
      case 'UNSAFE_SELF_STATUS_CHANGE':
        return 'admin.users.feedback.selfLockout';
      case 'ROLE_PERMISSION_SCOPE_EXCEEDED':
        return 'admin.users.feedback.roleScope';
      case 'ARCHIVED_USER_REACTIVATION_BLOCKED':
        return 'admin.users.feedback.archived';
      case 'REFRESH_SESSION_NOT_FOUND':
        return 'admin.users.feedback.sessionMissing';
    }
    if (error.status === 403) return 'admin.users.feedback.denied';
  }
  return 'admin.users.feedback.failed';
}

function AccountActionDrawer({
  accessToken,
  action,
  onClose,
  onSaved,
  user,
}: {
  accessToken: string;
  action: UserAction;
  onClose: () => void;
  onSaved: (user: AdminUserDetail, feedback: PlainMessageKey) => void;
  user: AdminUserDetail;
}) {
  const { t, formatDateTime } = useI18n();
  const formId = useId();
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [role, setRole] = useState('');
  const [roleLoadFailed, setRoleLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PlainMessageKey | null>(null);
  const writing = useRef(false);
  const name = user.displayName;
  const title = t(
    action.kind === 'status' ? statusActions[action.status] : actionLabels[action.kind],
  );
  const description = (() => {
    switch (action.kind) {
      case 'status':
        if (action.status === 'ACTIVE') return t('admin.users.confirm.reactivate', { name });
        if (action.status === 'SUSPENDED') return t('admin.users.confirm.suspend', { name });
        return t('admin.users.confirm.archive', { name });
      case 'assign':
        return t('admin.users.confirm.assign', { name });
      case 'remove':
        return t('admin.users.confirm.remove', { name, role: formatAdminRoleName(t, action.role) });
      case 'revoke':
        return t('admin.users.confirm.revoke', {
          name,
          position: action.position,
          date: formatDateTime(action.session.createdAt),
        });
      case 'revokeAll':
        return t('admin.users.confirm.revokeAll', { name });
    }
  })();

  useEffect(() => {
    if (action.kind !== 'assign') return;
    let active = true;
    setRoleLoadFailed(false);
    void listAdminRoles(accessToken).then(
      (result) => {
        if (active) setRoles(result.roles);
      },
      () => {
        if (active) setRoleLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [accessToken, action.kind, retry]);

  const availableRoles = roles?.filter((item) => !user.roles.includes(item.name));
  const selectedRole = availableRoles?.find((item) => item.name === role);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writing.current || (action.kind === 'assign' && !selectedRole)) return;
    writing.current = true;
    setPending(true);
    setFailure(null);
    try {
      switch (action.kind) {
        case 'status': {
          const result = await updateAdminUserStatus(accessToken, user.id, {
            status: action.status,
          });
          onSaved(result.user, 'admin.users.feedback.statusChanged');
          break;
        }
        case 'assign': {
          if (!selectedRole) return;
          const result = await assignAdminRole(accessToken, user.id, {
            roleName: selectedRole.name,
          });
          onSaved(result.user, 'admin.users.feedback.roleAssigned');
          break;
        }
        case 'remove': {
          const result = await removeAdminRole(accessToken, user.id, action.role);
          onSaved(result.user, 'admin.users.feedback.roleRemoved');
          break;
        }
        case 'revoke': {
          const { sessions } = await revokeAdminSession(accessToken, user.id, action.session.id);
          onSaved(
            { ...user, sessions, activeSessionCount: sessions.length },
            'admin.users.feedback.sessionRevoked',
          );
          break;
        }
        case 'revokeAll': {
          const { sessions } = await revokeAllAdminSessions(accessToken, user.id);
          onSaved(
            { ...user, sessions, activeSessionCount: sessions.length },
            'admin.users.feedback.sessionsRevoked',
          );
          break;
        }
      }
    } catch (error) {
      setFailure(actionFailure(error));
    } finally {
      writing.current = false;
      setPending(false);
    }
  }

  return (
    <Drawer
      closeDisabled={pending}
      description={description}
      footer={(close) => (
        <>
          <Button disabled={pending} onClick={close} variant="secondary">
            {t('common.actions.cancel')}
          </Button>
          <Button
            disabled={action.kind === 'assign' && !selectedRole}
            form={formId}
            loading={pending}
            loadingLabel={t('common.status.working')}
            type="submit"
            variant={
              action.kind === 'assign' || (action.kind === 'status' && action.status === 'ACTIVE')
                ? 'primary'
                : 'danger'
            }
          >
            {title}
          </Button>
        </>
      )}
      initialFocus="title"
      onClose={onClose}
      title={title}
    >
      <form className="admin-users__form" id={formId} onSubmit={(event) => void submit(event)}>
        <p className="admin-users__target">{user.email}</p>
        {failure ? (
          <InlineMessage announce title={t(failure)} tone="danger">
            {null}
          </InlineMessage>
        ) : null}
        {action.kind === 'assign' ? (
          roleLoadFailed ? (
            <PageState
              action={
                <Button onClick={() => setRetry((value) => value + 1)} variant="secondary">
                  {t('common.actions.retry')}
                </Button>
              }
              kind="error"
              title={t('admin.users.roles.error')}
            />
          ) : !availableRoles ? (
            <PageState kind="loading" title={t('admin.users.roles.loading')} />
          ) : availableRoles.length ? (
            <Select
              disabled={pending}
              label={t('admin.users.fields.role')}
              onChange={(event) => {
                setRole(event.currentTarget.value);
                setFailure(null);
              }}
              required
              value={role}
            >
              <option value="">{t('admin.users.roles.choose')}</option>
              {availableRoles.map((item) => (
                <option key={item.id} value={item.name}>
                  {formatAdminRoleName(t, item.name)}
                </option>
              ))}
            </Select>
          ) : (
            <p>{t('admin.users.roles.noneAvailable')}</p>
          )
        ) : null}
      </form>
    </Drawer>
  );
}
