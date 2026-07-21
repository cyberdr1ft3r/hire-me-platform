import { describe, expect, it } from 'vitest';

import { LoginRequestSchema } from './auth.js';

describe('auth contracts', () => {
  it('accepts a browser-safe login request shape', () => {
    const parsed = LoginRequestSchema.parse({
      email: 'ADMIN@example.test',
      password: 'synthetic-password-123',
    });

    expect(parsed.email).toBe('ADMIN@example.test');
  });
});
