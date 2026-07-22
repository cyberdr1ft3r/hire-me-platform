import { Module } from '@nestjs/common';

import { MissionAuditService } from './mission-audit.service.js';
import { MissionsController } from './missions.controller.js';
import { MissionsService } from './missions.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MissionsController],
  providers: [MissionAuditService, MissionsService],
})
export class MissionsModule {}
