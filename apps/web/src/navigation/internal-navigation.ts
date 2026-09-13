import type { PlainMessageKey } from '../i18n/index.js';

export type InternalRoute =
  | 'home'
  | 'admin'
  | 'clients'
  | 'candidates'
  | 'missions'
  | 'tasks'
  | 'documents'
  | 'training'
  | 'reporting'
  | 'commercial'
  | 'accounting';

export type NavigationGroupId = 'workspace' | 'recruitment' | 'operations' | 'business' | 'system';

/**
 * Navigation carries typed message keys, never display text. Routes, paths, and
 * permission codes stay language-neutral; only the rendered label changes with
 * the active locale.
 *
 * `PlainMessageKey` restricts these to keys that need no interpolation values,
 * which is what makes a stored key safe to translate at render time.
 */
export interface InternalNavigationItem {
  labelKey: PlainMessageKey;
  path: string;
  permissions?: readonly string[];
  route: InternalRoute;
}

export interface InternalNavigationGroup {
  id: NavigationGroupId;
  items: readonly InternalNavigationItem[];
  labelKey: PlainMessageKey;
}

const internalNavigationGroups: readonly InternalNavigationGroup[] = [
  {
    id: 'workspace',
    labelKey: 'navigation.groups.workspace',
    items: [
      { labelKey: 'navigation.destinations.overview', path: '/', route: 'home' },
      {
        labelKey: 'navigation.destinations.tasks',
        path: '/tasks',
        permissions: ['tasks:view'],
        route: 'tasks',
      },
    ],
  },
  {
    id: 'recruitment',
    labelKey: 'navigation.groups.recruitment',
    items: [
      {
        labelKey: 'navigation.destinations.candidates',
        path: '/candidates',
        permissions: ['candidates:view'],
        route: 'candidates',
      },
      {
        labelKey: 'navigation.destinations.missions',
        path: '/missions',
        permissions: ['missions:view'],
        route: 'missions',
      },
      {
        labelKey: 'navigation.destinations.reporting',
        path: '/reporting',
        permissions: ['reporting:recruitment:view'],
        route: 'reporting',
      },
    ],
  },
  {
    id: 'operations',
    labelKey: 'navigation.groups.operations',
    items: [
      {
        labelKey: 'navigation.destinations.clients',
        path: '/clients',
        permissions: ['clients:view'],
        route: 'clients',
      },
      {
        labelKey: 'navigation.destinations.training',
        path: '/training',
        permissions: ['training_programs:view'],
        route: 'training',
      },
      {
        labelKey: 'navigation.destinations.documents',
        path: '/documents',
        permissions: ['documents:view'],
        route: 'documents',
      },
    ],
  },
  {
    id: 'business',
    labelKey: 'navigation.groups.business',
    items: [
      {
        labelKey: 'navigation.destinations.commercial',
        path: '/commercial',
        permissions: ['quotations:view', 'contracts:view', 'purchase_orders:view', 'invoices:view'],
        route: 'commercial',
      },
      {
        labelKey: 'navigation.destinations.accounting',
        path: '/accounting',
        permissions: [
          'payments:view',
          'expenses:view',
          'client_balances:view',
          'profitability:view',
        ],
        route: 'accounting',
      },
    ],
  },
  {
    id: 'system',
    labelKey: 'navigation.groups.system',
    items: [
      {
        labelKey: 'navigation.destinations.administration',
        path: '/admin',
        permissions: ['users:view'],
        route: 'admin',
      },
    ],
  },
] as const;

/**
 * Destinations whose module interface is still English while the shell around
 * them is translated.
 *
 * These are marked as English content so assistive technology is not told that
 * English copy is French. A route leaves this list when its own redesign makes
 * it bilingual. Reporting and Candidates have left it: both surfaces are fully
 * translated, so none may be announced as English inside a French document.
 */
export const deferredEnglishRoutes: readonly InternalRoute[] = [
  'accounting',
  'admin',
  'clients',
  'commercial',
  'documents',
  'missions',
  'training',
];

export function isDeferredEnglishRoute(route: InternalRoute): boolean {
  return deferredEnglishRoutes.includes(route);
}

const internalNavigationItems = internalNavigationGroups.flatMap((group) => group.items);

export function routeToPath(route: InternalRoute): string {
  return internalNavigationItems.find((item) => item.route === route)?.path ?? '/';
}

export function pathToRoute(pathname: string): InternalRoute {
  return internalNavigationItems.find((item) => item.path === pathname)?.route ?? 'home';
}

export function canAccessInternalRoute(
  route: InternalRoute,
  permissions: readonly string[],
): boolean {
  const required = internalNavigationItems.find((item) => item.route === route)?.permissions;
  return !required || required.some((permission) => permissions.includes(permission));
}

export function visibleInternalNavigation(
  permissions: readonly string[],
): InternalNavigationGroup[] {
  return internalNavigationGroups.flatMap((group) => {
    const items = group.items.filter((item) => canAccessInternalRoute(item.route, permissions));
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}
