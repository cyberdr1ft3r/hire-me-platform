import { Module } from '@nestjs/common';

import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule, MeetingsModule],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
