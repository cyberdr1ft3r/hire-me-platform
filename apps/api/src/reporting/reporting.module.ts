import { Module } from '@nestjs/common';

import { ReportingAuditService } from './reporting-audit.service.js';
import { ReportingController } from './reporting.controller.js';
import { ReportingService } from './reporting.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ReportingController],
  providers: [ReportingAuditService, ReportingService],
})
export class ReportingModule {}
