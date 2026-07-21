export const ADMIN_PERMISSIONS = {
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_ROLES_MANAGE: 'users:roles:manage',
  USERS_STATUS_MANAGE: 'users:status:manage',
  USERS_SESSIONS_REVOKE: 'users:sessions:revoke',
  ROLES_VIEW: 'roles:view',
  PERMISSIONS_VIEW: 'permissions:view',
} as const;

export const ADMIN_PERMISSION_CODES = Object.values(ADMIN_PERMISSIONS);
