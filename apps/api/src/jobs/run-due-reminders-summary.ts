import type { TaskReminderTickResult } from '../tasks/task-reminder-delivery.service.js';

export type TaskReminderTickSummary = {
  event: 'task_reminders.tick';
  runId: string;
  trigger: 'scheduler';
  startedAt: string;
  completedAt: string;
  durationMs: number;
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
};

export function buildTaskReminderTickSummary(input: {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  result: TaskReminderTickResult;
}): TaskReminderTickSummary {
  const { runId, startedAt, completedAt, result } = input;
  if (result.trigger !== 'scheduler') {
    throw new Error('Runner summaries are only defined for scheduler ticks.');
  }
  return {
    event: 'task_reminders.tick',
    runId,
    trigger: 'scheduler',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
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
  };
}

/** One JSON line per tick; safe for production logs (counts and ids only). */
export function formatTaskReminderTickSummaryLine(summary: TaskReminderTickSummary): string {
  return JSON.stringify(summary);
}

export type TaskReminderFatalSummary = {
  event: 'task_reminders.fatal';
  code: string;
};

export function formatTaskReminderFatalLine(code: string): string {
  return JSON.stringify({ event: 'task_reminders.fatal', code } satisfies TaskReminderFatalSummary);
}

/** Rejects summaries that accidentally embed sensitive free text. */
const FORBIDDEN_SUMMARY_PATTERNS =
  /task reminder is due|@|password|Bearer |postgresql:\/\/|error\.message/i;

export function assertSafeSummaryJson(line: string): void {
  if (FORBIDDEN_SUMMARY_PATTERNS.test(line)) {
    throw new Error('Summary line matched a forbidden sensitive pattern.');
  }
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Summary must be a JSON object.');
  }
  const record = parsed as Record<string, unknown>;
  if (record.event !== 'task_reminders.tick' && record.event !== 'task_reminders.fatal') {
    throw new Error('Unexpected summary event.');
  }
}
