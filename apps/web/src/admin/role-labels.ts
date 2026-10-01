import type { AdminRoleName } from '@hire-me/contracts';

import type { Translator } from '../i18n/translate.js';

const ADMIN_ROLE_NAMES: readonly AdminRoleName[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR_MANAGER',
  'MANAGER',
  'TEAM_LEADER',
  'EMPLOYEE',
  'FINANCE_MANAGER',
  'GUEST',
  'CLIENT_USER',
];

function isAdminRoleName(value: string): value is AdminRoleName {
  return (ADMIN_ROLE_NAMES as readonly string[]).includes(value);
}

/** Localized admin role label; falls back to the canonical enum name when unknown. */
export function formatAdminRoleName(t: Translator, roleName: string): string {
  if (!isAdminRoleName(roleName)) {
    return roleName;
  }
  return t(`admin.roleNames.${roleName}`);
}
