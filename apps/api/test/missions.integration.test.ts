import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  MissionAssignmentDetailResponseSchema,
  MissionDetailResponseSchema,
  MissionListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  ClientStatus,
  PermissionScopeType,
  PrismaClient,
  RecruitmentMissionState,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const normalMissionPermissions = [
  'missions:view',
  'missions:create',
  'missions:update',
  'missions:status:manage',
  'missions:archive',
  'missions:closure:manage',
  'mission_assignments:view',
  'mission_assignments:manage',
] as const;

async function cleanMissionTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@missions.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@missions.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['RecruitmentMission', 'MissionRecruiter'] } },
        { targetUser: { normalizedEmail: { endsWith: '@missions.test' } } },
      ],
    },
  });
  await prisma.missionRecruiter.deleteMany({
    where: {
      OR: [
        { user: { normalizedEmail: { endsWith: '@missions.test' } } },
        { mission: { title: { contains: 'Issue19' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue19' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue19' } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@missions.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@missions.test' } },
  });
}

async function ensureRoleWithPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for mission tests.`,
      status: 'ACTIVE',
    },
  });

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for mission tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for mission tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function prepareMissionCatalog(): Promise<void> {
  await ensureRoleWithPermissions(RoleName.SUPER_ADMIN, [
    ...normalMissionPermissions,
    'mission_commercial_data:view',
    'mission_commercial_data:update',
  ]);
  await ensureRoleWithPermissions(RoleName.HR_MANAGER, normalMissionPermissions);
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: RoleName.HR_MANAGER },
      permission: {
        code: { in: ['mission_commercial_data:view', 'mission_commercial_data:update'] },
      },
    },
    data: { archivedAt: new Date() },
  });
  await prisma.role.upsert({
    where: { name: RoleName.MANAGER },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: RoleName.MANAGER,
      description: 'Synthetic manager role without unresolved mission row-scope permissions.',
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: RoleName.MANAGER },
      permission: {
        code: {
          in: [
            ...normalMissionPermissions,
            'mission_commercial_data:view',
            'mission_commercial_data:update',
          ],
        },
      },
    },
    data: { archivedAt: new Date() },
  });
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: { userId: user.id, passwordHash: await passwords.hashPassword(testPassword) },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  return user.id;
}

async function createClientRecord(name: string, status = ClientStatus.ACTIVE): Promise<string> {
  const client = await prisma.client.create({
    data: {
      name,
      normalizedName: name.trim().toLowerCase(),
      status,
    },
  });
  return client.id;
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  const body = AuthResponseSchema.parse(await response.json());
  return body.accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

async function createMissionRecord(
  baseUrl: string,
  accessToken: string,
  clientId: string,
  title: string,
) {
  const response = await fetch(`${baseUrl}/v1/missions`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ clientId, title, numberOfPositions: 2 }),
  });
  const body = MissionDetailResponseSchema.parse(await response.json());
  return body.mission.id;
}

async function raceAfterMissionLock<T>(
  missionId: string,
  startRequests: () => Promise<T>,
): Promise<T> {
  let releaseLock: (() => void) | undefined;
  let locked: (() => void) | undefined;
  const releasePromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const lockedPromise = new Promise<void>((resolve) => {
    locked = resolve;
  });

  const lockPromise = prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
      locked?.();
      await releasePromise;
    },
    { timeout: 10000 },
  );

  await lockedPromise;
  const resultPromise = startRequests();
  await new Promise((resolve) => setTimeout(resolve, 75));
  releaseLock?.();
  const result = await resultPromise;
  await lockPromise;
  return result;
}

describe('Recruitment missions API', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    await cleanMissionTestRecords();
    await prepareMissionCatalog();
    await createUser('mission-admin@missions.test', RoleName.SUPER_ADMIN);
    await createUser('mission-hr@missions.test', RoleName.HR_MANAGER);
    await createUser('mission-manager@missions.test', RoleName.MANAGER);
    await createUser('lead-a@missions.test', RoleName.HR_MANAGER);
    await createUser('lead-b@missions.test', RoleName.HR_MANAGER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await cleanMissionTestRecords();
    await prisma.$disconnect();
  });

  it('allows authorized mission CRUD and denies unresolved manager scope safely', async () => {
    const clientId = await createClientRecord('Issue19 Authorized Client');
    const hrToken = await loginAccessToken(baseUrl, 'mission-hr@missions.test');
    const managerToken = await loginAccessToken(baseUrl, 'mission-manager@missions.test');
    await createMissionRecord(baseUrl, hrToken, clientId, 'Issue19 Authorized Mission');

    const allowed = await fetch(`${baseUrl}/v1/missions?search=Issue19&page=1&pageSize=5`, {
      headers: authHeaders(hrToken),
    });
    const denied = await fetch(`${baseUrl}/v1/missions`, {
      headers: authHeaders(managerToken),
    });

    expect(allowed.status).toBe(200);
    expect(MissionListResponseSchema.parse(await allowed.json()).missions).toHaveLength(1);
    expect(denied.status).toBe(403);
  });

  it('hides and protects salary and commercial mission fields without explicit permissions', async () => {
    const clientId = await createClientRecord('Issue19 Commercial Client');
    const adminToken = await loginAccessToken(baseUrl, 'mission-admin@missions.test');
    const hrToken = await loginAccessToken(baseUrl, 'mission-hr@missions.test');
    const missionId = await createMissionRecord(
      baseUrl,
      hrToken,
      clientId,
      'Issue19 Commercial Mission',
    );

    const rejectedWrite = await fetch(`${baseUrl}/v1/missions/${missionId}`, {
      method: 'PATCH',
      headers: authHeaders(hrToken),
      body: JSON.stringify({ salaryMinCents: 100000, commercialSummary: 'Protected value' }),
    });
    const allowedWrite = await fetch(`${baseUrl}/v1/missions/${missionId}`, {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        salaryMinCents: 100000,
        salaryMaxCents: 120000,
        salaryCurrency: 'EUR',
      }),
    });
    const hidden = await fetch(`${baseUrl}/v1/missions/${missionId}`, {
      headers: authHeaders(hrToken),
    });
    const visible = await fetch(`${baseUrl}/v1/missions/${missionId}`, {
      headers: authHeaders(adminToken),
    });

    expect(rejectedWrite.status).toBe(403);
    expect(allowedWrite.status).toBe(200);
    expect(MissionDetailResponseSchema.parse(await hidden.json()).mission.commercial).toBeNull();
    expect(MissionDetailResponseSchema.parse(await visible.json()).mission.commercial).toEqual(
      expect.objectContaining({ salaryMinCents: 100000, salaryMaxCents: 120000 }),
    );
  });

  it('enforces documented lifecycle transitions and structured closure invariants', async () => {
    const clientId = await createClientRecord('Issue19 Lifecycle Client');
    const token = await loginAccessToken(baseUrl, 'mission-hr@missions.test');
    const missionId = await createMissionRecord(
      baseUrl,
      token,
      clientId,
      'Issue19 Lifecycle Mission',
    );

    const invalid = await fetch(`${baseUrl}/v1/missions/${missionId}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ state: RecruitmentMissionState.CLIENT_INTERVIEWS }),
    });
    const valid = await fetch(`${baseUrl}/v1/missions/${missionId}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ state: RecruitmentMissionState.INTERNAL_VALIDATION }),
    });
    const mismatchedClosure = await fetch(`${baseUrl}/v1/missions/${missionId}/close`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        state: RecruitmentMissionState.CANCELED,
        closureReason: 'CLOSED_WITHOUT_RECRUITMENT',
      }),
    });
    const canceled = await fetch(`${baseUrl}/v1/missions/${missionId}/close`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        state: RecruitmentMissionState.CANCELED,
        closureReason: 'CLIENT_CLOSED_OR_CANCELED',
      }),
    });
    const archived = await fetch(`${baseUrl}/v1/missions/${missionId}/archive`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    const updateAfterArchive = await fetch(`${baseUrl}/v1/missions/${missionId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ title: 'Issue19 Mutated After Archive' }),
    });

    expect(invalid.status).toBe(409);
    expect(valid.status).toBe(200);
    expect(mismatchedClosure.status).toBe(409);
    expect(MissionDetailResponseSchema.parse(await canceled.json()).mission.state).toBe('CANCELED');
    expect(MissionDetailResponseSchema.parse(await archived.json()).mission.state).toBe('ARCHIVED');
    expect(updateAfterArchive.status).toBe(409);
    expect(await readErrorCode(updateAfterArchive)).toBe('MISSION_TERMINAL');
  });

  it('enforces assignment IDOR, active duplicate, active user, and atomic lead replacement rules', async () => {
    const clientId = await createClientRecord('Issue19 Assignment Client');
    const token = await loginAccessToken(baseUrl, 'mission-hr@missions.test');
    const missionId = await createMissionRecord(
      baseUrl,
      token,
      clientId,
      'Issue19 Assignment Mission',
    );
    const otherMissionId = await createMissionRecord(
      baseUrl,
      token,
      clientId,
      'Issue19 Other Mission',
    );
    const leadA = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'lead-a@missions.test' },
    });
    const leadB = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'lead-b@missions.test' },
    });

    const first = await fetch(`${baseUrl}/v1/missions/${missionId}/assignments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userId: leadA.id, role: 'RECRUITER', isLead: false }),
    });
    const duplicate = await fetch(`${baseUrl}/v1/missions/${missionId}/assignments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userId: leadA.id, role: 'RECRUITER', isLead: false }),
    });
    const leadOne = await fetch(`${baseUrl}/v1/missions/${missionId}/assignments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userId: leadA.id, role: 'LEAD_RECRUITER', isLead: true }),
    });
    const leadTwo = await fetch(`${baseUrl}/v1/missions/${missionId}/assignments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userId: leadB.id, role: 'LEAD_RECRUITER', isLead: true }),
    });
    const firstLeadId = MissionAssignmentDetailResponseSchema.parse(await leadOne.json()).assignment
      .id;
    const secondLead = MissionAssignmentDetailResponseSchema.parse(await leadTwo.json()).assignment;
    const idor = await fetch(
      `${baseUrl}/v1/missions/${otherMissionId}/assignments/${firstLeadId}`,
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ status: AssignmentStatus.INACTIVE }),
      },
    );

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(secondLead.isLead).toBe(true);
    expect(
      await prisma.missionRecruiter.count({
        where: { missionId, status: AssignmentStatus.ACTIVE, archivedAt: null, isLead: true },
      }),
    ).toBe(1);
    expect(idor.status).toBe(404);
  });

  it('serializes mission archival against concurrent assignment creation and ordinary updates', async () => {
    const clientId = await createClientRecord('Issue19 Race Client');
    const token = await loginAccessToken(baseUrl, 'mission-hr@missions.test');
    const assignee = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'lead-a@missions.test' },
    });
    const createRaceMissionId = await createMissionRecord(
      baseUrl,
      token,
      clientId,
      'Issue19 Race Create',
    );
    await prisma.recruitmentMission.update({
      where: { id: createRaceMissionId },
      data: {
        state: RecruitmentMissionState.CANCELED,
        closureReason: 'CLIENT_CLOSED_OR_CANCELED',
        closedAt: new Date(),
      },
    });

    const [archive, create] = await raceAfterMissionLock(createRaceMissionId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/missions/${createRaceMissionId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const createPromise = fetch(`${baseUrl}/v1/missions/${createRaceMissionId}/assignments`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ userId: assignee.id, role: 'CONTRIBUTOR', isLead: false }),
      });
      return Promise.all([archivePromise, createPromise]);
    });
    const archivedMission = await prisma.recruitmentMission.findUniqueOrThrow({
      where: { id: createRaceMissionId },
    });
    const activeAssignments = await prisma.missionRecruiter.count({
      where: { missionId: createRaceMissionId, status: AssignmentStatus.ACTIVE, archivedAt: null },
    });

    expect(archive.status).toBe(201);
    expect(create.status).toBe(409);
    expect(await readErrorCode(create)).toBe('MISSION_TERMINAL');
    expect(archivedMission.state).toBe(RecruitmentMissionState.ARCHIVED);
    expect(activeAssignments).toBe(0);

    const updateRaceMissionId = await createMissionRecord(
      baseUrl,
      token,
      clientId,
      'Issue19 Race Update',
    );
    await prisma.recruitmentMission.update({
      where: { id: updateRaceMissionId },
      data: {
        state: RecruitmentMissionState.CANCELED,
        closureReason: 'CLIENT_CLOSED_OR_CANCELED',
        closedAt: new Date(),
      },
    });
    const [archiveUpdate, update] = await raceAfterMissionLock(updateRaceMissionId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/missions/${updateRaceMissionId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const updatePromise = fetch(`${baseUrl}/v1/missions/${updateRaceMissionId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ title: 'Issue19 Race Update Mutated' }),
      });
      return Promise.all([archivePromise, updatePromise]);
    });
    const missionAfterRace = await prisma.recruitmentMission.findUniqueOrThrow({
      where: { id: updateRaceMissionId },
    });

    expect(archiveUpdate.status).toBe(201);
    expect(update.status).toBe(409);
    expect(await readErrorCode(update)).toBe('MISSION_TERMINAL');
    expect(missionAfterRace.title).toBe('Issue19 Race Update');
    expect(missionAfterRace.state).toBe(RecruitmentMissionState.ARCHIVED);
  });
});
