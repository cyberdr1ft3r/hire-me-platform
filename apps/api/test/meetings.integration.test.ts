import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  MeetingDetailResponseSchema,
  MeetingListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

async function cleanMeetingTestRecords(): Promise<void> {
  await prisma.meetingParticipant.deleteMany({
    where: { meeting: { title: { contains: 'Issue124Meeting' } } },
  });
  await prisma.meeting.deleteMany({ where: { title: { contains: 'Issue124Meeting' } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@meetings124.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@meetings124.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@meetings124.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@meetings124.test' } },
  });
}

async function ensureRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: { name: roleName, description: `${roleName} test`, status: 'ACTIVE' },
  });
  for (const code of codes) {
    const permission = await ensurePermissionForTest(prisma, code, {
      description: `${code} test`,
      scopeType: PermissionScopeType.EXPLICIT,
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email.toLowerCase(),
      displayName: email.split('@')[0] ?? email,
      status: UserStatus.ACTIVE,
      userType: 'INTERNAL',
      passwordCredential: {
        create: { passwordHash: await passwords.hashPassword(testPassword) },
      },
      roles: { create: { role: { connect: { name: roleName } } } },
    },
  });
  return user.id;
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  expect(response.status).toBe(201);
  return AuthResponseSchema.parse(await response.json()).accessToken;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

describe('meetings foundation (Issue #124)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let organizerId: string;
  let participantId: string;
  let organizerToken: string;
  let participantToken: string;
  let outsiderToken: string;
  let noMeetingsToken: string;

  beforeAll(async () => {
    await cleanMeetingTestRecords();
    await ensureRolePermissions(RoleName.EMPLOYEE, [
      'meetings:view',
      'meetings:create',
      'meetings:manage',
      'tasks:view',
    ]);
    await ensureRolePermissions(RoleName.GUEST, ['records:view']);
    organizerId = await createUser('organizer@meetings124.test', RoleName.EMPLOYEE);
    participantId = await createUser('participant@meetings124.test', RoleName.EMPLOYEE);
    await createUser('outsider@meetings124.test', RoleName.EMPLOYEE);
    await createUser('nomeetings@meetings124.test', RoleName.GUEST);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    organizerToken = await loginAccessToken(baseUrl, 'organizer@meetings124.test');
    participantToken = await loginAccessToken(baseUrl, 'participant@meetings124.test');
    outsiderToken = await loginAccessToken(baseUrl, 'outsider@meetings124.test');
    noMeetingsToken = await loginAccessToken(baseUrl, 'nomeetings@meetings124.test');
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await cleanMeetingTestRecords();
    await prisma.$disconnect();
  });

  it('rejects list without meetings:view', async () => {
    const response = await fetch(`${baseUrl}/v1/meetings`, {
      headers: authHeaders(noMeetingsToken),
    });
    expect(response.status).toBe(403);
  });

  it('creates, lists, and returns meeting detail for organizer and participant', async () => {
    const start = new Date('2026-10-10T10:00:00.000Z').toISOString();
    const createResponse = await fetch(`${baseUrl}/v1/meetings`, {
      method: 'POST',
      headers: authHeaders(organizerToken),
      body: JSON.stringify({
        title: 'Issue124Meeting team sync',
        scheduledStartAt: start,
        scheduledEndAt: new Date('2026-10-10T11:00:00.000Z').toISOString(),
        timezone: 'UTC',
        participantUserIds: [participantId],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = MeetingDetailResponseSchema.parse(await createResponse.json()).meeting;
    expect(created.organizerUserId).toBe(organizerId);
    expect(created.participantCount).toBe(1);

    const participantList = MeetingListResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/meetings`, { headers: authHeaders(participantToken) })
      ).json(),
    );
    expect(participantList.meetings.some((meeting) => meeting.id === created.id)).toBe(true);

    const outsiderDetail = await fetch(`${baseUrl}/v1/meetings/${created.id}`, {
      headers: authHeaders(outsiderToken),
    });
    expect(outsiderDetail.status).toBe(404);
  });

  it('reflects reschedule and cancel on reads', async () => {
    const start = new Date('2026-10-12T14:00:00.000Z').toISOString();
    const createResponse = await fetch(`${baseUrl}/v1/meetings`, {
      method: 'POST',
      headers: authHeaders(organizerToken),
      body: JSON.stringify({
        title: 'Issue124Meeting lifecycle',
        scheduledStartAt: start,
        timezone: 'UTC',
        participantUserIds: [participantId],
      }),
    });
    const meeting = MeetingDetailResponseSchema.parse(await createResponse.json()).meeting;
    const rescheduledAt = new Date('2026-10-12T16:00:00.000Z').toISOString();
    const rescheduleResponse = await fetch(`${baseUrl}/v1/meetings/${meeting.id}/schedule`, {
      method: 'PATCH',
      headers: authHeaders(organizerToken),
      body: JSON.stringify({ scheduledStartAt: rescheduledAt, timezone: 'UTC' }),
    });
    expect(rescheduleResponse.status).toBe(200);
    const rescheduled = MeetingDetailResponseSchema.parse(await rescheduleResponse.json()).meeting;
    expect(rescheduled.scheduledStartAt).toBe(rescheduledAt);

    const cancelResponse = await fetch(`${baseUrl}/v1/meetings/${meeting.id}/cancel`, {
      method: 'PATCH',
      headers: authHeaders(organizerToken),
      body: JSON.stringify({ reason: 'Issue124Meeting canceled in test' }),
    });
    expect(cancelResponse.status).toBe(200);
    const canceled = MeetingDetailResponseSchema.parse(await cancelResponse.json()).meeting;
    expect(canceled.status).toBe('CANCELED');
  });
});
