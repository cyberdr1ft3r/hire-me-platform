import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAssignRoleRequestSchema,
  AdminCreateUserRequestSchema,
  AdminEffectivePermissionsResponseSchema,
  AdminPermissionListResponseSchema,
  AdminRoleListResponseSchema,
  AdminRoleNameSchema,
  AdminSessionListResponseSchema,
  AdminUpdateUserRequestSchema,
  AdminUpdateUserStatusRequestSchema,
  AdminUserDetailResponseSchema,
  AdminUserListQuerySchema,
  AdminUserListResponseSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { ADMIN_PERMISSIONS } from './admin.constants.js';
import { badRequest } from './admin.errors.js';
import { AdminService } from './admin.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/admin')
@UseGuards(AuthGuard, PermissionGuard)
export class AdminController {
  private readonly admin: AdminService;

  constructor(@Inject(AdminService) admin: AdminService) {
    this.admin = admin;
  }

  @Get('users')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_VIEW)
  async listUsers(@Query() query: unknown) {
    const parsed = AdminUserListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_USER_LIST_QUERY', 'Invalid user list query.');
    }

    return AdminUserListResponseSchema.parse(await this.admin.listUsers(parsed.data));
  }

  @Post('users')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_CREATE)
  async createUser(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = AdminCreateUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_USER_REQUEST', 'Invalid create user request.');
    }

    return AdminUserDetailResponseSchema.parse(
      await this.admin.createUser(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get('users/:userId')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_VIEW)
  async getUser(@Param('userId') userId: string) {
    return AdminUserDetailResponseSchema.parse(await this.admin.getUser(this.uuid(userId)));
  }

  @Patch('users/:userId')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_UPDATE)
  async updateUser(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = AdminUpdateUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_USER_REQUEST', 'Invalid update user request.');
    }

    return AdminUserDetailResponseSchema.parse(
      await this.admin.updateUser(
        this.uuid(userId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('users/:userId/roles')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_ROLES_MANAGE)
  async assignRole(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = AdminAssignRoleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_ASSIGN_ROLE_REQUEST', 'Invalid assign role request.');
    }

    return AdminUserDetailResponseSchema.parse(
      await this.admin.assignRole(
        this.uuid(userId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Delete('users/:userId/roles/:roleName')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_ROLES_MANAGE)
  async removeRole(
    @Param('userId') userId: string,
    @Param('roleName') roleName: string,
    @Req() request: RequestWithUser,
  ) {
    const parsed = AdminRoleNameSchema.safeParse(roleName);
    if (!parsed.success) {
      throw badRequest('INVALID_ROLE_NAME', 'Invalid role name.');
    }

    return AdminUserDetailResponseSchema.parse(
      await this.admin.removeRole(
        this.uuid(userId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch('users/:userId/status')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_STATUS_MANAGE)
  async updateStatus(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = AdminUpdateUserStatusRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_USER_STATUS_REQUEST', 'Invalid user status request.');
    }

    return AdminUserDetailResponseSchema.parse(
      await this.admin.updateStatus(
        this.uuid(userId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('users/:userId/sessions')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_VIEW)
  async listSessions(@Param('userId') userId: string) {
    return AdminSessionListResponseSchema.parse(await this.admin.listSessions(this.uuid(userId)));
  }

  @Delete('users/:userId/sessions/:sessionId')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_SESSIONS_REVOKE)
  async revokeSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithUser,
  ) {
    return AdminSessionListResponseSchema.parse(
      await this.admin.revokeSession(
        this.uuid(userId),
        this.uuid(sessionId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Delete('users/:userId/sessions')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_SESSIONS_REVOKE)
  async revokeAllSessions(@Param('userId') userId: string, @Req() request: RequestWithUser) {
    return AdminSessionListResponseSchema.parse(
      await this.admin.revokeAllSessions(
        this.uuid(userId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('roles')
  @RequirePermissions(ADMIN_PERMISSIONS.ROLES_VIEW)
  async listRoles() {
    return AdminRoleListResponseSchema.parse(await this.admin.listRoles());
  }

  @Get('permissions')
  @RequirePermissions(ADMIN_PERMISSIONS.PERMISSIONS_VIEW)
  async listPermissions() {
    return AdminPermissionListResponseSchema.parse(await this.admin.listPermissions());
  }

  @Get('users/:userId/effective-permissions')
  @RequirePermissions(ADMIN_PERMISSIONS.USERS_VIEW)
  async getEffectivePermissions(@Param('userId') userId: string) {
    return AdminEffectivePermissionsResponseSchema.parse(
      await this.admin.getEffectivePermissions(this.uuid(userId)),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid identifier.');
    }

    return parsed.data;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
