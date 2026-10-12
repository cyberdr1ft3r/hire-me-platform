import { Prisma } from '../persistence/prisma/generated-client.js';

/**
 * Bounded retry policy for automatic Task reminder delivery (R-036 / D-088).
 *
 * A transient delivery failure increments `attemptCount` and stamps `claimedAt`;
 * the reminder stays `PENDING` until its backoff elapses. The fifth transient
 * failure moves it to `FAILED`, which automation never selects again. Only the
 * manual reschedule path returns it to `PENDING` with the retry state reset.
 */
export const TASK_REMINDER_MAX_ATTEMPTS = 5;

/** Wait after failed attempt n (index n - 1), in minutes: 1, 5, 15, 60. */
export const TASK_REMINDER_BACKOFF_MINUTES = [1, 5, 15, 60] as const;

const MINUTE_MS = 60_000;

/**
 * Fixed, content-free failure codes. `failureReason` only ever holds one of these;
 * an error's own message never reaches the database or the logs.
 */
export const TASK_REMINDER_FAILURE_CODES = {
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  TX_CONFLICT: 'TX_CONFLICT',
  TIMEOUT: 'TIMEOUT',
  UNEXPECTED: 'UNEXPECTED',
} as const;

export type TaskReminderFailureCode =
  (typeof TASK_REMINDER_FAILURE_CODES)[keyof typeof TASK_REMINDER_FAILURE_CODES];

/** Backoff after `attemptCount` failed attempts, or null when none applies. */
export function taskReminderBackoffMs(attemptCount: number): number | null {
  if (attemptCount <= 0) {
    return 0;
  }
  const minutes = TASK_REMINDER_BACKOFF_MINUTES[attemptCount - 1];
  return minutes === undefined ? null : minutes * MINUTE_MS;
}

/**
 * Whether a `PENDING` reminder's retry backoff has elapsed at `now`. A reminder
 * with no failed attempts is always eligible; one at or beyond the attempt limit
 * never is (it should already be `FAILED`).
 */
export function isTaskReminderBackoffElapsed(
  attemptCount: number,
  claimedAt: Date | null,
  now: Date,
): boolean {
  const backoffMs = taskReminderBackoffMs(attemptCount);
  if (backoffMs === null) {
    return false;
  }
  if (backoffMs === 0) {
    return true;
  }
  if (claimedAt === null) {
    return false;
  }
  return claimedAt.getTime() <= now.getTime() - backoffMs;
}

/**
 * The same backoff rule as a Prisma filter, bound to `now` as a `DateTime`
 * parameter. Rows still in backoff are excluded in the query, so they never fill
 * a batch or hold back unrelated reminders.
 */
export function taskReminderBackoffElapsedWhere(now: Date): Prisma.TaskReminderWhereInput {
  return {
    OR: [
      { attemptCount: 0 },
      ...TASK_REMINDER_BACKOFF_MINUTES.map((minutes, index) => ({
        attemptCount: index + 1,
        claimedAt: { lte: new Date(now.getTime() - minutes * MINUTE_MS) },
      })),
    ],
  };
}

/** True when the failure that produced `attemptCount` should end automatic retry. */
export function isFinalTaskReminderAttempt(attemptCount: number): boolean {
  return attemptCount >= TASK_REMINDER_MAX_ATTEMPTS;
}

const unavailableCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const timeoutCodes = new Set(['P2024', 'P2028']);
const conflictSqlStates = new Set(['40001', '40P01', '55P03']);

/** Maps any thrown value to a fixed failure code without reading its message. */
export function classifyTaskReminderFailure(error: unknown): TaskReminderFailureCode {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (unavailableCodes.has(error.code)) {
      return TASK_REMINDER_FAILURE_CODES.DB_UNAVAILABLE;
    }
    if (timeoutCodes.has(error.code)) {
      return TASK_REMINDER_FAILURE_CODES.TIMEOUT;
    }
    if (error.code === 'P2034') {
      return TASK_REMINDER_FAILURE_CODES.TX_CONFLICT;
    }
    const sqlState = (error.meta as { code?: unknown } | undefined)?.code;
    if (typeof sqlState === 'string' && conflictSqlStates.has(sqlState)) {
      return TASK_REMINDER_FAILURE_CODES.TX_CONFLICT;
    }
    return TASK_REMINDER_FAILURE_CODES.UNEXPECTED;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return TASK_REMINDER_FAILURE_CODES.DB_UNAVAILABLE;
  }
  return TASK_REMINDER_FAILURE_CODES.UNEXPECTED;
}
