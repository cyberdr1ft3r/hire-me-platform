import type { PrismaClient } from '../persistence/prisma/generated-client.js';
import type { TaskReminderTickResult } from './task-reminder-delivery.service.js';

/** Count-only audit payload; must never contain task/user free text. */
export type TaskReminderTickAuditMetadata = {
  trigger: TaskReminderTickResult['trigger'];
  candidates: number;
  delivered: number;
  skippedLocked: number;
  skippedStale: number;
  canceledTaskClosed: number;
  canceledRecipientIneligible: number;
  failedTransient: number;
  movedToFailed: number;
  failureNotRecorded: number;
  overdueCandidates: number;
  overdueNotificationsCreated: number;
  overdueSkippedLocked: number;
  overdueFailed: number;
  backlogDue: number;
  oldestDueAgeSeconds: number;
  budgetExhausted: boolean;
};

/**
 * A tick is material when it changed reminder, notification, or overdue state,
 * or when a delivery failure could not be recorded (the reminder stays PENDING
 * without its attempt, so the tick row is the only persistent trace).
 * Pure skips and idle scans write no AuditLog row (D-088 / R-036 PR C).
 */
export function isMaterialTaskReminderTick(result: TaskReminderTickResult): boolean {
  return (
    result.delivered > 0 ||
    result.canceledTaskClosed > 0 ||
    result.canceledRecipientIneligible > 0 ||
    result.failedTransient > 0 ||
    result.movedToFailed > 0 ||
    result.failureNotRecorded > 0 ||
    result.overdueNotificationsCreated > 0 ||
    result.overdueFailed > 0
  );
}

export function buildTaskReminderTickAuditMetadata(
  result: TaskReminderTickResult,
): TaskReminderTickAuditMetadata {
  return {
    trigger: result.trigger,
    candidates: result.candidates,
    delivered: result.delivered,
    skippedLocked: result.skippedLocked,
    skippedStale: result.skippedStale,
    canceledTaskClosed: result.canceledTaskClosed,
    canceledRecipientIneligible: result.canceledRecipientIneligible,
    failedTransient: result.failedTransient,
    movedToFailed: result.movedToFailed,
    failureNotRecorded: result.failureNotRecorded,
    overdueCandidates: result.overdueCandidates,
    overdueNotificationsCreated: result.overdueNotificationsCreated,
    overdueSkippedLocked: result.overdueSkippedLocked,
    overdueFailed: result.overdueFailed,
    backlogDue: result.backlogDue,
    oldestDueAgeSeconds: result.oldestDueAgeSeconds,
    budgetExhausted: result.budgetExhausted,
  };
}

export function formatTaskReminderTickAuditMetadata(result: TaskReminderTickResult): string {
  return JSON.stringify(buildTaskReminderTickAuditMetadata(result));
}

export type TaskReminderTickAuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordTaskReminderTickAuditIfMaterial(
  prisma: PrismaClient,
  input: {
    actorUserId: string | null;
    result: TaskReminderTickResult;
    auditContext?: TaskReminderTickAuditContext;
  },
): Promise<void> {
  if (!isMaterialTaskReminderTick(input.result)) {
    return;
  }
  await prisma.auditLog.create({
    data: {
      action: 'tasks.reminders_processed',
      entityType: 'TaskReminder',
      actorUserId: input.actorUserId,
      ipAddress: input.auditContext?.ipAddress ?? null,
      userAgent: input.auditContext?.userAgent ?? null,
      metadataSummary: formatTaskReminderTickAuditMetadata(input.result),
    },
  });
}
