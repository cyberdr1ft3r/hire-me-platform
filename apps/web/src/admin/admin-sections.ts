export type AdminSection = 'billing' | 'users' | 'access';

export const ADMIN_SECTION_PERMISSIONS: Readonly<Record<AdminSection, readonly string[]>> = {
  billing: ['billing_settings:view'],
  users: ['users:view'],
  access: ['roles:view', 'permissions:view'],
};

const ADMIN_SECTIONS = Object.keys(ADMIN_SECTION_PERMISSIONS) as AdminSection[];

export function adminSectionFromSearch(search: string): AdminSection | null {
  const section = new URLSearchParams(search).get('section');
  return ADMIN_SECTIONS.includes(section as AdminSection) ? (section as AdminSection) : null;
}

export function adminSectionPath(section: AdminSection): string {
  return `/admin?section=${section}`;
}

export function canAccessAdminSection(
  section: AdminSection,
  permissions: readonly string[],
): boolean {
  return ADMIN_SECTION_PERMISSIONS[section].some((permission) => permissions.includes(permission));
}

export function visibleAdminSections(permissions: readonly string[]): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => canAccessAdminSection(section, permissions));
}
