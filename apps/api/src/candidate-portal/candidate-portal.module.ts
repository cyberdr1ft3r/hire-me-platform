import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CandidateClamav } from './candidate-clamav.js';
import {
  CandidateWorkspaceController,
  CandidateWorkspaceGuard,
} from './candidate-workspace.controller.js';
import { CandidateWorkspace } from './candidate-workspace.service.js';
import { CandidateGoogle } from './candidate-google.js';
import { CandidateMail } from './candidate-mail.js';
import { CandidatePortalController } from './candidate-portal.controller.js';
import { CandidatePortalService } from './candidate-portal.service.js';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  controllers: [CandidatePortalController, CandidateWorkspaceController],
  providers: [
    CandidateGoogle,
    CandidateMail,
    CandidatePortalService,
    CandidateWorkspace,
    CandidateWorkspaceGuard,
    CandidateClamav,
  ],
  exports: [CandidatePortalService, CandidateWorkspace, CandidateClamav],
})
export class CandidatePortalModule {}
