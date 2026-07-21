import { Module } from '@nestjs/common';

import { AdminAuditService } from './admin-audit.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminController],
  providers: [AdminAuditService, AdminService],
})
export class AdminModule {}
