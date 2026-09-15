import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  CandidateDetailResponseSchema,
  CandidateEducationDetailResponseSchema,
  CandidateLanguageDetailResponseSchema,
  CandidateListResponseSchema,
  CandidateSkillDetailResponseSchema,
  CandidateWorkExperienceDetailResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  CandidateStatus,
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const normalCandidatePermissions = [
  'candidates:view',
  'candidates:create',
  'candidates:update',
  'candidates:status:manage',
  'candidates:archive',
  'candidate_profile:view',
  'candidate_profile:manage',
] as const;
const sensitiveCandidatePermissions = [
  'candidate_compensation:view',
  'candidate_compensation:update',
  'candidate_consent:view',
  'candidate_consent:manage',
] as const;
const mutationOnlyCandidatePermissions = [
  'candidates:view',
  'candidates:create',
  'candidates:update',
  'candidates:status:manage',
  'candidates:archive',
] as const;

async function cleanCandidateTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          entityType: {
            in: [
              'Candidate',
              'CandidateSkill',
              'CandidateLanguage',
              'CandidateWorkExperience',
              'CandidateEducation',
            ],
          },
        },
        { targetUser: { normalizedEmail: { endsWith: '@candidates.test' } } },
      ],
    },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@candidates.test' } },
  });
  await prisma.candidateSkill.deleteMany({
    where: { candidate: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.candidateLanguage.deleteMany({
    where: { candidate: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.candidateWorkExperience.deleteMany({
    where: { candidate: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.candidateEducation.deleteMany({
    where: { candidate: { normalizedEmail: { endsWith: '@candidates.test' } } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@candidates.test' } },
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
      description: `Synthetic ${roleName} role for candidate tests.`,
      status: 'ACTIVE',
    },
  });

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for candidate tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for candidate tests.`,
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

async function ensureRoleWithOnlyCandidatePermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  await ensureRoleWithPermissions(roleName, permissionCodes);
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: roleName },
      permission: {
        code: {
          in: [
            ...normalCandidatePermissions,
            ...sensitiveCandidatePermissions,
            ...mutationOnlyCandidatePermissions,
          ],
        },
      },
      NOT: { permission: { code: { in: [...permissionCodes] } } },
    },
    data: { archivedAt: new Date() },
  });
}

async function prepareCandidateCatalog(): Promise<void> {
  await ensureRoleWithPermissions(RoleName.SUPER_ADMIN, [
    ...normalCandidatePermissions,
    ...sensitiveCandidatePermissions,
  ]);
  await ensureRoleWithPermissions(RoleName.HR_MANAGER, normalCandidatePermissions);
  await ensureRoleWithOnlyCandidatePermissions(RoleName.GUEST, mutationOnlyCandidatePermissions);
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: RoleName.HR_MANAGER },
      permission: { code: { in: [...sensitiveCandidatePermissions] } },
    },
    data: { archivedAt: new Date() },
  });
  await prisma.role.upsert({
    where: { name: RoleName.MANAGER },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: RoleName.MANAGER,
      description: 'Synthetic manager role without unresolved candidate row-scope permissions.',
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: RoleName.MANAGER },
      permission: {
        code: { in: [...normalCandidatePermissions, ...sensitiveCandidatePermissions] },
      },
    },
    data: { archivedAt: new Date() },
  });
}

type RolePermissionSnapshot = { permissionId: string; archivedAt: Date | null }[];

/** The role's grants, so a test can narrow a shared role and put it back exactly. */
async function snapshotRolePermissions(roleName: RoleName): Promise<RolePermissionSnapshot> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: roleName },
    include: { permissions: true },
  });
  return role.permissions.map(({ archivedAt, permissionId }) => ({ archivedAt, permissionId }));
}

async function restoreRolePermissions(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot,
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.deleteMany({
    where: { roleId: role.id, permissionId: { notIn: snapshot.map((row) => row.permissionId) } },
  });
  for (const row of snapshot) {
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: role.id, permissionId: row.permissionId } },
      data: { archivedAt: row.archivedAt },
    });
  }
}

async function createUser(email: string, roleName: RoleName): Promise<void> {
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: {
      userId: user.id,
      passwordHash: await passwords.hashPassword(testPassword),
    },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function raceAfterCandidateLock<T>(
  candidateId: string,
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
      await transaction.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${candidateId}::uuid FOR UPDATE`;
      locked?.();
      await releasePromise;
    },
    { timeout: 10000 },
  );

  await lockedPromise;
  const resultPromise = startRequests();
  releaseLock?.();
  await lockPromise;
  return resultPromise;
}

async function createCandidateRecord(
  baseUrl: string,
  accessToken: string,
  email: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/candidates`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      displayName: `Synthetic ${email}`,
      email,
      currentJobTitle: 'Recruitment Specialist',
      city: 'Paris',
      country: 'France',
      source: 'Synthetic',
    }),
  });
  const body = CandidateDetailResponseSchema.parse(await response.json());
  expect(response.status).toBe(201);
  return body.candidate.id;
}

describe('candidate master profiles', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    await cleanCandidateTestRecords();
    await prepareCandidateCatalog();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await cleanCandidateTestRecords();
    await app.close();
    await prisma.$disconnect();
  });

  it('allows authorized candidate listing and denies unresolved manager scope safely', async () => {
    await createUser('viewer@candidates.test', RoleName.HR_MANAGER);
    await createUser('manager@candidates.test', RoleName.MANAGER);
    const allowedToken = await loginAccessToken(baseUrl, 'viewer@candidates.test');
    const deniedToken = await loginAccessToken(baseUrl, 'manager@candidates.test');
    await createCandidateRecord(baseUrl, allowedToken, 'viewer.candidate@candidates.test');

    const allowed = await fetch(`${baseUrl}/v1/candidates?search=viewer&page=1&pageSize=5`, {
      headers: authHeaders(allowedToken),
    });
    const denied = await fetch(`${baseUrl}/v1/candidates`, {
      headers: authHeaders(deniedToken),
    });
    const body = CandidateListResponseSchema.parse(await allowed.json());

    expect(allowed.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(denied.status).toBe(403);
  });

  it('protects compensation and consent fields with dedicated permissions and safe audit', async () => {
    await createUser('sensitive-super@candidates.test', RoleName.SUPER_ADMIN);
    await createUser('sensitive-hr@candidates.test', RoleName.HR_MANAGER);
    const superToken = await loginAccessToken(baseUrl, 'sensitive-super@candidates.test');
    const ordinaryToken = await loginAccessToken(baseUrl, 'sensitive-hr@candidates.test');

    const create = await fetch(`${baseUrl}/v1/candidates`, {
      method: 'POST',
      headers: authHeaders(superToken),
      body: JSON.stringify({
        displayName: 'Sensitive Candidate',
        email: 'sensitive.candidate@candidates.test',
        salaryExpectationCents: 9000000,
        salaryExpectationCurrency: 'EUR',
        consentStatus: 'GRANTED',
        consentRecordedAt: '2026-07-21T10:00:00.000Z',
      }),
    });
    const candidateId = CandidateDetailResponseSchema.parse(await create.json()).candidate.id;

    const ordinary = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
      headers: authHeaders(ordinaryToken),
    });
    const sensitive = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
      headers: authHeaders(superToken),
    });
    const rejectedWrite = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: authHeaders(ordinaryToken),
      body: JSON.stringify({ salaryExpectationCents: 9500000 }),
    });
    const ordinaryBody = CandidateDetailResponseSchema.parse(await ordinary.json());
    const sensitiveBody = CandidateDetailResponseSchema.parse(await sensitive.json());
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'Candidate' },
    });
    const serializedAudit = JSON.stringify(auditLogs);

    expect(ordinaryBody.candidate.compensation).toBeNull();
    expect(ordinaryBody.candidate.consent).toBeNull();
    expect(sensitiveBody.candidate.compensation?.salaryExpectationCents).toBe(9000000);
    expect(sensitiveBody.candidate.consent?.consentStatus).toBe('GRANTED');
    expect(rejectedWrite.status).toBe(403);
    expect(serializedAudit).not.toContain('9000000');
    expect(serializedAudit).not.toContain('sensitive.candidate@candidates.test');
  });

  it('rejects normalized-email duplicates without silently merging candidate masters', async () => {
    await createUser('duplicate@candidates.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'duplicate@candidates.test');
    const firstId = await createCandidateRecord(baseUrl, token, 'duplicate.owner@candidates.test');

    const duplicate = await fetch(`${baseUrl}/v1/candidates`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'Duplicate Candidate',
        email: 'DUPLICATE.OWNER@candidates.test',
      }),
    });
    const candidateCount = await prisma.candidate.count({
      where: { normalizedEmail: 'duplicate.owner@candidates.test' },
    });

    expect(duplicate.status).toBe(409);
    expect(await readErrorCode(duplicate)).toBe('CANDIDATE_EMAIL_ALREADY_EXISTS');
    expect(candidateCount).toBe(1);
    expect(await prisma.candidate.findUnique({ where: { id: firstId } })).toBeTruthy();
  });

  it('manages lifecycle, talent-pool movement, archival, and archived write rejection', async () => {
    await createUser('lifecycle@candidates.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'lifecycle@candidates.test');
    const candidateId = await createCandidateRecord(baseUrl, token, 'lifecycle@candidates.test');

    const talentPool = await fetch(`${baseUrl}/v1/candidates/${candidateId}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status: CandidateStatus.TALENT_POOL }),
    });
    const active = await fetch(`${baseUrl}/v1/candidates/${candidateId}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status: CandidateStatus.ACTIVE }),
    });
    const archived = await fetch(`${baseUrl}/v1/candidates/${candidateId}/archive`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    const updateArchived = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ displayName: 'Blocked Candidate Update' }),
    });
    const createChildArchived = await fetch(`${baseUrl}/v1/candidates/${candidateId}/skills`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Blocked Skill' }),
    });
    const persisted = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

    expect(talentPool.status).toBe(200);
    expect(active.status).toBe(200);
    expect(archived.status).toBe(201);
    expect(updateArchived.status).toBe(409);
    expect(createChildArchived.status).toBe(409);
    expect(persisted.status).toBe(CandidateStatus.ARCHIVED);
    expect(persisted.archivedAt).toBeInstanceOf(Date);
  });

  it('manages structured profile children and protects nested ownership from IDOR', async () => {
    await createUser('profile@candidates.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'profile@candidates.test');
    const firstId = await createCandidateRecord(baseUrl, token, 'profile.one@candidates.test');
    const secondId = await createCandidateRecord(baseUrl, token, 'profile.two@candidates.test');

    const skillCreate = await fetch(`${baseUrl}/v1/candidates/${firstId}/skills`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'TypeScript', level: 'Advanced', years: 5 }),
    });
    const skill = CandidateSkillDetailResponseSchema.parse(await skillCreate.json()).skill;
    const language = await fetch(`${baseUrl}/v1/candidates/${firstId}/languages`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ language: 'French', proficiency: 'Professional' }),
    });
    const workExperience = await fetch(`${baseUrl}/v1/candidates/${firstId}/work-experiences`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ employer: 'Synthetic Employer', title: 'Developer' }),
    });
    const education = await fetch(`${baseUrl}/v1/candidates/${firstId}/education`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ institution: 'Synthetic University', qualification: 'MSc' }),
    });
    const wrongParent = await fetch(`${baseUrl}/v1/candidates/${secondId}/skills/${skill.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ level: 'Blocked' }),
    });
    const archiveSkill = await fetch(
      `${baseUrl}/v1/candidates/${firstId}/skills/${skill.id}/archive`,
      { method: 'POST', headers: authHeaders(token) },
    );
    const detail = await fetch(`${baseUrl}/v1/candidates/${firstId}`, {
      headers: authHeaders(token),
    });
    const body = CandidateDetailResponseSchema.parse(await detail.json());

    expect(skillCreate.status).toBe(201);
    expect(
      CandidateLanguageDetailResponseSchema.parse(await language.json()).language.language,
    ).toBe('French');
    expect(
      CandidateWorkExperienceDetailResponseSchema.parse(await workExperience.json()).workExperience
        .employer,
    ).toBe('Synthetic Employer');
    expect(
      CandidateEducationDetailResponseSchema.parse(await education.json()).education.institution,
    ).toBe('Synthetic University');
    expect(wrongParent.status).toBe(404);
    expect(archiveSkill.status).toBe(201);
    expect(
      body.candidate.skills.some((candidateSkill) => candidateSkill.name === 'TypeScript'),
    ).toBe(true);
  });

  it('redacts structured profile data from candidate mutation responses without profile view', async () => {
    await createUser('profile-redaction-owner@candidates.test', RoleName.HR_MANAGER);
    await createUser('profile-redaction-mutator@candidates.test', RoleName.GUEST);
    const ownerToken = await loginAccessToken(baseUrl, 'profile-redaction-owner@candidates.test');
    const mutatorToken = await loginAccessToken(
      baseUrl,
      'profile-redaction-mutator@candidates.test',
    );
    const candidateId = await createCandidateRecord(
      baseUrl,
      ownerToken,
      'profile-redaction.subject@candidates.test',
    );

    await fetch(`${baseUrl}/v1/candidates/${candidateId}/skills`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ name: 'Confidential Skill', level: 'Advanced' }),
    });
    await fetch(`${baseUrl}/v1/candidates/${candidateId}/languages`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ language: 'Confidential Language', proficiency: 'Native' }),
    });
    await fetch(`${baseUrl}/v1/candidates/${candidateId}/work-experiences`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ employer: 'Confidential Employer', title: 'Confidential Role' }),
    });
    await fetch(`${baseUrl}/v1/candidates/${candidateId}/education`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        institution: 'Confidential University',
        qualification: 'Confidential Degree',
      }),
    });

    const create = await fetch(`${baseUrl}/v1/candidates`, {
      method: 'POST',
      headers: authHeaders(mutatorToken),
      body: JSON.stringify({
        displayName: 'Mutation Only Created Candidate',
        email: 'profile-redaction.created@candidates.test',
      }),
    });
    const detail = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
      headers: authHeaders(mutatorToken),
    });
    const update = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: authHeaders(mutatorToken),
      body: JSON.stringify({ displayName: 'Mutation Only Updated Candidate' }),
    });
    const status = await fetch(`${baseUrl}/v1/candidates/${candidateId}/status`, {
      method: 'PATCH',
      headers: authHeaders(mutatorToken),
      body: JSON.stringify({ status: CandidateStatus.TALENT_POOL }),
    });
    const archive = await fetch(`${baseUrl}/v1/candidates/${candidateId}/archive`, {
      method: 'POST',
      headers: authHeaders(mutatorToken),
    });

    const responses = await Promise.all(
      [create, detail, update, status, archive].map(async (response) => {
        expect([200, 201]).toContain(response.status);
        return CandidateDetailResponseSchema.parse(await response.json()).candidate;
      }),
    );

    for (const candidate of responses) {
      expect(candidate.skills).toEqual([]);
      expect(candidate.languages).toEqual([]);
      expect(candidate.workExperiences).toEqual([]);
      expect(candidate.education).toEqual([]);
      expect(candidate.compensation).toBeNull();
      expect(candidate.consent).toBeNull();
    }
  });

  it('serializes candidate archival against concurrent skill creation', async () => {
    await createUser('race-child@candidates.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'race-child@candidates.test');
    const candidateId = await createCandidateRecord(baseUrl, token, 'race-child@candidates.test');

    const [archive, create] = await raceAfterCandidateLock(candidateId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/candidates/${candidateId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      await sleep(75);
      const createPromise = fetch(`${baseUrl}/v1/candidates/${candidateId}/skills`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Post Archive Skill' }),
      });

      return Promise.all([archivePromise, createPromise]);
    });
    const activeSkills = await prisma.candidateSkill.count({
      where: { candidateId, archivedAt: null },
    });
    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

    expect(archive.status).toBe(201);
    expect(create.status).toBe(409);
    expect(await readErrorCode(create)).toBe('CANDIDATE_ARCHIVED');
    expect(candidate.status).toBe(CandidateStatus.ARCHIVED);
    expect(activeSkills).toBe(0);
  });

  it('serializes candidate archival against concurrent ordinary profile updates', async () => {
    await createUser('race-update@candidates.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'race-update@candidates.test');
    const candidateId = await createCandidateRecord(baseUrl, token, 'race-update@candidates.test');

    const [archive, update] = await raceAfterCandidateLock(candidateId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/candidates/${candidateId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      await sleep(75);
      const updatePromise = fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ displayName: 'Post Archive Candidate Mutation' }),
      });

      return Promise.all([archivePromise, updatePromise]);
    });
    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

    expect(archive.status).toBe(201);
    expect(update.status).toBe(409);
    expect(await readErrorCode(update)).toBe('CANDIDATE_ARCHIVED');
    expect(candidate.displayName).toBe('Synthetic race-update@candidates.test');
    expect(candidate.status).toBe(CandidateStatus.ARCHIVED);
  });

  it('pages candidates deterministically and composes source, status, and search', async () => {
    await createUser('paging@candidates.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'paging@candidates.test');
    const probes = [
      { source: 'public_application', status: CandidateStatus.ACTIVE },
      { source: 'LinkedIn', status: CandidateStatus.ACTIVE },
      { source: 'public_application', status: CandidateStatus.TALENT_POOL },
      { source: 'public_application', status: CandidateStatus.ACTIVE },
      { source: 'LinkedIn', status: CandidateStatus.ACTIVE },
    ];
    const ids: string[] = [];
    for (const [index, probe] of probes.entries()) {
      const response = await fetch(`${baseUrl}/v1/candidates`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          displayName: `Paging Probe ${index + 1}`,
          email: `paging-probe-${index + 1}@candidates.test`,
          source: probe.source,
          status: probe.status,
        }),
      });
      expect(response.status).toBe(201);
      ids.push(CandidateDetailResponseSchema.parse(await response.json()).candidate.id);
    }
    const list = async (query: string) => {
      const response = await fetch(`${baseUrl}/v1/candidates?${query}`, {
        headers: authHeaders(token),
      });
      expect(response.status).toBe(200);
      return CandidateListResponseSchema.parse(await response.json());
    };

    // Three server pages of two cover every probe exactly once, newest first.
    const pages = await Promise.all(
      [1, 2, 3].map((page) => list(`search=Paging%20Probe&pageSize=2&page=${page}`)),
    );
    expect(pages.map((page) => page.candidates.length)).toEqual([2, 2, 1]);
    expect(pages.every((page) => page.pagination.total === 5)).toBe(true);
    const paged = pages.flatMap((page) => page.candidates.map((candidate) => candidate.id));
    expect(new Set(paged).size).toBe(5);
    expect(paged).toEqual([...ids].reverse());
    // The same page reads the same rows again.
    expect(
      (await list('search=Paging%20Probe&pageSize=2&page=2')).candidates.map((c) => c.id),
    ).toEqual(pages[1]!.candidates.map((candidate) => candidate.id));
    // A page past the end is empty but keeps the total, so the client can recover.
    const beyond = await list('search=Paging%20Probe&pageSize=2&page=4');
    expect(beyond.candidates).toEqual([]);
    expect(beyond.pagination.total).toBe(5);

    // Source is an exact match that ignores case, and it combines with status and search.
    const applications = await list('search=Paging%20Probe&source=PUBLIC_APPLICATION');
    expect(applications.candidates.map((candidate) => candidate.id).sort()).toEqual(
      [ids[0], ids[2], ids[3]].sort(),
    );
    const activeApplications = await list(
      'search=Paging%20Probe&source=public_application&status=ACTIVE&pageSize=1&page=2',
    );
    expect(activeApplications.pagination.total).toBe(2);
    expect(activeApplications.candidates.map((candidate) => candidate.id)).toEqual([ids[0]]);
    const partialSource = await list('search=Paging%20Probe&source=public');
    expect(partialSource.pagination.total).toBe(0);
  });

  it('updates and archives each structured record in place, keeping archived rows as history', async () => {
    await createUser('maintain@candidates.test', RoleName.HR_MANAGER);
    await createUser('maintain-no-profile@candidates.test', RoleName.GUEST);
    const token = await loginAccessToken(baseUrl, 'maintain@candidates.test');
    const noProfileToken = await loginAccessToken(baseUrl, 'maintain-no-profile@candidates.test');
    const candidateId = await createCandidateRecord(baseUrl, token, 'maintain@candidates.test');
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`${baseUrl}/v1/candidates/${candidateId}/${path}`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as Record<string, { id: string }>;
    };
    const skill = (await post('skills', { name: 'Python', level: 'Advanced' })).skill!;
    const language = (await post('languages', { language: 'French', proficiency: 'Fluent' }))
      .language!;
    const experience = (
      await post('work-experiences', {
        employer: 'Company A',
        title: 'Data Analyst',
        startDate: '2019-01',
        endDate: '2021-12',
      })
    ).workExperience!;
    const education = (
      await post('education', {
        institution: 'Example University',
        qualification: 'Master in Data Science',
        field: 'Statistics',
      })
    ).education!;
    const patch = (path: string, body: unknown, accessToken = token) =>
      fetch(`${baseUrl}/v1/candidates/${candidateId}/${path}`, {
        method: 'PATCH',
        headers: authHeaders(accessToken),
        body: JSON.stringify(body),
      });

    // Each record is corrected in place: the same row, no duplicate.
    const skillUpdate = await patch(`skills/${skill.id}`, { level: 'Expert' });
    expect(CandidateSkillDetailResponseSchema.parse(await skillUpdate.json()).skill).toMatchObject({
      id: skill.id,
      level: 'Expert',
      name: 'Python',
    });
    const languageUpdate = await patch(`languages/${language.id}`, { proficiency: 'Native' });
    expect(
      CandidateLanguageDetailResponseSchema.parse(await languageUpdate.json()).language.proficiency,
    ).toBe('Native');
    const experienceUpdate = await patch(`work-experiences/${experience.id}`, {
      startDate: '2018-09',
      endDate: '2021-08',
    });
    expect(
      CandidateWorkExperienceDetailResponseSchema.parse(await experienceUpdate.json())
        .workExperience,
    ).toMatchObject({ endDate: '2021-08', id: experience.id, startDate: '2018-09' });
    const educationUpdate = await patch(`education/${education.id}`, { field: null });
    expect(
      CandidateEducationDetailResponseSchema.parse(await educationUpdate.json()).education.field,
    ).toBeNull();
    expect(await prisma.candidateSkill.count({ where: { candidateId } })).toBe(1);
    expect(await prisma.candidateWorkExperience.count({ where: { candidateId } })).toBe(1);

    // Without candidate_profile:manage a record cannot be changed or archived.
    const denied = await patch(`skills/${skill.id}`, { level: 'Beginner' }, noProfileToken);
    expect(denied.status).toBe(403);
    const deniedArchive = await fetch(
      `${baseUrl}/v1/candidates/${candidateId}/skills/${skill.id}/archive`,
      { method: 'POST', headers: authHeaders(noProfileToken) },
    );
    expect(deniedArchive.status).toBe(403);

    // Archival keeps every row, marked archived, in the candidate detail.
    const routes = [
      ['skills', skill.id, 'CANDIDATE_SKILL_ARCHIVED', { level: 'Beginner' }],
      ['languages', language.id, 'CANDIDATE_LANGUAGE_ARCHIVED', { proficiency: 'Basic' }],
      [
        'work-experiences',
        experience.id,
        'CANDIDATE_WORK_EXPERIENCE_ARCHIVED',
        { title: 'Senior Data Analyst' },
      ],
      ['education', education.id, 'CANDIDATE_EDUCATION_ARCHIVED', { qualification: 'PhD' }],
    ] as const;
    for (const [path, id] of routes) {
      const archived = await fetch(
        `${baseUrl}/v1/candidates/${candidateId}/${path}/${id}/archive`,
        {
          method: 'POST',
          headers: authHeaders(token),
        },
      );
      expect(archived.status).toBe(201);
    }
    const detail = CandidateDetailResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/candidates/${candidateId}`, { headers: authHeaders(token) })
      ).json(),
    ).candidate;
    for (const rows of [
      detail.skills,
      detail.languages,
      detail.workExperiences,
      detail.education,
    ]) {
      expect(rows).toHaveLength(1);
      expect(rows[0]!.archivedAt).not.toBeNull();
    }
    expect(detail.skills[0]!.level).toBe('Expert');

    // An archived record can be neither edited nor archived again, and nothing is deleted.
    for (const [path, id, code, body] of routes) {
      const edit = await patch(`${path}/${id}`, body);
      expect(edit.status).toBe(409);
      expect(await readErrorCode(edit)).toBe(code);
      const again = await fetch(`${baseUrl}/v1/candidates/${candidateId}/${path}/${id}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      expect(again.status).toBe(409);
      const deletion = await fetch(`${baseUrl}/v1/candidates/${candidateId}/${path}/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      expect(deletion.status).toBe(404);
    }
    expect(await prisma.candidateSkill.count({ where: { candidateId } })).toBe(1);
    expect(await prisma.candidateLanguage.count({ where: { candidateId } })).toBe(1);
    expect(await prisma.candidateWorkExperience.count({ where: { candidateId } })).toBe(1);
    expect(await prisma.candidateEducation.count({ where: { candidateId } })).toBe(1);

    // Every change is audited without the record's values.
    const audits = await prisma.auditLog.findMany({
      where: { entityId: { in: [skill.id, language.id, experience.id, education.id] } },
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual(
      [
        'candidates.education.archived',
        'candidates.education.created',
        'candidates.education.updated',
        'candidates.language.archived',
        'candidates.language.created',
        'candidates.language.updated',
        'candidates.skill.archived',
        'candidates.skill.created',
        'candidates.skill.updated',
        'candidates.work_experience.archived',
        'candidates.work_experience.created',
        'candidates.work_experience.updated',
      ].sort(),
    );
    const serialized = JSON.stringify(audits);
    for (const value of ['Expert', 'Native', '2018-09', 'Master in Data Science']) {
      expect(serialized).not.toContain(value);
    }
  });

  describe('sensitive compensation and consent maintenance (Issue #69)', () => {
    const SENSITIVE_UPDATE_ACTIONS = [
      'candidates.compensation.updated',
      'candidates.consent.updated',
    ];

    async function createSensitiveCandidate(token: string, email: string): Promise<string> {
      const response = await fetch(`${baseUrl}/v1/candidates`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          displayName: 'Sensitive Maintenance Candidate',
          email,
          salaryExpectationCents: 9000000,
          salaryExpectationCurrency: 'EUR',
          consentStatus: 'GRANTED',
          consentRecordedAt: '2026-07-21T10:00:00.000Z',
        }),
      });
      expect(response.status).toBe(201);
      return CandidateDetailResponseSchema.parse(await response.json()).candidate.id;
    }

    function patchCandidate(candidateId: string, token: string, body: unknown) {
      return fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
    }

    async function actionsFor(candidateId: string): Promise<string[]> {
      const audits = await prisma.auditLog.findMany({
        where: { entityId: candidateId },
        orderBy: { createdAt: 'asc' },
      });
      return audits.map((audit) => audit.action);
    }

    const count = (actions: string[], action: string) =>
      actions.filter((entry) => entry === action).length;

    it('records a dedicated value-free audit event only when a sensitive group actually changes', async () => {
      await createUser('sensitive-audit@candidates.test', RoleName.SUPER_ADMIN);
      const token = await loginAccessToken(baseUrl, 'sensitive-audit@candidates.test');
      const candidateId = await createSensitiveCandidate(
        token,
        'sensitive.audit.candidate@candidates.test',
      );
      const stored = () => prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

      // Amount only: the currency, the consent, and the ordinary fields are untouched.
      const amount = await patchCandidate(candidateId, token, { salaryExpectationCents: 3600050 });
      expect(amount.status).toBe(200);
      expect(
        CandidateDetailResponseSchema.parse(await amount.json()).candidate.compensation,
      ).toEqual({ salaryExpectationCents: 3600050, salaryExpectationCurrency: 'EUR' });
      let actions = await actionsFor(candidateId);
      expect(count(actions, 'candidates.candidate.updated')).toBe(1);
      expect(count(actions, 'candidates.compensation.updated')).toBe(1);
      expect(count(actions, 'candidates.consent.updated')).toBe(0);

      // Currency only.
      expect(
        (await patchCandidate(candidateId, token, { salaryExpectationCurrency: 'MAD' })).status,
      ).toBe(200);
      // Status only: the recorded instant is not changed as a side effect.
      expect((await patchCandidate(candidateId, token, { consentStatus: 'REVOKED' })).status).toBe(
        200,
      );
      expect((await stored()).consentRecordedAt?.toISOString()).toBe('2026-07-21T10:00:00.000Z');
      // Recorded instant only.
      expect(
        (
          await patchCandidate(candidateId, token, {
            consentRecordedAt: '2026-08-01T09:30:00.000Z',
          })
        ).status,
      ).toBe(200);
      actions = await actionsFor(candidateId);
      expect(count(actions, 'candidates.compensation.updated')).toBe(2);
      expect(count(actions, 'candidates.consent.updated')).toBe(2);
      expect(await stored()).toMatchObject({
        consentStatus: 'REVOKED',
        salaryExpectationCents: 3600050,
        salaryExpectationCurrency: 'MAD',
      });

      // Sending the stored values again is not a sensitive change, even with the
      // same instant written differently and the currency padded.
      const same = await patchCandidate(candidateId, token, {
        salaryExpectationCents: 3600050,
        salaryExpectationCurrency: ' MAD ',
        consentStatus: 'REVOKED',
        consentRecordedAt: '2026-08-01T09:30:00Z',
      });
      expect(same.status).toBe(200);
      actions = await actionsFor(candidateId);
      expect(count(actions, 'candidates.candidate.updated')).toBe(5);
      expect(count(actions, 'candidates.compensation.updated')).toBe(2);
      expect(count(actions, 'candidates.consent.updated')).toBe(2);

      // An ordinary profile edit is not a sensitive change either.
      expect((await patchCandidate(candidateId, token, { city: 'Casablanca' })).status).toBe(200);
      actions = await actionsFor(candidateId);
      expect(count(actions, 'candidates.compensation.updated')).toBe(2);
      expect(count(actions, 'candidates.consent.updated')).toBe(2);

      // Clearing an amount and a recorded instant stores null and is audited once per group.
      const cleared = await patchCandidate(candidateId, token, {
        salaryExpectationCents: null,
        consentRecordedAt: null,
      });
      expect(cleared.status).toBe(200);
      expect(await stored()).toMatchObject({
        consentRecordedAt: null,
        salaryExpectationCents: null,
        salaryExpectationCurrency: 'MAD',
      });
      actions = await actionsFor(candidateId);
      expect(count(actions, 'candidates.compensation.updated')).toBe(3);
      expect(count(actions, 'candidates.consent.updated')).toBe(3);

      // The dedicated events identify the actor and the candidate, and nothing else.
      const audits = await prisma.auditLog.findMany({
        where: { entityId: candidateId, action: { in: SENSITIVE_UPDATE_ACTIONS } },
      });
      const actor = await prisma.user.findUniqueOrThrow({
        where: { normalizedEmail: 'sensitive-audit@candidates.test' },
      });
      expect(audits.every((audit) => audit.actorUserId === actor.id)).toBe(true);
      expect(audits.every((audit) => audit.entityType === 'Candidate')).toBe(true);
      const serialized = JSON.stringify(
        await prisma.auditLog.findMany({ where: { entityId: candidateId } }),
      );
      for (const value of [
        '9000000',
        '3600050',
        'EUR',
        'MAD',
        'GRANTED',
        'REVOKED',
        '2026-07-21T10',
        '2026-08-01',
        'sensitive.audit.candidate@candidates.test',
        'Casablanca',
        'salaryExpectation',
        'consentStatus',
        'consentRecordedAt',
      ]) {
        expect(serialized).not.toContain(value);
      }
    });

    it('rejects denied, archived, malformed, and out-of-range sensitive writes without a sensitive-update event', async () => {
      const snapshot = await snapshotRolePermissions(RoleName.TEAM_LEADER);
      try {
        // Candidate update plus both view permissions, without update or manage.
        await ensureRoleWithOnlyCandidatePermissions(RoleName.TEAM_LEADER, [
          'candidates:view',
          'candidates:update',
          'candidate_compensation:view',
          'candidate_consent:view',
        ]);
        await createUser('sensitive-owner@candidates.test', RoleName.SUPER_ADMIN);
        await createUser('sensitive-view-only@candidates.test', RoleName.TEAM_LEADER);
        await createUser('sensitive-ordinary@candidates.test', RoleName.HR_MANAGER);
        const ownerToken = await loginAccessToken(baseUrl, 'sensitive-owner@candidates.test');
        const viewOnlyToken = await loginAccessToken(
          baseUrl,
          'sensitive-view-only@candidates.test',
        );
        const ordinaryToken = await loginAccessToken(baseUrl, 'sensitive-ordinary@candidates.test');
        const candidateId = await createSensitiveCandidate(
          ownerToken,
          'sensitive.denied.candidate@candidates.test',
        );
        const before = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

        // The view-only actor reads both areas but can change neither.
        const read = await fetch(`${baseUrl}/v1/candidates/${candidateId}`, {
          headers: authHeaders(viewOnlyToken),
        });
        const readBody = CandidateDetailResponseSchema.parse(await read.json()).candidate;
        expect(readBody.compensation?.salaryExpectationCents).toBe(9000000);
        expect(readBody.consent?.consentStatus).toBe('GRANTED');

        const denials = [
          [
            viewOnlyToken,
            { salaryExpectationCents: 100 },
            'CANDIDATE_COMPENSATION_PERMISSION_REQUIRED',
          ],
          [
            viewOnlyToken,
            { salaryExpectationCurrency: 'USD' },
            'CANDIDATE_COMPENSATION_PERMISSION_REQUIRED',
          ],
          [viewOnlyToken, { consentStatus: 'REVOKED' }, 'CANDIDATE_CONSENT_PERMISSION_REQUIRED'],
          [viewOnlyToken, { consentRecordedAt: null }, 'CANDIDATE_CONSENT_PERMISSION_REQUIRED'],
          [ordinaryToken, { consentStatus: 'EXPIRED' }, 'CANDIDATE_CONSENT_PERMISSION_REQUIRED'],
        ] as const;
        for (const [token, body, code] of denials) {
          const denied = await patchCandidate(candidateId, token, body);
          const text = await denied.text();
          expect(denied.status).toBe(403);
          expect(JSON.parse(text)).toMatchObject({ error: { code } });
          for (const value of ['9000000', 'EUR', 'GRANTED', '2026-07-21']) {
            expect(text).not.toContain(value);
          }
        }

        // Malformed amounts are rejected by the contract before any write.
        for (const salaryExpectationCents of [-1, 36000.5, '3600000', 2147483648]) {
          const invalid = await patchCandidate(candidateId, ownerToken, { salaryExpectationCents });
          expect(invalid.status).toBe(400);
          expect(await readErrorCode(invalid)).toBe('INVALID_UPDATE_CANDIDATE_REQUEST');
        }
        for (const body of [{ salaryExpectationCurrency: 'EURO' }, { consentStatus: 'granted' }]) {
          expect((await patchCandidate(candidateId, ownerToken, body)).status).toBe(400);
        }
        const oversizedCreate = await fetch(`${baseUrl}/v1/candidates`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({ displayName: 'Oversized', salaryExpectationCents: 2147483648 }),
        });
        expect(oversizedCreate.status).toBe(400);
        let actions = await actionsFor(candidateId);
        expect(actions.filter((action) => SENSITIVE_UPDATE_ACTIONS.includes(action))).toEqual([]);
        expect(count(actions, 'candidates.candidate.updated')).toBe(0);

        // The largest amount the column holds is accepted.
        const largest = await patchCandidate(candidateId, ownerToken, {
          salaryExpectationCents: 2147483647,
        });
        expect(largest.status).toBe(200);
        actions = await actionsFor(candidateId);
        expect(count(actions, 'candidates.compensation.updated')).toBe(1);
        const settled = actions.length;

        // An archived candidate accepts no sensitive write.
        const archive = await fetch(`${baseUrl}/v1/candidates/${candidateId}/archive`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
        });
        expect(archive.status).toBe(201);
        const archived = await patchCandidate(candidateId, ownerToken, {
          salaryExpectationCents: 100,
          consentStatus: 'EXPIRED',
        });
        expect(archived.status).toBe(409);
        expect(await readErrorCode(archived)).toBe('CANDIDATE_ARCHIVED');

        const after = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
        expect(after).toMatchObject({
          consentRecordedAt: before.consentRecordedAt,
          consentStatus: 'GRANTED',
          salaryExpectationCents: 2147483647,
          salaryExpectationCurrency: 'EUR',
        });
        expect((await actionsFor(candidateId)).slice(settled)).toEqual([
          'candidates.candidate.archived',
        ]);
      } finally {
        await restoreRolePermissions(RoleName.TEAM_LEADER, snapshot);
      }
    });

    it('returns no sensitive values to an actor who may write them without their view permission', async () => {
      const snapshot = await snapshotRolePermissions(RoleName.EMPLOYEE);
      try {
        await ensureRoleWithOnlyCandidatePermissions(RoleName.EMPLOYEE, [
          'candidates:view',
          'candidates:update',
          'candidate_compensation:update',
          'candidate_consent:manage',
        ]);
        await createUser('sensitive-blind-owner@candidates.test', RoleName.SUPER_ADMIN);
        await createUser('sensitive-blind@candidates.test', RoleName.EMPLOYEE);
        const ownerToken = await loginAccessToken(baseUrl, 'sensitive-blind-owner@candidates.test');
        const blindToken = await loginAccessToken(baseUrl, 'sensitive-blind@candidates.test');
        const candidateId = await createSensitiveCandidate(
          ownerToken,
          'sensitive.blind.candidate@candidates.test',
        );

        // The existing server rule is preserved: the write is authorized by
        // update/manage alone, but nothing sensitive comes back.
        const written = await patchCandidate(candidateId, blindToken, {
          salaryExpectationCents: 4200000,
          consentStatus: 'EXPIRED',
        });
        const text = await written.text();
        expect(written.status).toBe(200);
        const body = CandidateDetailResponseSchema.parse(JSON.parse(text)).candidate;
        expect(body.compensation).toBeNull();
        expect(body.consent).toBeNull();
        for (const value of ['4200000', '9000000', 'EUR', 'EXPIRED', 'GRANTED', '2026-07-21']) {
          expect(text).not.toContain(value);
        }
        const list = await fetch(`${baseUrl}/v1/candidates?search=Sensitive%20Maintenance`, {
          headers: authHeaders(blindToken),
        });
        const listText = await list.text();
        expect(list.status).toBe(200);
        for (const value of ['4200000', 'EUR', 'EXPIRED', '2026-07-21']) {
          expect(listText).not.toContain(value);
        }
        const actions = await actionsFor(candidateId);
        expect(count(actions, 'candidates.compensation.updated')).toBe(1);
        expect(count(actions, 'candidates.consent.updated')).toBe(1);
        expect(count(actions, 'candidates.compensation.viewed')).toBe(0);
      } finally {
        await restoreRolePermissions(RoleName.EMPLOYEE, snapshot);
      }
    });
  });
});
