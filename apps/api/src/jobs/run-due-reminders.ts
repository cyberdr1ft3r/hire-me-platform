import { NestFactory } from '@nestjs/core';

import { runDueRemindersMain } from './run-due-reminders-main.js';
import { formatTaskReminderFatalLine } from './run-due-reminders-summary.js';
import { TaskReminderWorkerModule } from './task-reminder-worker.module.js';

async function main(): Promise<void> {
  const { exitCode } = await runDueRemindersMain({
    argv: process.argv.slice(2),
    createApplicationContext: () =>
      NestFactory.createApplicationContext(TaskReminderWorkerModule, {
        logger: false,
      }),
  });
  process.exitCode = exitCode;
}

main().catch(() => {
  process.stdout.write(`${formatTaskReminderFatalLine('WORKER_BOOTSTRAP_FAILED')}\n`);
  process.exitCode = 1;
});
