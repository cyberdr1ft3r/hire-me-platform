import { Module } from '@nestjs/common';

import { TaskAuditService } from './task-audit.service.js';
import { TASK_REMINDER_CLOCK, systemTaskReminderClock } from './task-reminder-clock.js';
import { TaskReminderDeliveryService } from './task-reminder-delivery.service.js';
import { NotificationsController, TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { PrismaModule } from '../persistence/prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule, DocumentsModule],
  controllers: [TasksController, NotificationsController],
  providers: [
    TaskAuditService,
    TasksService,
    TaskReminderDeliveryService,
    { provide: TASK_REMINDER_CLOCK, useValue: systemTaskReminderClock },
  ],
  exports: [TaskReminderDeliveryService],
})
export class TasksModule {}
