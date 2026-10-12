import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { API_ROOT } from './disposable-database.js';

const requireFromApi = createRequire(join(API_ROOT, 'package.json'));
export const PRISMA_CLI = requireFromApi.resolve('prisma/build/index.js');
export const TSX_CLI = requireFromApi.resolve('tsx/cli');
const vitestCli = requireFromApi.resolve('vitest/vitest.mjs');
export const PRISMA_SCHEMA = join(API_ROOT, 'prisma/schema.prisma');

/**
 * Runs a Node CLI with an explicit environment and no shell, so no `.env`
 * loader or shell expansion can change the database it reaches. Output is
 * inherited; the tools used here print the database name and host, never a
 * password.
 */
export function runNode(script: string, args: string[], env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: API_ROOT,
    env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

/** Like `runNode`, but captures combined output for assertions instead of printing it. */
export function runNodeCaptured(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): { status: number; output: string } {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: API_ROOT,
    env,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/**
 * Like `runNodeCaptured`, but does not block the event loop, so a test can observe
 * the child's database session (for example, while it waits on a lock).
 */
export function runNodeCapturedAsync(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ status: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: API_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status: status ?? 1, output }));
  });
}

export function runPrisma(args: string[], env: NodeJS.ProcessEnv): void {
  const status = runNode(PRISMA_CLI, [...args, '--schema', PRISMA_SCHEMA], env);
  if (status !== 0) {
    throw new Error(`prisma ${args.join(' ')} failed with exit code ${status}.`);
  }
}

/** Runs Prisma against an explicit schema file and captures its output. */
export function runPrismaCaptured(
  args: string[],
  env: NodeJS.ProcessEnv,
  schemaPath: string = PRISMA_SCHEMA,
): { status: number; output: string } {
  return runNodeCaptured(PRISMA_CLI, [...args, '--schema', schemaPath], env);
}

export function runPrismaCapturedAsync(
  args: string[],
  env: NodeJS.ProcessEnv,
  schemaPath: string = PRISMA_SCHEMA,
): Promise<{ status: number; output: string }> {
  return runNodeCapturedAsync(PRISMA_CLI, [...args, '--schema', schemaPath], env);
}

export function runTsx(script: string, env: NodeJS.ProcessEnv): void {
  const status = runNode(TSX_CLI, [script], env);
  if (status !== 0) {
    throw new Error(`${script} failed with exit code ${status}.`);
  }
}

export function runVitest(args: string[], env: NodeJS.ProcessEnv): number {
  return runNode(vitestCli, ['run', ...args], env);
}
