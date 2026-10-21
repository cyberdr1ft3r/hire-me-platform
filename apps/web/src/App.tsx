import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';

import { fetchHealthStatus, fetchMe, login, logout, restoreSession } from './api.js';
import { subscribeAuthSession } from './auth/authenticated-request.js';
import { pathToRoute, type InternalRoute } from './navigation/internal-navigation.js';
import {
  acceptHistoryTraversal,
  initializeHistoryIndex,
  replaceHistoryPath,
  requestNavigation,
} from './navigation/navigation-guard.js';
import { I18nProvider, useI18n } from './i18n/index.js';
import { useMessagingUnreadSummary } from './messages/index.js';
import { RouteModuleBoundary } from './navigation/RouteModuleBoundary.js';
import { ConsoleProvider } from './console/ConsoleProvider.js';
import { AuthenticatedWorkspace } from './console/AuthenticatedWorkspace.js';
import {
  LazyPublicOpportunitiesPanel,
  LazyPublicOpportunityDetailPanel,
} from './navigation/route-lazy-modules.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

interface AppLocation {
  route: InternalRoute;
  search: string;
}

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
  const userIdRef = useRef<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [location, setLocation] = useState<AppLocation>(() => ({
    route: pathToRoute(window.location.pathname),
    search: window.location.search,
  }));
  const route = location.route;
  const unreadMessages = useMessagingUnreadSummary({
    accessToken,
    enabled: user?.permissions.includes('messages:view') ?? false,
    principal: user ? `${user.id} ${user.permissions.join(' ')}` : '',
  });

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
    initializeHistoryIndex();
    const handlePopState = (event: PopStateEvent) => {
      // A dirty drawer may hold Back/Forward for confirmation (navigation-guard.ts).
      if (!acceptHistoryTraversal(event.state)) return;
      setLocation({
        route: pathToRoute(window.location.pathname),
        search: window.location.search,
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let isMounted = true;

    // A missing or failed restore leaves the signed-out state alone, so it can
    // never clear a session the user started by signing in meanwhile.
    void restoreSession().then((auth) => {
      if (isMounted && auth) {
        setSessionEpoch((epoch) => epoch + 1);
        setAccessToken(auth.accessToken);
        userIdRef.current = auth.user.id;
        setUser(auth.user);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // `accessToken` stays the token the session started with: the request core
  // sends the latest rotated token, so a background refresh does not re-run
  // every effect keyed on it. A refresh may still change the user's
  // permissions, and a terminal refresh failure signs out exactly once.
  useEffect(
    () =>
      subscribeAuthSession((event) => {
        if (event.type === 'ended') {
          setSessionEpoch((epoch) => epoch + 1);
          setAccessToken(null);
          userIdRef.current = null;
          setUser(null);
          return;
        }
        if (userIdRef.current && userIdRef.current !== event.user.id) {
          setSessionEpoch((epoch) => epoch + 1);
        }
        userIdRef.current = event.user.id;
        setUser((current) => (sameUser(current, event.user) ? current : event.user));
      }),
    [],
  );

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
      setSessionEpoch((epoch) => epoch + 1);
      setAccessToken(auth.accessToken);
      userIdRef.current = auth.user.id;
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
      const { user: nextUser } = await fetchMe(accessToken);
      if (userIdRef.current && userIdRef.current !== nextUser.id) {
        setSessionEpoch((epoch) => epoch + 1);
      }
      userIdRef.current = nextUser.id;
      setUser((current) => (sameUser(current, nextUser) ? current : nextUser));
    } catch {
      // A terminal refresh failure already signed out through the session
      // subscription; any other failure keeps the current session.
    }
  }

  function handleLogout(): void {
    requestNavigation(() => {
      void finishLogout();
    });
  }

  async function finishLogout(): Promise<void> {
    if (accessToken) {
      await logout(accessToken);
    }
    setAccessToken(null);
    userIdRef.current = null;
    setUser(null);
    // Signing out ends the session; the active unsaved guard has already asked.
    replaceHistoryPath('/');
    setLocation({ route: 'home', search: '' });
  }

  // The public opportunity pages are bilingual and share the locale provider and
  // the saved preference, so they carry no English boundary. They stay outside
  // the internal shell and are matched on the same URLs as always.
  const publicOpportunityMatch = window.location.pathname.match(/^\/opportunities\/([^/]+)$/);
  if (window.location.pathname === '/opportunities') {
    return (
      <RouteModuleBoundary>
        <LazyPublicOpportunitiesPanel />
      </RouteModuleBoundary>
    );
  }
  if (publicOpportunityMatch?.[1]) {
    // Keyed by slug, so a different opportunity never inherits another's form.
    return (
      <RouteModuleBoundary>
        <LazyPublicOpportunityDetailPanel
          key={publicOpportunityMatch[1]}
          publicSlug={publicOpportunityMatch[1]}
        />
      </RouteModuleBoundary>
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

  return (
    <ConsoleProvider
      key={`${user.id}:${sessionEpoch}`}
      initialRoute={route}
      permissions={user.permissions}
    >
      <AuthenticatedWorkspace
        apiState={apiState}
        accessToken={accessToken}
        location={location}
        onLogout={handleLogout}
        onRefreshUser={handleRefreshUser}
        setLocation={setLocation}
        unreadCount={unreadMessages.count ?? 0}
        refreshUnread={unreadMessages.refresh}
        user={user}
      />
    </ConsoleProvider>
  );
}

function sameUser(current: AuthenticatedUser | null, next: AuthenticatedUser): boolean {
  return current !== null && JSON.stringify(current) === JSON.stringify(next);
}
