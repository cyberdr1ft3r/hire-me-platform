import { describe, expect, it } from 'vitest';

import { loadEnvironment } from './environment.js';

describe('loadEnvironment', () => {
  it('returns validated configuration for safe development placeholders', () => {
    expect(
      loadEnvironment({
        API_CORS_ORIGIN: 'http://127.0.0.1:5173',
        API_HOST: '127.0.0.1',
        API_PORT: '3000',
        DATABASE_URL:
          'postgresql://hire_me:hire_me_dev_password@127.0.0.1:5432/hire_me_dev?schema=public',
        NODE_ENV: 'test',
      }),
    ).toMatchObject({
      API_PORT: 3000,
      NODE_ENV: 'test',
    });
  });

  it('rejects invalid configuration before startup', () => {
    expect(() =>
      loadEnvironment({
        API_CORS_ORIGIN: 'not-a-url',
        DATABASE_URL: 'not-a-url',
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
