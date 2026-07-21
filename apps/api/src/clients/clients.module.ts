import { Module } from '@nestjs/common';

import { ClientAuditService } from './client-audit.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ClientsController],
  providers: [ClientAuditService, ClientsService],
})
export class ClientsModule {}
