import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { CandidateAuditService } from './candidate-audit.service.js';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CandidatesController],
  providers: [CandidateAuditService, CandidatesService],
})
export class CandidatesModule {}
