import { describe, expect, it } from 'vitest';

import { REQUIRED_PERMISSIONS_KEY } from '../auth/permissions.decorator.js';
import { Prisma } from '../persistence/prisma/generated-client.js';
import { TaskReminderDeliveryService } from './task-reminder-delivery.service.js';
import {
  classifyTaskReminderFailure,
  isFinalTaskReminderAttempt,
  isTaskReminderBackoffElapsed,
  TASK_REMINDER_BACKOFF_MINUTES,
  TASK_REMINDER_MAX_ATTEMPTS,
  taskReminderBackoffElapsedWhere,
} from './task-reminder-retry.js';
import { TasksController } from './tasks.controller.js';

const now = new Date('2025-01-15T12:00:00.000Z');
const minutesBefore = (minutes: number, extraMs = 0) =>
  new Date(now.getTime() - minutes * 60_000 + extraMs);

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('synthetic', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('Task reminder retry policy (R-036 / D-088)', () => {
  it('uses five attempts with 1, 5, 15, and 60 minute backoff', () => {
    expect(TASK_REMINDER_MAX_ATTEMPTS).toBe(5);
    expect([...TASK_REMINDER_BACKOFF_MINUTES]).toEqual([1, 5, 15, 60]);
    expect(isFinalTaskReminderAttempt(4)).toBe(false);
    expect(isFinalTaskReminderAttempt(5)).toBe(true);
  });

  it('treats a reminder with no failed attempts as eligible regardless of claimedAt', () => {
    expect(isTaskReminderBackoffElapsed(0, null, now)).toBe(true);
    expect(isTaskReminderBackoffElapsed(0, now, now)).toBe(true);
  });

  it.each([
    [1, 1],
    [2, 5],
    [3, 15],
    [4, 60],
  ])('after failed attempt %i waits exactly %i minutes', (attemptCount, minutes) => {
    expect(isTaskReminderBackoffElapsed(attemptCount, minutesBefore(minutes, 1), now)).toBe(false);
    expect(isTaskReminderBackoffElapsed(attemptCount, minutesBefore(minutes), now)).toBe(true);
  });

  it('never re-selects a reminder at the attempt limit or without a claim time', () => {
    expect(isTaskReminderBackoffElapsed(5, minutesBefore(10_000), now)).toBe(false);
    expect(isTaskReminderBackoffElapsed(1, null, now)).toBe(false);
  });

  it('builds the same backoff rule as a Prisma filter bound to the tick instant', () => {
    expect(taskReminderBackoffElapsedWhere(now)).toEqual({
      OR: [
        { attemptCount: 0 },
        { attemptCount: 1, claimedAt: { lte: minutesBefore(1) } },
        { attemptCount: 2, claimedAt: { lte: minutesBefore(5) } },
        { attemptCount: 3, claimedAt: { lte: minutesBefore(15) } },
        { attemptCount: 4, claimedAt: { lte: minutesBefore(60) } },
      ],
    });
  });

  it('classifies failures into fixed codes without reading the error message', () => {
    expect(classifyTaskReminderFailure(knownError('P1001'))).toBe('DB_UNAVAILABLE');
    expect(classifyTaskReminderFailure(knownError('P2028'))).toBe('TIMEOUT');
    expect(classifyTaskReminderFailure(knownError('P2024'))).toBe('TIMEOUT');
    expect(classifyTaskReminderFailure(knownError('P2034'))).toBe('TX_CONFLICT');
    expect(classifyTaskReminderFailure(knownError('P2010', { code: '40P01' }))).toBe('TX_CONFLICT');
    expect(classifyTaskReminderFailure(knownError('P2002'))).toBe('UNEXPECTED');
    const secret = new Error('Candidate jane@example.test salary 90000');
    expect(classifyTaskReminderFailure(secret)).toBe('UNEXPECTED');
  });
});

describe('Task reminder tick actor and endpoint gate', () => {
  const service = new TaskReminderDeliveryService({} as never, { now: () => now });

  it('requires the manager actor for manual ticks and the null system actor for scheduler ticks', async () => {
    await expect(
      service.runDueTick({ now, limit: 1, trigger: 'manual', actorUserId: null }),
    ).rejects.toThrow('manual reminder tick requires');
    await expect(
      service.runDueTick({
        now,
        limit: 1,
        trigger: 'scheduler',
        actorUserId: '00000000-0000-0000-0000-000000000001',
      }),
    ).rejects.toThrow('system actor');
  });

  it('refuses unbounded batches', async () => {
    await expect(
      service.runDueTick({ now, limit: 101, trigger: 'scheduler', actorUserId: null }),
    ).rejects.toThrow(RangeError);
    await expect(
      service.runDueTick({ now, limit: 0, trigger: 'scheduler', actorUserId: null }),
    ).rejects.toThrow(RangeError);
  });

  it('declares both reminder management and all-task visibility on the manual endpoint', () => {
    const handler = Object.getOwnPropertyDescriptor(
      TasksController.prototype,
      'processDueReminders',
    )?.value as object;
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      'tasks:reminders:manage',
      'tasks:view_all',
    ]);
  });
});
