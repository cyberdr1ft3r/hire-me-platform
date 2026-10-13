import { Module } from '@nestjs/common';

import { MessagingAccessService } from './messaging-access.service.js';
import { MESSAGING_CLOCK, systemMessagingClock } from './messaging-clock.js';
import { MessagingController } from './messaging.controller.js';
import {
  DEFAULT_MESSAGING_RATE_LIMITS,
  MESSAGING_RATE_LIMITS,
  MessagingRateLimiter,
} from './messaging-rate-limiter.js';
import { MessagingService } from './messaging.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

/**
 * Issue #171 foundation + Issue #179 internal messaging API (D-087). No web UI,
 * realtime transport, notifications, or attachments here.
 */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MessagingController],
  providers: [
    MessagingAccessService,
    MessagingService,
    MessagingRateLimiter,
    { provide: MESSAGING_CLOCK, useValue: systemMessagingClock },
    { provide: MESSAGING_RATE_LIMITS, useValue: DEFAULT_MESSAGING_RATE_LIMITS },
  ],
  exports: [MessagingAccessService],
})
export class MessagingModule {}
