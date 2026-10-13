import type { PlainMessageKey } from '../../i18n/index.js';
import {
  visibleInternalNavigation,
  type InternalNavigationItem,
  type InternalRoute,
} from '../../navigation/internal-navigation.js';

export type ShellDomainId =
  'overview' | 'recruitment' | 'commercial' | 'operations' | 'communication' | 'administration';
export interface ShellDomain {
  id: ShellDomainId;
  labelKey: PlainMessageKey;
  items: readonly InternalNavigationItem[];
}

const domainRoutes: readonly {
  id: ShellDomainId;
  labelKey: PlainMessageKey;
  routes: readonly InternalRoute[];
}[] = [
  {
    id: 'overview',
    labelKey: 'navigation.destinations.overview',
    routes: ['home', 'tasks', 'agenda'],
  },
  {
    id: 'recruitment',
    labelKey: 'navigation.groups.recruitment',
    routes: ['candidates', 'missions', 'reporting'],
  },
  {
    id: 'commercial',
    labelKey: 'navigation.destinations.commercial',
    routes: ['commercial', 'accounting'],
  },
  {
    id: 'operations',
    labelKey: 'navigation.groups.operations',
    routes: ['clients', 'training', 'documents'],
  },
  { id: 'communication', labelKey: 'shell.navigation.communication', routes: ['messages'] },
  { id: 'administration', labelKey: 'navigation.destinations.administration', routes: ['admin'] },
];

/** Presentation only: permission decisions and destination paths stay in the existing registry. */
export function visibleShellDomains(permissions: readonly string[]): ShellDomain[] {
  const allowed = visibleInternalNavigation(permissions).flatMap((group) => group.items);
  return domainRoutes.flatMap((domain) => {
    const items = domain.routes.flatMap((route) => allowed.filter((item) => item.route === route));
    return items.length ? [{ id: domain.id, labelKey: domain.labelKey, items }] : [];
  });
}

export function domainForRoute(route: InternalRoute): ShellDomainId {
  // Meetings is an existing deep-linked workspace reached from Agenda/Tasks.
  return domainRoutes.find((domain) => domain.routes.includes(route))?.id ?? 'overview';
}

export const NAVIGATION_PREFERENCE_KEY = 'hireme.navigation.expanded';
export function readNavigationExpanded(): boolean {
  try {
    return window.localStorage.getItem(NAVIGATION_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}
export function saveNavigationExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(NAVIGATION_PREFERENCE_KEY, String(expanded));
  } catch {
    /* Storage restrictions must not prevent navigation. */
  }
}
