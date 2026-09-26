import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

/**
 * Deterministic file order for the PostgreSQL suite.
 *
 * Vitest orders files by size by default, so adding or growing a test file would
 * silently reshuffle the run. Files run alphabetically instead.
 * `HIREME_TEST_FILE_ORDER=reverse` runs them in the opposite order, which CI uses
 * on the second pass to prove no suite depends on another having run first. No
 * suite deletes shared seed data any more (Issue #90), so there is no
 * "destructive file last" rule.
 */
class DeterministicSequencer extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = [...files].sort((left, right) => left.moduleId.localeCompare(right.moduleId));
    return Promise.resolve(
      process.env.HIREME_TEST_FILE_ORDER === 'reverse' ? ordered.reverse() : ordered,
    );
  }
}

export default defineConfig({
  test: {
    // Refuses the run before any suite loads unless TEST_DATABASE_URL is this
    // checkout's provisioned disposable database.
    globalSetup: ['test/support/global-guard.ts'],
    setupFiles: ['test/setup-integration-env.ts', 'test/setup-env.ts'],
    environment: 'node',
    fileParallelism: false,
    globals: true,
    include: ['test/**/*.integration.test.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { sequencer: DeterministicSequencer },
  },
});
