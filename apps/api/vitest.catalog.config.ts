import { defineConfig } from 'vitest/config';

/**
 * The authorization-catalog survival check (Issue #90). Run through
 * `pnpm test:db:check-catalog` after every integration pass; it uses the same
 * fail-closed guard and target as the integration suites.
 */
export default defineConfig({
  test: {
    globalSetup: ['test/support/global-guard.ts'],
    setupFiles: ['test/setup-integration-env.ts', 'test/setup-env.ts'],
    environment: 'node',
    fileParallelism: false,
    globals: true,
    include: ['test/catalog/**/*.check.ts'],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
