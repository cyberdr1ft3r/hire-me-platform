import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  InternalPublicOpportunityDetailResponseSchema,
  PublicApplicationSubmitResponseSchema,
  PublicOpportunityDetailResponseSchema,
  PublicOpportunityListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  MissionRecruiterRole,
  PermissionScopeType,
  PrismaClient,
  PublicApplicationFileCategory,
  PublicOpportunityStatus,
  RecruitmentMissionState,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const publicPermissions = [
  'public_opportunities:view',
  'public_opportunities:manage',
  'public_opportunities:publish',
  'public_applications:view',
] as const;
const manageOnlyPublicPermissions = [
  'public_opportunities:view',
  'public_opportunities:manage',
] as const;

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: {
    permissionId: string;
    grantedAt: Date;
    archivedAt: Date | null;
  }[];
};

async function cleanPublicApplicationRecords(): Promise<void> {
  await prisma.publicCandidateApplicationFile.deleteMany({
    where: { publicOpportunity: { publicSlug: { contains: 'issue27' } } },
  });
  await prisma.publicCandidateApplication.deleteMany({
    where: { publicOpportunity: { publicSlug: { contains: 'issue27' } } },
  });
  await prisma.publicOpportunity.deleteMany({ where: { publicSlug: { contains: 'issue27' } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['PublicOpportunity', 'PublicCandidateApplication'] } },
        { targetUser: { normalizedEmail: { endsWith: '@public-applications.test' } } },
      ],
    },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue27' } } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue27' } } },
        { candidate: { normalizedEmail: { endsWith: '@public-applications.test' } } },
      ],
    },
  });
  await prisma.candidateDocument.updateMany({
    where: { candidate: { normalizedEmail: { endsWith: '@public-applications.test' } } },
    data: { currentVersionId: null },
  });
  await prisma.candidateDocumentVersion.deleteMany({
    where: {
      candidateDocument: {
        candidate: { normalizedEmail: { endsWith: '@public-applications.test' } },
      },
    },
  });
  await prisma.candidateDocument.deleteMany({
    where: { candidate: { normalizedEmail: { endsWith: '@public-applications.test' } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue27' } } },
        { user: { normalizedEmail: { endsWith: '@public-applications.test' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({ where: { title: { contains: 'Issue27' } } });
  await prisma.client.deleteMany({ where: { normalizedName: { contains: 'issue27' } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@public-applications.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@public-applications.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@public-applications.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@public-applications.test' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@public-applications.test' } },
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
      description: `Synthetic ${roleName} role for public application tests.`,
      status: 'ACTIVE',
    },
  });

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for public application tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for public application tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function removeRolePermissions(roleName: RoleName, permissionCodes: readonly string[]) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const permissions = await prisma.permission.findMany({
    where: { code: { in: [...permissionCodes] } },
  });
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: { in: permissions.map((permission) => permission.id) },
    },
  });
}

async function snapshotRolePermissions(roleName: RoleName): Promise<RolePermissionSnapshot[]> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    include: { permissions: true },
  });
  if (!role) {
    return [{ roleExisted: false, permissions: [] }];
  }
  return [
    {
      roleExisted: true,
      permissions: role.permissions.map((rolePermission) => ({
        permissionId: rolePermission.permissionId,
        grantedAt: rolePermission.grantedAt,
        archivedAt: rolePermission.archivedAt,
      })),
    },
  ];
}

async function restoreRolePermissions(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot[],
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    return;
  }
  const original = snapshot[0] ?? { roleExisted: false, permissions: [] };
  if (!original.roleExisted) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    return;
  }
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: {
        notIn: original.permissions.map((rolePermission) => rolePermission.permissionId),
      },
    },
  });
  for (const rolePermission of original.permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: rolePermission.permissionId },
      },
      update: {
        grantedAt: rolePermission.grantedAt,
        archivedAt: rolePermission.archivedAt,
      },
      create: {
        roleId: role.id,
        permissionId: rolePermission.permissionId,
        grantedAt: rolePermission.grantedAt,
        archivedAt: rolePermission.archivedAt,
      },
    });
  }
}

async function deleteRoleIfCreatedForSnapshot(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot[],
): Promise<void> {
  if (snapshot[0]?.roleExisted !== false) {
    return;
  }
  await prisma.role.deleteMany({ where: { name: roleName } });
}

async function captureCleanupFailure(
  cleanupStep: () => Promise<void>,
  existingError: Error | undefined,
): Promise<Error | undefined> {
  try {
    await cleanupStep();
    return existingError;
  } catch (error) {
    const cleanupError = error instanceof Error ? error : new Error(String(error));
    return existingError ?? cleanupError;
  }
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

async function createMissionWithOpportunity(slug: string, recruiterUserId: string) {
  const client = await prisma.client.create({
    data: {
      name: `Issue27 ${slug} Client`,
      normalizedName: `issue27 ${slug} client`,
    },
  });
  const mission = await prisma.recruitmentMission.create({
    data: {
      clientId: client.id,
      title: `Issue27 ${slug} Mission`,
      state: RecruitmentMissionState.ACTIVE,
      salaryMinCents: 100000,
      salaryMaxCents: 120000,
      salaryCurrency: 'EUR',
    },
  });
  await prisma.missionRecruiter.create({
    data: {
      missionId: mission.id,
      userId: recruiterUserId,
      role: MissionRecruiterRole.LEAD_RECRUITER,
      isLead: true,
      status: AssignmentStatus.ACTIVE,
    },
  });
  const opportunity = await prisma.publicOpportunity.create({
    data: {
      missionId: mission.id,
      status: PublicOpportunityStatus.OPEN,
      applicationLinkEnabled: true,
      listedOnWebsite: true,
      publicSlug: slug,
      publicTitle: `Issue27 ${slug} Role`,
      publicSummary: 'Synthetic public summary.',
      publicDescription: 'Synthetic public description.',
      publicLocation: 'Remote',
      applicationDeadline: new Date(Date.now() + 86_400_000),
    },
  });
  return { client, mission, opportunity };
}

function applicationPayload(email: string, filename = 'cv.pdf') {
  return {
    fullName: `Synthetic ${email}`,
    email,
    phone: '+33123456789',
    city: 'Paris',
    country: 'FR',
    currentPosition: 'Software engineer',
    experienceYears: 5,
    skills: 'TypeScript, PostgreSQL',
    languages: 'French, English',
    availability: 'One month',
    salaryExpectationCents: 110000,
    salaryExpectationCurrency: 'EUR',
    professionalLinks: 'https://example.test/profile',
    motivation: 'Synthetic motivation.',
    consentGranted: true,
    files: [
      {
        category: 'CV',
        filename,
        contentType: 'application/pdf',
        base64Content: Buffer.from('%PDF-1.4\n% synthetic test cv\n').toString('base64'),
      },
    ],
  };
}

async function submit(
  baseUrl: string,
  slug: string,
  payload = applicationPayload(`${slug}@public-applications.test`),
) {
  return fetch(`${baseUrl}/v1/public/opportunities/${slug}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('public opportunity applications', () => {
  let app: INestApplication;
  let baseUrl: string;
  let recruiterUserId: string;
  let clientUserRolePermissionSnapshot: RolePermissionSnapshot[] = [];
  let clientUserRolePermissionSnapshotCaptured = false;

  beforeAll(async () => {
    await cleanPublicApplicationRecords();
    clientUserRolePermissionSnapshot = await snapshotRolePermissions(RoleName.CLIENT_USER);
    clientUserRolePermissionSnapshotCaptured = true;
    await ensureRoleWithPermissions(RoleName.HR_MANAGER, publicPermissions);
    await ensureRoleWithPermissions(RoleName.CLIENT_USER, manageOnlyPublicPermissions);
    await removeRolePermissions(RoleName.CLIENT_USER, [
      'public_opportunities:publish',
      'public_applications:view',
    ]);
    recruiterUserId = await createUser('recruiter@public-applications.test', RoleName.HR_MANAGER);
    await createUser('manage-only@public-applications.test', RoleName.CLIENT_USER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors({ origin: 'http://127.0.0.1:5173', credentials: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    let cleanupError: Error | undefined;
    try {
      cleanupError = await captureCleanupFailure(async () => {
        await app?.close();
      }, cleanupError);
      cleanupError = await captureCleanupFailure(async () => {
        if (clientUserRolePermissionSnapshotCaptured) {
          await restoreRolePermissions(RoleName.CLIENT_USER, clientUserRolePermissionSnapshot);
        }
      }, cleanupError);
      cleanupError = await captureCleanupFailure(cleanPublicApplicationRecords, cleanupError);
      cleanupError = await captureCleanupFailure(async () => {
        if (clientUserRolePermissionSnapshotCaptured) {
          await deleteRoleIfCreatedForSnapshot(
            RoleName.CLIENT_USER,
            clientUserRolePermissionSnapshot,
          );
        }
      }, cleanupError);
    } finally {
      await prisma.$disconnect();
    }
    if (cleanupError) {
      throw cleanupError;
    }
  });

  it('exposes only approved fields for listed and unlisted opportunities', async () => {
    await createMissionWithOpportunity('issue27-listed', recruiterUserId);
    const { opportunity } = await createMissionWithOpportunity('issue27-unlisted', recruiterUserId);
    await prisma.publicOpportunity.update({
      where: { id: opportunity.id },
      data: { listedOnWebsite: false },
    });

    const list = await fetch(`${baseUrl}/v1/public/opportunities`);
    const listBody = PublicOpportunityListResponseSchema.parse(await list.json());
    expect(listBody.opportunities.some((item) => item.publicSlug === 'issue27-listed')).toBe(true);
    expect(listBody.opportunities.some((item) => item.publicSlug === 'issue27-unlisted')).toBe(
      false,
    );
    const listedOpportunity = listBody.opportunities[0];
    expect(listedOpportunity).toBeDefined();
    if (!listedOpportunity) {
      throw new Error('Expected at least one listed opportunity.');
    }
    expect(listedOpportunity).not.toHaveProperty('missionId');
    expect(listedOpportunity).not.toHaveProperty('applicationCount');
    expect(listedOpportunity.clientName).toBeNull();
    expect(listedOpportunity.salary).toBeNull();

    const detail = await fetch(`${baseUrl}/v1/public/opportunities/issue27-unlisted`);
    const detailBody = PublicOpportunityDetailResponseSchema.parse(await detail.json());
    expect(detail.status).toBe(200);
    expect(detailBody.opportunity.publicSlug).toBe('issue27-unlisted');
  });

  it('creates a reusable candidate, internal process, application record, and traceable CV version', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-submit',
      recruiterUserId,
    );

    const response = await submit(baseUrl, opportunity.publicSlug);
    expect(response.status).toBe(200);
    expect(PublicApplicationSubmitResponseSchema.parse(await response.json()).status).toBe(
      'RECEIVED',
    );

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { normalizedEmail: 'issue27-submit@public-applications.test' },
    });
    const process = await prisma.missionCandidate.findUniqueOrThrow({
      where: { missionId_candidateId: { missionId: mission.id, candidateId: candidate.id } },
    });
    expect(process.clientVisible).toBe(false);
    expect(process.responsibleRecruiterUserId).toBe(recruiterUserId);

    const application = await prisma.publicCandidateApplication.findFirstOrThrow({
      where: { missionCandidateId: process.id },
      include: { files: true },
    });
    expect(application.submittedSalaryExpectationCents).toBe(110000);
    expect(application.files).toHaveLength(1);
    const applicationFile = application.files[0];
    expect(applicationFile).toBeDefined();
    if (!applicationFile) {
      throw new Error('Expected application file trace.');
    }
    expect(applicationFile.category).toBe(PublicApplicationFileCategory.CV);

    const version = await prisma.candidateDocumentVersion.findUniqueOrThrow({
      where: { id: applicationFile.candidateDocumentVersionId },
    });
    expect(version.versionNumber).toBe(1);
    expect(version.storageKey).toContain('public-applications/issue27-submit/');
  });

  it('reuses active candidates across missions but blocks duplicate same-mission submissions', async () => {
    const first = await createMissionWithOpportunity('issue27-reuse-one', recruiterUserId);
    const second = await createMissionWithOpportunity('issue27-reuse-two', recruiterUserId);
    const email = 'reuse@public-applications.test';

    await submit(baseUrl, first.opportunity.publicSlug, applicationPayload(email, 'first.pdf'));
    await submit(baseUrl, second.opportunity.publicSlug, applicationPayload(email, 'second.pdf'));
    const duplicate = await submit(
      baseUrl,
      first.opportunity.publicSlug,
      applicationPayload(email, 'third.pdf'),
    );
    expect(duplicate.status).toBe(200);

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    await expect(
      prisma.missionCandidate.findUniqueOrThrow({
        where: {
          missionId_candidateId: { missionId: first.mission.id, candidateId: candidate.id },
        },
      }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.missionCandidate.findUniqueOrThrow({
        where: {
          missionId_candidateId: { missionId: second.mission.id, candidateId: candidate.id },
        },
      }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.publicCandidateApplication.count({ where: { submittedNormalizedEmail: email } }),
    ).resolves.toBe(2);
    const cvDocument = await prisma.candidateDocument.findFirstOrThrow({
      where: { candidateId: candidate.id, documentType: 'CV' },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    expect(cvDocument.versions.map((version) => version.versionNumber)).toEqual([1, 2]);
  });

  it('enforces duplicate prevention under concurrent public submissions', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-race',
      recruiterUserId,
    );
    const email = 'race@public-applications.test';
    const [first, second] = await Promise.all([
      submit(baseUrl, opportunity.publicSlug, applicationPayload(email, 'race-one.pdf')),
      submit(baseUrl, opportunity.publicSlug, applicationPayload(email, 'race-two.pdf')),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    await expect(
      prisma.missionCandidate.count({
        where: { missionId: mission.id, candidateId: candidate.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.publicCandidateApplication.count({
        where: { publicOpportunityId: opportunity.id, submittedNormalizedEmail: email },
      }),
    ).resolves.toBe(1);
  });

  it('fails safely for archived candidates and rejects invalid files or missing consent', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-safe-fail',
      recruiterUserId,
    );
    await prisma.candidate.create({
      data: {
        displayName: 'Archived applicant',
        email: 'archived@public-applications.test',
        normalizedEmail: 'archived@public-applications.test',
        status: CandidateStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });

    const archived = await submit(
      baseUrl,
      opportunity.publicSlug,
      applicationPayload('archived@public-applications.test'),
    );
    expect(archived.status).toBe(200);
    await expect(prisma.missionCandidate.count({ where: { missionId: mission.id } })).resolves.toBe(
      0,
    );

    const invalidFile = await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload('invalid-file@public-applications.test', 'unsafe.exe'),
      files: [
        {
          category: 'CV',
          filename: 'unsafe.exe',
          contentType: 'application/pdf',
          base64Content: Buffer.from('MZ executable').toString('base64'),
        },
      ],
    });
    expect(invalidFile.status).toBe(400);

    const missingConsent = await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload('missing-consent@public-applications.test'),
      consentGranted: false,
    });
    expect(missingConsent.status).toBe(400);
  });

  it('rejects unavailable opportunities and hides missing recruiter state', async () => {
    const disabled = await createMissionWithOpportunity('issue27-disabled', recruiterUserId);
    await prisma.publicOpportunity.update({
      where: { id: disabled.opportunity.id },
      data: { applicationLinkEnabled: false },
    });
    const disabledResponse = await fetch(`${baseUrl}/v1/public/opportunities/issue27-disabled`);
    expect(disabledResponse.status).toBe(404);

    const expired = await createMissionWithOpportunity('issue27-expired', recruiterUserId);
    await prisma.publicOpportunity.update({
      where: { id: expired.opportunity.id },
      data: { applicationDeadline: new Date(Date.now() - 60_000) },
    });
    const expiredResponse = await submit(baseUrl, expired.opportunity.publicSlug);
    expect(expiredResponse.status).toBe(404);

    const client = await prisma.client.create({
      data: { name: 'Issue27 no recruiter Client', normalizedName: 'issue27 no recruiter client' },
    });
    const mission = await prisma.recruitmentMission.create({
      data: {
        clientId: client.id,
        title: 'Issue27 no recruiter Mission',
        state: RecruitmentMissionState.ACTIVE,
      },
    });
    const opportunity = await prisma.publicOpportunity.create({
      data: {
        missionId: mission.id,
        status: PublicOpportunityStatus.OPEN,
        applicationLinkEnabled: true,
        listedOnWebsite: false,
        publicSlug: 'issue27-no-recruiter',
        publicTitle: 'Issue27 no recruiter Role',
      },
    });

    const response = await submit(baseUrl, opportunity.publicSlug);
    expect(response.status).toBe(200);
    await expect(prisma.missionCandidate.count({ where: { missionId: mission.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.publicCandidateApplication.count({ where: { publicOpportunityId: opportunity.id } }),
    ).resolves.toBe(0);
  });

  it('supports internal public opportunity configuration with protected permissions', async () => {
    const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
    const { mission } = await createMissionWithOpportunity('issue27-config', recruiterUserId);

    const response = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        publicTitle: 'Issue27 configured public title',
        showClientName: true,
        showSalary: true,
      }),
    });
    expect(response.status).toBe(200);
    const body = InternalPublicOpportunityDetailResponseSchema.parse(await response.json());
    expect(body.publicOpportunity.publicTitle).toBe('Issue27 configured public title');
    expect(body.publicOpportunity.clientName).toContain('Issue27');
    expect(body.publicOpportunity.salary?.salaryMinCents).toBe(100000);
  });

  it('allows manage-only configuration updates but requires publish permission for publication fields', async () => {
    const manageOnlyToken = await loginAccessToken(baseUrl, 'manage-only@public-applications.test');
    const publishToken = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-publish-permission',
      recruiterUserId,
    );

    const ordinaryUpdate = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
      method: 'PATCH',
      headers: authHeaders(manageOnlyToken),
      body: JSON.stringify({
        publicTitle: 'Issue27 manage-only update',
        publicSummary: 'Manage-only summary update.',
        showClientName: true,
        cvRequired: false,
      }),
    });
    expect(ordinaryUpdate.status).toBe(200);
    const ordinaryBody = InternalPublicOpportunityDetailResponseSchema.parse(
      await ordinaryUpdate.json(),
    );
    expect(ordinaryBody.publicOpportunity.publicTitle).toBe('Issue27 manage-only update');
    expect(ordinaryBody.publicOpportunity.publicSummary).toBe('Manage-only summary update.');
    expect(ordinaryBody.publicOpportunity.showClientName).toBe(true);
    expect(ordinaryBody.publicOpportunity.uploadRequirements.cvRequired).toBe(false);

    const auditWhere = {
      action: 'public_opportunities.configuration.updated',
      entityType: 'PublicOpportunity',
      entityId: opportunity.id,
    };
    await expect(prisma.auditLog.count({ where: auditWhere })).resolves.toBe(1);

    const deniedAttempts = [
      { input: { status: PublicOpportunityStatus.PAUSED }, expected: { status: 'OPEN' } },
      { input: { applicationLinkEnabled: false }, expected: { applicationLinkEnabled: true } },
      { input: { listedOnWebsite: false }, expected: { listedOnWebsite: true } },
    ] as const;

    for (const attempt of deniedAttempts) {
      const denied = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
        method: 'PATCH',
        headers: authHeaders(manageOnlyToken),
        body: JSON.stringify(attempt.input),
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({
        error: { code: 'PUBLIC_OPPORTUNITY_PUBLISH_PERMISSION_REQUIRED' },
      });
      await expect(
        prisma.publicOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } }),
      ).resolves.toMatchObject(attempt.expected);
      await expect(prisma.auditLog.count({ where: auditWhere })).resolves.toBe(1);
    }

    const allowed = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
      method: 'PATCH',
      headers: authHeaders(publishToken),
      body: JSON.stringify({
        status: PublicOpportunityStatus.PAUSED,
        applicationLinkEnabled: false,
        listedOnWebsite: false,
      }),
    });
    expect(allowed.status).toBe(200);
    const body = InternalPublicOpportunityDetailResponseSchema.parse(await allowed.json());
    expect(body.publicOpportunity.status).toBe('PAUSED');
    expect(body.publicOpportunity.applicationLinkEnabled).toBe(false);
    expect(body.publicOpportunity.listedOnWebsite).toBe(false);
    await expect(prisma.auditLog.count({ where: auditWhere })).resolves.toBe(2);
  });

  it('validates partial publication window updates against persisted values', async () => {
    const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-window-validation',
      recruiterUserId,
    );
    const deadline = new Date(Date.now() + 86_400_000);
    await prisma.publicOpportunity.update({
      where: { id: opportunity.id },
      data: { publicationStartsAt: null, applicationDeadline: deadline },
    });

    const invalidStart = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        publicationStartsAt: new Date(deadline.getTime() + 60_000).toISOString(),
      }),
    });
    expect(invalidStart.status).toBe(409);
    expect(await invalidStart.json()).toMatchObject({
      error: { code: 'PUBLIC_OPPORTUNITY_WINDOW_INVALID' },
    });

    const startsAt = new Date(Date.now() + 3_600_000);
    await prisma.publicOpportunity.update({
      where: { id: opportunity.id },
      data: { publicationStartsAt: startsAt, applicationDeadline: deadline },
    });
    const invalidDeadline = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        applicationDeadline: new Date(startsAt.getTime() - 60_000).toISOString(),
      }),
    });
    expect(invalidDeadline.status).toBe(409);
    expect(await invalidDeadline.json()).toMatchObject({
      error: { code: 'PUBLIC_OPPORTUNITY_WINDOW_INVALID' },
    });
  });
});
