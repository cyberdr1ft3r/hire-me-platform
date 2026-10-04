import { Module } from '@nestjs/common';

import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
