import './setup-env.js';
import { randomUUID } from 'node:crypto';
import {
  ClientDemandSchema,
  ClientPortalDashboardSchema,
  ClientPortalPreviewSchema,
  ClientPortalPublicationsSchema,
  ClientPortalStaffDemandSchema,
  ClientPortalStaffOrganizationSchema,
  ClientPublicationSchema,
} from '@hire-me/contracts';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { ClientPortalMail } from '../src/client-portal/client-portal-auth.service.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaClient } from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const origin = 'http://127.0.0.1:5173';
const prefix = 'client-portal-' + randomUUID();
const password = 'Client-QA-Password-99!';
const replacement = 'Client-New-Password-99!';
const adminEmail = 'bootstrap-admin@test-db.hireme.test';
const emails = [adminEmail, prefix + '-peer@example.test', prefix + '-other@example.test'];
const messages: { email: string; purpose: string; link: URL }[] = [];
const orgs: string[] = [];
let app: NestExpressApplication;
let base: string;
let staff: string;
let adminId: string;
let candidateId: string | undefined;
let externalUserId: string | undefined;
const external = '/v1/client-portal/';
const internal = (id: string) => '/v1/internal/client-portal/organizations/' + id;
const cookie = (response: Response) => response.headers.getSetCookie()[0]?.split(';')[0];
const fields = {
  title: 'Synthetic engineering role',
  description: 'Review applications for an isolated development fixture.',
  location: 'Casablanca',
  numberOfPositions: 2,
};

async function request(
  path: string,
  status: number,
  options: { body?: object; cookie?: string; bearer?: string; origin?: string } = {},
) {
  const response = await fetch(base + path, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Origin: options.origin ?? origin,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.bearer ? { Authorization: 'Bearer ' + options.bearer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  expect(response.status, path + ' ' + (response.ok ? '' : await response.clone().text())).toBe(
    status,
  );
  return response;
}

function asStaff(path: string, status: number, body?: object) {
  return request(path, status, { bearer: staff, body });
}

async function accept(clientId: string, contactId: string, email: string) {
  await asStaff(internal(clientId) + '/invitations', 202, { contactId });
  const link = messages
    .slice()
    .reverse()
    .find((mail) => mail.email === email && mail.purpose === 'INVITE')!.link;
  expect(link.origin + link.pathname).toBe(origin + '/client/accept');
  const body = { password, token: link.hash.slice(1) };
  await request(external + 'accept', 403, { body, origin: 'https://foreign.example.test' });
  const result = await request(external + 'accept', 204, { body });
  await request(external + 'accept', 401, { body });
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(result.headers.get('set-cookie')).toContain('SameSite=Strict');
  return cookie(result);
}

beforeAll(async () => {
  vi.stubEnv('CLIENT_PORTAL_ENABLED', 'true');
  vi.stubEnv('CANDIDATE_PORTAL_ENABLED', 'true');
  vi.stubEnv('CANDIDATE_MAIL_OUTBOX', '.tmp-runtime/client-fixtures-not-used');
  vi.stubEnv('CLIENT_PORTAL_MAIL_OUTBOX', '.tmp-runtime/client-fixtures-not-used');
  vi.stubEnv('API_CORS_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClientPortalMail)
    .useValue({
      send(email: string, purpose: string, link: string) {
        messages.push({ email, purpose, link: new URL(link) });
      },
    })
    .compile();
  app = module.createNestApplication<NestExpressApplication>();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const result = await request('/auth/login', 201, {
    body: { email: adminEmail, password: 'CiSyntheticAdminPassphrase123!' },
  });
  const { user, accessToken } = (await result.json()) as {
    user: { id: string };
    accessToken: string;
  };
  staff = accessToken;
  adminId = user.id;
});

afterAll(async () => {
  try {
    await app?.close();
    const scope = { clientId: { in: orgs } };
    const [members, demands, publications] = await Promise.all([
      prisma.clientPortalMember.findMany({ where: scope, select: { id: true } }),
      prisma.clientPortalDemand.findMany({ where: scope, select: { id: true } }),
      prisma.clientPortalPublication.findMany({ where: scope, select: { id: true } }),
    ]);
    const missions = await prisma.recruitmentMission.findMany({
      where: scope,
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: {
          in: [...members, ...demands, ...publications, ...missions].map((row) => row.id),
        },
      },
    });
    await prisma.clientPortalPublication.deleteMany({ where: scope });
    await prisma.clientPortalDemandEvent.deleteMany({
      where: { demandId: { in: demands.map((row) => row.id) } },
    });
    await prisma.clientPortalDemand.deleteMany({ where: scope });
    await prisma.clientPortalMember.deleteMany({ where: scope });
    await prisma.missionCandidate.deleteMany({
      where: { missionId: { in: missions.map((row) => row.id) } },
    });
    await prisma.recruitmentMission.deleteMany({ where: scope });
    await prisma.clientContact.deleteMany({ where: scope });
    await prisma.client.deleteMany({ where: { id: { in: orgs } } });
    if (candidateId) await prisma.candidate.delete({ where: { id: candidateId } });
    if (externalUserId) {
      await prisma.userRole.deleteMany({ where: { userId: externalUserId } });
      await prisma.user.delete({ where: { id: externalUserId } });
    }
  } finally {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  }
});

it('gates access and keeps organization demands, invitations and sessions isolated', async () => {
  const orgA = await prisma.client.create({
    data: {
      name: prefix + ' A',
      normalizedName: prefix + ' a',
      status: 'ACTIVE',
      commercialSummary: 'PRIVATE',
    },
  });
  const orgB = await prisma.client.create({
    data: { name: prefix + ' B', normalizedName: prefix + ' b', status: 'ACTIVE' },
  });
  orgs.push(orgA.id, orgB.id);
  const [first, peer, foreign] = await Promise.all(
    emails.map((email, index) =>
      prisma.clientContact.create({
        data: {
          clientId: index === 2 ? orgB.id : orgA.id,
          displayName: 'Named test contact ' + index,
          email,
          normalizedEmail: email,
        },
      }),
    ),
  );
  if (!first || !peer || !foreign) throw new Error('Contact fixtures missing');
  const a = internal(orgA.id);
  const b = internal(orgB.id);

  await request(external + 'dashboard', 401, { bearer: staff });
  await request(external + 'login', 401, {
    body: { email: adminEmail, password: 'CiSyntheticAdminPassphrase123!' },
  });
  await asStaff(a + '/invitations', 404, { contactId: foreign.id });
  const firstCookie = await accept(orgA.id, first.id, first.email);
  const peerCookie = await accept(orgA.id, peer.id, peer.email);
  const otherCookie = await accept(orgB.id, foreign.id, foreign.email);
  await request('/auth/me', 401, { cookie: firstCookie });
  await request(a, 401, { cookie: firstCookie });
  await request('/v1/candidate/applications', 401, { cookie: firstCookie });
  const dashboard = ClientPortalDashboardSchema.parse(
    await (await request(external + 'dashboard', 200, { cookie: otherCookie })).json(),
  );
  expect(dashboard.organization).toEqual({
    name: orgB.name,
    city: null,
    country: null,
    website: null,
    industry: null,
  });
  expect(dashboard.demands).toEqual([]);

  await request(external + 'demands', 400, {
    cookie: firstCookie,
    body: { ...fields, clientId: orgB.id },
  });
  const draft = ClientDemandSchema.parse(
    await (await request(external + 'demands', 201, { cookie: firstCookie, body: fields })).json(),
  );
  const id = draft.id as string;
  const demandPath = external + 'demands/' + id;
  const decision = a + '/demands/' + id + '/decision';
  await request(demandPath, 404, { cookie: peerCookie });
  await request(demandPath, 404, { cookie: otherCookie });
  await request(demandPath + '/submit', 404, { cookie: peerCookie, body: { revision: 1 } });
  await asStaff(decision, 404, { revision: 1, action: 'REVIEW' });
  await request(demandPath + '/submit', 200, { cookie: firstCookie, body: { revision: 1 } });
  expect(
    ClientDemandSchema.parse(await (await request(demandPath, 200, { cookie: peerCookie })).json())
      .editable,
  ).toBe(false);
  await asStaff(b + '/demands/' + id + '/decision', 404, { revision: 2, action: 'REVIEW' });
  await asStaff(decision, 200, { revision: 2, action: 'REVIEW' });
  await asStaff(decision, 200, { revision: 3, action: 'REVISE', reason: 'MORE_DETAILS' });
  await request(demandPath, 200, {
    cookie: firstCookie,
    body: { ...fields, title: 'Refined engineering role', revision: 4 },
  });
  expect(
    ClientDemandSchema.parse(await (await request(demandPath, 200, { cookie: peerCookie })).json())
      .title,
  ).toBe(fields.title);
  await request(demandPath + '/submit', 200, { cookie: firstCookie, body: { revision: 5 } });
  await asStaff(decision, 409, { revision: 5, action: 'REVIEW' });
  await asStaff(decision, 200, { revision: 6, action: 'REVIEW' });
  await asStaff(decision, 200, { revision: 7, action: 'APPROVE' });
  const conversions = await Promise.all(
    [1, 2].map(() => asStaff(decision, 200, { revision: 8, action: 'CONVERT' })),
  );
  const converted = ClientPortalStaffDemandSchema.parse(await conversions[0]!.json());
  if (!converted.missionId) throw new Error('Draft mission missing');
  expect(ClientPortalStaffDemandSchema.parse(await conversions[1]!.json()).missionId).toBe(
    converted.missionId,
  );
  expect(await prisma.recruitmentMission.count({ where: { clientId: orgA.id } })).toBe(1);
  expect(
    await prisma.recruitmentMission.findUnique({
      where: { id: converted.missionId },
      select: { state: true, numberOfPositions: true },
    }),
  ).toEqual({ state: 'DRAFT', numberOfPositions: 2 });
  const clientResult = ClientDemandSchema.parse(
    await (await request(demandPath, 200, { cookie: peerCookie })).json(),
  );
  expect(clientResult.status).toBe('CONVERTED');
  expect(clientResult).not.toHaveProperty('missionId');
  await request(external + 'dashboard?cursor=' + id, 404, { cookie: otherCookie });

  const rejected = ClientDemandSchema.parse(
    await (await request(external + 'demands', 201, { cookie: firstCookie, body: fields })).json(),
  );
  await request(external + 'demands/' + rejected.id + '/submit', 200, {
    cookie: firstCookie,
    body: { revision: 1 },
  });
  await asStaff(a + '/demands/' + rejected.id + '/decision', 200, {
    revision: 2,
    action: 'REVIEW',
  });
  await asStaff(a + '/demands/' + rejected.id + '/decision', 200, {
    revision: 3,
    action: 'REJECT',
    reason: 'CAPACITY',
  });
  expect(
    ClientDemandSchema.parse(
      await (
        await request(external + 'demands/' + rejected.id, 200, { cookie: peerCookie })
      ).json(),
    ).history[0]?.reason,
  ).toBe('CAPACITY');

  const candidate = await prisma.candidate.create({
    data: {
      displayName: prefix,
      currentJobTitle: 'Approved public role',
      country: 'MA',
      phone: 'PRIVATE PHONE',
      email: 'hidden@example.test',
      professionalSummary: 'PRIVATE NOTES',
    },
  });
  candidateId = candidate.id;
  const previewRequest = { candidateId, summaryDocument: true };
  await asStaff(a + '/publications/preview', 404, previewRequest);
  await prisma.candidate.update({
    where: { id: candidateId },
    data: { consentStatus: 'GRANTED', consentRecordedAt: new Date() },
  });
  const preview = ClientPortalPreviewSchema.parse(
    await (await asStaff(a + '/publications/preview', 200, previewRequest)).json(),
  );
  await asStaff(a + '/publications', 400, { ...previewRequest, preview });
  await asStaff(a + '/publications', 409, {
    ...previewRequest,
    preview: { ...preview, title: 'Stale title' },
    consentConfirmed: true,
  });
  const card = ClientPublicationSchema.parse(
    await (
      await asStaff(a + '/publications', 201, {
        ...previewRequest,
        preview,
        consentConfirmed: true,
      })
    ).json(),
  );
  expect(Object.keys(card).sort()).toEqual([
    'city',
    'country',
    'demandId',
    'id',
    'publishedAt',
    'summaryDocument',
    'title',
  ]);
  const doc = external + 'publications/' + card.id + '/document';
  expect(await (await request(doc, 200, { cookie: peerCookie })).text()).toBe(
    'Approved public role\nMA\n',
  );
  await request(doc, 404, { cookie: otherCookie });
  await request(external + 'publications?cursor=' + card.id, 404, { cookie: otherCookie });
  await asStaff(b + '/publications/' + card.id + '/revoke', 404, {});
  const shortlist = { ...previewRequest, demandId: id };
  await asStaff(a + '/publications/preview', 404, shortlist);
  await asStaff(b + '/publications/preview', 404, shortlist);
  await prisma.missionCandidate.create({
    data: {
      missionId: converted.missionId,
      candidateId,
      state: 'PRESENTED_TO_CLIENT',
      clientVisible: true,
      presentedAt: new Date(),
      responsibleRecruiterUserId: adminId,
    },
  });
  const shortlisted = ClientPublicationSchema.parse(
    await (
      await asStaff(a + '/publications', 201, { ...shortlist, preview, consentConfirmed: true })
    ).json(),
  );
  const shortlistUrl = external + 'publications?demandId=' + id;
  expect(
    ClientPortalPublicationsSchema.parse(
      await (await request(shortlistUrl, 200, { cookie: peerCookie })).json(),
    ).publications[0]?.id,
  ).toBe(shortlisted.id);
  await request(shortlistUrl, 404, { cookie: otherCookie });
  await asStaff(a + '/publications/' + shortlisted.id + '/revoke', 204, {});
  await request(external + 'publications/' + shortlisted.id + '/document', 404, {
    cookie: firstCookie,
  });
  await prisma.candidate.update({ where: { id: candidateId }, data: { consentStatus: 'REVOKED' } });
  await request(doc, 404, { cookie: peerCookie });
  await prisma.candidate.update({
    where: { id: candidateId },
    data: { consentStatus: 'GRANTED', consentRecordedAt: new Date() },
  });
  await request(doc, 404, { cookie: peerCookie });
  expect(
    await prisma.auditLog.count({
      where: { entityId: card.id, action: 'client_portal.publication.consent_invalidated' },
    }),
  ).toBe(1);

  await request(external + 'forgot', 202, { body: { email: first.email } });
  const proof = messages
    .slice()
    .reverse()
    .find((mail) => mail.email === first.email && mail.purpose === 'RESET')!.link;
  const resetBody = { token: proof.hash.slice(1), password: replacement };
  const reset = await request(external + 'reset', 204, { body: resetBody });
  await request(external + 'reset', 401, { body: resetBody });
  await request(external + 'dashboard', 401, { cookie: firstCookie });
  const staffView = ClientPortalStaffOrganizationSchema.parse(await (await asStaff(a, 200)).json());
  const memberId = staffView.members.find(
    (member: { contactId: string }) => member.contactId === first.id,
  )?.id;
  if (!memberId) throw new Error('Client membership missing');
  await asStaff(b + '/members/' + memberId + '/revoke', 404, {});
  await asStaff(a + '/members/' + memberId + '/revoke', 204, {});
  await request(external + 'dashboard', 401, { cookie: cookie(reset) });
  await request(external + 'login', 401, { body: { email: first.email, password: replacement } });
  expect(
    await prisma.auditLog.count({
      where: { entityId: id, action: 'client_portal.demand.convert' },
    }),
  ).toBe(1);
}, 45_000);

it('denies staff endpoints to a legacy client user even with an internal bearer token', async () => {
  const legacy = await prisma.user.create({
    data: {
      displayName: 'Client test role',
      email: prefix + '@example.test',
      normalizedEmail: prefix + '@example.test',
      status: 'ACTIVE',
      userType: 'CLIENT',
    },
  });
  externalUserId = legacy.id;
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'CLIENT_USER' } });
  await prisma.userRole.create({ data: { userId: legacy.id, roleId: role.id } });
  const bearer = app.get(TokenService).createAccessToken(legacy.id).token;
  await request(internal(orgs[0]!), 403, { bearer });
  await request(external + 'dashboard', 401, { bearer });
  vi.stubEnv('CLIENT_PORTAL_ENABLED', 'false');
  try {
    await request(external + 'dashboard', 404);
    await asStaff(internal(orgs[0]!), 404);
  } finally {
    vi.stubEnv('CLIENT_PORTAL_ENABLED', 'true');
  }
});
