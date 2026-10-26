import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Root CI runs the API and web Vitest projects concurrently. Keep the
    // jsdom suite bounded so asynchronous rendering and focus effects are not
    // starved by competing workers on the GitHub-hosted runner.
    maxWorkers: 2,
    setupFiles: './src/test/setup.ts',
  },
});
