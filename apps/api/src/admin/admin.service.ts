import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminAssignRoleRequest,
  AdminCreateUserRequest,
  AdminEffectivePermissionsResponse,
  AdminPermissionListResponse,
  AdminRoleListResponse,
  AdminSessionListResponse,
  AdminUpdateUserRequest,
  AdminUpdateUserStatusRequest,
  AdminUserDetailResponse,
  AdminUserListQuery,
  AdminUserListResponse,
} from '@hire-me/contracts';

import { ADMIN_PERMISSION_CODES } from './admin.constants.js';
import { badRequest, conflict, forbidden, notFound } from './admin.errors.js';
import { AdminAuditService } from './admin-audit.service.js';
import type { RequestContext } from '../auth/auth.types.js';
import { normalizeEmail } from '../auth/normalize-email.js';
import { PasswordService } from '../auth/password.service.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  PermissionStatus,
  Prisma,
  RoleName,
  RoleStatus,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type UserWithAdminRelations = Prisma.UserGetPayload<{
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true;
              };
            };
          };
        };
      };
    };
    refreshSessions: true;
  };
}>;

type PrismaTransaction = Prisma.TransactionClient;

const SUPER_ADMIN_INVARIANT_LOCK_ID = 13_101_313;
const ADMIN_PERMISSION_CODE_SET = new Set<string>(ADMIN_PERMISSION_CODES);

@Injectable()
export class AdminService {
  private readonly audit: AdminAuditService;
  private readonly passwords: PasswordService;
  private readonly permissions: PermissionsService;
  private readonly prisma: PrismaService;

  constructor(
    @Inject(AdminAuditService) audit: AdminAuditService,
    @Inject(PasswordService) passwords: PasswordService,
    @Inject(PermissionsService) permissions: PermissionsService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    this.audit = audit;
    this.passwords = passwords;
    this.permissions = permissions;
    this.prisma = prisma;
  }

  async listUsers(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const where: Prisma.UserWhereInput = {
      userType: UserType.INTERNAL,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { normalizedEmail: { contains: normalizeEmail(query.search) } },
            ],
          }
        : {}),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: this.userInclude(),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      users: users.map((user) => this.toUserSummary(user)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  async getUser(userId: string): Promise<AdminUserDetailResponse> {
    const user = await this.findInternalUser(userId);
    return { user: this.toUserDetail(user) };
  }

  async createUser(
    input: AdminCreateUserRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminUserDetailResponse> {
    if (!this.passwords.validatePasswordPolicy(input.initialPassword)) {
      throw badRequest(
        'INITIAL_PASSWORD_POLICY_FAILED',
        'Initial password does not meet the password policy.',
      );
    }

    const normalized = normalizeEmail(input.email);

    try {
      const user = await this.prisma.user.create({
        data: {
          displayName: input.displayName,
          email: input.email.trim(),
          normalizedEmail: normalized,
          locale: input.locale,
          status: UserStatus.ACTIVE,
          userType: UserType.INTERNAL,
          passwordCredential: {
            create: {
              passwordHash: await this.passwords.hashPassword(input.initialPassword),
            },
          },
        },
        include: this.userInclude(),
      });

      await this.audit.record('admin.user.created', context, {
        actorUserId,
        targetUserId: user.id,
        entityType: 'User',
        entityId: user.id,
        metadataSummary: 'Internal user created with administrator-set initial credential.',
      });

      return { user: this.toUserDetail(user) };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw conflict('USER_EMAIL_ALREADY_EXISTS', 'A user with that email already exists.');
      }
      throw error;
    }
  }

  async updateUser(
    userId: string,
    input: AdminUpdateUserRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminUserDetailResponse> {
    await this.ensureInternalUserExists(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      },
      include: this.userInclude(),
    });

    await this.audit.record('admin.user.updated', context, {
      actorUserId,
      targetUserId: user.id,
      entityType: 'User',
      entityId: user.id,
      metadataSummary: 'Approved non-sensitive user profile fields updated.',
    });

    return { user: this.toUserDetail(user) };
  }

  async assignRole(
    userId: string,
    input: AdminAssignRoleRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminUserDetailResponse> {
    const role = await this.prisma.role.findFirst({
      where: { name: input.roleName, status: RoleStatus.ACTIVE, archivedAt: null },
      include: {
        permissions: {
          where: { archivedAt: null, permission: { status: PermissionStatus.ACTIVE } },
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw notFound('ROLE_NOT_FOUND', 'Role was not found.');
    }

    const actorPermissions = new Set(
      await this.permissions.getEffectivePermissionCodes(actorUserId),
    );
    const missing = role.permissions
      .map((rolePermission) => rolePermission.permission.code)
      .filter((code) => !actorPermissions.has(code));

    if (missing.length > 0) {
      throw forbidden(
        'ROLE_PERMISSION_SCOPE_EXCEEDED',
        'Role assignment would grant permissions outside the administrator effective scope.',
      );
    }

    await this.ensureInternalUserExists(userId);
    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      update: { archivedAt: null },
      create: {
        userId,
        roleId: role.id,
      },
    });

    await this.audit.record('admin.user.role_assigned', context, {
      actorUserId,
      targetUserId: userId,
      entityType: 'User',
      entityId: userId,
      metadataSummary: `Role assigned: ${role.name}.`,
    });

    return this.getUser(userId);
  }

  async removeRole(
    userId: string,
    roleName: RoleName,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminUserDetailResponse> {
    await this.prisma.$transaction(async (transaction) => {
      const role = await transaction.role.findFirst({
        where: { name: roleName, status: RoleStatus.ACTIVE, archivedAt: null },
      });
      if (!role) {
        throw notFound('ROLE_NOT_FOUND', 'Role was not found.');
      }

      await this.ensureInternalUserExists(userId, transaction);
      if (userId === actorUserId) {
        await this.assertNoUnsafeSelfDemotion(actorUserId, role.id, transaction);
      }
      if (role.name === RoleName.SUPER_ADMIN) {
        await this.assertCanChangeActiveSuperAdmin(userId, transaction);
      }

      await transaction.userRole.updateMany({
        where: {
          userId,
          roleId: role.id,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
    });

    await this.audit.record('admin.user.role_removed', context, {
      actorUserId,
      targetUserId: userId,
      entityType: 'User',
      entityId: userId,
      metadataSummary: `Role removed: ${roleName}.`,
    });

    return this.getUser(userId);
  }

  async updateStatus(
    userId: string,
    input: AdminUpdateUserStatusRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminUserDetailResponse> {
    if (userId === actorUserId && input.status !== UserStatus.ACTIVE) {
      throw conflict(
        'UNSAFE_SELF_STATUS_CHANGE',
        'Administrators cannot suspend or archive themselves.',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      const user = await this.ensureInternalUserExists(userId, transaction);
      if (input.status === UserStatus.ACTIVE && user.archivedAt) {
        throw conflict('ARCHIVED_USER_REACTIVATION_BLOCKED', 'Archived users are not reactivated.');
      }

      if (user.status === UserStatus.ACTIVE && input.status !== UserStatus.ACTIVE) {
        const isSuperAdmin = await this.userHasActiveRole(
          userId,
          RoleName.SUPER_ADMIN,
          transaction,
        );
        if (isSuperAdmin) {
          await this.assertCanChangeActiveSuperAdmin(userId, transaction);
        }
      }

      const now = new Date();
      await transaction.user.update({
        where: { id: userId },
        data: {
          status: input.status,
          archivedAt: input.status === UserStatus.ARCHIVED ? now : user.archivedAt,
        },
      });

      if (input.status !== UserStatus.ACTIVE) {
        await transaction.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });

    await this.audit.record('admin.user.status_updated', context, {
      actorUserId,
      targetUserId: userId,
      entityType: 'User',
      entityId: userId,
      metadataSummary: `User status changed to ${input.status}.`,
    });

    return this.getUser(userId);
  }

  async listSessions(userId: string): Promise<AdminSessionListResponse> {
    await this.ensureInternalUserExists(userId);
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return { sessions: sessions.map((session) => this.toSessionSummary(session)) };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminSessionListResponse> {
    await this.ensureInternalUserExists(userId);
    const result = await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw notFound('REFRESH_SESSION_NOT_FOUND', 'Refresh session was not found.');
    }

    await this.audit.record('admin.user.session_revoked', context, {
      actorUserId,
      targetUserId: userId,
      entityType: 'RefreshSession',
      entityId: sessionId,
      metadataSummary: 'Selected refresh session revoked.',
    });

    return this.listSessions(userId);
  }

  async revokeAllSessions(
    userId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<AdminSessionListResponse> {
    await this.ensureInternalUserExists(userId);
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record('admin.user.sessions_revoked', context, {
      actorUserId,
      targetUserId: userId,
      entityType: 'User',
      entityId: userId,
      metadataSummary: 'All refresh sessions revoked for selected user.',
    });

    return this.listSessions(userId);
  }

  async listRoles(): Promise<AdminRoleListResponse> {
    const roles = await this.prisma.role.findMany({
      where: { status: RoleStatus.ACTIVE, archivedAt: null },
      include: {
        permissions: {
          where: { archivedAt: null, permission: { status: PermissionStatus.ACTIVE } },
          include: { permission: true },
          orderBy: { permission: { code: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        status: role.status,
        permissions: role.permissions.map((rolePermission) => ({
          id: rolePermission.permission.id,
          code: rolePermission.permission.code,
          description: rolePermission.permission.description,
          scopeType: rolePermission.permission.scopeType,
          status: rolePermission.permission.status,
        })),
      })),
    };
  }

  async listPermissions(): Promise<AdminPermissionListResponse> {
    const permissions = await this.prisma.permission.findMany({
      where: { status: PermissionStatus.ACTIVE },
      orderBy: { code: 'asc' },
    });

    return {
      permissions: permissions.map((permission) => ({
        id: permission.id,
        code: permission.code,
        description: permission.description,
        scopeType: permission.scopeType,
        status: permission.status,
      })),
    };
  }

  async getEffectivePermissions(userId: string): Promise<AdminEffectivePermissionsResponse> {
    await this.ensureInternalUserExists(userId);
    return {
      userId,
      permissions: await this.permissions.getEffectivePermissionCodes(userId),
    };
  }

  private async findInternalUser(userId: string): Promise<UserWithAdminRelations> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, userType: UserType.INTERNAL },
      include: this.userInclude(),
    });

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'User was not found.');
    }

    return user;
  }

  private async ensureInternalUserExists(
    userId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ) {
    const user = await prisma.user.findFirst({
      where: { id: userId, userType: UserType.INTERNAL },
    });

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'User was not found.');
    }

    return user;
  }

  private async assertNoUnsafeSelfDemotion(
    actorUserId: string,
    removedRoleId: string,
    prisma: PrismaTransaction,
  ): Promise<void> {
    const roles = await prisma.userRole.findMany({
      where: {
        userId: actorUserId,
        archivedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                archivedAt: null,
                permission: { status: PermissionStatus.ACTIVE },
              },
              include: { permission: true },
            },
          },
        },
      },
    });
    const remainingPermissions = new Set(
      roles
        .filter((userRole) => userRole.roleId !== removedRoleId)
        .flatMap((userRole) =>
          userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
        ),
    );
    const currentAdminPermissions = roles
      .flatMap((userRole) =>
        userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
      )
      .filter((code) => ADMIN_PERMISSION_CODE_SET.has(code));

    if (currentAdminPermissions.some((code) => !remainingPermissions.has(code))) {
      throw conflict(
        'UNSAFE_SELF_DEMOTION',
        'Administrators cannot remove their own final administrative capability.',
      );
    }
  }

  private async assertCanChangeActiveSuperAdmin(
    userId: string,
    prisma: PrismaTransaction,
  ): Promise<void> {
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_INVARIANT_LOCK_ID})`;
    const isSuperAdmin = await this.userHasActiveRole(userId, RoleName.SUPER_ADMIN, prisma);
    if (!isSuperAdmin) {
      return;
    }

    const activeSuperAdmins = await prisma.userRole.count({
      where: {
        archivedAt: null,
        role: { name: RoleName.SUPER_ADMIN, status: RoleStatus.ACTIVE, archivedAt: null },
        user: { status: UserStatus.ACTIVE, archivedAt: null },
      },
    });

    if (activeSuperAdmins <= 1) {
      throw conflict(
        'LAST_ACTIVE_SUPER_ADMIN_PROTECTED',
        'The last active SUPER_ADMIN cannot be demoted, suspended, or archived.',
      );
    }
  }

  private async userHasActiveRole(
    userId: string,
    roleName: RoleName,
    prisma: PrismaTransaction,
  ): Promise<boolean> {
    const count = await prisma.userRole.count({
      where: {
        userId,
        archivedAt: null,
        role: { name: roleName, status: RoleStatus.ACTIVE, archivedAt: null },
      },
    });

    return count > 0;
  }

  private userInclude() {
    return {
      roles: {
        where: { archivedAt: null },
        include: {
          role: {
            include: {
              permissions: {
                where: { archivedAt: null, permission: { status: PermissionStatus.ACTIVE } },
                include: { permission: true },
              },
            },
          },
        },
      },
      refreshSessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      },
    } satisfies Prisma.UserInclude;
  }

  private toUserSummary(user: UserWithAdminRelations) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      normalizedEmail: user.normalizedEmail,
      status: user.status,
      userType: user.userType,
      locale: user.locale,
      lastLoginAt: this.isoOrNull(user.lastLoginAt),
      archivedAt: this.isoOrNull(user.archivedAt),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      roles: user.roles.map((userRole) => userRole.role.name).sort(),
      effectivePermissions: this.effectivePermissionsFromUser(user),
      activeSessionCount: user.refreshSessions.length,
    };
  }

  private toUserDetail(user: UserWithAdminRelations) {
    return {
      ...this.toUserSummary(user),
      sessions: user.refreshSessions.map((session) => this.toSessionSummary(session)),
    };
  }

  private effectivePermissionsFromUser(user: UserWithAdminRelations): string[] {
    return [
      ...new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    ].sort();
  }

  private toSessionSummary(session: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
  }) {
    return {
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastUsedAt: this.isoOrNull(session.lastUsedAt),
      revokedAt: this.isoOrNull(session.revokedAt),
    };
  }

  private isoOrNull(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
