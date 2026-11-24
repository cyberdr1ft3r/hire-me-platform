import './setup-env.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  CandidateCvSchema,
  CandidateCvsResponseSchema,
  CandidateProfileResponseSchema,
  CandidateSubmissionResponseSchema,
} from '@hire-me/contracts';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { CandidateClamav } from '../src/candidate-portal/candidate-clamav.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaClient } from '../src/persistence/prisma/generated-client.js';
import { registerApiHttpBodyParsers } from '../src/public-applications/public-application-http-transport.js';

const db = new PrismaClient();
const origin = 'http://127.0.0.1:5173';
const basePath = '/v1/candidate/';
const prefix = 'candidate-workspace-' + randomUUID();
const email = prefix + '-staff@example.test';
const document = (mark: string) => Buffer.from('%PDF-1.4\n% ' + mark + '\n%%EOF\n');
const firstPdf = document('v1 original');
const secondPdf = document('v2 revised');
const profile = {
  fullName: 'Synthetic Original',
  phone: '0123',
  city: 'Rabat',
  country: 'Morocco',
  currentPosition: 'Systems engineer',
  summary: 'Synthetic summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'TypeScript',
  languages: 'French',
  qualifications: 'Qualification',
  professionalLinks: 'https://example.test/profile',
  availability: 'Next month',
};
let base: string;
let app: NestExpressApplication;
let root: string;
let owner: { id: string; cookie: string };
let foreign: { id: string; cookie: string };
let adminId: string;
let matchingStaffId: string | undefined;
let staff: string;
let clientId: string;
let clientCookie: string;
let crmId: string;
const missions: string[] = [];

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function identity(address: string) {
  const row = await db.candidateIdentity.create({
    data: { email: address, verifiedAt: new Date() },
  });
  const value = randomBytes(32).toString('base64url');
  await db.candidatePortalSession.create({
    data: {
      identityId: row.id,
      tokenHash: hash(value),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return { id: row.id, cookie: 'hireme_candidate_session=' + value };
}

async function request(
  route: string,
  status: number,
  options: { body?: object; cookie?: string; bearer?: string; origin?: string } = {},
) {
  const body = options.body;
  const multipart = body instanceof FormData;
  const response = await fetch(base + route, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Origin: options.origin ?? origin,
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.bearer ? { Authorization: 'Bearer ' + options.bearer } : {}),
      ...(options.body && !multipart ? { 'Content-Type': 'application/json' } : {}),
    },
    body: multipart ? body : options.body ? JSON.stringify(options.body) : undefined,
  });
  expect(response.status, route + ' ' + (response.ok ? '' : await response.clone().text())).toBe(
    status,
  );
  return response;
}

function form(name: string, bytes = firstPdf, type = 'application/pdf') {
  const data = new FormData();
  data.set('file', new Blob([Uint8Array.from(bytes)], { type }), name);
  return data;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hireme-candidate-workspace-'));
  vi.stubEnv('CANDIDATE_PORTAL_ENABLED', 'true');
  vi.stubEnv('CANDIDATE_MAIL_OUTBOX', root);
  vi.stubEnv('CLIENT_PORTAL_ENABLED', 'true');
  vi.stubEnv('CLIENT_PORTAL_MAIL_OUTBOX', root);
  vi.stubEnv('PRIVATE_UPLOAD_STORAGE_ROOT', root);
  vi.stubEnv('API_CORS_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CandidateClamav)
    .useValue({
      async scan(bytes: Buffer) {
        if (bytes.includes('synthetic-scan-offline'))
          throw new ServiceUnavailableException({ error: { code: 'CANDIDATE_SCAN_UNAVAILABLE' } });
        if (bytes.includes('synthetic-rejected-signature'))
          throw new UnprocessableEntityException({ error: { code: 'CANDIDATE_FILE_UNSAFE' } });
        await Promise.resolve();
      },
    })
    .compile();
  app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
  registerApiHttpBodyParsers(app, { generalJsonLimit: '6mb', publicApplicationJsonLimit: '8mb' });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const admin = await db.user.findUniqueOrThrow({
    where: { normalizedEmail: 'bootstrap-admin@test-db.hireme.test' },
  });
  matchingStaffId = (
    await db.user.create({
      data: {
        email,
        normalizedEmail: email,
        displayName: 'Synthetic matching staff',
        userType: 'INTERNAL',
        status: 'ACTIVE',
      },
    })
  ).id;
  adminId = admin.id;
  staff = app.get(TokenService).createAccessToken(adminId).token;
  owner = await identity(email);
  foreign = await identity(prefix + '@example.test');
  const matching = await db.candidate.create({
    data: { displayName: 'Existing synthetic CRM record', email, normalizedEmail: email },
  });
  crmId = matching.id;
  const client = await db.client.create({
    data: { name: prefix, normalizedName: prefix, status: 'ACTIVE' },
  });
  clientId = client.id;
  const contact = await db.clientContact.create({
    data: { clientId, displayName: 'Synthetic external client', email, normalizedEmail: email },
  });
  const clientMember = await db.clientPortalMember.create({
    data: { clientId, contactId: contact.id, email, acceptedAt: new Date() },
  });
  const clientToken = randomBytes(32).toString('base64url');
  await db.clientPortalSession.create({
    data: {
      memberId: clientMember.id,
      tokenHash: hash(clientToken),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  clientCookie = 'hireme_client_session=' + clientToken;
});

afterAll(async () => {
  try {
    await app?.close();
    const ids = [owner?.id, foreign?.id].filter((value): value is string => Boolean(value));
    const people = await db.candidateIdentity.findMany({
      where: { id: { in: ids } },
      select: { intakeCandidateId: true },
    });
    const candidateIds = [crmId, ...people.map((row) => row.intakeCandidateId)].filter(
      (value): value is string => Boolean(value),
    );
    const scope = { missionId: { in: missions } };
    const applications = await db.publicCandidateApplication.findMany({
      where: scope,
      select: { id: true },
    });
    await db.auditLog.deleteMany({
      where: { entityId: { in: applications.map((app) => app.id) } },
    });
    await db.publicCandidateApplicationFile.deleteMany({ where: scope });
    await db.publicCandidateApplication.deleteMany({ where: scope });
    await db.missionCandidateEvent.deleteMany({ where: { missionCandidate: scope } });
    await db.missionCandidate.deleteMany({ where: scope });
    await db.missionRecruiter.deleteMany({ where: scope });
    await db.publicOpportunity.deleteMany({ where: scope });
    await db.recruitmentMission.deleteMany({ where: { id: { in: missions } } });
    await db.candidateDocument.updateMany({
      where: { candidateId: { in: candidateIds } },
      data: { currentVersionId: null },
    });
    await db.candidateDocumentVersion.deleteMany({
      where: { candidateDocument: { candidateId: { in: candidateIds } } },
    });
    await db.candidateDocument.deleteMany({ where: { candidateId: { in: candidateIds } } });
    await db.candidatePortalCvVersion.deleteMany({ where: { cv: { identityId: { in: ids } } } });
    await db.candidatePortalCv.deleteMany({ where: { identityId: { in: ids } } });
    await db.candidatePortalProfile.deleteMany({ where: { identityId: { in: ids } } });
    await db.candidateIdentity.deleteMany({ where: { id: { in: ids } } });
    await db.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    if (matchingStaffId) await db.user.delete({ where: { id: matchingStaffId } });
    if (clientId) {
      await db.clientPortalMember.deleteMany({ where: { clientId } });
      await db.clientContact.deleteMany({ where: { clientId } });
      await db.client.delete({ where: { id: clientId } });
    }
  } finally {
    vi.unstubAllEnvs();
    await db.$disconnect();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function job(suffix: string) {
  const mission = await db.recruitmentMission.create({
    data: { clientId, title: prefix + suffix, state: 'ACTIVE' },
  });
  missions.push(mission.id);
  await db.missionRecruiter.create({
    data: {
      missionId: mission.id,
      userId: adminId,
      role: 'LEAD_RECRUITER',
      isLead: true,
      status: 'ACTIVE',
    },
  });
  const opening = await db.publicOpportunity.create({
    data: {
      missionId: mission.id,
      status: 'OPEN',
      publicSlug: prefix + suffix,
      publicTitle: prefix + suffix,
      applicationLinkEnabled: true,
      cvRequired: true,
    },
  });
  return '/v1/public/opportunities/' + opening.publicSlug + '/applications';
}

it('persists only the authenticated profile and refuses stale revisions and foreign authority', async () => {
  const path = basePath + 'profile';
  await request(path, 401, { bearer: staff });
  await request(path, 401, { cookie: clientCookie });
  expect((await request('/v1/client-portal/dashboard', 200, { cookie: clientCookie })).ok).toBe(
    true,
  );
  await request(path, 403, {
    body: { profile, revision: 0 },
    cookie: owner.cookie,
    origin: 'https://other.example.test',
  });
  await request(path, 400, {
    body: { profile: { ...profile, professionalLinks: 'javascript:noop()' }, revision: 0 },
    cookie: owner.cookie,
  });
  await request(path, 400, {
    body: { profile, revision: 0, email: foreign.id },
    cookie: owner.cookie,
  });
  const first = CandidateProfileResponseSchema.parse(
    await (
      await request(path, 200, { body: { profile, revision: 0 }, cookie: owner.cookie })
    ).json(),
  );
  expect(first).toEqual({ profile, revision: 1, email });
  await request(path, 409, { body: { profile, revision: 0 }, cookie: owner.cookie });
  expect(
    CandidateProfileResponseSchema.parse(
      await (await request(path, 200, { cookie: foreign.cookie })).json(),
    ).profile,
  ).toBeNull();
  const saved = CandidateProfileResponseSchema.parse(
    await (await request(path, 200, { cookie: owner.cookie })).json(),
  );
  expect(saved).toEqual(first);
  expect(
    await db.candidate.findUniqueOrThrow({ where: { id: crmId }, select: { displayName: true } }),
  ).toEqual({ displayName: 'Existing synthetic CRM record' });
});

it('enforces clean CV ownership and preserves the submitted profile fields and exact file across replacement and removal', async () => {
  const options = { cookie: owner.cookie };
  const other = { cookie: foreign.cookie };
  const docs = basePath + 'documents';
  await request(docs, 413, {
    ...options,
    body: form('oversized.pdf', Buffer.alloc(6 * 1024 * 1024)),
  });
  await request(docs, 400, { ...options, body: form('invalid.exe') });
  await request(docs, 400, { ...options, body: form('invalid.pdf', Buffer.from('not PDF')) });
  await request(docs, 422, {
    ...options,
    body: form('infected.pdf', document('synthetic-rejected-signature')),
  });
  await request(docs, 503, {
    ...options,
    body: form('offline.pdf', document('synthetic-scan-offline')),
  });
  expect(await readdir(root)).toEqual([]);
  expect(
    CandidateCvsResponseSchema.parse(await (await request(docs, 200, options)).json()).cvs,
  ).toEqual([]);

  const first = CandidateCvSchema.parse(
    await (await request(docs, 201, { ...options, body: form('old.pdf') })).json(),
  );
  const selected = first.versions[0]!;
  expect(first.preferred).toBe(true);
  const spare = CandidateCvSchema.parse(
    await (await request(docs, 201, { ...options, body: form('other.pdf') })).json(),
  );
  await request(docs + '/' + spare.id + '/prefer', 204, { ...options, body: {} });
  const preferred = CandidateCvsResponseSchema.parse(
    await (await request(docs, 200, options)).json(),
  ).cvs;
  expect(preferred[0]?.id).toBe(spare.id);
  await request(docs + '/' + first.id + '/prefer', 204, { ...options, body: {} });
  await request(docs + '/' + first.id + '/replace', 404, { ...other, body: form('foreign.pdf') });
  const download = docs + '/versions/' + selected.id;
  await request(download, 404, other);
  await request(download, 401, { cookie: clientCookie });
  await request(download, 401, { bearer: staff });
  expect(Buffer.from(await (await request(download, 200, options)).arrayBuffer())).toEqual(
    firstPdf,
  );

  const firstJob = await job('-first');
  const secondJob = await job('-second');
  const payload = {
    fullName: profile.fullName,
    email: 'untrusted@example.test',
    city: profile.city,
    consentGranted: true,
    files: [],
    candidateCvVersionId: selected.id,
  };
  await request(firstJob, 404, { ...other, body: payload });
  await request(firstJob, 400, { ...options, body: { ...payload, consentGranted: false } });
  await request(firstJob, 200, { ...options, body: payload });
  const old = await db.publicCandidateApplication.findFirstOrThrow({
    where: { ownerIdentityId: owner.id },
    include: { files: true },
  });
  expect(old.candidateId).not.toBe(crmId);
  expect(old.submittedEmail).toBe(email);
  expect(old.selectedPortalCvVersionId).toBe(selected.id);
  expect(
    await db.candidate.findUniqueOrThrow({ where: { id: crmId }, select: { displayName: true } }),
  ).toEqual({ displayName: 'Existing synthetic CRM record' });
  const proof = basePath + 'applications/' + old.id + '/submission';
  await request(proof, 404, other);
  await request(proof, 401, { cookie: clientCookie });
  const snapshot = CandidateSubmissionResponseSchema.parse(
    await (await request(proof, 200, options)).json(),
  );
  expect(snapshot).toMatchObject({
    fullName: profile.fullName,
    cvFilename: 'old.pdf',
    libraryVersion: 1,
  });
  await request(basePath + 'profile', 200, {
    ...options,
    body: { profile: { ...profile, fullName: 'New professional name' }, revision: 1 },
  });
  const replaced = CandidateCvSchema.parse(
    await (
      await request(docs + '/' + first.id + '/replace', 201, {
        ...options,
        body: form('new.pdf', secondPdf),
      })
    ).json(),
  );
  expect(replaced.versions.map((version) => version.version)).toEqual([2, 1]);
  expect(Buffer.from(await (await request(download, 200, options)).arrayBuffer())).toEqual(
    firstPdf,
  );
  await request(secondJob, 200, {
    ...options,
    body: {
      ...payload,
      fullName: 'New professional name',
      candidateCvVersionId: replaced.versions[0]?.id,
    },
  });
  await request(docs + '/' + first.id + '/remove', 204, { ...options, body: {} });
  await request(download, 404, options);
  await request(firstJob, 200, { ...options, body: payload });
  expect(await db.publicCandidateApplication.count({ where: { ownerIdentityId: owner.id } })).toBe(
    2,
  );
  expect(
    CandidateSubmissionResponseSchema.parse(await (await request(proof, 200, options)).json()),
  ).toEqual(snapshot);
  expect(await readFile(join(root, old.files[0]!.storageKey))).toEqual(firstPdf);
  const review =
    '/v1/missions/' + old.missionId + '/public-opportunity/applications/' + old.id + '/cv';
  expect(Buffer.from(await (await request(review, 200, { bearer: staff })).arrayBuffer())).toEqual(
    firstPdf,
  );
  await request(review, 401, options);
  await request(review, 401, { cookie: clientCookie });
  await request(
    review.replace(
      old.missionId,
      missions.find((id) => id !== old.missionId)!,
    ),
    404,
    { bearer: staff },
  );

  await db.candidatePortalSession.updateMany({
    where: { identityId: foreign.id },
    data: { expiresAt: new Date(0) },
  });
  await request(docs, 401, other);
  await request(basePath + 'logout', 204, { ...options, body: {} });
  await request(proof, 401, options);
}, 45_000);
