import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthGuard } from './auth.guard.js';
import { PermissionGuard } from './permission.guard.js';
import { RequirePermissions } from './permissions.decorator.js';

@Controller('auth/demo')
@UseGuards(AuthGuard, PermissionGuard)
export class AuthDemoController {
  @Get('permission-check')
  @RequirePermissions('records:view')
  checkPermission() {
    return { status: 'ok' };
  }
}
