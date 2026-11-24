import { Module } from '@nestjs/common';

import { ClientPortalAuth, ClientPortalMail } from './client-portal-auth.service.js';
import { ClientPortalController, ClientPortalStaffController } from './client-portal.controller.js';
import { ClientPortalWorkflow } from './client-portal-workflow.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { MissionsModule } from '../missions/missions.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, MissionsModule, PrismaModule],
  controllers: [ClientPortalController, ClientPortalStaffController],
  providers: [ClientPortalAuth, ClientPortalMail, ClientPortalWorkflow],
})
export class ClientPortalModule {}
