import { afterEach, describe, expect, it, vi } from 'vitest';

import { TokenService } from './token.service.js';

describe('TokenService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates short-lived access tokens and rejects tampering', () => {
    const service = new TokenService();
    const { token, expiresAt } = service.createAccessToken('6f6d50ec-7fcf-4420-b41d-d723bdd7b07d');

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(service.verifyAccessToken(token).sub).toBe('6f6d50ec-7fcf-4420-b41d-d723bdd7b07d');
    expect(() => service.verifyAccessToken(`${token.slice(0, -2)}aa`)).toThrow();
  });

  it('rejects malformed tokens and wrong-purpose tokens', () => {
    const service = new TokenService();
    const wrongPurposePayload = Buffer.from(
      JSON.stringify({
        sub: '6f6d50ec-7fcf-4420-b41d-d723bdd7b07d',
        typ: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).toString('base64url');

    expect(() => service.verifyAccessToken('not-a-token')).toThrow();
    expect(() =>
      service.verifyAccessToken(`eyJhbGciOiJIUzI1NiJ9.${wrongPurposePayload}.sig`),
    ).toThrow();
  });

  it('rejects expired access tokens', () => {
    const service = new TokenService();
    const { token, expiresAt } = service.createAccessToken('6f6d50ec-7fcf-4420-b41d-d723bdd7b07d');

    vi.setSystemTime(new Date(expiresAt.getTime() + 1000));

    expect(() => service.verifyAccessToken(token)).toThrow();
  });
});
