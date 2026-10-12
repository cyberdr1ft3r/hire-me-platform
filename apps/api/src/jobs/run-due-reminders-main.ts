import { loadWorkerEnvironment, WorkerEnvironmentError } from '../config/worker-environment.js';
import { runDueRemindersLoop, runSchedulerTick } from './run-due-reminders-core.js';
import { parseRunDueRemindersArgs, RunDueRemindersArgsError } from './run-due-reminders-args.js';
import { formatTaskReminderFatalLine } from './run-due-reminders-summary.js';
import { TaskReminderDeliveryService } from '../tasks/task-reminder-delivery.service.js';

export type NestApplicationContextLike = {
  get<T>(token: unknown): T;
  close(): Promise<void>;
};

export type RunDueRemindersMainDeps = {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  createApplicationContext: () => Promise<NestApplicationContextLike>;
  writeStdout?: (chunk: string) => void;
  /** Registers SIGTERM/SIGINT handlers; defaults to `process.on`. */
  registerShutdownHandlers?: (handler: () => void) => void;
};

export type RunDueRemindersMainResult = {
  exitCode: number;
  stdout: string;
};

function appendStdout(writeStdout: (chunk: string) => void, chunk: string): void {
  writeStdout(chunk.endsWith('\n') ? chunk : `${chunk}\n`);
}

/**
 * Runs the reminder worker lifecycle and returns an exit code after closing the app context.
 * Fatal paths emit fixed safe JSON only; raw error messages are never written to stdout.
 */
export async function runDueRemindersMain(
  deps: RunDueRemindersMainDeps,
): Promise<RunDueRemindersMainResult> {
  const chunks: string[] = [];
  const writeStdout = deps.writeStdout ?? ((chunk) => chunks.push(chunk));
  let exitCode = 0;

  const emitFatal = (code: string): void => {
    appendStdout(writeStdout, formatTaskReminderFatalLine(code));
    exitCode = 1;
  };

  let config;
  try {
    loadWorkerEnvironment(deps.env ?? process.env);
    config = parseRunDueRemindersArgs(deps.argv);
  } catch (error: unknown) {
    if (error instanceof WorkerEnvironmentError || error instanceof RunDueRemindersArgsError) {
      emitFatal(error.code);
    } else {
      emitFatal('WORKER_BOOTSTRAP_FAILED');
    }
    return { exitCode, stdout: chunks.join('') };
  }

  let app: NestApplicationContextLike | undefined;
  try {
    app = await deps.createApplicationContext();
  } catch {
    emitFatal('WORKER_BOOTSTRAP_FAILED');
    return { exitCode, stdout: chunks.join('') };
  }

  const shutdownController = new AbortController();
  const requestShutdown = (): void => {
    shutdownController.abort();
  };

  const register =
    deps.registerShutdownHandlers ??
    ((handler) => {
      process.on('SIGINT', handler);
      process.on('SIGTERM', handler);
    });
  register(requestShutdown);

  try {
    const delivery = app.get<TaskReminderDeliveryService>(TaskReminderDeliveryService);
    if (config.mode === 'once') {
      await runSchedulerTick({ delivery, config });
    } else {
      await runDueRemindersLoop({
        delivery,
        config,
        abortSignal: shutdownController.signal,
        shouldAbort: () => shutdownController.signal.aborted,
      });
    }
  } catch {
    emitFatal('WORKER_TICK_FAILED');
  } finally {
    await app.close();
  }

  return { exitCode, stdout: chunks.join('') };
}
