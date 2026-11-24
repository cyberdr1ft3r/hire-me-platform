import './setup-env.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { CandidateGoogle } from '../src/candidate-portal/candidate-google.js';
import { CandidateMail } from '../src/candidate-portal/candidate-mail.js';
import { PrismaClient } from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const messages: { email: string; purpose: string; link: URL }[] = [];
const prefix = 'portal-' + randomUUID();
const googleSubject = prefix + '-google';
const googleEmail = prefix + '@gmail.com';
let app: NestExpressApplication;
let base: string;
const origin = 'http://127.0.0.1:5173';

beforeAll(async () => {
  vi.stubEnv('CANDIDATE_PORTAL_ENABLED', 'true');
  vi.stubEnv('CANDIDATE_MAIL_OUTBOX', '.tmp-runtime/candidate-fixture-not-used');
  vi.stubEnv('CANDIDATE_GOOGLE_CLIENT_ID', 'candidate-fixture.apps.googleusercontent.com');
  vi.stubEnv('API_CORS_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CandidateMail)
    .useValue({
      send(email: string, purpose: string, link: string) {
        messages.push({ email, purpose, link: new URL(link) });
      },
    })
    .overrideProvider(CandidateGoogle)
    .useValue({
      verify(credential: string, audience: string, nonce: string) {
        expect(audience).toBe('candidate-fixture.apps.googleusercontent.com');
        expect(credential).toBe('synthetic-credential');
        expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        return { sub: googleSubject, email: googleEmail };
      },
    })
    .compile();
  app = module.createNestApplication<NestExpressApplication>();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

afterAll(async () => {
  try {
    await app?.close();
    await prisma.candidateIdentity.deleteMany({ where: { email: { startsWith: prefix } } });
  } finally {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  }
});

function request(path: string, input?: object, cookie?: string, requestOrigin = origin) {
  return fetch(base + path, {
    method: input ? 'POST' : 'GET',
    headers: {
      Origin: requestOrigin,
      ...(input ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
}

const endpoint = '/v1/candidate/';
const password = 'Candidate-QA-Passphrase99!';
const cookieOf = (response: Response) => response.headers.getSetCookie()[0]?.split(';')[0];

it('verifies the mailbox, rejects replay and foreign origins, and revokes sessions on reset and logout', async () => {
  const email = prefix + '-password@example.test';
  expect(
    (await request(endpoint + 'register', { email }, undefined, 'https://foreign.example.test'))
      .status,
  ).toBe(403);
  expect(
    (await request(endpoint + 'register', { email, returnTo: '//untrusted.example' })).status,
  ).toBe(202);
  expect((await request(endpoint + 'login', { email, password })).status).toBe(401);
  const verification = messages.find(
    (message) => message.email === email && message.purpose === 'VERIFY',
  )!.link;
  expect(verification.origin).toBe(origin);
  expect(verification.searchParams.get('returnTo')).toBe('/candidate/applications');
  const input = { token: verification.hash.slice(1), password };
  const verified = await request(endpoint + 'verify', input);
  expect(verified.status).toBe(204);
  expect((await request(endpoint + 'verify', input)).status).toBe(401);
  const firstCookie = cookieOf(verified);
  expect(firstCookie).toMatch(/^hireme_candidate_session=/);
  expect(await (await request(endpoint + 'session', undefined, firstCookie)).json()).toEqual({
    candidate: { email, principal: 'CANDIDATE' },
  });
  expect((await request('/auth/me', undefined, firstCookie)).status).toBe(401);
  expect((await request(endpoint + 'forgot', { email })).status).toBe(202);
  const reset = messages.find(
    (message) => message.email === email && message.purpose === 'RESET',
  )!.link;
  const replacement = 'Another-Candidate-Password99!';
  const resetResponse = await request(endpoint + 'reset', {
    token: reset.hash.slice(1),
    password: replacement,
  });
  expect(resetResponse.status).toBe(204);
  expect(
    (await request(endpoint + 'session', undefined, firstCookie)).headers.get('cache-control'),
  ).toBe('no-store');
  expect((await request(endpoint + 'applications', undefined, firstCookie)).status).toBe(401);
  expect((await request(endpoint + 'login', { email, password })).status).toBe(401);
  const loggedIn = await request(endpoint + 'login', { email, password: replacement });
  expect(loggedIn.status).toBe(204);
  expect((await request(endpoint + 'logout', {}, cookieOf(loggedIn))).status).toBe(204);
  expect((await request(endpoint + 'applications', undefined, cookieOf(loggedIn))).status).toBe(
    401,
  );
});

it('uses the Google subject, checks a one-use browser challenge, and starts with empty ownership', async () => {
  const challenge = await request(endpoint + 'google/challenge', {});
  expect(challenge.status).toBe(200);
  const binding = cookieOf(challenge);
  const response = await request(
    endpoint + 'google',
    { credential: 'synthetic-credential' },
    binding,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ verified: true });
  const session = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('hireme_candidate_session='))
    ?.split(';')[0];
  expect(await (await request(endpoint + 'applications', undefined, session)).json()).toEqual({
    applications: [],
    nextCursor: null,
  });
  expect(
    (await request(endpoint + 'google', { credential: 'synthetic-credential' }, binding)).status,
  ).toBe(401);
  expect(
    await prisma.candidateIdentity.findUnique({
      where: { googleSubject },
      select: { email: true },
    }),
  ).toEqual({ email: googleEmail });
});
