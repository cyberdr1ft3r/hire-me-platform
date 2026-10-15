import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';

import { fetchHealthStatus, fetchMe, login, logout, restoreSession } from './api.js';
import { subscribeAuthSession } from './auth/authenticated-request.js';
import {
  canAccessInternalRoute,
  isDeferredEnglishRoute,
  pathToRoute,
  routeToPath,
  type InternalRoute,
} from './navigation/internal-navigation.js';
import {
  acceptHistoryTraversal,
  initializeHistoryIndex,
  pushHistoryPath,
  replaceHistoryPath,
  requestNavigation,
} from './navigation/navigation-guard.js';
import {
  candidateDeepLink,
  clientDeepLink,
  missionDeepLink,
  recordNavigationIntent,
} from './navigation/record-deep-links.js';
import { AppShell } from './ui/shell/AppShell.js';
import { I18nProvider, LegacyEnglishContent, useI18n } from './i18n/index.js';
import { InternalHome } from './ui/shell/InternalHome.js';
import { formatUnreadBadge, useMessagingUnreadSummary } from './messages/index.js';
import { RouteModuleBoundary } from './navigation/RouteModuleBoundary.js';
import {
  LazyAccountingPanel,
  LazyAdminPanel,
  LazyAgendaPanel,
  LazyCandidatesPanel,
  LazyClientsPanel,
  LazyCommercialPanel,
  LazyDocumentsPanel,
  LazyMeetingsPanel,
  LazyMessagesPanel,
  LazyMissionsPanel,
  LazyPublicOpportunitiesPanel,
  LazyPublicOpportunityDetailPanel,
  LazyReportingPanel,
  LazyTasksPanel,
  LazyTrainingPanel,
} from './navigation/route-lazy-modules.js';

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
        setAccessToken(auth.accessToken);
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
          setAccessToken(null);
          setUser(null);
          return;
        }
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
      const { user: nextUser } = await fetchMe(accessToken);
      setUser((current) => (sameUser(current, nextUser) ? current : nextUser));
    } catch {
      // A terminal refresh failure already signed out through the session
      // subscription; any other failure keeps the current session.
    }
  }

  async function handleLogout(): Promise<void> {
    if (accessToken) {
      await logout(accessToken);
    }
    setAccessToken(null);
    setUser(null);
    // Signing out ends the session; nothing on screen is kept, so nothing asks.
    goToRoute('home');
  }

  function goToRoute(nextRoute: InternalRoute): void {
    const path = routeToPath(nextRoute);
    pushHistoryPath(path);
    setLocation({ route: nextRoute, search: '' });
  }

  // In-app navigation asks first when the screen holds unsaved input (navigation-guard.ts).
  function navigate(nextRoute: InternalRoute): void {
    requestNavigation(() => goToRoute(nextRoute));
  }

  function navigateToPath(path: string): void {
    requestNavigation(() => {
      pushHistoryPath(path);
      setLocation({
        route: pathToRoute(new URL(path, window.location.origin).pathname),
        search: new URL(path, window.location.origin).search,
      });
    });
  }

  function replaceRecordIntent(path: string): void {
    replaceHistoryPath(path);
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
        routeContent = <LazyAdminPanel accessToken={accessToken} />;
        break;
      case 'clients':
        routeContent = (
          <LazyClientsPanel
            accessToken={accessToken}
            onCloseRecord={() => navigateToPath('/clients')}
            onNavigatePath={navigateToPath}
            onOpenRecord={(clientId) => navigateToPath(clientDeepLink(clientId))}
            permissions={user.permissions}
            recordClientId={recordIntent.clientId}
          />
        );
        break;
      case 'candidates':
        routeContent = (
          <LazyCandidatesPanel
            accessToken={accessToken}
            // Opening a record is a history entry, so Back returns to the directory.
            onCloseRecord={() => navigateToPath('/candidates')}
            onNavigatePath={navigateToPath}
            onOpenRecord={(candidateId) => navigateToPath(candidateDeepLink(candidateId))}
            permissions={user.permissions}
            recordCandidateId={recordIntent.candidateId}
          />
        );
        break;
      case 'missions':
        routeContent = (
          <LazyMissionsPanel
            accessToken={accessToken}
            actorUserId={user.id}
            initialInterviewId={recordIntent.interviewId}
            initialProcessId={recordIntent.processId}
            // Opening a record is a history entry, so Back returns to the directory.
            onCloseRecord={() => navigateToPath('/missions')}
            onOpenRecord={(missionId) => navigateToPath(missionDeepLink(missionId))}
            permissions={user.permissions}
            recordMissionId={recordIntent.missionId}
          />
        );
        break;
      case 'meetings':
        routeContent = (
          <LazyMeetingsPanel accessToken={accessToken} initialMeetingId={recordIntent.meetingId} />
        );
        break;
      case 'agenda':
        routeContent = <LazyAgendaPanel accessToken={accessToken} onNavigate={navigateToPath} />;
        break;
      case 'tasks':
        routeContent = (
          <LazyTasksPanel
            accessToken={accessToken}
            initialTaskId={recordIntent.taskId}
            user={user}
          />
        );
        break;
      case 'documents':
        routeContent = (
          <LazyDocumentsPanel accessToken={accessToken} permissions={user.permissions} />
        );
        break;
      case 'messages':
        routeContent = (
          <LazyMessagesPanel
            accessToken={accessToken}
            actorUserId={user.id}
            initialConversationId={recordIntent.conversationId}
            onUnreadChanged={unreadMessages.refresh}
            permissions={user.permissions}
          />
        );
        break;
      case 'training':
        routeContent = (
          <LazyTrainingPanel
            accessToken={accessToken}
            actorUserId={user.id}
            initialProgramId={recordIntent.programId}
            initialSessionId={recordIntent.sessionId}
            onSelectionChange={(programId, sessionId) => {
              const parameters = new URLSearchParams({ program: programId });
              if (sessionId) {
                parameters.set('session', sessionId);
              }
              replaceRecordIntent(`/training?${parameters.toString()}`);
            }}
            permissions={user.permissions}
          />
        );
        break;
      case 'reporting':
        routeContent = (
          <LazyReportingPanel
            accessToken={accessToken}
            onNavigate={navigateToPath}
            permissions={user.permissions}
          />
        );
        break;
      case 'commercial':
        routeContent = (
          <LazyCommercialPanel
            accessToken={accessToken}
            actorUserId={user.id}
            permissions={user.permissions}
          />
        );
        break;
      case 'accounting':
        routeContent = (
          <LazyAccountingPanel
            accessToken={accessToken}
            actorUserId={user.id}
            permissions={user.permissions}
          />
        );
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
      notificationCenter={{
        accessToken,
        messageUnreadCount: unreadMessages.count,
        onMessageUnreadChanged: unreadMessages.refresh,
        onNavigatePath: navigateToPath,
      }}
      navigationBadges={
        unreadMessages.count
          ? {
              messages: {
                display: formatUnreadBadge(unreadMessages.count),
                label: t('messages.unreadBadge', { count: unreadMessages.count }),
              },
            }
          : undefined
      }
      onLogout={handleLogout}
      onNavigate={navigate}
      onRefreshUser={handleRefreshUser}
      user={user}
    >
      <RouteModuleBoundary route={canOpenRoute ? route : undefined}>
        {routeContent}
      </RouteModuleBoundary>
    </AppShell>
  );
}

function sameUser(current: AuthenticatedUser | null, next: AuthenticatedUser): boolean {
  return current !== null && JSON.stringify(current) === JSON.stringify(next);
}
