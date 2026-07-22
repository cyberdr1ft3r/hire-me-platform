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
});
