import { z } from 'zod';

export const AdminUserStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']);
export const AdminUserTypeSchema = z.enum(['INTERNAL', 'CLIENT', 'GUEST']);
export const AdminRoleNameSchema = z.enum([
  'SUPER_ADMIN',
  'ADMIN',
  'HR_MANAGER',
  'MANAGER',
  'TEAM_LEADER',
  'EMPLOYEE',
  'GUEST',
  'CLIENT_USER',
]);
export const AdminRoleStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const AdminPermissionStatusSchema = z.enum(['ACTIVE', 'DEPRECATED']);
export const AdminPermissionScopeTypeSchema = z.enum([
  'GLOBAL',
  'ALL_DATA',
  'TEAM',
  'ASSIGNED',
  'CLIENT',
  'EXPLICIT',
]);

export const AdminPermissionSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  description: z.string(),
  scopeType: AdminPermissionScopeTypeSchema,
  status: AdminPermissionStatusSchema,
});

export const AdminRoleSchema = z.object({
  id: z.string().uuid(),
  name: AdminRoleNameSchema,
  description: z.string(),
  status: AdminRoleStatusSchema,
  permissions: z.array(AdminPermissionSchema),
});

export const AdminRefreshSessionSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});

export const AdminUserSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  normalizedEmail: z.string().email(),
  status: AdminUserStatusSchema,
  userType: AdminUserTypeSchema,
  locale: z.string(),
  lastLoginAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  roles: z.array(AdminRoleNameSchema),
  effectivePermissions: z.array(z.string()),
  activeSessionCount: z.number().int().nonnegative(),
});

export const AdminUserDetailSchema = AdminUserSummarySchema.extend({
  sessions: z.array(AdminRefreshSessionSummarySchema),
});

export const AdminUserListResponseSchema = z.object({
  users: z.array(AdminUserSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const AdminUserDetailResponseSchema = z.object({
  user: AdminUserDetailSchema,
});

export const AdminCreateUserRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().email().max(254),
  initialPassword: z.string().min(12).max(256),
  locale: z.string().trim().min(2).max(12).default('en'),
});

export const AdminUpdateUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    locale: z.string().trim().min(2).max(12).optional(),
  })
  .refine((value) => value.displayName !== undefined || value.locale !== undefined, {
    message: 'At least one editable field is required.',
  });

export const AdminAssignRoleRequestSchema = z.object({
  roleName: AdminRoleNameSchema,
});

export const AdminUpdateUserStatusRequestSchema = z.object({
  status: AdminUserStatusSchema,
});

export const AdminUserListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: AdminUserStatusSchema.optional(),
});

export const AdminRoleListResponseSchema = z.object({
  roles: z.array(AdminRoleSchema),
});

export const AdminPermissionListResponseSchema = z.object({
  permissions: z.array(AdminPermissionSchema),
});

export const AdminEffectivePermissionsResponseSchema = z.object({
  userId: z.string().uuid(),
  permissions: z.array(z.string()),
});

export const AdminSessionListResponseSchema = z.object({
  sessions: z.array(AdminRefreshSessionSummarySchema),
});

export type AdminUserStatus = z.infer<typeof AdminUserStatusSchema>;
export type AdminRoleName = z.infer<typeof AdminRoleNameSchema>;
export type AdminPermission = z.infer<typeof AdminPermissionSchema>;
export type AdminRole = z.infer<typeof AdminRoleSchema>;
export type AdminRefreshSessionSummary = z.infer<typeof AdminRefreshSessionSummarySchema>;
export type AdminUserSummary = z.infer<typeof AdminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;
export type AdminUserListResponse = z.infer<typeof AdminUserListResponseSchema>;
export type AdminUserDetailResponse = z.infer<typeof AdminUserDetailResponseSchema>;
export type AdminCreateUserRequest = z.infer<typeof AdminCreateUserRequestSchema>;
export type AdminUpdateUserRequest = z.infer<typeof AdminUpdateUserRequestSchema>;
export type AdminAssignRoleRequest = z.infer<typeof AdminAssignRoleRequestSchema>;
export type AdminUpdateUserStatusRequest = z.infer<typeof AdminUpdateUserStatusRequestSchema>;
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;
export type AdminRoleListResponse = z.infer<typeof AdminRoleListResponseSchema>;
export type AdminPermissionListResponse = z.infer<typeof AdminPermissionListResponseSchema>;
export type AdminEffectivePermissionsResponse = z.infer<
  typeof AdminEffectivePermissionsResponseSchema
>;
export type AdminSessionListResponse = z.infer<typeof AdminSessionListResponseSchema>;
