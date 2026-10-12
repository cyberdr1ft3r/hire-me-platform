import { Module } from '@nestjs/common';

import { MessagingAccessService } from './messaging-access.service.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

/**
 * Issue #171 / D-087 messaging foundation. No controllers yet: routes, the
 * participant picker, and send/read/edit/withdraw arrive in PR B.
 */
@Module({
  imports: [PrismaModule],
  providers: [MessagingAccessService],
  exports: [MessagingAccessService],
})
export class MessagingModule {}
