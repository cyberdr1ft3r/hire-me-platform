import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';

import { useI18n, LegacyEnglishContent, type PlainMessageKey } from '../i18n/index.js';
import {
  canAccessInternalRoute,
  isDeferredEnglishRoute,
  pathToRoute,
  routeToPath,
  type InternalRoute,
} from '../navigation/internal-navigation.js';
import {
  pushHistoryPath,
  replaceHistoryPath,
  requestNavigation,
  hasUnsavedNavigationChanges,
  subscribeNavigationGuardState,
} from '../navigation/navigation-guard.js';
import {
  candidateDeepLink,
  clientDeepLink,
  missionDeepLink,
  recordNavigationIntent,
} from '../navigation/record-deep-links.js';
import { encodeConsoleHistoryState } from './console-state.js';
import { AppShell } from '../ui/shell/AppShell.js';
import { PageShell, PageState } from '../ui/PageSystem.js';
import { InternalHome } from '../ui/shell/InternalHome.js';
import { formatUnreadBadge } from '../messages/index.js';
import { RouteModuleBoundary } from '../navigation/RouteModuleBoundary.js';
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
  LazyReportingPanel,
  LazyTasksPanel,
  LazyTrainingPanel,
} from '../navigation/route-lazy-modules.js';
import { ConsoleTabBar } from './ConsoleTabBar.js';
import {
  consoleReducer,
  consoleUrlIntent,
  HARD_TAB_LIMIT,
  resolveConsoleHistoryTab,
  recordTab,
  workspaceTab,
  type ConsoleTab,
  type TabId,
} from './console-state.js';
import { useConsole } from './ConsoleProvider.js';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

interface AppLocation {
  route: InternalRoute;
  search: string;
}

interface AuthenticatedWorkspaceProps {
  accessToken: string;
  apiState: ApiState;
  location: AppLocation;
  onLogout: () => void | Promise<void>;
  onRefreshUser: () => void | Promise<void>;
  refreshUnread: () => void;
  setLocation: Dispatch<SetStateAction<AppLocation>>;
  unreadCount: number;
  user: AuthenticatedUser;
}

const routeLabels: Record<InternalRoute, PlainMessageKey> = {
  home: 'navigation.destinations.overview',
  admin: 'navigation.destinations.administration',
  agenda: 'navigation.destinations.agenda',
  meetings: 'navigation.destinations.agenda',
  messages: 'navigation.destinations.messages',
  clients: 'navigation.destinations.clients',
  candidates: 'navigation.destinations.candidates',
  missions: 'navigation.destinations.missions',
  tasks: 'navigation.destinations.tasks',
  documents: 'navigation.destinations.documents',
  training: 'navigation.destinations.training',
  reporting: 'navigation.destinations.reporting',
  commercial: 'navigation.destinations.commercial',
  accounting: 'navigation.destinations.accounting',
};

function pathForTab(tab: ConsoleTab): string {
  if (tab.kind === 'workspace') return routeToPath(tab.route);
  if (tab.recordKind === 'client') return clientDeepLink(tab.recordId);
  if (tab.recordKind === 'candidate') return candidateDeepLink(tab.recordId);
  return missionDeepLink(tab.recordId);
}

export function AuthenticatedWorkspace({
  accessToken,
  apiState,
  location,
  onLogout,
  onRefreshUser,
  refreshUnread,
  setLocation,
  unreadCount,
  user,
}: AuthenticatedWorkspaceProps) {
  const { t } = useI18n();
  const { consoleId, dispatch, permissions, state } = useConsole();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [preserveTabFocus, setPreserveTabFocus] = useState(false);
  const route = location.route;

  useEffect(() => {
    const update = () => setHasUnsavedChanges(hasUnsavedNavigationChanges());
    update();
    return subscribeNavigationGuardState(update);
  }, []);

  const tabForPath = useCallback(
    (pathname: string, search: string): ConsoleTab | null => {
      const intent = consoleUrlIntent(pathname, search);
      if (!workspaceTab(intent.route)) return null;
      const record = intent.record && state.tabs.find((tab) => tab.id === intent.record);
      if (record && record.route === intent.route) return record;
      if (intent.record) {
        const kind =
          intent.route === 'clients'
            ? 'client'
            : intent.route === 'candidates'
              ? 'candidate'
              : intent.route === 'missions'
                ? 'mission'
                : null;
        const recordId = intent.record.split(':').at(-1);
        if (kind && recordId) return recordTab(kind, recordId, intent.route);
      }
      return workspaceTab(intent.route);
    },
    [state.tabs],
  );

  const historyExtension = useCallback(
    (tabId: TabId | null): Record<string, unknown> | undefined =>
      tabId ? encodeConsoleHistoryState({}, consoleId, tabId) : undefined,
    [consoleId],
  );

  useEffect(() => {
    if (!workspaceTab(location.route)) return;
    if (!canAccessInternalRoute(location.route, permissions)) return;
    const intendedTab = tabForPath(routeToPath(location.route), location.search);
    if (
      intendedTab?.kind === 'record' &&
      !state.tabs.some((tab) => tab.id === intendedTab.id) &&
      canAccessInternalRoute(intendedTab.route, permissions)
    ) {
      dispatch({
        type: 'openRecord',
        kind: intendedTab.recordKind,
        recordId: intendedTab.recordId,
        from: intendedTab.parent.slice(3) as InternalRoute,
      });
      dispatch({ type: 'activate', id: intendedTab.id });
      return;
    }
    const tabId = resolveConsoleHistoryTab(
      state,
      window.history.state,
      consoleId,
      routeToPath(location.route),
      location.search,
    );
    const target = state.tabs.find((tab) => tab.id === tabId);
    if (!target) {
      const fallback = workspaceTab(location.route);
      if (fallback && canAccessInternalRoute(fallback.route, permissions)) {
        dispatch({ type: 'openWorkspace', route: fallback.route });
        dispatch({ type: 'activate', id: fallback.id });
      }
      return;
    }
    // A revoked URL can still render the established denied state, but a stale
    // history hint never activates a protected module or grants access.
    if (!canAccessInternalRoute(target.route, permissions)) return;
    if (
      target.kind === 'record' &&
      !canAccessInternalRoute(target.parent.slice(3) as InternalRoute, permissions)
    )
      return;
    if (target.id !== state.active) dispatch({ type: 'activate', id: target.id });
  }, [consoleId, dispatch, location, permissions, state, tabForPath]);

  const commitPath = useCallback(
    (path: string, replace = false, replaceLru = false): void => {
      const url = new URL(path, window.location.origin);
      const nextRoute = pathToRoute(url.pathname);
      if (!canAccessInternalRoute(nextRoute, permissions)) return;
      const target = tabForPath(url.pathname, url.search);
      if (
        target &&
        !state.tabs.some((tab) => tab.id === target.id) &&
        state.tabs.length >= HARD_TAB_LIMIT &&
        !replaceLru
      ) {
        setPendingPath(path);
        return;
      }

      requestNavigation(() => {
        if (target) {
          if (replaceLru) dispatch({ type: 'replaceLru', tab: target, dirty: [] });
          else if (target.kind === 'workspace')
            dispatch({ type: 'openWorkspace', route: target.route });
          else
            dispatch({
              type: 'openRecord',
              kind: target.recordKind,
              recordId: target.recordId,
              from: target.parent.slice(3) as InternalRoute,
            });
          dispatch({ type: 'activate', id: target.id });
        }
        const metadata = historyExtension(target?.id ?? null);
        if (replace) replaceHistoryPath(path, metadata);
        else pushHistoryPath(path, metadata);
        setLocation({ route: nextRoute, search: url.search });
        setPendingPath(null);
      });
    },
    [dispatch, historyExtension, permissions, setLocation, state.tabs, tabForPath],
  );

  const navigateToPath = useCallback(
    (path: string): void => {
      setPreserveTabFocus(false);
      commitPath(path);
    },
    [commitPath],
  );
  const navigate = useCallback(
    (nextRoute: InternalRoute): void => {
      setPreserveTabFocus(false);
      commitPath(routeToPath(nextRoute));
    },
    [commitPath],
  );
  const replaceRecordIntent = useCallback(
    (path: string): void => commitPath(path, true),
    [commitPath],
  );

  const closeTab = useCallback(
    (id: TabId): void => {
      const next = consoleReducer(state, { type: 'close', id });
      if (next === state) return;
      if (next.active !== state.active) {
        requestNavigation(() => {
          const fallback =
            next.tabs.find(
              (tab) => tab.id === next.active && canAccessInternalRoute(tab.route, permissions),
            ) ??
            next.tabs.find((tab) => canAccessInternalRoute(tab.route, permissions)) ??
            next.tabs[0];
          if (!fallback) return;
          dispatch({ type: 'close', id });
          dispatch({ type: 'activate', id: fallback.id });
          replaceHistoryPath(pathForTab(fallback), historyExtension(fallback.id));
          setLocation({ route: fallback.route, search: '' });
        });
      } else dispatch({ type: 'close', id });
    },
    [dispatch, historyExtension, permissions, setLocation, state],
  );

  const activateTab = useCallback(
    (tab: ConsoleTab, keepFocus: boolean): void => {
      if (!canAccessInternalRoute(tab.route, permissions)) return;
      if (
        tab.kind === 'record' &&
        !canAccessInternalRoute(tab.parent.slice(3) as InternalRoute, permissions)
      )
        return;
      setPreserveTabFocus(keepFocus);
      commitPath(pathForTab(tab));
    },
    [commitPath, permissions],
  );

  const pendingTab = pendingPath
    ? tabForPath(
        new URL(pendingPath, window.location.origin).pathname,
        new URL(pendingPath, window.location.origin).search,
      )
    : null;
  const replacement = pendingTab
    ? consoleReducer(state, { type: 'replaceLru', tab: pendingTab, dirty: [] })
    : state;
  const canReplacePending = Boolean(
    pendingTab && replacement !== state && replacement.tabs.some((tab) => tab.id === pendingTab.id),
  );
  const visibleTabs = useMemo(
    () =>
      state.tabs.filter(
        (tab) =>
          tab.id === 'ws:home' ||
          tab.id === state.active ||
          canAccessInternalRoute(tab.route, permissions),
      ),
    [permissions, state],
  );
  const pendingLabel = pendingTab ? t(routeLabels[pendingTab.route]) : undefined;
  const showConsoleTabs = workspaceTab(route) !== null;
  const recordIntent = useMemo(
    () => recordNavigationIntent(route, location.search),
    [location.search, route],
  );

  function handleClose(id: TabId): void {
    closeTab(id);
  }

  function continuePending(replaceLru: boolean): void {
    if (!pendingPath) return;
    const path = pendingPath;
    if (replaceLru && !canReplacePending) return;
    commitPath(path, false, replaceLru);
  }

  const canOpenRoute = canAccessInternalRoute(route, permissions);
  let routeContent: ReactNode;
  if (!canOpenRoute) {
    routeContent = (
      <PageShell aria-label={t('access.deniedRegion')}>
        <PageState kind="permission-denied" title={t('access.deniedTitle')}>
          <p>{t('access.deniedMessage')}</p>
        </PageState>
      </PageShell>
    );
  } else {
    switch (route) {
      case 'admin':
        routeContent = <LazyAdminPanel accessToken={accessToken} permissions={[...permissions]} />;
        break;
      case 'clients':
        routeContent = (
          <LazyClientsPanel
            accessToken={accessToken}
            onCloseRecord={() => navigateToPath('/clients')}
            onNavigatePath={navigateToPath}
            onOpenRecord={(clientId) => navigateToPath(clientDeepLink(clientId))}
            permissions={[...permissions]}
            recordClientId={recordIntent.clientId}
          />
        );
        break;
      case 'candidates':
        routeContent = (
          <LazyCandidatesPanel
            accessToken={accessToken}
            onCloseRecord={() => navigateToPath('/candidates')}
            onNavigatePath={navigateToPath}
            onOpenRecord={(candidateId) => navigateToPath(candidateDeepLink(candidateId))}
            permissions={[...permissions]}
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
            onCloseRecord={() => navigateToPath('/missions')}
            onOpenRecord={(missionId) => navigateToPath(missionDeepLink(missionId))}
            permissions={[...permissions]}
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
          <LazyDocumentsPanel accessToken={accessToken} permissions={[...permissions]} />
        );
        break;
      case 'messages':
        routeContent = (
          <LazyMessagesPanel
            accessToken={accessToken}
            actorUserId={user.id}
            initialConversationId={recordIntent.conversationId}
            onUnreadChanged={refreshUnread}
            permissions={[...permissions]}
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
              if (sessionId) parameters.set('session', sessionId);
              replaceRecordIntent(`/training?${parameters.toString()}`);
            }}
            permissions={[...permissions]}
          />
        );
        break;
      case 'reporting':
        routeContent = (
          <LazyReportingPanel
            accessToken={accessToken}
            onNavigate={navigateToPath}
            permissions={[...permissions]}
          />
        );
        break;
      case 'commercial':
        routeContent = (
          <LazyCommercialPanel
            accessToken={accessToken}
            actorUserId={user.id}
            permissions={[...permissions]}
          />
        );
        break;
      case 'accounting':
        routeContent = (
          <LazyAccountingPanel
            accessToken={accessToken}
            actorUserId={user.id}
            permissions={[...permissions]}
          />
        );
        break;
      default:
        routeContent = <InternalHome user={user} />;
    }
  }
  if (canOpenRoute && isDeferredEnglishRoute(route))
    routeContent = <LegacyEnglishContent>{routeContent}</LegacyEnglishContent>;

  return (
    <AppShell
      apiState={apiState}
      currentRoute={route}
      focusMainOnRouteChange={!preserveTabFocus}
      consoleWorkspace={
        showConsoleTabs ? (
          <ConsoleTabBar
            canReplacePending={canReplacePending}
            onActivate={activateTab}
            onCancelPending={() => setPendingPath(null)}
            onClose={handleClose}
            onContinuePending={() => continuePending(false)}
            onReplacePending={() => continuePending(true)}
            pendingLabel={pendingLabel}
            state={state}
            visibleTabs={visibleTabs}
            dirtyTabId={hasUnsavedChanges ? state.active : null}
          />
        ) : undefined
      }
      notificationCenter={{
        accessToken,
        messageUnreadCount: unreadCount,
        onNavigatePath: navigateToPath,
      }}
      navigationBadges={
        unreadCount
          ? {
              messages: {
                display: formatUnreadBadge(unreadCount),
                label: t('messages.unreadBadge', { count: unreadCount }),
              },
            }
          : undefined
      }
      onLogout={onLogout}
      onNavigate={navigate}
      onRefreshUser={onRefreshUser}
      user={user}
    >
      {/*
       * A route-keyed boundary unmounts the previous module before the next lazy
       * import suspends. Without the key, React hides the previously revealed
       * subtree in the shared Suspense boundary until the new chunk resolves;
       * that violates D-089's active-only rendering and retains inactive module
       * state during the transition.
       */}
      <RouteModuleBoundary key={route} route={canOpenRoute ? route : undefined}>
        {routeContent}
      </RouteModuleBoundary>
    </AppShell>
  );
}
