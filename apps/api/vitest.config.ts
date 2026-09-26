import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The disposable-database guard's rules are unit-tested without a database.
    include: ['src/**/*.test.ts', 'test/support/**/*.test.ts'],
    setupFiles: ['./test/setup-env.ts'],
  },
});
