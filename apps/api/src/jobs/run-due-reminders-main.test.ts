import { describe, expect, it, vi } from 'vitest';

import { TaskReminderDeliveryService } from '../tasks/task-reminder-delivery.service.js';
import { runDueRemindersMain, type NestApplicationContextLike } from './run-due-reminders-main.js';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://runner:runner@127.0.0.1:5432/runner_test',
  NODE_ENV: 'test',
} as const;

describe('runDueRemindersMain', () => {
  it('closes the application context and exits non-zero when a tick throws', async () => {
    const sensitiveMessage = 'secret-database-connection-leak-xyzzy';
    const runDueTick = vi.fn(() => Promise.reject(new Error(sensitiveMessage)));
    const close = vi.fn(() => Promise.resolve());

    const { exitCode, stdout } = await runDueRemindersMain({
      argv: ['--once'],
      env: { ...VALID_ENV },
      createApplicationContext: (): Promise<NestApplicationContextLike> =>
        Promise.resolve({
          get: <T>(token: unknown): T => {
            expect(token).toBe(TaskReminderDeliveryService);
            return { runDueTick } as T;
          },
          close,
        }),
    });

    expect(exitCode).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(stdout).toContain('WORKER_TICK_FAILED');
    expect(stdout).not.toContain(sensitiveMessage);
    expect(stdout).not.toMatch(/error\.message/i);
  });
});
