import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { CandidateGoogle } from './candidate-google.js';
import { CandidateMail } from './candidate-mail.js';
import { CandidatePortalController } from './candidate-portal.controller.js';
import { CandidatePortalService } from './candidate-portal.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CandidatePortalController],
  providers: [CandidateGoogle, CandidateMail, CandidatePortalService],
  exports: [CandidatePortalService],
})
export class CandidatePortalModule {}
