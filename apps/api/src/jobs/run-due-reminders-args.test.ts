import { describe, expect, it } from 'vitest';

import {
  parseRunDueRemindersArgs,
  RunDueRemindersArgsError,
  TASK_REMINDER_RUNNER_MIN_INTERVAL_SECONDS,
} from './run-due-reminders-args.js';

describe('parseRunDueRemindersArgs', () => {
  it('defaults to one-shot with standard limits', () => {
    expect(parseRunDueRemindersArgs([])).toEqual({
      mode: 'once',
      limit: 25,
      overdueLimit: 100,
      intervalSeconds: null,
    });
  });

  it('accepts explicit once and bounded limits', () => {
    expect(parseRunDueRemindersArgs(['--once', '--limit=50', '--overdue-limit=10'])).toEqual({
      mode: 'once',
      limit: 50,
      overdueLimit: 10,
      intervalSeconds: null,
    });
  });

  it('requires interval for loop mode', () => {
    expect(() => parseRunDueRemindersArgs(['--loop'])).toThrow(RunDueRemindersArgsError);
  });

  it('rejects interval below the safe minimum', () => {
    expect(() =>
      parseRunDueRemindersArgs([
        '--loop',
        `--interval-seconds=${TASK_REMINDER_RUNNER_MIN_INTERVAL_SECONDS - 1}`,
      ]),
    ).toThrow(RunDueRemindersArgsError);
  });

  it('rejects unknown flags', () => {
    expect(() => parseRunDueRemindersArgs(['--unknown'])).toThrow(RunDueRemindersArgsError);
  });

  it('rejects limits outside 1..100', () => {
    expect(() => parseRunDueRemindersArgs(['--limit=0'])).toThrow(RunDueRemindersArgsError);
    expect(() => parseRunDueRemindersArgs(['--limit=101'])).toThrow(RunDueRemindersArgsError);
  });
});
