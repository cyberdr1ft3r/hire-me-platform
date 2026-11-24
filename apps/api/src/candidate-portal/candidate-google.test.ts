import {
  LoginTicket,
  OAuth2Client,
  type TokenPayload,
  type VerifyIdTokenOptions,
} from 'google-auth-library';
import { afterEach, expect, it, vi } from 'vitest';

import { CandidateGoogle } from './candidate-google.js';

afterEach(() => vi.restoreAllMocks());

it('uses Google verification with the configured audience and validates verified email, nonce and expiry', async () => {
  const audience = 'candidate-test.apps.googleusercontent.com';
  const now = Math.floor(Date.now() / 1000);
  const claims: TokenPayload = {
    iss: 'https://accounts.google.com',
    aud: audience,
    iat: now,
    sub: 'synthetic-google-subject',
    email: 'candidate@gmail.com',
    email_verified: true,
    nonce: 'expected-nonce',
    exp: now + 60,
  };
  const promiseVerifier: { verifyIdToken(options: VerifyIdTokenOptions): Promise<LoginTicket> } =
    OAuth2Client.prototype;
  const verify = vi.spyOn(promiseVerifier, 'verifyIdToken');
  const provider = new CandidateGoogle();

  verify.mockResolvedValueOnce(new LoginTicket(undefined, claims));
  expect(await provider.verify('fixture', audience, 'expected-nonce')).toMatchObject({
    sub: claims.sub,
  });
  expect(verify).toHaveBeenCalledWith({ idToken: 'fixture', audience });

  for (const payload of [
    { ...claims, email_verified: false },
    { ...claims, nonce: 'wrong' },
    { ...claims, exp: now - 1 },
  ]) {
    verify.mockResolvedValueOnce(new LoginTicket(undefined, payload));
    await expect(provider.verify('fixture', audience, 'expected-nonce')).rejects.toMatchObject({
      status: 401,
    });
  }
  verify.mockRejectedValueOnce(new Error('Invalid signature'));
  await expect(provider.verify('fixture', audience, 'expected-nonce')).rejects.toMatchObject({
    status: 401,
  });
});
