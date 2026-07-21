import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator.js';
import type { RequestWithUser } from './auth.types.js';
import { PermissionsService } from './permissions.service.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly permissions: PermissionsService;
  private readonly reflector: Reflector;

  constructor(
    @Inject(PermissionsService) permissions: PermissionsService,
    @Inject(Reflector) reflector: Reflector,
  ) {
    this.permissions = permissions;
    this.reflector = reflector;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_REQUIRED',
          message: 'Permission metadata is required.',
        },
      });
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Permission denied.',
        },
      });
    }

    const effective = new Set(await this.permissions.getEffectivePermissionCodes(request.user.id));
    const allowed = required.every((permission) => effective.has(permission));

    if (!allowed) {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Permission denied.',
        },
      });
    }

    return true;
  }
}
