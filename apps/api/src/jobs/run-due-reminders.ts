import { NestFactory } from '@nestjs/core';

import { loadWorkerEnvironment, WorkerEnvironmentError } from '../config/worker-environment.js';
import { runDueRemindersLoop, runSchedulerTick } from './run-due-reminders-core.js';
import { parseRunDueRemindersArgs, RunDueRemindersArgsError } from './run-due-reminders-args.js';
import { formatTaskReminderFatalLine } from './run-due-reminders-summary.js';
import { TaskReminderWorkerModule } from './task-reminder-worker.module.js';
import { TaskReminderDeliveryService } from '../tasks/task-reminder-delivery.service.js';

function emitFatal(code: string): never {
  const line = formatTaskReminderFatalLine(code);
  process.stdout.write(`${line}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let config;
  try {
    loadWorkerEnvironment();
    config = parseRunDueRemindersArgs(process.argv.slice(2));
  } catch (error: unknown) {
    if (error instanceof WorkerEnvironmentError || error instanceof RunDueRemindersArgsError) {
      emitFatal(error.code);
    }
    emitFatal('WORKER_BOOTSTRAP_FAILED');
  }

  let app;
  try {
    app = await NestFactory.createApplicationContext(TaskReminderWorkerModule, {
      logger: false,
    });
  } catch {
    emitFatal('WORKER_BOOTSTRAP_FAILED');
  }

  const delivery = app.get(TaskReminderDeliveryService);
  let shuttingDown = false;

  const requestShutdown = (): void => {
    shuttingDown = true;
  };

  process.on('SIGINT', requestShutdown);
  process.on('SIGTERM', requestShutdown);

  try {
    if (config.mode === 'once') {
      await runSchedulerTick({ delivery, config });
    } else {
      await runDueRemindersLoop({
        delivery,
        config,
        shouldAbort: () => shuttingDown,
      });
    }
  } catch {
    emitFatal('WORKER_TICK_FAILED');
  } finally {
    await app.close();
  }

  process.exit(0);
}

main().catch(() => {
  emitFatal('WORKER_BOOTSTRAP_FAILED');
});
