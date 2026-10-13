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
import { ShellIcon } from './ShellIcon.js';
import {
  domainForRoute,
  readNavigationExpanded,
  workspaceLayoutForRoute,
  saveNavigationExpanded,
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
  currentRoute: InternalRoute;
  navigationBadges?: Partial<Record<InternalRoute, NavigationBadge>>;
  onLogout: () => void | Promise<void>;
  onNavigate: (route: InternalRoute) => void;
  onRefreshUser: () => void | Promise<void>;
  user: AuthenticatedUser;
}
const mobileNavigationQuery = '(max-width: 56.25rem)';
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
  currentRoute,
  navigationBadges,
  onLogout,
  onNavigate,
  onRefreshUser,
  user,
}: AppShellProps) {
  const { t } = useI18n();
  const [mobile, setMobile] = useState(isMobileNavigation);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [expanded, setExpanded] = useState(readNavigationExpanded);
  const [selectedDomain, setSelectedDomain] = useState(domainForRoute(currentRoute));
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const previousRouteRef = useRef(currentRoute);
  const domains = visibleShellDomains(user.permissions);
  const activeDomain = domainForRoute(currentRoute);
  const context = domains.find((domain) => domain.id === selectedDomain) ?? domains[0];
  const currentItem = domains
    .flatMap((domain) => domain.items)
    .find((item) => item.route === currentRoute);
  const currentLabel = currentItem
    ? t(currentItem.labelKey)
    : currentRoute === 'meetings'
      ? t('agenda.sources.meeting')
      : t('navigation.destinations.overview');

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
      setSelectedDomain(domainForRoute(currentRoute));
      setNavigationOpen(false);
      // Fill-layout routes scroll inside main; never carry an old offset across routes.
      if (mainRef.current) mainRef.current.scrollTop = 0;
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [currentRoute]);
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
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  function setPanelExpanded(next: boolean): void {
    setExpanded(next);
    saveNavigationExpanded(next);
  }
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
      data-density="internal-compact"
      data-expanded={expanded ? 'true' : 'false'}
      data-layout={workspaceLayoutForRoute(currentRoute, mobile)}
    >
      <a className="app-shell__skip-link" href="#main-content">
        {t('shell.navigation.skipToMain')}
      </a>
      {!mobile ? (
        <nav
          aria-label={t('shell.navigation.domainRegion')}
          className="app-shell__rail"
          data-tooltip-dismissed={tooltipDismissed ? 'true' : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setTooltipDismissed(true);
          }}
        >
          <span aria-label="HireMe" className="app-shell__brand-mark">
            H
          </span>
          <div className="app-shell__rail-items">
            {domains.map((domain) => {
              const badge = domain.items
                .map((item) => navigationBadges?.[item.route])
                .find(Boolean);
              const label = t(domain.labelKey) + (badge ? ` · ${badge.label}` : '');
              const icon = (
                <>
                  <ShellIcon name={domain.id} />
                  {badge ? (
                    <span className="app-shell__rail-badge" aria-hidden="true">
                      {badge.display}
                    </span>
                  ) : null}
                </>
              );
              const onlyDestination = domain.items.length === 1 ? domain.items[0] : undefined;
              return (
                <div className="app-shell__rail-item" key={domain.id}>
                  {onlyDestination ? (
                    // A one-destination domain has nothing to reveal: its rail control is
                    // that destination's link, so it can never leave a stale context open.
                    <a
                      aria-current={onlyDestination.route === currentRoute ? 'page' : undefined}
                      aria-label={label}
                      className="app-shell__rail-button"
                      href={onlyDestination.path}
                      onClick={(event) => {
                        if (!isPlainClick(event)) return;
                        setSelectedDomain(domain.id);
                        handleDestination(event, onlyDestination.route);
                      }}
                      onFocus={() => setTooltipDismissed(false)}
                      onMouseEnter={() => setTooltipDismissed(false)}
                    >
                      {icon}
                    </a>
                  ) : (
                    <button
                      className="app-shell__rail-button"
                      type="button"
                      aria-label={label}
                      aria-controls="app-context-navigation"
                      aria-expanded={expanded && context?.id === domain.id}
                      aria-current={activeDomain === domain.id ? 'true' : undefined}
                      onFocus={() => setTooltipDismissed(false)}
                      onMouseEnter={() => setTooltipDismissed(false)}
                      onClick={() => {
                        setSelectedDomain(domain.id);
                        setPanelExpanded(true);
                      }}
                    >
                      {icon}
                    </button>
                  )}
                  <span className="app-shell__tooltip" role="tooltip">
                    {t(domain.labelKey)}
                  </span>
                </div>
              );
            })}
          </div>
        </nav>
      ) : null}
      {mobile && navigationOpen ? (
        <button
          aria-label={t('shell.navigation.dismissNavigation')}
          className="app-shell__scrim"
          onClick={() => closeNavigation()}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <aside
        aria-hidden={(mobile ? !navigationOpen : !expanded) ? 'true' : undefined}
        aria-label={
          mobile ? t('shell.navigation.mobileRegion') : t('shell.navigation.sidebarRegion')
        }
        aria-modal={mobile && navigationOpen ? 'true' : undefined}
        className="app-shell__sidebar"
        data-mobile={mobile ? 'true' : undefined}
        data-open={navigationOpen ? 'true' : undefined}
        id="app-context-navigation"
        inert={(mobile ? !navigationOpen : !expanded) ? true : undefined}
        onKeyDown={handleNavigationKeyDown}
        ref={navigationRef}
        role={mobile ? 'dialog' : undefined}
      >
        <div className="app-shell__brand">
          <strong>HireMe</strong>
          {mobile ? (
            <Button
              aria-label={t('shell.navigation.closeNavigation')}
              onClick={() => closeNavigation()}
              variant="quiet"
            >
              <ShellIcon name="close" />
            </Button>
          ) : null}
        </div>
        <nav aria-label={t('shell.navigation.primaryRegion')} className="app-shell__navigation">
          {mobile ? domains.map(links) : context ? links(context) : null}
        </nav>
        {mobile ? (
          <footer className="app-shell__mobile-session">
            {health}
            <LanguageSelect />
            {session}
          </footer>
        ) : (
          <p className="app-shell__context-hint">{t('shell.navigation.contextHint')}</p>
        )}
      </aside>
      <div className="app-shell__workspace" inert={mobile && navigationOpen ? true : undefined}>
        <header className="app-shell__utility-bar">
          <button
            aria-controls="app-context-navigation"
            aria-expanded={mobile ? navigationOpen : expanded}
            aria-label={
              mobile
                ? t('shell.navigation.openNavigation')
                : expanded
                  ? t('shell.navigation.collapse')
                  : t('shell.navigation.expand')
            }
            className="app-shell__menu-trigger"
            onClick={() => (mobile ? setNavigationOpen(true) : setPanelExpanded(!expanded))}
            ref={triggerRef}
            type="button"
            title={
              mobile
                ? t('shell.navigation.openNavigation')
                : expanded
                  ? t('shell.navigation.collapse')
                  : t('shell.navigation.expand')
            }
          >
            <ShellIcon name={mobile ? 'menu' : 'panel'} />
          </button>
          <div className="app-shell__breadcrumb">
            <strong>HireMe</strong>
            <span aria-hidden="true">/</span>
            <span>{currentLabel}</span>
          </div>
          {!mobile ? (
            <div className="app-shell__utilities">
              {health}
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
                <summary aria-label={t('shell.session.account')} title={t('shell.session.account')}>
                  <ShellIcon name="account" />
                </summary>
                {session}
              </details>
            </div>
          ) : null}
        </header>
        <main
          className="app-shell__main"
          id="main-content"
          inert={mobile && navigationOpen ? true : undefined}
          ref={mainRef}
          tabIndex={-1}
        >
          <div className="app-shell__content" data-route={routeToPath(currentRoute)}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
