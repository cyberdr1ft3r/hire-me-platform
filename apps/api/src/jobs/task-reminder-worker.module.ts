import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma/prisma.module.js';
import { TASK_REMINDER_CLOCK, systemTaskReminderClock } from '../tasks/task-reminder-clock.js';
import { TaskReminderDeliveryService } from '../tasks/task-reminder-delivery.service.js';

/** Minimum Nest graph for {@link TaskReminderDeliveryService.runDueTick}. */
@Module({
  imports: [PrismaModule],
  providers: [
    TaskReminderDeliveryService,
    { provide: TASK_REMINDER_CLOCK, useValue: systemTaskReminderClock },
  ],
  exports: [TaskReminderDeliveryService],
})
export class TaskReminderWorkerModule {}
