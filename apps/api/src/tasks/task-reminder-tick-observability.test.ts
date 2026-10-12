import { describe, expect, it } from 'vitest';

import type { TaskReminderTickResult } from './task-reminder-delivery.service.js';
import {
  formatTaskReminderTickAuditMetadata,
  isMaterialTaskReminderTick,
  type TaskReminderTickAuditMetadata,
} from './task-reminder-tick-observability.js';
import {
  eligibleDueReminderWhere,
  isCombinedTickBudgetExhausted,
  oldestDueAgeSeconds,
} from './task-reminder-eligible-reminder-where.js';

const baseTick = (overrides: Partial<TaskReminderTickResult> = {}): TaskReminderTickResult => ({
  trigger: 'scheduler',
  now: new Date('2025-03-01T12:00:00.000Z'),
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
  backlogDue: 0,
  oldestDueAgeSeconds: 0,
  budgetExhausted: false,
  ...overrides,
});

describe('isMaterialTaskReminderTick', () => {
  it('treats idle ticks with only skips as non-material', () => {
    expect(
      isMaterialTaskReminderTick(
        baseTick({ candidates: 3, skippedLocked: 2, skippedStale: 1, backlogDue: 3 }),
      ),
    ).toBe(false);
  });

  it('treats delivery and overdue outcomes as material', () => {
    expect(isMaterialTaskReminderTick(baseTick({ delivered: 1 }))).toBe(true);
    expect(isMaterialTaskReminderTick(baseTick({ overdueNotificationsCreated: 1 }))).toBe(true);
    expect(isMaterialTaskReminderTick(baseTick({ failedTransient: 1 }))).toBe(true);
  });

  it('treats an unrecorded delivery failure as material on its own', () => {
    expect(
      isMaterialTaskReminderTick(baseTick({ candidates: 1, failureNotRecorded: 1, backlogDue: 1 })),
    ).toBe(true);
  });

  it.each(['skippedLocked', 'skippedStale', 'overdueSkippedLocked'] as const)(
    'treats %s alone as non-material',
    (counter) => {
      expect(isMaterialTaskReminderTick(baseTick({ [counter]: 1 }))).toBe(false);
    },
  );
});

describe('audit metadata', () => {
  it('contains counts only', () => {
    const metadata = formatTaskReminderTickAuditMetadata(
      baseTick({ delivered: 2, backlogDue: 5, oldestDueAgeSeconds: 120, budgetExhausted: true }),
    );
    expect(metadata).not.toMatch(/@|task reminder is due|postgresql:\/\//i);
    const parsed = JSON.parse(metadata) as TaskReminderTickAuditMetadata;
    expect(parsed.delivered).toBe(2);
    expect(parsed.backlogDue).toBe(5);
    expect(parsed.budgetExhausted).toBe(true);
  });
});

describe('lag helpers', () => {
  it('computes oldest due age from the tick instant', () => {
    const now = new Date('2025-03-01T12:10:00.000Z');
    const remindAt = new Date('2025-03-01T12:00:00.000Z');
    expect(oldestDueAgeSeconds(now, remindAt)).toBe(600);
    expect(oldestDueAgeSeconds(now, null)).toBe(0);
  });

  it('flags budget exhaustion when backlog exceeds the page size', () => {
    expect(isCombinedTickBudgetExhausted(101, 100, 0, 100)).toBe(true);
    expect(isCombinedTickBudgetExhausted(10, 100, 150, 100)).toBe(true);
    expect(isCombinedTickBudgetExhausted(10, 100, 50, 100)).toBe(false);
  });

  it('builds the same eligibility filter used by delivery selection', () => {
    const now = new Date('2025-03-01T12:00:00.000Z');
    expect(eligibleDueReminderWhere(now)).toMatchObject({
      remindAt: { lte: now },
    });
  });
});
