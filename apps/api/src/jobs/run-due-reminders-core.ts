import { randomUUID } from 'node:crypto';

import type { TaskReminderDeliveryService } from '../tasks/task-reminder-delivery.service.js';
import {
  assertSafeSummaryJson,
  buildTaskReminderTickSummary,
  formatTaskReminderTickSummaryLine,
} from './run-due-reminders-summary.js';
import type { RunDueRemindersConfig } from './run-due-reminders-args.js';
import { defaultSleep, type SleepFn } from './run-due-reminders-sleep.js';

export type { SleepFn } from './run-due-reminders-sleep.js';
export { createAbortableSleep, defaultSleep } from './run-due-reminders-sleep.js';

export type RunDueRemindersCoreDeps = {
  delivery: TaskReminderDeliveryService;
  config: RunDueRemindersConfig;
  sleep?: SleepFn;
  writeLine?: (line: string) => void;
  createRunId?: () => string;
  shouldAbort?: () => boolean;
  abortSignal?: AbortSignal;
};

/**
 * Runs one scheduler tick and writes one safe JSON summary line.
 * Per-reminder failures do not throw; bootstrap failures propagate to the caller.
 */
export async function runSchedulerTick(deps: RunDueRemindersCoreDeps): Promise<void> {
  const writeLine = deps.writeLine ?? ((line) => process.stdout.write(`${line}\n`));
  const createRunId = deps.createRunId ?? randomUUID;
  const startedAt = new Date();
  const runId = createRunId();
  const result = await deps.delivery.runDueTick({
    limit: deps.config.limit,
    overdueLimit: deps.config.overdueLimit,
    trigger: 'scheduler',
    actorUserId: null,
  });
  const completedAt = new Date();
  const summary = buildTaskReminderTickSummary({ runId, startedAt, completedAt, result });
  const line = formatTaskReminderTickSummaryLine(summary);
  assertSafeSummaryJson(line);
  writeLine(line);
}

/**
 * Loop mode: runs ticks sequentially with a gap after each completion.
 * Never starts a new tick while one is in flight. Stops when `shouldAbort` is true
 * before starting the next tick (not mid-tick).
 */
export async function runDueRemindersLoop(deps: RunDueRemindersCoreDeps): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  const intervalMs = (deps.config.intervalSeconds ?? 0) * 1000;
  if (intervalMs <= 0) {
    throw new Error('Loop mode requires a positive interval.');
  }
  const shouldAbort = deps.shouldAbort ?? (() => false);

  while (!shouldAbort()) {
    await runSchedulerTick(deps);
    if (shouldAbort()) {
      break;
    }
    await sleep(intervalMs, deps.abortSignal);
  }
}
