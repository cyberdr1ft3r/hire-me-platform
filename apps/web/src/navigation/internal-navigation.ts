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

export type NavigationGroupName =
  'Workspace' | 'Recruitment' | 'Operations' | 'Business' | 'System';

export interface InternalNavigationItem {
  label: string;
  path: string;
  permissions?: readonly string[];
  route: InternalRoute;
}

export interface InternalNavigationGroup {
  label: NavigationGroupName;
  items: readonly InternalNavigationItem[];
}

const internalNavigationGroups: readonly InternalNavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', path: '/', route: 'home' },
      { label: 'Tasks', path: '/tasks', permissions: ['tasks:view'], route: 'tasks' },
    ],
  },
  {
    label: 'Recruitment',
    items: [
      {
        label: 'Candidates',
        path: '/candidates',
        permissions: ['candidates:view'],
        route: 'candidates',
      },
      {
        label: 'Missions',
        path: '/missions',
        permissions: ['missions:view'],
        route: 'missions',
      },
      {
        label: 'Reporting',
        path: '/reporting',
        permissions: ['reporting:recruitment:view'],
        route: 'reporting',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Clients',
        path: '/clients',
        permissions: ['clients:view'],
        route: 'clients',
      },
      {
        label: 'Training',
        path: '/training',
        permissions: ['training_programs:view'],
        route: 'training',
      },
      {
        label: 'Documents',
        path: '/documents',
        permissions: ['documents:view'],
        route: 'documents',
      },
    ],
  },
  {
    label: 'Business',
    items: [
      {
        label: 'Commercial',
        path: '/commercial',
        permissions: ['quotations:view', 'contracts:view', 'purchase_orders:view', 'invoices:view'],
        route: 'commercial',
      },
      {
        label: 'Accounting',
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
    label: 'System',
    items: [
      {
        label: 'Administration',
        path: '/admin',
        permissions: ['users:view'],
        route: 'admin',
      },
    ],
  },
] as const;

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
