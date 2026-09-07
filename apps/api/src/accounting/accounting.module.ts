import { Module } from '@nestjs/common';

import { AccountingAuditService } from './accounting-audit.service.js';
import { AccountingController } from './accounting.controller.js';
import { AccountingService } from './accounting.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AccountingController],
  providers: [AccountingAuditService, AccountingService],
})
export class AccountingModule {}
