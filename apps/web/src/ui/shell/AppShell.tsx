import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { AuthenticatedUser } from '@hire-me/contracts';

import {
  routeToPath,
  visibleInternalNavigation,
  type InternalRoute,
} from '../../navigation/internal-navigation.js';
import { Button } from '../Button.js';

export type ShellApiState =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

interface AppShellProps {
  apiState: ShellApiState;
  children: ReactNode;
  currentRoute: InternalRoute;
  onLogout: () => void | Promise<void>;
  onNavigate: (route: InternalRoute) => void;
  onRefreshUser: () => void | Promise<void>;
  user: AuthenticatedUser;
}

const mobileNavigationQuery = '(max-width: 47.999rem)';

function isMobileNavigation(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia(mobileNavigationQuery).matches
  );
}

export function AppShell({
  apiState,
  children,
  currentRoute,
  onLogout,
  onNavigate,
  onRefreshUser,
  user,
}: AppShellProps) {
  const [mobile, setMobile] = useState(isMobileNavigation);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousRouteRef = useRef(currentRoute);
  const groups = visibleInternalNavigation(user.permissions);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia(mobileNavigationQuery);
    const handleChange = () => {
      setMobile(media.matches);
      if (!media.matches) {
        setNavigationOpen(false);
      }
    };
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (previousRouteRef.current !== currentRoute) {
      previousRouteRef.current = currentRoute;
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [currentRoute]);

  useEffect(() => {
    if (mobile && navigationOpen) {
      navigationRef.current?.querySelector<HTMLElement>('[aria-current="page"], button')?.focus();
    }
  }, [mobile, navigationOpen]);

  function closeNavigation(restoreFocus = true): void {
    setNavigationOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }

  function handleNavigationKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (!mobile || !navigationOpen) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNavigation();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(
      navigationRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [],
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function handleDestination(event: MouseEvent<HTMLAnchorElement>, route: InternalRoute): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    if (mobile) {
      closeNavigation(false);
    }
    onNavigate(route);
  }

  const apiLabel =
    apiState.status === 'loading'
      ? 'API checking'
      : apiState.status === 'ready'
        ? 'API healthy'
        : 'API unavailable';

  return (
    <div className="app-shell" data-density="internal-compact">
      <a className="app-shell__skip-link" href="#main-content">
        Skip to main content
      </a>
      {mobile && navigationOpen ? (
        <button
          aria-label="Dismiss navigation"
          className="app-shell__scrim"
          onClick={() => closeNavigation()}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <aside
        aria-hidden={mobile && !navigationOpen ? 'true' : undefined}
        aria-label={mobile ? 'Mobile navigation' : 'Application sidebar'}
        aria-modal={mobile && navigationOpen ? 'true' : undefined}
        className="app-shell__sidebar"
        data-mobile={mobile ? 'true' : undefined}
        data-open={navigationOpen ? 'true' : undefined}
        id="app-navigation"
        inert={mobile && !navigationOpen ? true : undefined}
        onKeyDown={handleNavigationKeyDown}
        ref={navigationRef}
        role={mobile ? 'dialog' : undefined}
      >
        <div className="app-shell__brand">
          <span aria-hidden="true" className="app-shell__brand-mark">
            H
          </span>
          <span>
            <strong>HireMe</strong>
            <small>Operations</small>
          </span>
          {mobile ? (
            <Button
              aria-label="Close navigation"
              onClick={() => closeNavigation()}
              size="compact"
              variant="quiet"
            >
              Close
            </Button>
          ) : null}
        </div>

        <nav aria-label="Primary navigation" className="app-shell__navigation">
          {groups.map((group) => (
            <section className="app-shell__nav-group" key={group.label}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.route}>
                    <a
                      aria-current={item.route === currentRoute ? 'page' : undefined}
                      href={item.path}
                      onClick={(event) => handleDestination(event, item.route)}
                    >
                      <span>{item.label}</span>
                      {item.route === currentRoute ? (
                        <span aria-hidden="true" className="app-shell__current-marker" />
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <footer className="app-shell__session">
          <div className="app-shell__health" data-api-status={apiState.status}>
            <span aria-hidden="true" className="app-shell__health-dot" />
            <span>{apiLabel}</span>
          </div>
          <div className="app-shell__identity">
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
          <div className="app-shell__session-actions">
            <Button onClick={() => void onRefreshUser()} size="compact" variant="quiet">
              Refresh profile
            </Button>
            <Button onClick={() => void onLogout()} size="compact" variant="secondary">
              Sign out
            </Button>
          </div>
        </footer>
      </aside>

      <main
        className="app-shell__main"
        id="main-content"
        inert={mobile && navigationOpen ? true : undefined}
        ref={mainRef}
        tabIndex={-1}
      >
        <header className="app-shell__mobile-bar">
          <button
            aria-controls="app-navigation"
            aria-expanded={navigationOpen}
            aria-label="Open navigation"
            className="app-shell__menu-trigger"
            onClick={() => setNavigationOpen(true)}
            ref={triggerRef}
            type="button"
          >
            <span aria-hidden="true">Menu</span>
          </button>
          <strong>HireMe</strong>
          <span aria-hidden="true" />
        </header>
        <div className="app-shell__content" data-route={routeToPath(currentRoute)}>
          {children}
        </div>
      </main>
    </div>
  );
}
