import { TaskReminderStatus } from '../persistence/prisma/generated-client.js';
import { taskReminderBackoffElapsedWhere } from './task-reminder-retry.js';

/** Eligible automated reminder rows at the injected tick instant `now`. */
export function eligibleDueReminderWhere(now: Date) {
  return {
    status: TaskReminderStatus.PENDING,
    archivedAt: null,
    remindAt: { lte: now },
    ...taskReminderBackoffElapsedWhere(now),
  } as const;
}

export function oldestDueAgeSeconds(now: Date, oldestRemindAt: Date | null | undefined): number {
  if (!oldestRemindAt) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - oldestRemindAt.getTime()) / 1000));
}

export function isReminderBudgetExhausted(backlogDue: number, limit: number): boolean {
  return backlogDue > limit;
}

export function isCombinedTickBudgetExhausted(
  backlogDue: number,
  reminderLimit: number,
  overdueBacklog: number,
  overdueLimit: number,
): boolean {
  return (
    isReminderBudgetExhausted(backlogDue, reminderLimit) ||
    isReminderBudgetExhausted(overdueBacklog, overdueLimit)
  );
}
