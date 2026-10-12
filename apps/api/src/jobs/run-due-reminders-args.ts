import {
  TASK_OVERDUE_TICK_DEFAULT_LIMIT,
  TASK_REMINDER_TICK_MAX_LIMIT,
} from '../tasks/task-reminder-delivery.service.js';

export const TASK_REMINDER_RUNNER_DEFAULT_LIMIT = 25;
export const TASK_REMINDER_RUNNER_MIN_INTERVAL_SECONDS = 5;

export type RunDueRemindersMode = 'once' | 'loop';

export type RunDueRemindersConfig = {
  mode: RunDueRemindersMode;
  limit: number;
  overdueLimit: number;
  intervalSeconds: number | null;
};

export class RunDueRemindersArgsError extends Error {
  readonly code = 'RUNNER_ARGS_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RunDueRemindersArgsError';
  }
}

function parsePositiveInt(name: string, raw: string, min: number, max: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || `${value}` !== raw.trim()) {
    throw new RunDueRemindersArgsError(`${name} must be an integer between ${min} and ${max}.`);
  }
  if (value < min || value > max) {
    throw new RunDueRemindersArgsError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Parses CLI flags for the reminder runner. Unknown flags are rejected.
 * Default mode is one-shot (`once`); `--loop` requires `--interval-seconds`.
 */
export function parseRunDueRemindersArgs(argv: readonly string[]): RunDueRemindersConfig {
  let mode: RunDueRemindersMode = 'once';
  let limit = TASK_REMINDER_RUNNER_DEFAULT_LIMIT;
  let overdueLimit = TASK_OVERDUE_TICK_DEFAULT_LIMIT;
  let intervalSeconds: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === '--once') {
      mode = 'once';
      continue;
    }
    if (token === '--loop') {
      mode = 'loop';
      continue;
    }
    if (token.startsWith('--limit=')) {
      limit = parsePositiveInt(
        '--limit',
        token.slice('--limit='.length),
        1,
        TASK_REMINDER_TICK_MAX_LIMIT,
      );
      continue;
    }
    if (token === '--limit') {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new RunDueRemindersArgsError('--limit requires a value.');
      }
      limit = parsePositiveInt('--limit', next, 1, TASK_REMINDER_TICK_MAX_LIMIT);
      index += 1;
      continue;
    }
    if (token.startsWith('--overdue-limit=')) {
      overdueLimit = parsePositiveInt(
        '--overdue-limit',
        token.slice('--overdue-limit='.length),
        1,
        TASK_REMINDER_TICK_MAX_LIMIT,
      );
      continue;
    }
    if (token === '--overdue-limit') {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new RunDueRemindersArgsError('--overdue-limit requires a value.');
      }
      overdueLimit = parsePositiveInt('--overdue-limit', next, 1, TASK_REMINDER_TICK_MAX_LIMIT);
      index += 1;
      continue;
    }
    if (token.startsWith('--interval-seconds=')) {
      intervalSeconds = parsePositiveInt(
        '--interval-seconds',
        token.slice('--interval-seconds='.length),
        TASK_REMINDER_RUNNER_MIN_INTERVAL_SECONDS,
        86_400,
      );
      continue;
    }
    if (token === '--interval-seconds') {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new RunDueRemindersArgsError('--interval-seconds requires a value.');
      }
      intervalSeconds = parsePositiveInt(
        '--interval-seconds',
        next,
        TASK_REMINDER_RUNNER_MIN_INTERVAL_SECONDS,
        86_400,
      );
      index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      throw new RunDueRemindersArgsError(`Unknown argument: ${token}`);
    }
    throw new RunDueRemindersArgsError(`Unexpected positional argument: ${token}`);
  }

  if (mode === 'loop' && intervalSeconds === null) {
    throw new RunDueRemindersArgsError(
      '--loop requires --interval-seconds with a value of at least 5.',
    );
  }
  if (mode === 'once' && intervalSeconds !== null) {
    throw new RunDueRemindersArgsError('--interval-seconds is only valid with --loop.');
  }

  return { mode, limit, overdueLimit, intervalSeconds };
}
