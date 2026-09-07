import { Module } from '@nestjs/common';

import { TrainingAuditService } from './training-audit.service.js';
import { TrainingController } from './training.controller.js';
import { TrainingService } from './training.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TrainingController],
  providers: [TrainingAuditService, TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
