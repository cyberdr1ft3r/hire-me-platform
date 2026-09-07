import { Module } from '@nestjs/common';

import { CommercialAuditService } from './commercial-audit.service.js';
import { CommercialController } from './commercial.controller.js';
import { CommercialService } from './commercial.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CommercialController],
  providers: [CommercialAuditService, CommercialService],
})
export class CommercialModule {}
