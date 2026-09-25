import './setup-env.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AuthResponseSchema,
  InternalPublicOpportunityDetailResponseSchema,
  PublicApplicationSubmitResponseSchema,
  PublicOpportunityDetailResponseSchema,
  PublicOpportunityListResponseSchema,
  publicApplicationMaxFileSizeBytes,
  publicApplicationMaxTotalUploadBytes,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { loadEnvironment } from '../src/config/environment.js';
import {
  publicApplicationRequestTooLargeCode,
  registerApiHttpBodyParsers,
} from '../src/public-applications/public-application-http-transport.js';
import { PasswordService } from '../src/auth/password.service.js';
import { ProtectedStorageService } from '../src/storage/protected-storage.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ConsentStatus,
  MissionRecruiterRole,
  PermissionScopeType,
  PrismaClient,
  PublicApplicationFileCategory,
  PublicOpportunityStatus,
  RecruitmentMissionState,
  RoleName,
  UserStatus,
  UserType,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();

/**
 * The reviewed read-only legacy statement, executed exactly as
 * `docs/runbooks/public-application-salary-unit-review.md` documents it, so the
 * runbook and the behaviour proved here cannot drift apart.
 */
const legacyReviewSqlPath = fileURLToPath(
  new URL('../diagnostics/public-application-salary-unit-review.sql', import.meta.url),
);

type LegacyReviewRow = {
  applicationRecordedCurrency: boolean;
  candidateId: string;
  classification: string;
  currentCandidateArchived: boolean;
  currentCandidateCurrencyMatchesSnapshot: boolean;
  currentCandidateSourceMatchesApplicationOrigin: boolean;
  missionId: string;
  publicCandidateApplicationId: string;
  publicOpportunityId: string;
  submittedAt: Date;
};

const LEGACY_REVIEW_COLUMNS = [
  'applicationRecordedCurrency',
  'candidateId',
  'classification',
  'currentCandidateArchived',
  'currentCandidateCurrencyMatchesSnapshot',
  'currentCandidateSourceMatchesApplicationOrigin',
  'missionId',
  'publicCandidateApplicationId',
  'publicOpportunityId',
  'submittedAt',
] as const;

async function runLegacyReview(): Promise<LegacyReviewRow[]> {
  const sql = await readFile(legacyReviewSqlPath, 'utf8');
  return prisma.$queryRawUnsafe<LegacyReviewRow[]>(sql);
}

/** The review row for one opportunity, which has at most one application here. */
function reviewRowFor(rows: LegacyReviewRow[], opportunityId: string): LegacyReviewRow {
  const row = rows.find((candidateRow) => candidateRow.publicOpportunityId === opportunityId);
  if (!row) {
    throw new Error(`No legacy review row for opportunity ${opportunityId}.`);
  }
  return row;
}
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
// The legacy review regressions edit Candidate metadata through the supported
// endpoint. `hr_manager` is seeded with both, but this file must not depend on
// which other suite ran first, so it asserts the precondition itself.
const candidateMaintenancePermissions = ['candidates:view', 'candidates:update'] as const;

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: {
    permissionId: string;
    grantedAt: Date;
    archivedAt: Date | null;
  }[];
};

const syntheticPublicSlugPrefixes = ['issue27', 'issue80', 'issue82', 'issue84'] as const;

function syntheticPublicSlugWhere(): {
  OR: Array<{ publicSlug: { contains: string } }>;
} {
  return {
    OR: syntheticPublicSlugPrefixes.map((prefix) => ({ publicSlug: { contains: prefix } })),
  };
}

async function cleanPublicApplicationRecords(): Promise<void> {
  await prisma.publicCandidateApplicationFile.deleteMany({
    where: { publicOpportunity: syntheticPublicSlugWhere() },
  });
  await prisma.publicCandidateApplication.deleteMany({
    where: { publicOpportunity: syntheticPublicSlugWhere() },
  });
  await prisma.publicOpportunity.deleteMany({ where: syntheticPublicSlugWhere() });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['PublicOpportunity', 'PublicCandidateApplication'] } },
        { targetUser: { normalizedEmail: { endsWith: '@public-applications.test' } } },
      ],
    },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: {
      missionCandidate: {
        mission: {
          OR: [
            { title: { contains: 'Issue27' } },
            { title: { contains: 'Issue80' } },
            { title: { contains: 'Issue84' } },
          ],
        },
      },
    },
  });
  await prisma.missionCandidate.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue27' } } },
        { mission: { title: { contains: 'Issue80' } } },
        { mission: { title: { contains: 'Issue84' } } },
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
        { mission: { title: { contains: 'Issue80' } } },
        { mission: { title: { contains: 'Issue84' } } },
        { user: { normalizedEmail: { endsWith: '@public-applications.test' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({
    where: {
      OR: [
        { title: { contains: 'Issue27' } },
        { title: { contains: 'Issue80' } },
        { title: { contains: 'Issue84' } },
      ],
    },
  });
  await prisma.client.deleteMany({
    where: {
      OR: [
        { normalizedName: { contains: 'issue27' } },
        { normalizedName: { contains: 'issue80' } },
        { normalizedName: { contains: 'issue84' } },
      ],
    },
  });
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

function buildSyntheticPngWithEmptyIdat(): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = writeIntegrationPngChunk('IHDR', ihdrData);
  const emptyIdatChunk = writeIntegrationPngChunk('IDAT', Buffer.alloc(0));
  const iendChunk = writeIntegrationPngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdrChunk, emptyIdatChunk, iendChunk]);
}

function writeIntegrationPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(integrationPngChunkCrc(typeAndData));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function integrationPngChunkCrc(typeAndData: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < typeAndData.length; index += 1) {
    crc = integrationPngCrcTable[(crc ^ typeAndData[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const integrationPngCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let entry = 0; entry < 256; entry += 1) {
    let value = entry;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[entry] = value >>> 0;
  }
  return table;
})();

const uploadFixtures = {
  pdf: Buffer.from('%PDF-1.4\n% synthetic test cv\n'),
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
  jpeg: Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
    'base64',
  ),
  text: Buffer.from('Synthetic supporting document.\n'),
  svgScript: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  html: Buffer.from('<html><body>Not an image</body></html>'),
};

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

async function patchInternalOpportunity(
  apiBaseUrl: string,
  missionId: string,
  token: string,
  body: Record<string, unknown>,
) {
  return fetch(`${apiBaseUrl}/v1/missions/${missionId}/public-opportunity`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

function syntheticPlainTextBuffer(byteLength: number): Buffer {
  return Buffer.alloc(byteLength, 0x61);
}

function plainTextUploadFile(
  category: 'ADDITIONAL' | 'CERTIFICATION' | 'CV' | 'DIPLOMA',
  rawBytes: number,
  filename: string,
) {
  return {
    category,
    filename,
    contentType: 'text/plain',
    base64Content: syntheticPlainTextBuffer(rawBytes).toString('base64'),
  };
}

async function enableAllOptionalUploadCategories(
  apiBaseUrl: string,
  missionId: string,
): Promise<void> {
  const token = await loginAccessToken(apiBaseUrl, 'recruiter@public-applications.test');
  const response = await patchInternalOpportunity(apiBaseUrl, missionId, token, {
    additionalAttachmentsEnabled: true,
    certificationsEnabled: true,
    diplomasEnabled: true,
  });
  expect(response.status).toBe(200);
}

async function assertRejectedUploadLeavesNoSideEffects(options: {
  missionId: string;
  opportunityId: string;
  email: string;
  auditCountBefore: number;
}): Promise<void> {
  await expect(prisma.candidate.count({ where: { normalizedEmail: options.email } })).resolves.toBe(
    0,
  );
  await expect(
    prisma.missionCandidate.count({
      where: { missionId: options.missionId, candidate: { normalizedEmail: options.email } },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.publicCandidateApplication.count({
      where: {
        publicOpportunityId: options.opportunityId,
        submittedNormalizedEmail: options.email,
      },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.candidateDocumentVersion.count({
      where: {
        candidateDocument: { candidate: { normalizedEmail: options.email } },
      },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.publicCandidateApplicationFile.count({
      where: { publicOpportunityId: options.opportunityId },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.auditLog.count({
      where: { action: 'public_applications.application.submitted' },
    }),
  ).resolves.toBe(options.auditCountBefore);
}

describe('public opportunity applications', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let recruiterUserId: string;
  let clientUserRolePermissionSnapshot: RolePermissionSnapshot[] = [];
  let clientUserRolePermissionSnapshotCaptured = false;

  beforeAll(async () => {
    await cleanPublicApplicationRecords();
    clientUserRolePermissionSnapshot = await snapshotRolePermissions(RoleName.CLIENT_USER);
    clientUserRolePermissionSnapshotCaptured = true;
    await ensureRoleWithPermissions(RoleName.HR_MANAGER, [
      ...publicPermissions,
      ...candidateMaintenancePermissions,
    ]);
    await ensureRoleWithPermissions(RoleName.CLIENT_USER, manageOnlyPublicPermissions);
    await removeRolePermissions(RoleName.CLIENT_USER, [
      'public_opportunities:publish',
      'public_applications:view',
    ]);
    recruiterUserId = await createUser('recruiter@public-applications.test', RoleName.HR_MANAGER);
    await createUser('manage-only@public-applications.test', RoleName.CLIENT_USER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    const environment = loadEnvironment();
    registerApiHttpBodyParsers(app, {
      generalJsonLimit: environment.JSON_BODY_LIMIT,
      publicApplicationJsonLimit: environment.PUBLIC_APPLICATION_JSON_LIMIT,
    });
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

  it('accepts valid PDF, JPEG, PNG, and text/plain uploads with signature validation', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue80-valid-uploads',
      recruiterUserId,
    );
    const cases = [
      {
        email: 'valid-pdf@public-applications.test',
        filename: 'CV.PDF',
        contentType: 'application/pdf',
        buffer: uploadFixtures.pdf,
      },
      {
        email: 'valid-jpeg@public-applications.test',
        filename: 'photo.JPEG',
        contentType: 'image/jpeg',
        buffer: uploadFixtures.jpeg,
      },
      {
        email: 'valid-png@public-applications.test',
        filename: 'badge.PNG',
        contentType: 'image/png',
        buffer: uploadFixtures.png,
      },
      {
        email: 'valid-text@public-applications.test',
        filename: 'notes.txt',
        contentType: 'text/plain',
        buffer: uploadFixtures.text,
      },
    ] as const;

    for (const testCase of cases) {
      const response = await submit(baseUrl, opportunity.publicSlug, {
        ...applicationPayload(testCase.email, testCase.filename),
        files: [
          {
            category: 'CV',
            filename: testCase.filename,
            contentType: testCase.contentType,
            base64Content: testCase.buffer.toString('base64'),
          },
        ],
      });
      expect(response.status, testCase.email).toBe(200);
      await expect(
        prisma.publicCandidateApplication.findFirst({
          where: {
            publicOpportunityId: opportunity.id,
            submittedNormalizedEmail: testCase.email,
          },
        }),
      ).resolves.toBeTruthy();
    }

    await expect(prisma.missionCandidate.count({ where: { missionId: mission.id } })).resolves.toBe(
      cases.length,
    );
  });

  it('rejects structurally invalid JPEG/PNG polyglots before storage or database writes', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue80-structure-reject',
      recruiterUserId,
    );
    const storage = app.get(ProtectedStorageService);
    const put = vi.spyOn(storage, 'put');
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'public_applications.application.submitted' },
    });
    const trailingHtml = Buffer.from('<html><body>polyglot</body></html>');
    const trailingSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
    const fabricatedIhdrOnly = Buffer.concat([
      pngSignature,
      uploadFixtures.png.subarray(8, 8 + 25),
    ]);
    const soiEoiOnlyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const emptyIdatPng = buildSyntheticPngWithEmptyIdat();

    const rejectionCases = [
      {
        email: 'jpeg-html-trailer@public-applications.test',
        contentType: 'image/jpeg',
        filename: 'photo.jpg',
        buffer: Buffer.concat([uploadFixtures.jpeg, trailingHtml]),
      },
      {
        email: 'png-svg-trailer@public-applications.test',
        contentType: 'image/png',
        filename: 'logo.png',
        buffer: Buffer.concat([uploadFixtures.png, trailingSvg]),
      },
      {
        email: 'png-ihdr-only@public-applications.test',
        contentType: 'image/png',
        filename: 'logo.png',
        buffer: fabricatedIhdrOnly,
      },
      {
        email: 'png-truncated-chunk@public-applications.test',
        contentType: 'image/png',
        filename: 'logo.png',
        buffer: uploadFixtures.png.subarray(0, uploadFixtures.png.length - 4),
      },
      {
        email: 'jpeg-missing-eoi@public-applications.test',
        contentType: 'image/jpeg',
        filename: 'photo.jpg',
        buffer: uploadFixtures.jpeg.subarray(0, uploadFixtures.jpeg.length - 2),
      },
      {
        email: 'jpeg-soi-eoi-only@public-applications.test',
        contentType: 'image/jpeg',
        filename: 'photo.jpg',
        buffer: soiEoiOnlyJpeg,
      },
      {
        email: 'png-empty-idat@public-applications.test',
        contentType: 'image/png',
        filename: 'logo.png',
        buffer: emptyIdatPng,
      },
    ] as const;

    try {
      for (const testCase of rejectionCases) {
        const response = await submit(baseUrl, opportunity.publicSlug, {
          ...applicationPayload(testCase.email),
          files: [
            {
              category: 'CV',
              filename: testCase.filename,
              contentType: testCase.contentType,
              base64Content: testCase.buffer.toString('base64'),
            },
          ],
        });
        expect(response.status, testCase.email).toBe(400);
        expect(await response.json(), testCase.email).toMatchObject({
          error: { code: 'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED' },
        });
        await assertRejectedUploadLeavesNoSideEffects({
          missionId: mission.id,
          opportunityId: opportunity.id,
          email: testCase.email,
          auditCountBefore,
        });
      }
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
  });

  describe('issue82 optional upload category invariant', () => {
    async function patchInternalOpportunity(
      missionId: string,
      token: string,
      body: Record<string, unknown>,
    ) {
      return fetch(`${baseUrl}/v1/missions/${missionId}/public-opportunity`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
    }

    function certificationFilePayload(email: string, includeCertification: boolean) {
      const files: {
        category: PublicApplicationFileCategory;
        filename: string;
        contentType: string;
        base64Content: string;
      }[] = [
        {
          category: PublicApplicationFileCategory.CV,
          filename: 'cv.pdf',
          contentType: 'application/pdf',
          base64Content: uploadFixtures.pdf.toString('base64'),
        },
      ];
      if (includeCertification) {
        files.push({
          category: PublicApplicationFileCategory.CERTIFICATION,
          filename: 'cert.pdf',
          contentType: 'application/pdf',
          base64Content: uploadFixtures.pdf.toString('base64'),
        });
      }
      return { ...applicationPayload(email), files };
    }

    function diplomaFilePayload(email: string, includeDiploma: boolean) {
      const files: {
        category: PublicApplicationFileCategory;
        filename: string;
        contentType: string;
        base64Content: string;
      }[] = [
        {
          category: PublicApplicationFileCategory.CV,
          filename: 'cv.pdf',
          contentType: 'application/pdf',
          base64Content: uploadFixtures.pdf.toString('base64'),
        },
      ];
      if (includeDiploma) {
        files.push({
          category: PublicApplicationFileCategory.DIPLOMA,
          filename: 'diploma.pdf',
          contentType: 'application/pdf',
          base64Content: uploadFixtures.pdf.toString('base64'),
        });
      }
      return { ...applicationPayload(email), files };
    }

    it('accepts submissions when stored certification config is disabled-but-required', async () => {
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue82-cert-contradictory',
        recruiterUserId,
      );
      await prisma.publicOpportunity.update({
        where: { id: opportunity.id },
        data: { certificationsEnabled: false, certificationsRequired: true },
      });

      const publicDetail = await fetch(
        `${baseUrl}/v1/public/opportunities/${opportunity.publicSlug}`,
      );
      expect(publicDetail.status).toBe(200);
      const detailBody = PublicOpportunityDetailResponseSchema.parse(await publicDetail.json());
      expect(detailBody.opportunity.uploadRequirements.certificationsEnabled).toBe(false);
      expect(detailBody.opportunity.uploadRequirements.certificationsRequired).toBe(false);

      const email = 'issue82-cert-contradictory@public-applications.test';
      const accepted = await submit(
        baseUrl,
        opportunity.publicSlug,
        certificationFilePayload(email, false),
      );
      expect(accepted.status).toBe(200);
      PublicApplicationSubmitResponseSchema.parse(await accepted.json());

      const rejectedHiddenCategory = await submit(
        baseUrl,
        opportunity.publicSlug,
        certificationFilePayload('issue82-cert-hidden-file@public-applications.test', true),
      );
      expect(rejectedHiddenCategory.status).toBe(400);
      expect(await rejectedHiddenCategory.json()).toMatchObject({
        error: { code: 'PUBLIC_APPLICATION_FILE_CATEGORY_DISABLED' },
      });
      await expect(
        prisma.publicCandidateApplication.count({ where: { publicOpportunityId: opportunity.id } }),
      ).resolves.toBe(1);
      await expect(
        prisma.missionCandidate.count({ where: { missionId: mission.id } }),
      ).resolves.toBe(1);
    });

    it('enforces enabled required certifications and clears required when staff disables the category', async () => {
      const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue82-cert-staff-toggle',
        recruiterUserId,
      );

      const enableRequired = await patchInternalOpportunity(mission.id, token, {
        certificationsEnabled: true,
        certificationsRequired: true,
        cvRequired: true,
      });
      expect(enableRequired.status).toBe(200);

      const missingCert = await submit(
        baseUrl,
        opportunity.publicSlug,
        certificationFilePayload('issue82-cert-missing@public-applications.test', false),
      );
      expect(missingCert.status).toBe(400);
      expect(await missingCert.json()).toMatchObject({
        error: { code: 'PUBLIC_APPLICATION_CERTIFICATION_REQUIRED' },
      });

      const withCert = await submit(
        baseUrl,
        opportunity.publicSlug,
        certificationFilePayload('issue82-cert-provided@public-applications.test', true),
      );
      expect(withCert.status).toBe(200);

      const disableCategory = await patchInternalOpportunity(mission.id, token, {
        certificationsEnabled: false,
        certificationsRequired: true,
      });
      expect(disableCategory.status).toBe(200);
      const disabledBody = InternalPublicOpportunityDetailResponseSchema.parse(
        await disableCategory.json(),
      );
      expect(disabledBody.publicOpportunity.uploadRequirements.certificationsRequired).toBe(false);
      await expect(
        prisma.publicOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } }),
      ).resolves.toMatchObject({
        certificationsEnabled: false,
        certificationsRequired: false,
      });

      const afterDisable = await submit(
        baseUrl,
        opportunity.publicSlug,
        certificationFilePayload('issue82-cert-after-disable@public-applications.test', false),
      );
      expect(afterDisable.status).toBe(200);
    });

    it('handles diplomas independently and repairs contradictory stored diploma settings on save', async () => {
      const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue82-diploma-config',
        recruiterUserId,
      );
      await prisma.publicOpportunity.update({
        where: { id: opportunity.id },
        data: {
          diplomasEnabled: false,
          diplomasRequired: true,
          certificationsEnabled: true,
          certificationsRequired: false,
        },
      });

      const optionalDiplomaSubmit = await submit(
        baseUrl,
        opportunity.publicSlug,
        diplomaFilePayload('issue82-diploma-optional@public-applications.test', false),
      );
      expect(optionalDiplomaSubmit.status).toBe(200);

      const repair = await patchInternalOpportunity(mission.id, token, {
        publicSummary: 'Issue82 repair contradictory diploma flags.',
      });
      expect(repair.status).toBe(200);
      await expect(
        prisma.publicOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } }),
      ).resolves.toMatchObject({
        diplomasEnabled: false,
        diplomasRequired: false,
      });

      const enableRequiredDiploma = await patchInternalOpportunity(mission.id, token, {
        diplomasEnabled: true,
        diplomasRequired: true,
      });
      expect(enableRequiredDiploma.status).toBe(200);
      const missingDiploma = await submit(
        baseUrl,
        opportunity.publicSlug,
        diplomaFilePayload('issue82-diploma-missing@public-applications.test', false),
      );
      expect(missingDiploma.status).toBe(400);
      expect(await missingDiploma.json()).toMatchObject({
        error: { code: 'PUBLIC_APPLICATION_DIPLOMA_REQUIRED' },
      });
      await expect(
        prisma.missionCandidate.count({ where: { missionId: mission.id } }),
      ).resolves.toBe(1);
    });

    it('supports both categories enabled with independent required flags', async () => {
      const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue82-both-categories',
        recruiterUserId,
      );
      const configured = await patchInternalOpportunity(mission.id, token, {
        certificationsEnabled: true,
        certificationsRequired: true,
        diplomasEnabled: true,
        diplomasRequired: false,
      });
      expect(configured.status).toBe(200);

      const email = 'issue82-both-categories@public-applications.test';
      const payload = {
        ...applicationPayload(email),
        files: [
          {
            category: 'CV' as const,
            filename: 'cv.pdf',
            contentType: 'application/pdf',
            base64Content: uploadFixtures.pdf.toString('base64'),
          },
          {
            category: 'CERTIFICATION' as const,
            filename: 'cert.pdf',
            contentType: 'application/pdf',
            base64Content: uploadFixtures.pdf.toString('base64'),
          },
        ],
      };
      const accepted = await submit(baseUrl, opportunity.publicSlug, payload);
      expect(accepted.status).toBe(200);
    });
  });

  describe('issue84 json transport and aggregate upload limits', () => {
    function jsonBodyWithApproximateUtf8Bytes(targetBytes: number): string {
      let padding = Math.max(0, targetBytes - 64);
      let body = JSON.stringify({ padding: 'a'.repeat(padding) });
      while (Buffer.byteLength(body, 'utf8') < targetBytes) {
        padding += 1024;
        body = JSON.stringify({ padding: 'a'.repeat(padding) });
      }
      return body;
    }

    function aggregatePlainTextFiles(rawSizes: number[]) {
      const categories: Array<'ADDITIONAL' | 'CERTIFICATION' | 'CV' | 'DIPLOMA'> = [
        'CV',
        'CERTIFICATION',
        'DIPLOMA',
        'ADDITIONAL',
      ];
      return rawSizes.map((size, index) =>
        plainTextUploadFile(categories[index] ?? 'ADDITIONAL', size, `part-${index}.txt`),
      );
    }

    it('advertises aggregate and per-file limits aligned with shared contracts', async () => {
      const { opportunity } = await createMissionWithOpportunity('issue84-limits', recruiterUserId);
      const detail = await fetch(`${baseUrl}/v1/public/opportunities/${opportunity.publicSlug}`);
      const body = PublicOpportunityDetailResponseSchema.parse(await detail.json());
      expect(body.opportunity.uploadRequirements.maxTotalUploadBytes).toBe(
        publicApplicationMaxTotalUploadBytes,
      );
      expect(body.opportunity.uploadRequirements.maxFileSizeBytes).toBe(
        publicApplicationMaxFileSizeBytes,
      );
    });

    it('accepts multi-file submissions just below, at, and above the audit ~4.8 MB aggregate case', async () => {
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue84-audit-aggregate',
        recruiterUserId,
      );
      await enableAllOptionalUploadCategories(baseUrl, mission.id);

      const auditEmail = 'issue84-audit-4800000@public-applications.test';
      const auditResponse = await submit(baseUrl, opportunity.publicSlug, {
        ...applicationPayload(auditEmail),
        motivation: 'x'.repeat(4000),
        files: aggregatePlainTextFiles([1_500_000, 1_500_000, 1_500_000, 300_000]),
      });
      expect(auditResponse.status).toBe(200);
      expect(
        Buffer.byteLength(
          JSON.stringify({
            ...applicationPayload(auditEmail),
            motivation: 'x'.repeat(4000),
            files: aggregatePlainTextFiles([1_500_000, 1_500_000, 1_500_000, 300_000]),
          }),
          'utf8',
        ),
      ).toBeGreaterThan(6 * 1024 * 1024);
    });

    it('rejects non-public JSON above the general 6mb limit but below the public 8mb allowance', async () => {
      const betweenLimitsBytes = 6 * 1024 * 1024 + 512 * 1024;
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBodyWithApproximateUtf8Bytes(betweenLimitsBytes),
      });
      expect(response.status).toBe(413);
      const bodyText = await response.text();
      expect(bodyText).not.toContain(publicApplicationRequestTooLargeCode);
    });

    it('applies the general 6mb JSON limit to non-POST methods on the public application URL', async () => {
      const { opportunity } = await createMissionWithOpportunity(
        'issue84-non-post-general-limit',
        recruiterUserId,
      );
      const betweenLimitsBytes = 6 * 1024 * 1024 + 512 * 1024;
      const body = jsonBodyWithApproximateUtf8Bytes(betweenLimitsBytes);
      for (const method of ['PUT', 'PATCH'] as const) {
        const response = await fetch(
          `${baseUrl}/v1/public/opportunities/${opportunity.publicSlug}/applications?website=trap`,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body,
          },
        );
        expect(response.status, method).toBe(413);
        expect(await response.text(), method).not.toContain(publicApplicationRequestTooLargeCode);
      }
    });

    it('parses small URL-encoded bodies and rejects oversize URL-encoded payloads at 100kb', async () => {
      const small = new URLSearchParams({
        email: 'recruiter@public-applications.test',
        password: 'Synthetic-passphrase-123!',
      });
      const parsed = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: small.toString(),
      });
      expect(parsed.status).not.toBe(413);
      expect(AuthResponseSchema.safeParse(await parsed.json()).success).toBe(true);

      const oversize = new URLSearchParams({
        email: 'oversize-urlencoded@public-applications.test',
        password: 'Synthetic-passphrase-123!',
        pad: 'x'.repeat(110 * 1024),
      });
      const rejected = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: oversize.toString(),
      });
      expect(rejected.status).toBe(413);
      expect(await rejected.text()).not.toContain(publicApplicationRequestTooLargeCode);
    });

    it('accepts public submit when encoded JSON exceeds 6mb via scoped public parser only', async () => {
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue84-over-6mb-json',
        recruiterUserId,
      );
      await enableAllOptionalUploadCategories(baseUrl, mission.id);
      const email = 'issue84-over-6mb-json@public-applications.test';
      const payload = {
        ...applicationPayload(email),
        motivation: 'x'.repeat(4000),
        files: aggregatePlainTextFiles([1_500_000, 1_500_000, 1_500_000, 300_000]),
      };
      expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeGreaterThan(6 * 1024 * 1024);
      const response = await fetch(
        `${baseUrl}/v1/public/opportunities/${opportunity.publicSlug}/applications/?website=trap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      expect(response.status).toBe(200);
      await expect(
        prisma.publicCandidateApplication.count({
          where: {
            publicOpportunityId: opportunity.id,
            submittedNormalizedEmail: email,
          },
        }),
      ).resolves.toBe(1);
    });

    it('accepts multi-file submissions just below and exactly at the raw aggregate cap', async () => {
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue84-aggregate-ok',
        recruiterUserId,
      );
      await enableAllOptionalUploadCategories(baseUrl, mission.id);

      const belowEmail = 'issue84-below-aggregate@public-applications.test';
      const belowResponse = await submit(baseUrl, opportunity.publicSlug, {
        ...applicationPayload(belowEmail),
        files: aggregatePlainTextFiles([1_500_000, 1_500_000, 1_499_999]),
      });
      expect(belowResponse.status).toBe(200);

      const { opportunity: atOpportunity, mission: atMission } = await createMissionWithOpportunity(
        'issue84-aggregate-at',
        recruiterUserId,
      );
      await enableAllOptionalUploadCategories(baseUrl, atMission.id);
      const atEmail = 'issue84-at-aggregate@public-applications.test';
      const atResponse = await submit(baseUrl, atOpportunity.publicSlug, {
        ...applicationPayload(atEmail),
        files: aggregatePlainTextFiles([
          1_500_000,
          1_500_000,
          1_500_000,
          publicApplicationMaxTotalUploadBytes - 4_500_000,
        ]),
      });
      expect(atResponse.status).toBe(200);
    });

    it('rejects raw aggregate just above the cap at the application layer without side effects', async () => {
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue84-aggregate-over',
        recruiterUserId,
      );
      await enableAllOptionalUploadCategories(baseUrl, mission.id);
      const storage = app.get(ProtectedStorageService);
      const put = vi.spyOn(storage, 'put');
      const auditCountBefore = await prisma.auditLog.count({
        where: { action: 'public_applications.application.submitted' },
      });
      const email = 'issue84-over-aggregate@public-applications.test';

      try {
        const response = await submit(baseUrl, opportunity.publicSlug, {
          ...applicationPayload(email),
          files: aggregatePlainTextFiles([
            1_500_000,
            1_500_000,
            1_500_000,
            publicApplicationMaxTotalUploadBytes - 4_500_000 + 1,
          ]),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: { code: 'PUBLIC_APPLICATION_UPLOAD_TOO_LARGE' },
        });
        await assertRejectedUploadLeavesNoSideEffects({
          missionId: mission.id,
          opportunityId: opportunity.id,
          email,
          auditCountBefore,
        });
        expect(put).not.toHaveBeenCalled();
      } finally {
        put.mockRestore();
      }
    });
  });

  describe('issue84 body-parser oversize handling', () => {
    let tightApp: NestExpressApplication;
    let tightBaseUrl: string;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      tightApp = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
      registerApiHttpBodyParsers(tightApp, {
        generalJsonLimit: '6mb',
        publicApplicationJsonLimit: '512kb',
      });
      await tightApp.listen(0, '127.0.0.1');
      tightBaseUrl = await tightApp.getUrl();
    });

    afterAll(async () => {
      await tightApp?.close();
    });

    it('returns stable 413 for public application POST when JSON exceeds the parser limit', async () => {
      const { mission, opportunity } = await createMissionWithOpportunity(
        'issue84-parser-413',
        recruiterUserId,
      );
      const auditCountBefore = await prisma.auditLog.count({
        where: { action: 'public_applications.application.submitted' },
      });
      const email = 'issue84-parser-413@public-applications.test';
      const response = await fetch(
        `${tightBaseUrl}/v1/public/opportunities/${opportunity.publicSlug}/applications`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...applicationPayload(email),
            files: [plainTextUploadFile('CV', 400_000, 'large.txt')],
          }),
        },
      );
      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body).toMatchObject({ error: { code: publicApplicationRequestTooLargeCode } });
      expect(JSON.stringify(body)).not.toContain(email);
      expect(JSON.stringify(body)).not.toContain(mission.id);
      await assertRejectedUploadLeavesNoSideEffects({
        missionId: mission.id,
        opportunityId: opportunity.id,
        email,
        auditCountBefore,
      });
    });
  });

  it('rejects spoofed, truncated, mismatched, and oversized uploads without side effects', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue80-upload-reject',
      recruiterUserId,
    );
    const storage = app.get(ProtectedStorageService);
    const put = vi.spyOn(storage, 'put');
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'public_applications.application.submitted' },
    });

    const rejectionCases = [
      {
        email: 'svg-as-png@public-applications.test',
        file: {
          category: 'CV',
          filename: 'logo.png',
          contentType: 'image/png',
          base64Content: uploadFixtures.svgScript.toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      },
      {
        email: 'html-as-jpeg@public-applications.test',
        file: {
          category: 'CV',
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          base64Content: uploadFixtures.html.toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      },
      {
        email: 'truncated-jpeg@public-applications.test',
        file: {
          category: 'CV',
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          base64Content: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      },
      {
        email: 'invalid-pdf@public-applications.test',
        file: {
          category: 'CV',
          filename: 'cv.pdf',
          contentType: 'application/pdf',
          base64Content: Buffer.from('NOTPDF').toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      },
      {
        email: 'mime-mismatch@public-applications.test',
        file: {
          category: 'CV',
          filename: 'cv.png',
          contentType: 'application/pdf',
          base64Content: uploadFixtures.pdf.toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
      },
      {
        email: 'double-ext@public-applications.test',
        file: {
          category: 'CV',
          filename: 'cv.pdf.exe',
          contentType: 'application/pdf',
          base64Content: uploadFixtures.pdf.toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_TYPE_REJECTED',
      },
      {
        email: 'empty-file@public-applications.test',
        file: {
          category: 'CV',
          filename: 'empty.txt',
          contentType: 'text/plain',
          base64Content: Buffer.from('   \n\t').toString('base64'),
        },
        code: 'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
      },
    ] as const;

    try {
      for (const testCase of rejectionCases) {
        const response = await submit(baseUrl, opportunity.publicSlug, {
          ...applicationPayload(testCase.email),
          files: [testCase.file],
        });
        expect(response.status, testCase.email).toBe(400);
        const body = await response.json();
        expect(body, testCase.email).toMatchObject({ error: { code: testCase.code } });
        expect(JSON.stringify(body)).not.toContain(mission.id);
        expect(JSON.stringify(body)).not.toContain(testCase.email);
        await assertRejectedUploadLeavesNoSideEffects({
          missionId: mission.id,
          opportunityId: opportunity.id,
          email: testCase.email,
          auditCountBefore,
        });
      }
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
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

    // No eligible recruiter is not an accepted application. A false RECEIVED
    // response previously concealed a transaction rollback and discarded a CV.
    const storage = app.get(ProtectedStorageService);
    const put = vi.spyOn(storage, 'put');
    const remove = vi.spyOn(storage, 'delete');
    const warning = vi.spyOn(Logger.prototype, 'warn');
    const email = 'issue27-no-recruiter@public-applications.test';
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'public_applications.application.submitted' },
    });
    try {
      const response = await submit(baseUrl, opportunity.publicSlug, applicationPayload(email));
      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error).toEqual({
        error: {
          code: 'PUBLIC_APPLICATION_TEMPORARILY_UNAVAILABLE',
          message: 'Application could not be submitted. Please try again later.',
        },
      });
      expect(JSON.stringify(error)).not.toContain(mission.id);
      expect(JSON.stringify(error)).not.toContain(email);
      expect(JSON.stringify(error)).not.toContain('recruiter');
      expect(
        warning.mock.calls.some(
          ([message]) =>
            typeof message === 'string' &&
            message.includes('no eligible recruiter') &&
            message.includes(mission.id),
        ),
      ).toBe(true);
      for (const call of warning.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(email);
      }
      expect(put).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove.mock.calls[0]?.[0]).toBe(put.mock.calls[0]?.[0]);
    } finally {
      put.mockRestore();
      remove.mockRestore();
      warning.mockRestore();
    }

    await expect(prisma.candidate.count({ where: { normalizedEmail: email } })).resolves.toBe(0);
    await expect(prisma.missionCandidate.count({ where: { missionId: mission.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.publicCandidateApplication.count({ where: { publicOpportunityId: opportunity.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { action: 'public_applications.application.submitted' },
      }),
    ).resolves.toBe(auditCountBefore);

    // Once an eligible recruiter is assigned the same candidate can retry,
    // and exactly one application/process/audit is committed.
    await prisma.missionRecruiter.create({
      data: {
        missionId: mission.id,
        userId: recruiterUserId,
        role: MissionRecruiterRole.LEAD_RECRUITER,
        isLead: true,
        status: AssignmentStatus.ACTIVE,
      },
    });
    const retry = await submit(baseUrl, opportunity.publicSlug, applicationPayload(email));
    expect(retry.status).toBe(200);
    expect(PublicApplicationSubmitResponseSchema.parse(await retry.json()).status).toBe('RECEIVED');
    await expect(prisma.candidate.count({ where: { normalizedEmail: email } })).resolves.toBe(1);
    await expect(prisma.missionCandidate.count({ where: { missionId: mission.id } })).resolves.toBe(
      1,
    );
    const accepted = await prisma.publicCandidateApplication.findFirstOrThrow({
      where: { publicOpportunityId: opportunity.id },
    });
    await expect(
      prisma.auditLog.count({
        where: { action: 'public_applications.application.submitted', entityId: accepted.id },
      }),
    ).resolves.toBe(1);
  });

  it('refuses a new application when every assigned recruiter is ineligible', async () => {
    const cases = [
      'inactive-assignment',
      'archived-assignment',
      'suspended-user',
      'archived-user',
      'client-user',
      'contributor-only',
    ] as const;
    for (const mode of cases) {
      const userId = await createUser(
        `recruiter-${mode}@public-applications.test`,
        RoleName.HR_MANAGER,
      );
      const { mission, opportunity } = await createMissionWithOpportunity(
        `issue27-no-eligible-${mode}`,
        userId,
      );
      if (mode === 'inactive-assignment' || mode === 'archived-assignment') {
        await prisma.missionRecruiter.updateMany({
          where: { missionId: mission.id },
          data:
            mode === 'inactive-assignment'
              ? { status: AssignmentStatus.INACTIVE }
              : { archivedAt: new Date() },
        });
      } else if (mode === 'suspended-user' || mode === 'archived-user' || mode === 'client-user') {
        await prisma.user.update({
          where: { id: userId },
          data:
            mode === 'suspended-user'
              ? { status: UserStatus.SUSPENDED }
              : mode === 'archived-user'
                ? { status: UserStatus.ARCHIVED, archivedAt: new Date() }
                : { userType: UserType.CLIENT },
        });
      } else {
        await prisma.missionRecruiter.updateMany({
          where: { missionId: mission.id },
          data: { role: MissionRecruiterRole.CONTRIBUTOR },
        });
      }
      const email = `no-eligible-${mode}@public-applications.test`;
      const response = await submit(baseUrl, opportunity.publicSlug, applicationPayload(email));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: {
          code: 'PUBLIC_APPLICATION_TEMPORARILY_UNAVAILABLE',
          message: 'Application could not be submitted. Please try again later.',
        },
      });
      await expect(prisma.candidate.count({ where: { normalizedEmail: email } })).resolves.toBe(0);
      await expect(
        prisma.publicCandidateApplication.count({ where: { publicOpportunityId: opportunity.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.missionCandidate.count({ where: { missionId: mission.id } }),
      ).resolves.toBe(0);
    }
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

  it('stores the submitted minor units exactly, on the snapshot and on a new Candidate', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-salary-new',
      recruiterUserId,
    );
    const email = 'salary-new@public-applications.test';

    // 36000.50 typed in the browser reaches the endpoint as exact minor units.
    const response = await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload(email),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
    expect(response.status).toBe(200);

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    expect(candidate.source).toBe('public_application');
    expect(candidate.salaryExpectationCents).toBe(3_600_050);
    expect(candidate.salaryExpectationCurrency).toBe('MAD');

    const application = await prisma.publicCandidateApplication.findFirstOrThrow({
      where: { publicOpportunityId: opportunity.id, submittedNormalizedEmail: email },
    });
    expect(application.submittedSalaryExpectationCents).toBe(3_600_050);
    expect(application.submittedSalaryExpectationCurrency).toBe('MAD');
    expect(application.missionId).toBe(mission.id);

    // No amount reaches the audit trail; only the value-free summary is recorded.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'PublicCandidateApplication', entityId: application.id },
    });
    expect(audit.action).toBe('public_applications.application.submitted');
    expect(JSON.stringify(audit)).not.toContain('3600050');
    expect(JSON.stringify(audit)).not.toContain('36000');
    expect(JSON.stringify(audit)).not.toContain('MAD');
    expect(audit.metadataSummary).toBe(
      'Public application accepted; sensitive candidate payload excluded.',
    );
  });

  it('records the submitted amount on the snapshot without overwriting an existing Candidate', async () => {
    const { opportunity } = await createMissionWithOpportunity(
      'issue27-salary-existing',
      recruiterUserId,
    );
    const email = 'salary-existing@public-applications.test';
    const existing = await prisma.candidate.create({
      data: {
        displayName: 'Existing applicant',
        email,
        normalizedEmail: email,
        status: CandidateStatus.ACTIVE,
        consentStatus: ConsentStatus.GRANTED,
        source: 'referral',
        salaryExpectationCents: 1_234_567,
        salaryExpectationCurrency: 'EUR',
      },
    });

    const response = await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload(email),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
    expect(response.status).toBe(200);

    const application = await prisma.publicCandidateApplication.findFirstOrThrow({
      where: { publicOpportunityId: opportunity.id, submittedNormalizedEmail: email },
    });
    expect(application.candidateId).toBe(existing.id);
    expect(application.submittedSalaryExpectationCents).toBe(3_600_050);
    expect(application.submittedSalaryExpectationCurrency).toBe('MAD');

    // A public application is not an implicit Candidate compensation edit.
    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: existing.id } });
    expect(candidate.salaryExpectationCents).toBe(1_234_567);
    expect(candidate.salaryExpectationCurrency).toBe('EUR');
    expect(candidate.updatedAt.getTime()).toBe(existing.updatedAt.getTime());
  });

  it('refuses an out-of-range or negative amount and leaves no partial records', async () => {
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-salary-range',
      recruiterUserId,
    );

    for (const [email, salaryExpectationCents] of [
      ['salary-overflow@public-applications.test', 2_147_483_648],
      ['salary-negative@public-applications.test', -1],
      ['salary-fraction@public-applications.test', 3_600_050.5],
    ] as const) {
      const response = await submit(baseUrl, opportunity.publicSlug, {
        ...applicationPayload(email),
        salaryExpectationCents,
      });
      expect(response.status, email).toBe(400);

      await expect(
        prisma.candidate.count({ where: { normalizedEmail: email } }),
        email,
      ).resolves.toBe(0);
      await expect(
        prisma.publicCandidateApplication.count({
          where: { publicOpportunityId: opportunity.id, submittedNormalizedEmail: email },
        }),
        email,
      ).resolves.toBe(0);
    }

    await expect(prisma.missionCandidate.count({ where: { missionId: mission.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.publicCandidateApplication.count({ where: { publicOpportunityId: opportunity.id } }),
    ).resolves.toBe(0);

    // The accepted boundary still goes through, so the bound is exact.
    const accepted = await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload('salary-boundary@public-applications.test'),
      salaryExpectationCents: 2_147_483_647,
    });
    expect(accepted.status).toBe(200);
    await expect(
      prisma.publicCandidateApplication.findFirstOrThrow({
        where: {
          publicOpportunityId: opportunity.id,
          submittedNormalizedEmail: 'salary-boundary@public-applications.test',
        },
      }),
    ).resolves.toMatchObject({ submittedSalaryExpectationCents: 2_147_483_647 });
  });

  it('classifies rows by current expectation against the snapshot, with no amount and no write', async () => {
    const stillMatching = await createMissionWithOpportunity(
      'issue27-legacy-match',
      recruiterUserId,
    );
    const maintained = await createMissionWithOpportunity(
      'issue27-legacy-maintained',
      recruiterUserId,
    );
    const reused = await createMissionWithOpportunity('issue27-legacy-reused', recruiterUserId);
    const noExpectation = await createMissionWithOpportunity(
      'issue27-legacy-none',
      recruiterUserId,
    );

    const emails = {
      maintained: 'legacy-maintained@public-applications.test',
      match: 'legacy-match@public-applications.test',
      none: 'legacy-none@public-applications.test',
      reused: 'legacy-reused@public-applications.test',
    } as const;

    // A Candidate whose expectation still equals the submitted snapshot.
    await submit(baseUrl, stillMatching.opportunity.publicSlug, {
      ...applicationPayload(emails.match),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });

    // The same shape, but an operator has since maintained the Candidate.
    await submit(baseUrl, maintained.opportunity.publicSlug, {
      ...applicationPayload(emails.maintained),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
    await prisma.candidate.update({
      where: { normalizedEmail: emails.maintained },
      data: { salaryExpectationCents: 4_200_000 },
    });

    // An already-existing Candidate, whose own compensation is never overwritten.
    await prisma.candidate.create({
      data: {
        displayName: 'Reused applicant',
        email: emails.reused,
        normalizedEmail: emails.reused,
        status: CandidateStatus.ACTIVE,
        consentStatus: ConsentStatus.GRANTED,
        source: 'referral',
        salaryExpectationCents: 1_234_567,
        salaryExpectationCurrency: 'EUR',
      },
    });
    await submit(baseUrl, reused.opportunity.publicSlug, {
      ...applicationPayload(emails.reused),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });

    // An application that recorded an expectation for a Candidate that has none.
    await submit(baseUrl, noExpectation.opportunity.publicSlug, {
      ...applicationPayload(emails.none),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
    await prisma.candidate.update({
      where: { normalizedEmail: emails.none },
      data: { salaryExpectationCents: null },
    });

    const applicationsBefore = await prisma.publicCandidateApplication.findMany({
      where: { publicOpportunity: { publicSlug: { startsWith: 'issue27-legacy-' } } },
      orderBy: { id: 'asc' },
    });
    const candidatesBefore = await prisma.candidate.findMany({
      where: { normalizedEmail: { in: Object.values(emails) } },
      orderBy: { id: 'asc' },
    });

    const rows = await runLegacyReview();

    // Every label states only how the Candidate's current expectation compares
    // with the recorded snapshot. None of them claims the application created or
    // reused the Candidate, and none of them names a unit.
    expect(reviewRowFor(rows, stillMatching.opportunity.id).classification).toBe(
      'CANDIDATE_EXPECTATION_MATCHES_SNAPSHOT',
    );
    expect(reviewRowFor(rows, maintained.opportunity.id).classification).toBe(
      'CANDIDATE_EXPECTATION_DIFFERS_FROM_SNAPSHOT',
    );
    expect(reviewRowFor(rows, reused.opportunity.id).classification).toBe(
      'CANDIDATE_EXPECTATION_DIFFERS_FROM_SNAPSHOT',
    );
    expect(reviewRowFor(rows, noExpectation.opportunity.id).classification).toBe(
      'CANDIDATE_HAS_NO_RECORDED_EXPECTATION',
    );

    const reviewed = [stillMatching, maintained, reused, noExpectation].map((created) =>
      reviewRowFor(rows, created.opportunity.id),
    );
    for (const row of reviewed) {
      // Review evidence only: identifiers, booleans, and a label. No amount, no currency.
      expect(Object.keys(row).sort()).toEqual([...LEGACY_REVIEW_COLUMNS]);
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('3600050');
      expect(serialized).not.toContain('1234567');
      expect(serialized).not.toContain('4200000');
      expect(serialized).not.toContain('MAD');
      expect(serialized).not.toContain('EUR');
    }

    // The statement is read-only: nothing it touched changed.
    await expect(
      prisma.publicCandidateApplication.findMany({
        where: { publicOpportunity: { publicSlug: { startsWith: 'issue27-legacy-' } } },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(applicationsBefore);
    await expect(
      prisma.candidate.findMany({
        where: { normalizedEmail: { in: Object.values(emails) } },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(candidatesBefore);
  });

  it('keeps the review result stable when the opportunity slug is changed afterwards', async () => {
    const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
    const { mission, opportunity } = await createMissionWithOpportunity(
      'issue27-legacy-slugmove',
      recruiterUserId,
    );
    const email = 'legacy-slugmove@public-applications.test';

    // A Candidate this application really does create.
    await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload(email),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
    const before = reviewRowFor(await runLegacyReview(), opportunity.id);
    expect(before.classification).toBe('CANDIDATE_EXPECTATION_MATCHES_SNAPSHOT');
    expect(before.currentCandidateSourceMatchesApplicationOrigin).toBe(true);

    // The supported internal update renames the published slug.
    const renamed = await fetch(`${baseUrl}/v1/missions/${mission.id}/public-opportunity`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ publicSlug: 'issue27-legacy-slugmoved' }),
    });
    expect(renamed.status).toBe(200);

    const after = reviewRowFor(await runLegacyReview(), opportunity.id);
    // The classification is unchanged, because it never depended on the slug.
    expect(after.classification).toBe(before.classification);
    expect(after.currentCandidateCurrencyMatchesSnapshot).toBe(
      before.currentCandidateCurrencyMatchesSnapshot,
    );
    // The current-metadata hint does flip, which is exactly why it is named for
    // current metadata and is never read as provenance: this Candidate was still
    // created by this application.
    expect(after.currentCandidateSourceMatchesApplicationOrigin).toBe(false);
    await expect(
      prisma.candidate.findUniqueOrThrow({ where: { normalizedEmail: email } }),
    ).resolves.toMatchObject({
      source: 'public_application',
      sourceDetail: 'issue27-legacy-slugmove',
    });
  });

  it('keeps the review result stable when Candidate source metadata is edited afterwards', async () => {
    const token = await loginAccessToken(baseUrl, 'recruiter@public-applications.test');
    const created = await createMissionWithOpportunity('issue27-legacy-created', recruiterUserId);
    const reused = await createMissionWithOpportunity('issue27-legacy-rereused', recruiterUserId);
    const createdEmail = 'legacy-created@public-applications.test';
    const reusedEmail = 'legacy-rereused@public-applications.test';

    // One Candidate the application creates, and one that already existed with
    // the same expectation, so only their history differs.
    await submit(baseUrl, created.opportunity.publicSlug, {
      ...applicationPayload(createdEmail),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
    const existing = await prisma.candidate.create({
      data: {
        displayName: 'Previously recorded applicant',
        email: reusedEmail,
        normalizedEmail: reusedEmail,
        status: CandidateStatus.ACTIVE,
        consentStatus: ConsentStatus.GRANTED,
        source: 'referral',
        sourceDetail: 'Career fair',
        salaryExpectationCents: 3_600_050,
        salaryExpectationCurrency: 'MAD',
      },
    });
    await submit(baseUrl, reused.opportunity.publicSlug, {
      ...applicationPayload(reusedEmail),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });

    const createdBefore = reviewRowFor(await runLegacyReview(), created.opportunity.id);
    const reusedBefore = reviewRowFor(await runLegacyReview(), reused.opportunity.id);
    expect(createdBefore.currentCandidateSourceMatchesApplicationOrigin).toBe(true);
    expect(reusedBefore.currentCandidateSourceMatchesApplicationOrigin).toBe(false);

    // Both edits are ordinary authorized Candidate maintenance.
    const clearedOrigin = await fetch(`${baseUrl}/v1/candidates/${createdBefore.candidateId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ source: 'referral', sourceDetail: 'Career fair' }),
    });
    expect(clearedOrigin.status).toBe(200);
    const adoptedOrigin = await fetch(`${baseUrl}/v1/candidates/${existing.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        source: 'public_application',
        sourceDetail: reused.opportunity.publicSlug,
      }),
    });
    expect(adoptedOrigin.status).toBe(200);

    const createdAfter = reviewRowFor(await runLegacyReview(), created.opportunity.id);
    const reusedAfter = reviewRowFor(await runLegacyReview(), reused.opportunity.id);

    // The hint is now exactly inverted against the real history, which is why the
    // review must not derive a new-versus-existing claim from it.
    expect(createdAfter.currentCandidateSourceMatchesApplicationOrigin).toBe(false);
    expect(reusedAfter.currentCandidateSourceMatchesApplicationOrigin).toBe(true);

    // The classification never moved, because it compares recorded amounts only,
    // and the genuinely created and genuinely reused rows are indistinguishable.
    expect(createdAfter.classification).toBe('CANDIDATE_EXPECTATION_MATCHES_SNAPSHOT');
    expect(reusedAfter.classification).toBe('CANDIDATE_EXPECTATION_MATCHES_SNAPSHOT');
    expect(createdAfter.classification).toBe(createdBefore.classification);
    expect(reusedAfter.classification).toBe(reusedBefore.classification);

    // The existing Candidate's own compensation is still untouched by the public
    // application; only the metadata an operator edited changed.
    await expect(
      prisma.candidate.findUniqueOrThrow({ where: { id: existing.id } }),
    ).resolves.toMatchObject({
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });
  });

  it('reviews legacy rows through one read-only statement that returns no compensation', async () => {
    const sql = await readFile(legacyReviewSqlPath, 'utf8');
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .trim();

    expect(statements.startsWith('SELECT')).toBe(true);
    expect(statements.split(';').filter((part) => part.trim() !== '')).toHaveLength(1);
    for (const forbidden of [
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'CREATE',
      'ALTER',
      'DROP',
      'GRANT',
      'FOR UPDATE',
      'FOR NO KEY UPDATE',
      'FOR SHARE',
    ]) {
      expect(statements.toUpperCase(), forbidden).not.toContain(forbidden);
    }
    // No amount or currency column is projected, only the derived booleans.
    expect(statements).not.toContain('AS "submittedSalaryExpectationCents"');
    expect(statements).not.toContain('AS "salaryExpectationCents"');
    expect(statements).not.toContain('AS "salaryExpectationCurrency"');

    const { opportunity } = await createMissionWithOpportunity(
      'issue27-legacy-readonly',
      recruiterUserId,
    );
    const email = 'legacy-readonly@public-applications.test';
    await submit(baseUrl, opportunity.publicSlug, {
      ...applicationPayload(email),
      salaryExpectationCents: 3_600_050,
      salaryExpectationCurrency: 'MAD',
    });

    const applicationBefore = await prisma.publicCandidateApplication.findFirstOrThrow({
      where: { publicOpportunityId: opportunity.id },
    });
    const candidateBefore = await prisma.candidate.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    const auditBefore = await prisma.auditLog.count();

    const row = reviewRowFor(await runLegacyReview(), opportunity.id);
    expect(Object.keys(row).sort()).toEqual([...LEGACY_REVIEW_COLUMNS]);
    expect(JSON.stringify(row)).not.toMatch(/3600050|36000|MAD/);

    // Running the review changes nothing and records no audit entry of its own.
    await expect(
      prisma.publicCandidateApplication.findFirstOrThrow({
        where: { publicOpportunityId: opportunity.id },
      }),
    ).resolves.toEqual(applicationBefore);
    await expect(
      prisma.candidate.findUniqueOrThrow({ where: { normalizedEmail: email } }),
    ).resolves.toEqual(candidateBefore);
    await expect(prisma.auditLog.count()).resolves.toBe(auditBefore);
  });
});
