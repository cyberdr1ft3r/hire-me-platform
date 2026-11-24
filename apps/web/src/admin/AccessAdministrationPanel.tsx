import type { AdminPermission, AdminRole } from '@hire-me/contracts';
import { useEffect, useState } from 'react';

import { listAdminPermissions, listAdminRoles } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { Button, FilterToolbar, PageState, Select, TextField } from '../ui/index.js';
import {
  PermissionGroups,
  permissionArea,
  permissionAreas,
  type PermissionArea,
} from './AccessPermissionGroups.js';
import { formatAdminRoleName } from './role-labels.js';

const searchText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

export function AccessAdministrationPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: readonly string[];
}) {
  const { t } = useI18n();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [catalog, setCatalog] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [area, setArea] = useState<PermissionArea | ''>('');
  const canViewRoles = permissions.includes('roles:view');
  const canViewPermissions = permissions.includes('permissions:view');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void Promise.all([
      canViewRoles ? listAdminRoles(accessToken) : null,
      canViewPermissions ? listAdminPermissions(accessToken) : null,
    ])
      .then(([roleResult, permissionResult]) => {
        if (!active) return;
        setRoles(roleResult?.roles ?? []);
        setCatalog(permissionResult?.permissions ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, attempt, canViewPermissions, canViewRoles]);

  const query = searchText(search);
  const inArea = ({ code }: AdminPermission) => !area || permissionArea(code) === area;
  const matches = (...values: string[]) =>
    values.some((value) => searchText(value).includes(query));
  const permissionMatches = ({ code, description }: AdminPermission) =>
    matches(code, description, t(`admin.access.areas.${permissionArea(code)}`));
  const visibleRoles = roles.filter((role) => {
    const inScope = role.permissions.filter(inArea);
    return (
      (!area || inScope.length > 0) &&
      (matches(formatAdminRoleName(t, role.name), t(`admin.roleDescriptions.${role.name}`)) ||
        inScope.some(permissionMatches))
    );
  });
  const visibleCatalog = catalog.filter(
    (permission) => inArea(permission) && permissionMatches(permission),
  );
  const filtered = Boolean(query || area);
  const empty = t(filtered ? 'admin.access.noMatches' : 'admin.access.empty');
  const resultCounts = [
    canViewRoles ? t('admin.access.roleCount', { count: visibleRoles.length }) : '',
    canViewPermissions ? t('admin.access.permissionCount', { count: visibleCatalog.length }) : '',
  ].filter(Boolean);

  return (
    <section aria-labelledby="admin-access-title" className="admin-section">
      <div className="admin-section__heading">
        <h2 id="admin-access-title">{t('admin.sections.access.title')}</h2>
        <p>{t('admin.sections.access.description')}</p>
      </div>
      {loading ? <PageState kind="loading" title={t('admin.access.loading')} /> : null}
      {error ? (
        <PageState
          kind="error"
          title={t('admin.access.errorTitle')}
          action={
            <Button variant="secondary" onClick={() => setAttempt((previous) => previous + 1)}>
              {t('admin.access.retry')}
            </Button>
          }
        >
          <p>{t('admin.access.errorMessage')}</p>
        </PageState>
      ) : null}
      {!loading && !error ? (
        <>
          <FilterToolbar
            aria-label={t('admin.access.filters')}
            status={<span role="status">{resultCounts.join(' · ')}</span>}
            search={
              <TextField
                label={t('admin.access.search')}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            }
            filters={
              <Select
                label={t('admin.access.area')}
                value={area}
                onChange={(event) => setArea(event.target.value as PermissionArea | '')}
              >
                <option value="">{t('admin.access.allAreas')}</option>
                {permissionAreas.map((key) => (
                  <option key={key} value={key}>
                    {t(`admin.access.areas.${key}`)}
                  </option>
                ))}
              </Select>
            }
            actions={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setArea('');
                  }}
                >
                  {t('admin.access.clear')}
                </Button>
              ) : undefined
            }
          />
          <div className="admin-access-grid">
            {canViewRoles ? (
              <section aria-labelledby="admin-role-catalog-title">
                <h3 id="admin-role-catalog-title">{t('admin.access.rolesTitle')}</h3>
                {visibleRoles.length ? (
                  <div className="admin-role-catalog">
                    {visibleRoles.map((role) => {
                      const entries = role.permissions.filter(inArea);
                      return (
                        <article key={role.id} className="admin-role-summary">
                          <h4>{formatAdminRoleName(t, role.name)}</h4>
                          <p>{t(`admin.roleDescriptions.${role.name}`)}</p>
                          {role.status === 'ARCHIVED' ? (
                            <p>{t('admin.users.status.ARCHIVED')}</p>
                          ) : null}
                          <details className="admin-access-disclosure">
                            <summary>
                              {t('admin.access.roleGrants', { count: entries.length })}
                            </summary>
                            <PermissionGroups entries={entries} emptyLabel={empty} />
                          </details>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <PageState kind="empty" title={empty} />
                )}
              </section>
            ) : null}
            {canViewPermissions ? (
              <section aria-labelledby="admin-permission-catalog-title">
                <h3 id="admin-permission-catalog-title">{t('admin.access.permissionsTitle')}</h3>
                {visibleCatalog.length ? (
                  <PermissionGroups entries={visibleCatalog} emptyLabel={empty} />
                ) : (
                  <PageState kind="empty" title={empty} />
                )}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
