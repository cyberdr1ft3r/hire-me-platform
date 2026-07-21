import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthDemoController } from './auth-demo.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { AuthAuditService } from './audit.service.js';
import { PasswordService } from './password.service.js';
import { PermissionGuard } from './permission.guard.js';
import { PermissionsService } from './permissions.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { TokenService } from './token.service.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, AuthDemoController],
  providers: [
    AuthAuditService,
    AuthGuard,
    AuthService,
    PasswordService,
    PermissionGuard,
    PermissionsService,
    RateLimitService,
    TokenService,
  ],
  exports: [
    AuthGuard,
    AuthService,
    PasswordService,
    PermissionGuard,
    PermissionsService,
    TokenService,
  ],
})
export class AuthModule {}
