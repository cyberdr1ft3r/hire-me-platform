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
});
