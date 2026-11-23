import type { AdminUserDetail, AdminUserListResponse, AdminUserStatus } from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { getAdminUser, listAdminUsers } from '../api.js';
import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { Button, FilterToolbar, InlineMessage, PageState, Select, TextField } from '../ui/index.js';
import { formatAdminRoleName } from './role-labels.js';
import { UserAccountDrawer } from './UserAccountDrawer.js';
import { UserDetails, UserStatusBadge, userStatusLabels } from './UserDetails.js';
import './admin-users.css';

const pageSize = 20;
const maxPage = 500;
const firstPage = { page: 1, search: '', status: '' };

type Selection = { id: string; user?: AdminUserDetail; failed?: boolean };

export function UserAdministrationPanel({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: readonly string[];
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState(firstPage);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [account, setAccount] = useState<'create' | AdminUserDetail | null>(null);
  const [notice, setNotice] = useState<PlainMessageKey | null>(null);
  const detailRequest = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const listOpener = useRef<HTMLButtonElement | null>(null);
  const selectedId = selection?.id;
  const canCreate = permissions.includes('users:create');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setListFailed(false);
    void listAdminUsers({ accessToken, pageSize, ...query })
      .then((response) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(response.pagination.total / pageSize));
        if (query.page > lastPage) setQuery({ ...query, page: lastPage });
        else setResult(response);
      })
      .catch(() => {
        if (active) setListFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, query, refresh]);

  useEffect(() => {
    if (selectedId) detailHeading.current?.focus();
  }, [selectedId]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({ page: 1, search: search.trim(), status });
  }

  function clearSearch() {
    setSearch('');
    setStatus('');
    setQuery({ ...firstPage });
  }

  function loadDetails(id: string) {
    const request = ++detailRequest.current;
    setSelection({ id });
    setNotice(null);
    void getAdminUser(accessToken, id).then(
      ({ user }) => {
        if (request === detailRequest.current) setSelection({ id, user });
      },
      () => {
        if (request === detailRequest.current) setSelection({ id, failed: true });
      },
    );
  }

  function backToList() {
    detailRequest.current++;
    setSelection(null);
    setNotice(null);
    requestAnimationFrame(() => {
      if (listOpener.current?.isConnected) listOpener.current.focus();
      else listHeading.current?.focus();
    });
  }

  function userSaved(user: AdminUserDetail, message: PlainMessageKey) {
    detailRequest.current++;
    setSelection({ id: user.id, user });
    setNotice(message);
    setRefresh((value) => value + 1);
  }

  const total = result?.pagination.total ?? 0;
  const pages = Math.min(maxPage, Math.ceil(total / pageSize));
  const filtered = Boolean(query.search || query.status);

  return (
    <section aria-labelledby="admin-users-title" className="admin-section admin-users">
      <header className="admin-users__heading">
        <div className="admin-section__heading">
          <h2 id="admin-users-title" ref={listHeading} tabIndex={-1}>
            {t('admin.sections.users.title')}
          </h2>
          <p>{t('admin.sections.users.description')}</p>
        </div>
        {canCreate ? (
          <Button
            onClick={(event) => {
              listOpener.current = event.currentTarget;
              setNotice(null);
              setAccount('create');
            }}
            type="button"
          >
            {t('admin.users.create.open')}
          </Button>
        ) : null}
      </header>
      {notice ? (
        <InlineMessage announce title={t(notice)} tone="success">
          {null}
        </InlineMessage>
      ) : null}
      <div className="admin-users__layout" data-detail={selection ? 'true' : undefined}>
        <section aria-label={t('admin.users.listRegion')} className="admin-users__list">
          <form aria-label={t('admin.users.filters.region')} role="search" onSubmit={submitSearch}>
            <FilterToolbar
              search={
                <TextField
                  label={t('admin.users.filters.search')}
                  maxLength={120}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder={t('admin.users.filters.placeholder')}
                  type="search"
                  value={search}
                />
              }
              filters={
                <Select
                  label={t('admin.users.filters.status')}
                  onChange={(event) => setStatus(event.currentTarget.value)}
                  value={status}
                >
                  <option value="">{t('admin.users.filters.anyStatus')}</option>
                  {(Object.keys(userStatusLabels) as AdminUserStatus[]).map((value) => (
                    <option key={value} value={value}>
                      {t(userStatusLabels[value])}
                    </option>
                  ))}
                </Select>
              }
              actions={
                <Button type="submit" variant="secondary">
                  {t('admin.users.filters.submit')}
                </Button>
              }
            />
          </form>
          <div aria-busy={loading} className="admin-users__results">
            {loading && !result ? (
              <PageState kind="loading" title={t('admin.users.loading')} />
            ) : null}
            {listFailed ? (
              <PageState
                action={
                  <Button onClick={() => setRefresh((value) => value + 1)} variant="secondary">
                    {t('common.actions.retry')}
                  </Button>
                }
                kind="error"
                title={t('admin.users.errorTitle')}
              >
                <p>{t('admin.users.errorMessage')}</p>
              </PageState>
            ) : null}
            {result && !listFailed && !result.users.length && !loading ? (
              <PageState
                action={
                  filtered ? (
                    <Button onClick={clearSearch} variant="secondary">
                      {t('admin.users.filters.clear')}
                    </Button>
                  ) : undefined
                }
                kind="empty"
                title={t('admin.users.emptyTitle')}
              >
                {t(filtered ? 'admin.users.emptyMessage' : 'admin.users.emptyDirectory')}
              </PageState>
            ) : null}
            {result?.users.length ? (
              <>
                <div className="admin-users__result-bar">
                  <p role="status">{t('admin.users.results', { count: total })}</p>
                  {filtered ? (
                    <Button onClick={clearSearch} size="compact" variant="quiet">
                      {t('admin.users.filters.clear')}
                    </Button>
                  ) : null}
                </div>
                <ul className="admin-users__rows">
                  {result.users.map((user) => (
                    <li data-selected={selectedId === user.id || undefined} key={user.id}>
                      <div className="admin-users__identity">
                        <Button
                          aria-current={selectedId === user.id ? 'true' : undefined}
                          onClick={(event) => {
                            listOpener.current = event.currentTarget;
                            loadDetails(user.id);
                          }}
                          variant="quiet"
                        >
                          {user.displayName}
                        </Button>
                        <span>{user.email}</span>
                      </div>
                      <div className="admin-users__row-access">
                        <UserStatusBadge status={user.status} />
                        <span>
                          {user.roles.map((role) => formatAdminRoleName(t, role)).join(', ') ||
                            t('admin.users.roles.empty')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {pages > 1 ? (
                  <nav
                    aria-label={t('admin.users.pagination.label')}
                    className="admin-users__pagination"
                  >
                    <Button
                      disabled={loading || query.page <= 1}
                      onClick={() => setQuery({ ...query, page: query.page - 1 })}
                      variant="secondary"
                    >
                      {t('admin.users.pagination.previous')}
                    </Button>
                    <span>
                      {t('admin.users.pagination.page', { page: result.pagination.page, pages })}
                    </span>
                    <Button
                      disabled={loading || query.page >= pages}
                      onClick={() => setQuery({ ...query, page: query.page + 1 })}
                      variant="secondary"
                    >
                      {t('admin.users.pagination.next')}
                    </Button>
                  </nav>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
        {selection ? (
          <section aria-label={t('admin.users.detailRegion')} className="admin-users__detail">
            <Button onClick={backToList} variant="quiet">
              {t('admin.users.back')}
            </Button>
            <div className="admin-users__heading">
              <div className="admin-section__heading">
                <h3 ref={detailHeading} tabIndex={-1}>
                  {selection.user?.displayName ?? t('admin.users.detailTitle')}
                </h3>
                {selection.user ? <p>{selection.user.email}</p> : null}
              </div>
              {selection.user && permissions.includes('users:update') ? (
                <Button
                  onClick={() => {
                    setNotice(null);
                    setAccount(selection.user ?? null);
                  }}
                  variant="secondary"
                >
                  {t('admin.users.actions.update')}
                </Button>
              ) : null}
            </div>
            {selection.failed ? (
              <PageState
                action={
                  <Button onClick={() => loadDetails(selection.id)} variant="secondary">
                    {t('common.actions.retry')}
                  </Button>
                }
                kind="error"
                title={t('admin.users.detailError')}
              />
            ) : selection.user ? (
              <UserDetails
                accessToken={accessToken}
                key={selection.user.id}
                onSaved={userSaved}
                permissions={permissions}
                user={selection.user}
              />
            ) : (
              <PageState kind="loading" title={t('admin.users.detailLoading')} />
            )}
          </section>
        ) : null}
      </div>
      {account ? (
        <UserAccountDrawer
          accessToken={accessToken}
          onClose={() => setAccount(null)}
          onSaved={(user, feedback) => {
            setAccount(null);
            userSaved(user, feedback);
          }}
          user={account === 'create' ? undefined : account}
        />
      ) : null}
    </section>
  );
}
