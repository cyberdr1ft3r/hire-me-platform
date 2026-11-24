import { OAuth2Client } from 'google-auth-library';
import { afterEach, expect, it, vi } from 'vitest';

import { CandidateGoogle } from './candidate-google.js';

afterEach(() => vi.restoreAllMocks());

it('uses Google verification with the configured audience and validates verified email, nonce and expiry', async () => {
  const claims = {
    sub: 'synthetic-google-subject',
    email: 'candidate@gmail.com',
    email_verified: true,
    nonce: 'expected-nonce',
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken');
  function verifiedToken(payload: object) {
    verify.mockResolvedValueOnce({ getPayload: () => payload } as Awaited<
      ReturnType<OAuth2Client['verifyIdToken']>
    >);
  }
  const provider = new CandidateGoogle();
  const audience = 'candidate-test.apps.googleusercontent.com';

  verifiedToken(claims);
  expect(await provider.verify('fixture', audience, 'expected-nonce')).toMatchObject({
    sub: claims.sub,
  });
  expect(verify).toHaveBeenCalledWith({ idToken: 'fixture', audience });

  for (const payload of [
    { ...claims, email_verified: false },
    { ...claims, nonce: 'wrong' },
    { ...claims, exp: Math.floor(Date.now() / 1000) - 1 },
  ]) {
    verifiedToken(payload);
    await expect(provider.verify('fixture', audience, 'expected-nonce')).rejects.toMatchObject({
      status: 401,
    });
  }
  verify.mockRejectedValueOnce(new Error('Invalid signature'));
  await expect(provider.verify('fixture', audience, 'expected-nonce')).rejects.toMatchObject({
    status: 401,
  });
});
