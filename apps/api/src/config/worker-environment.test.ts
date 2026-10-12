import { describe, expect, it } from 'vitest';

import { loadWorkerEnvironment, WorkerEnvironmentError } from './worker-environment.js';

describe('loadWorkerEnvironment', () => {
  it('accepts DATABASE_URL and NODE_ENV only', () => {
    const env = loadWorkerEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/hireme_test',
      NODE_ENV: 'test',
    });
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.NODE_ENV).toBe('test');
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() => loadWorkerEnvironment({ NODE_ENV: 'test' })).toThrow(WorkerEnvironmentError);
  });
});
