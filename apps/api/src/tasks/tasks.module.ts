import { Module } from '@nestjs/common';

import { TaskAuditService } from './task-audit.service.js';
import { NotificationsController, TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TasksController, NotificationsController],
  providers: [TaskAuditService, TasksService],
})
export class TasksModule {}
