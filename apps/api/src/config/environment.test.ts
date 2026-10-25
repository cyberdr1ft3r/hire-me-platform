import { describe, expect, it } from 'vitest';

import { loadEnvironment } from './environment.js';

describe('loadEnvironment', () => {
  it('returns validated configuration for safe development placeholders', () => {
    expect(
      loadEnvironment({
        API_CORS_ORIGIN: 'http://127.0.0.1:5173',
        API_HOST: '127.0.0.1',
        API_PORT: '3000',
        AUTH_ACCESS_TOKEN_SECRET: 'test_access_token_secret_32_characters_minimum',
        AUTH_REFRESH_TOKEN_PEPPER: 'test_refresh_token_pepper_32_characters_minimum',
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

  it('requires an explicit invoice issuance decision in production', () => {
    const production = {
      API_CORS_ORIGIN: 'https://hire-me.dr1ft3r.dev',
      AUTH_ACCESS_TOKEN_SECRET: 'production_access_secret_32_characters_minimum',
      AUTH_REFRESH_TOKEN_PEPPER: 'production_refresh_pepper_32_characters_minimum',
      DATABASE_URL: 'postgresql://hire_me:secret@postgres:5432/hire_me_staging',
      NODE_ENV: 'production',
    } as const;

    expect(() => loadEnvironment(production)).toThrow(/INVOICE_ISSUANCE_ENABLED/);
    expect(loadEnvironment({ ...production, INVOICE_ISSUANCE_ENABLED: 'false' })).toMatchObject({
      INVOICE_ISSUANCE_ENABLED: false,
    });
    expect(loadEnvironment({ ...production, INVOICE_ISSUANCE_ENABLED: 'true' })).toMatchObject({
      INVOICE_ISSUANCE_ENABLED: true,
    });
  });

  it('rejects documented replacement markers in production secrets', () => {
    expect(() =>
      loadEnvironment({
        API_CORS_ORIGIN: 'https://hire-me.dr1ft3r.dev',
        AUTH_ACCESS_TOKEN_SECRET: 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS',
        AUTH_REFRESH_TOKEN_PEPPER: 'production_refresh_pepper_32_characters_minimum',
        DATABASE_URL: 'postgresql://hire_me:secret@postgres:5432/hire_me_staging',
        INVOICE_ISSUANCE_ENABLED: 'false',
        NODE_ENV: 'production',
      }),
    ).toThrow(/AUTH_ACCESS_TOKEN_SECRET must be production-grade/);
  });
});
