import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { API_ROOT } from './disposable-database.js';

const requireFromApi = createRequire(join(API_ROOT, 'package.json'));
const prismaCli = requireFromApi.resolve('prisma/build/index.js');
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

export function runPrisma(args: string[], env: NodeJS.ProcessEnv): void {
  const status = runNode(prismaCli, [...args, '--schema', PRISMA_SCHEMA], env);
  if (status !== 0) {
    throw new Error(`prisma ${args.join(' ')} failed with exit code ${status}.`);
  }
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
