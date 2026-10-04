import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AgendaListResponseSchema, AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  PermissionScopeType,
  PrismaClient,
  RoleName,
  TaskStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

async function cleanAgendaTestRecords(): Promise<void> {
  await prisma.taskReminder.deleteMany({
    where: { task: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.taskAssignment.deleteMany({
    where: { task: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.task.deleteMany({ where: { title: { contains: 'Issue124Agenda' } } });
  await prisma.meetingParticipant.deleteMany({
    where: { meeting: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.meeting.deleteMany({ where: { title: { contains: 'Issue124Agenda' } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@agenda124.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@agenda124.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@agenda124.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@agenda124.test' } },
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
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  expect(response.status).toBe(201);
  return AuthResponseSchema.parse(await response.json()).accessToken;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe('agenda aggregation (Issue #124)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerId: string;
  let outsiderId: string;
  let ownerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    await cleanAgendaTestRecords();
    await ensureRolePermissions(RoleName.EMPLOYEE, [
      'tasks:view',
      'tasks:create',
      'meetings:view',
      'meetings:create',
      'meetings:manage',
    ]);
    ownerId = await createUser('owner@agenda124.test', RoleName.EMPLOYEE);
    outsiderId = await createUser('outsider@agenda124.test', RoleName.EMPLOYEE);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ownerToken = await loginAccessToken(baseUrl, 'owner@agenda124.test');
    outsiderToken = await loginAccessToken(baseUrl, 'outsider@agenda124.test');
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await cleanAgendaTestRecords();
    await prisma.$disconnect();
  });

  it('allows any authenticated user and returns empty when no visible sources', async () => {
    const response = await fetch(`${baseUrl}/v1/agenda?view=upcoming`, {
      headers: authHeaders(outsiderToken),
    });
    expect(response.status).toBe(200);
    const body = AgendaListResponseSchema.parse(await response.json());
    expect(body.items).toEqual([]);
  });

  it('includes owned tasks and meetings without leaking other users meetings', async () => {
    const dueAt = new Date('2026-10-15T12:00:00.000Z');
    await prisma.task.create({
      data: {
        title: 'Issue124Agenda owned task',
        status: TaskStatus.OPEN,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt,
      },
    });
    const meetingStart = new Date('2026-10-16T09:00:00.000Z');
    await prisma.meeting.create({
      data: {
        title: 'Issue124Agenda private meeting',
        scheduledStartAt: meetingStart,
        timezone: 'UTC',
        organizerUserId: ownerId,
        participants: { create: { userId: outsiderId } },
      },
    });
    const ownerAgenda = AgendaListResponseSchema.parse(
      await (
        await fetch(
          `${baseUrl}/v1/agenda?from=${encodeURIComponent('2026-10-01T00:00:00.000Z')}&to=${encodeURIComponent('2026-10-31T23:59:59.999Z')}`,
          { headers: authHeaders(ownerToken) },
        )
      ).json(),
    );
    expect(ownerAgenda.items.some((item) => item.sourceType === 'task')).toBe(true);
    expect(ownerAgenda.items.some((item) => item.sourceType === 'meeting')).toBe(true);

    const outsiderAgenda = AgendaListResponseSchema.parse(
      await (
        await fetch(
          `${baseUrl}/v1/agenda?from=${encodeURIComponent('2026-10-01T00:00:00.000Z')}&to=${encodeURIComponent('2026-10-31T23:59:59.999Z')}&sources=meeting`,
          { headers: authHeaders(outsiderToken) },
        )
      ).json(),
    );
    expect(outsiderAgenda.items.some((item) => item.title.includes('private meeting'))).toBe(true);
    expect(
      outsiderAgenda.items.some(
        (item) => item.sourceType === 'task' && item.title.includes('owned task'),
      ),
    ).toBe(false);
  });

  it('dedupes follow_up reminders that share a task due timestamp', async () => {
    const dueAt = new Date('2026-10-18T08:00:00.000Z');
    const task = await prisma.task.create({
      data: {
        title: 'Issue124Agenda reminder dedupe',
        status: TaskStatus.OPEN,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt,
      },
    });
    await prisma.taskReminder.create({
      data: {
        taskId: task.id,
        recipientUserId: ownerId,
        remindAt: dueAt,
        status: 'PENDING',
        idempotencyKey: `issue124-agenda:${task.id}:dedupe`,
      },
    });
    const body = AgendaListResponseSchema.parse(
      await (
        await fetch(
          `${baseUrl}/v1/agenda?from=${encodeURIComponent('2026-10-01T00:00:00.000Z')}&to=${encodeURIComponent('2026-10-31T23:59:59.999Z')}&sources=task,follow_up`,
          { headers: authHeaders(ownerToken) },
        )
      ).json(),
    );
    const taskRows = body.items.filter(
      (item) => item.sourceId === task.id || item.deepLink.includes(task.id),
    );
    expect(taskRows.filter((item) => item.sourceType === 'follow_up')).toHaveLength(0);
    expect(taskRows.filter((item) => item.sourceType === 'task')).toHaveLength(1);
  });
});
