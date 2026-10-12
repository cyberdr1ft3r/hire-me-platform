import { describe, expect, it, vi } from 'vitest';

import type { TaskReminderTickResult } from '../tasks/task-reminder-delivery.service.js';
import {
  createAbortableSleep,
  runDueRemindersLoop,
  runSchedulerTick,
} from './run-due-reminders-core.js';

const emptyResult = (): TaskReminderTickResult => ({
  trigger: 'scheduler',
  now: new Date('2025-01-01T00:00:00.000Z'),
  candidates: 0,
  delivered: 0,
  skippedLocked: 0,
  skippedStale: 0,
  canceledTaskClosed: 0,
  canceledRecipientIneligible: 0,
  failedTransient: 0,
  movedToFailed: 0,
  failureNotRecorded: 0,
  overdueCandidates: 0,
  overdueNotificationsCreated: 0,
  overdueSkippedLocked: 0,
  overdueFailed: 0,
});

describe('runSchedulerTick', () => {
  it('calls the delivery engine with a null scheduler actor', async () => {
    const runDueTick = vi.fn(() => Promise.resolve(emptyResult()));
    const lines: string[] = [];
    await runSchedulerTick({
      delivery: { runDueTick } as never,
      config: { mode: 'once', limit: 10, overdueLimit: 20, intervalSeconds: null },
      writeLine: (line) => lines.push(line),
      createRunId: () => 'run-test',
    });
    expect(runDueTick).toHaveBeenCalledWith({
      limit: 10,
      overdueLimit: 20,
      trigger: 'scheduler',
      actorUserId: null,
    });
    expect(lines).toHaveLength(1);
    const summary = JSON.parse(lines[0]!) as { event: string; runId: string; trigger: string };
    expect(summary.event).toBe('task_reminders.tick');
    expect(summary.runId).toBe('run-test');
    expect(summary.trigger).toBe('scheduler');
    expect(lines[0]).not.toMatch(/@|password|postgresql:\/\//i);
  });
});

describe('runDueRemindersLoop', () => {
  it('does not overlap ticks and stops before the next tick when aborted', async () => {
    const runDueTick = vi.fn(() => Promise.resolve(emptyResult()));
    let inFlight = false;
    runDueTick.mockImplementation(() => {
      expect(inFlight).toBe(false);
      inFlight = true;
      inFlight = false;
      return Promise.resolve(emptyResult());
    });
    let aborted = false;
    const sleep = vi.fn(() => {
      aborted = true;
      return Promise.resolve();
    });
    const lines: string[] = [];
    await runDueRemindersLoop({
      delivery: { runDueTick } as never,
      config: { mode: 'loop', limit: 1, overdueLimit: 1, intervalSeconds: 60 },
      sleep,
      shouldAbort: () => aborted,
      writeLine: (line) => lines.push(line),
    });
    expect(runDueTick).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);
  });

  it('ends inter-tick wait immediately when shutdown aborts the sleep signal', async () => {
    vi.useFakeTimers();
    try {
      const runDueTick = vi.fn(() => Promise.resolve(emptyResult()));
      const controller = new AbortController();
      let sleepEntered = false;
      const baseSleep = createAbortableSleep();
      const sleep = async (milliseconds: number, signal?: AbortSignal): Promise<void> => {
        sleepEntered = true;
        await baseSleep(milliseconds, signal);
      };

      const loopPromise = runDueRemindersLoop({
        delivery: { runDueTick } as never,
        config: { mode: 'loop', limit: 1, overdueLimit: 1, intervalSeconds: 3600 },
        sleep,
        abortSignal: controller.signal,
        shouldAbort: () => controller.signal.aborted,
      });

      await vi.waitUntil(() => sleepEntered);
      expect(runDueTick).toHaveBeenCalledTimes(1);

      controller.abort();
      await loopPromise;

      expect(runDueTick).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(runDueTick).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
