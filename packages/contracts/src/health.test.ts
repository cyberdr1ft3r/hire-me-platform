import { describe, expect, it } from 'vitest';

import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('accepts the API health response contract', () => {
    expect(
      HealthResponseSchema.parse({
        status: 'ok',
        service: 'hire-me-api',
        timestamp: '2026-07-21T10:00:00.000Z',
        uptimeSeconds: 1,
      }),
    ).toMatchObject({ status: 'ok' });
  });
});
