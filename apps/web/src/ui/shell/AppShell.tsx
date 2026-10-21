import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';
import { useI18n } from '../../i18n/index.js';
import { routeToPath, type InternalRoute } from '../../navigation/internal-navigation.js';
import { Button } from '../Button.js';
import { LanguageSelect } from './LanguageSelect.js';
import { NotificationCenter, type NotificationCenterProps } from './NotificationCenter.js';
import { ShellIcon } from './ShellIcon.js';
import {
  workspaceLayoutForRoute,
  visibleShellDomains,
  type ShellDomain,
} from './shell-navigation.js';

export type ShellApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };
export interface NavigationBadge {
  display: string;
  label: string;
}
interface AppShellProps {
  apiState: ShellApiState;
  children: ReactNode;
  consoleWorkspace?: ReactNode;
  currentRoute: InternalRoute;
  focusMainOnRouteChange?: boolean;
  navigationBadges?: Partial<Record<InternalRoute, NavigationBadge>>;
  notificationCenter?: Omit<NotificationCenterProps, 'permissions'>;
  onLogout: () => void | Promise<void>;
  onNavigate: (route: InternalRoute) => void;
  onRefreshUser: () => void | Promise<void>;
  user: AuthenticatedUser;
}
const mobileNavigationQuery = '(max-width: 56.25rem)';
const primaryRoutes: readonly InternalRoute[] = [
  'home',
  'candidates',
  'missions',
  'clients',
  'tasks',
  'messages',
  'commercial',
];
/** Plain primary clicks navigate in-app; modified clicks keep native link behavior. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
function isMobileNavigation(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia(mobileNavigationQuery).matches
  );
}

export function AppShell({
  apiState,
  children,
  consoleWorkspace,
  currentRoute,
  focusMainOnRouteChange = true,
  navigationBadges,
  notificationCenter,
  onLogout,
  onNavigate,
  onRefreshUser,
  user,
}: AppShellProps) {
  const { t } = useI18n();
  const [mobile, setMobile] = useState(isMobileNavigation);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  const previousRouteRef = useRef(currentRoute);
  const domains = visibleShellDomains(user.permissions);
  const availableItems = domains.flatMap((domain) => domain.items);
  const primaryItems = primaryRoutes.flatMap((route) => {
    const item = availableItems.find((candidate) => candidate.route === route);
    return item ? [item] : [];
  });
  const primaryRouteSet = new Set(primaryRoutes);
  const moreDomains = domains
    .map((domain) => ({
      ...domain,
      items: domain.items.filter((item) => !primaryRouteSet.has(item.route)),
    }))
    .filter((domain) => domain.items.length > 0);
  const currentIsInMore = moreDomains.some((domain) =>
    domain.items.some((item) => item.route === currentRoute),
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(mobileNavigationQuery);
    const change = () => {
      setMobile(media.matches);
      setNavigationOpen(false);
    };
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (previousRouteRef.current !== currentRoute) {
      previousRouteRef.current = currentRoute;
      setNavigationOpen(false);
      setMoreOpen(false);
      // Fill-layout routes scroll inside main; never carry an old offset across routes.
      if (mainRef.current) mainRef.current.scrollTop = 0;
      if (focusMainOnRouteChange) mainRef.current?.focus({ preventScroll: true });
    }
  }, [currentRoute, focusMainOnRouteChange]);
  useEffect(() => {
    if (!mobile || !navigationOpen) return;
    navigationRef.current?.querySelector<HTMLElement>('button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobile, navigationOpen]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node))
        accountRef.current.open = false;
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  function closeNavigation(restoreFocus = true): void {
    setNavigationOpen(false);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }
  function handleNavigationKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (!mobile || !navigationOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNavigation();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      navigationRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), select:not(:disabled)',
      ) ?? [],
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  function handleDestination(event: MouseEvent<HTMLAnchorElement>, route: InternalRoute): void {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (mobile) {
      closeNavigation(false);
      mainRef.current?.focus({ preventScroll: true });
    }
    onNavigate(route);
  }
  function closeMoreOnEscape(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || !moreOpen) return;
    event.preventDefault();
    setMoreOpen(false);
    window.setTimeout(() => moreRef.current?.querySelector('button')?.focus(), 0);
  }
  const apiLabel =
    apiState.status === 'loading'
      ? t('shell.api.checking')
      : apiState.status === 'ready'
        ? t('shell.api.healthy')
        : t('shell.api.unavailable');
  const health = (
    <div className="app-shell__health" data-api-status={apiState.status}>
      <span aria-hidden="true" className="app-shell__health-dot" />
      <span>{apiLabel}</span>
    </div>
  );
  const session = (
    <div className="app-shell__session">
      <div className="app-shell__identity">
        <strong>{user.displayName}</strong>
        <span>{user.email}</span>
      </div>
      <div className="app-shell__session-actions">
        <Button onClick={() => void onRefreshUser()} size="compact" variant="quiet">
          {t('shell.session.refreshProfile')}
        </Button>
        <Button onClick={() => void onLogout()} size="compact" variant="secondary">
          {t('shell.session.signOut')}
        </Button>
      </div>
    </div>
  );
  function links(domain: ShellDomain) {
    return (
      <section className="app-shell__nav-group" key={domain.id}>
        <p className="app-shell__nav-label">{t(domain.labelKey)}</p>
        <ul>
          {domain.items.map((item) => {
            const badge = navigationBadges?.[item.route];
            return (
              <li key={item.route}>
                <a
                  aria-current={item.route === currentRoute ? 'page' : undefined}
                  href={item.path}
                  onClick={(event) => handleDestination(event, item.route)}
                >
                  <span>{t(item.labelKey)}</span>
                  {badge ? (
                    <span className="app-shell__nav-badge">
                      <span aria-hidden="true">{badge.display}</span>
                      <span className="sr-only">{badge.label}</span>
                    </span>
                  ) : null}
                  {item.route === currentRoute ? (
                    <span aria-hidden="true" className="app-shell__current-marker" />
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return (
    <div
      className="app-shell"
      data-console-workspace={consoleWorkspace ? 'true' : undefined}
      data-density="internal-compact"
      data-layout={workspaceLayoutForRoute(currentRoute, mobile)}
    >
      <a className="app-shell__skip-link" href="#main-content">
        {t('shell.navigation.skipToMain')}
      </a>
      {mobile && navigationOpen ? (
        <button
          aria-label={t('shell.navigation.dismissNavigation')}
          className="app-shell__scrim"
          onClick={() => closeNavigation()}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      {mobile ? (
        <aside
          aria-hidden={!navigationOpen}
          aria-label={t('shell.navigation.mobileRegion')}
          aria-modal={navigationOpen ? 'true' : undefined}
          className="app-shell__sidebar"
          data-mobile="true"
          data-open={navigationOpen ? 'true' : undefined}
          id="app-context-navigation"
          inert={!navigationOpen}
          onKeyDown={handleNavigationKeyDown}
          ref={navigationRef}
          role="dialog"
        >
          <div className="app-shell__brand">
            <strong>HireMe</strong>
            <Button
              aria-label={t('shell.navigation.closeNavigation')}
              onClick={() => closeNavigation()}
              variant="quiet"
            >
              <ShellIcon name="close" />
            </Button>
          </div>
          <nav aria-label={t('shell.navigation.primaryRegion')} className="app-shell__navigation">
            {domains.map(links)}
          </nav>
          <footer className="app-shell__mobile-session">
            {health}
            <LanguageSelect />
            {session}
          </footer>
        </aside>
      ) : null}
      <div className="app-shell__workspace" inert={mobile && navigationOpen ? true : undefined}>
        <header className="app-shell__utility-bar">
          <div className="app-shell__topbar-start">
            {mobile ? (
              <button
                aria-controls="app-context-navigation"
                aria-expanded={navigationOpen}
                aria-label={t('shell.navigation.openNavigation')}
                className="app-shell__menu-trigger"
                onClick={() => setNavigationOpen(true)}
                ref={triggerRef}
                type="button"
                title={t('shell.navigation.openNavigation')}
              >
                <ShellIcon name="menu" />
              </button>
            ) : null}
            <span aria-hidden="true" className="app-shell__brand-mark">
              H
            </span>
            <strong className="app-shell__brand-name">HireMe</strong>
            <span
              aria-label={t('shell.applicationLabel')}
              className="app-shell__application-context"
            >
              <span aria-hidden="true" className="app-shell__application-icon" />
              {t('shell.application')}
            </span>
          </div>
          <div className="app-shell__utilities">
            {notificationCenter ? (
              <NotificationCenter {...notificationCenter} permissions={user.permissions} />
            ) : null}
            <div className="app-shell__health-wrapper">{health}</div>
            {!mobile ? (
              <>
                <LanguageSelect />
                <details
                  className="app-shell__account"
                  ref={accountRef}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && accountRef.current) {
                      accountRef.current.open = false;
                      accountRef.current.querySelector('summary')?.focus();
                    }
                  }}
                >
                  <summary
                    aria-label={t('shell.session.account')}
                    title={t('shell.session.account')}
                  >
                    <ShellIcon name="account" />
                  </summary>
                  {session}
                </details>
              </>
            ) : null}
          </div>
        </header>
        {!mobile ? (
          <nav aria-label={t('shell.navigation.primaryRegion')} className="app-shell__module-nav">
            <ul className="app-shell__module-list">
              {primaryItems.map((item) => {
                const badge = navigationBadges?.[item.route];
                const label = item.route === 'home' ? t('shell.navigation.home') : t(item.labelKey);
                return (
                  <li key={item.route}>
                    <a
                      aria-current={item.route === currentRoute ? 'page' : undefined}
                      href={item.path}
                      onClick={(event) => handleDestination(event, item.route)}
                    >
                      <span>{label}</span>
                      {badge ? (
                        <span className="app-shell__nav-badge">
                          <span aria-hidden="true">{badge.display}</span>
                          <span className="sr-only">{badge.label}</span>
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
              {moreDomains.length > 0 ? (
                <li className="app-shell__more" onKeyDown={closeMoreOnEscape} ref={moreRef}>
                  <button
                    aria-controls="app-shell-more-destinations"
                    aria-current={currentIsInMore ? 'page' : undefined}
                    aria-expanded={moreOpen}
                    className="app-shell__more-trigger"
                    onClick={() => setMoreOpen((open) => !open)}
                    type="button"
                  >
                    {t('shell.navigation.more')}
                    <span aria-hidden="true" className="app-shell__more-chevron" />
                  </button>
                  {moreOpen ? (
                    <div
                      aria-label={t('shell.navigation.moreDestinations')}
                      className="app-shell__more-panel"
                      id="app-shell-more-destinations"
                    >
                      {moreDomains.map((domain) => (
                        <section className="app-shell__more-group" key={domain.id}>
                          <h2>{t(domain.labelKey)}</h2>
                          <ul>
                            {domain.items.map((item) => (
                              <li key={item.route}>
                                <a
                                  aria-current={item.route === currentRoute ? 'page' : undefined}
                                  href={item.path}
                                  onClick={(event) => {
                                    const plainClick = isPlainClick(event);
                                    handleDestination(event, item.route);
                                    if (plainClick) setMoreOpen(false);
                                  }}
                                >
                                  {t(item.labelKey)}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}
        {consoleWorkspace ? (
          <div className="app-shell__console-workspace">{consoleWorkspace}</div>
        ) : null}
        <main
          className="app-shell__main"
          id="main-content"
          inert={mobile && navigationOpen ? true : undefined}
          ref={mainRef}
          tabIndex={-1}
        >
          <div className="app-shell__content" data-route={routeToPath(currentRoute)}>
            {consoleWorkspace ? <div className="app-shell__surface">{children}</div> : children}
          </div>
        </main>
      </div>
    </div>
  );
}
