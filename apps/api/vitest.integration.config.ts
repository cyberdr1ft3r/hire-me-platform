import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

/**
 * Deterministic file order for the PostgreSQL suite.
 *
 * Vitest orders files by size by default, so adding or growing a test file silently
 * reshuffles the run. That matters here because `database.integration.test.ts` truncates
 * the whole schema, including the seeded roles and permissions every other suite depends
 * on. Ordering alphabetically and forcing that one destructive suite to run last makes the
 * result independent of file sizes rather than accidentally correct.
 */
class DeterministicSequencer extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const destructive = (specification: TestSpecification): boolean =>
      specification.moduleId.includes('database.integration.test');

    return Promise.resolve(
      [...files].sort((left, right) => {
        if (destructive(left) !== destructive(right)) {
          return destructive(left) ? 1 : -1;
        }
        return left.moduleId.localeCompare(right.moduleId);
      }),
    );
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globals: true,
    include: ['test/**/*.integration.test.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { sequencer: DeterministicSequencer },
  },
});
