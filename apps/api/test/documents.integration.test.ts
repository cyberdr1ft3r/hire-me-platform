import type { INestApplication } from '@nestjs/common';
import './setup-env.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  DocumentDetailResponseSchema,
  DocumentTypeSchema,
  DocumentVersionListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { ProtectedStorageService } from '../src/storage/protected-storage.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ClientStatus,
  DocumentType,
  MissionCandidateState,
  MissionRecruiterRole,
  PermissionScopeType,
  PrismaClient,
  RecruitmentMissionState,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const storage = new ProtectedStorageService();
const testPassword = 'Synthetic-passphrase-123!';
const documentPermissions = [
  'documents:view',
  'documents:create',
  'documents:versions:create',
  'documents:update',
  'documents:archive',
  'documents:download',
] as const;
const contextPermissions = [
  'clients:view',
  'candidates:view',
  'missions:view',
  'mission_candidates:view',
] as const;
const pdfBase64 = Buffer.from('%PDF-1.4\n% issue35 synthetic document\n').toString('base64');

async function cleanDocumentTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@documents.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@documents.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['Document', 'DocumentVersion'] } },
        { targetUser: { normalizedEmail: { endsWith: '@documents.test' } } },
      ],
    },
  });
  await prisma.document.updateMany({
    where: { title: { contains: 'Issue35' } },
    data: { currentVersionId: null },
  });
  await prisma.documentVersion.deleteMany({
    where: { document: { title: { contains: 'Issue35' } } },
  });
  await prisma.document.deleteMany({ where: { title: { contains: 'Issue35' } } });
  await prisma.missionCandidate.deleteMany({
    where: { candidate: { normalizedEmail: { endsWith: '@documents.test' } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@documents.test' } } },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue35' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@documents.test' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue35' } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@documents.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@documents.test' } },
  });
}

async function setRolePermissions(roleName: RoleName, permissionCodes: readonly string[]) {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for document tests.`,
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id },
    data: { archivedAt: new Date() },
  });
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for document tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for document tests.`,
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

async function prepareDocumentCatalog(): Promise<void> {
  await setRolePermissions(RoleName.HR_MANAGER, [...documentPermissions, ...contextPermissions]);
  await setRolePermissions(RoleName.EMPLOYEE, [...documentPermissions]);
  await setRolePermissions(RoleName.GUEST, []);
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
    data: {
      userId: user.id,
      passwordHash: await passwords.hashPassword(testPassword),
    },
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

async function createRecruitmentContext(ownerUserId: string) {
  const suffix = randomUUID();
  const client = await prisma.client.create({
    data: {
      name: `Issue35 Client ${suffix}`,
      normalizedName: `issue35 client ${suffix}`,
      status: ClientStatus.ACTIVE,
    },
  });
  const candidateEmail = `candidate-${suffix}@documents.test`;
  const candidate = await prisma.candidate.create({
    data: {
      displayName: 'Issue35 Candidate',
      email: candidateEmail,
      normalizedEmail: candidateEmail,
      status: CandidateStatus.ACTIVE,
    },
  });
  const mission = await prisma.recruitmentMission.create({
    data: {
      clientId: client.id,
      title: `Issue35 Mission ${suffix}`,
      state: RecruitmentMissionState.ACTIVE,
      numberOfPositions: 1,
    },
  });
  await prisma.missionRecruiter.create({
    data: {
      missionId: mission.id,
      userId: ownerUserId,
      role: MissionRecruiterRole.LEAD_RECRUITER,
      isLead: true,
      status: AssignmentStatus.ACTIVE,
    },
  });
  const process = await prisma.missionCandidate.create({
    data: {
      missionId: mission.id,
      candidateId: candidate.id,
      responsibleRecruiterUserId: ownerUserId,
      state: MissionCandidateState.CLIENT_OFFER,
    },
  });
  return { client, candidate, mission, process };
}

function versionInput(filename = 'contract.pdf') {
  return {
    filename,
    contentType: 'application/pdf',
    base64Content: pdfBase64,
    outputFamily: 'PDF' as const,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function raceAfterDocumentLock<T>(
  documentId: string,
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
      await transaction.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId}::uuid FOR UPDATE`;
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

describe('document management foundation', () => {
  let app: INestApplication;
  let baseUrl: string;
  let actorUserId: string;
  let accessToken: string;

  beforeAll(async () => {
    await cleanDocumentTestRecords();
    await prepareDocumentCatalog();
    actorUserId = await createUser('operator@documents.test', RoleName.HR_MANAGER);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    accessToken = await loginAccessToken(baseUrl, 'operator@documents.test');
  });

  afterAll(async () => {
    await cleanDocumentTestRecords();
    await app.close();
    await prisma.$disconnect();
  });

  it('keeps recruitment and training contract taxonomy distinct and blocks legacy generic contract creation', async () => {
    expect(DocumentTypeSchema.options).toContain('CONTRAT_RECRUTEMENT');
    expect(DocumentTypeSchema.options).toContain('CONTRAT_FORMATION');
    expect(DocumentType.CONTRAT_RECRUTEMENT).not.toBe(DocumentType.CONTRAT_FORMATION);

    const legacy = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Legacy Contract',
        documentType: 'LEGACY_CONTRACT',
        context: {},
      }),
    });

    expect(legacy.status).toBe(400);
  });

  it('registers recruitment documents with immutable versions and protected download payloads', async () => {
    const context = await createRecruitmentContext(actorUserId);
    const created = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Recruitment Contract',
        documentType: 'CONTRAT_RECRUTEMENT',
        context: {
          clientId: context.client.id,
          candidateId: context.candidate.id,
          recruitmentMissionId: context.mission.id,
          missionCandidateId: context.process.id,
        },
        version: versionInput('../unsafe contract.pdf'),
      }),
    });
    const body = DocumentDetailResponseSchema.parse(await created.json());
    const serialized = JSON.stringify(body);

    expect(created.status).toBe(201);
    expect(body.document.documentType).toBe('CONTRAT_RECRUTEMENT');
    expect(body.document.versions).toHaveLength(1);
    expect(body.document.versions[0]?.versionNumber).toBe(1);
    expect(body.document.versions[0]?.filename).toBe('.._unsafe_contract.pdf');
    expect(body.document.versions[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('documents/');

    const download = await fetch(
      `${baseUrl}/v1/documents/${body.document.id}/versions/${body.document.versions[0]?.id}/download`,
      { headers: authHeaders(accessToken) },
    );
    expect(download.status).toBe(200);
    expect(await download.text()).toContain('%PDF-1.4');
  });

  it('creates deterministic version numbers under concurrent uploads', async () => {
    const context = await createRecruitmentContext(actorUserId);
    const created = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Concurrent Versions',
        documentType: 'JOB_DESCRIPTION',
        context: { recruitmentMissionId: context.mission.id, clientId: context.client.id },
        version: versionInput('v1.pdf'),
      }),
    });
    const document = DocumentDetailResponseSchema.parse(await created.json()).document;

    const [first, second] = await raceAfterDocumentLock(document.id, async () => {
      const firstPromise = fetch(`${baseUrl}/v1/documents/${document.id}/versions`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify(versionInput('v2.pdf')),
      });
      await sleep(50);
      const secondPromise = fetch(`${baseUrl}/v1/documents/${document.id}/versions`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify(versionInput('v3.pdf')),
      });
      return Promise.all([firstPromise, secondPromise]);
    });
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { versionNumber: 'asc' },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2, 3]);
    expect(new Set(versions.map((version) => version.versionNumber)).size).toBe(3);
  });

  it('requires document capability plus underlying business context permission', async () => {
    const context = await createRecruitmentContext(actorUserId);
    const created = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Scoped Candidate File',
        documentType: 'HR_DOCUMENT',
        context: { candidateId: context.candidate.id },
        version: versionInput('candidate.pdf'),
      }),
    });
    const document = DocumentDetailResponseSchema.parse(await created.json()).document;
    await createUser('document-only@documents.test', RoleName.EMPLOYEE);
    const documentOnlyToken = await loginAccessToken(baseUrl, 'document-only@documents.test');

    const denied = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
      headers: authHeaders(documentOnlyToken),
    });

    expect(denied.status).toBe(404);
  });

  it('rejects cross-context mismatches without document, version, or audit side effects', async () => {
    const first = await createRecruitmentContext(actorUserId);
    const second = await createRecruitmentContext(actorUserId);
    const before = await countDocumentSideEffects();
    const rejected = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Rejected Mismatch',
        documentType: 'CONTRAT_RECRUTEMENT',
        context: {
          clientId: second.client.id,
          recruitmentMissionId: first.mission.id,
        },
        version: versionInput('mismatch.pdf'),
      }),
    });
    const after = await countDocumentSideEffects();

    expect(rejected.status).toBe(409);
    expect(after).toEqual(before);
  });

  it('rejects archived context downloads while preserving document history', async () => {
    const context = await createRecruitmentContext(actorUserId);
    const created = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Archived Context',
        documentType: 'CLIENT_FILE',
        context: { clientId: context.client.id },
        version: versionInput('archive.pdf'),
      }),
    });
    const document = DocumentDetailResponseSchema.parse(await created.json()).document;
    await prisma.client.update({
      where: { id: context.client.id },
      data: { status: ClientStatus.ARCHIVED, archivedAt: new Date() },
    });

    const detail = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
      headers: authHeaders(accessToken),
    });
    const versionCount = await prisma.documentVersion.count({ where: { documentId: document.id } });

    expect(detail.status).toBe(404);
    expect(versionCount).toBe(1);
  });

  it('archives documents without deleting historical versions and omits sensitive audit metadata', async () => {
    const context = await createRecruitmentContext(actorUserId);
    const created = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Archive Preserves Versions',
        documentType: 'JOB_DESCRIPTION',
        context: { recruitmentMissionId: context.mission.id },
        version: versionInput('job-description.pdf'),
      }),
    });
    const document = DocumentDetailResponseSchema.parse(await created.json()).document;

    const archived = await fetch(`${baseUrl}/v1/documents/${document.id}/archive`, {
      method: 'POST',
      headers: authHeaders(accessToken),
    });
    const versions = await fetch(`${baseUrl}/v1/documents/${document.id}/versions`, {
      headers: authHeaders(accessToken),
    });
    const versionBody = DocumentVersionListResponseSchema.parse(await versions.json());
    const audit = await prisma.auditLog.findMany({
      where: { entityId: { in: [document.id, document.versions[0]?.id ?? ''] } },
    });
    const serializedAudit = JSON.stringify(audit);

    expect(archived.status).toBe(201);
    expect(versionBody.versions).toHaveLength(1);
    expect(serializedAudit).not.toContain('storageKey');
    expect(serializedAudit).not.toContain('documents/');
    expect(serializedAudit).not.toContain('%PDF');
  });

  it('denies unauthorized UUID access and rejected writes leave no document side effects', async () => {
    await createUser('guest@documents.test', RoleName.GUEST);
    const guestToken = await loginAccessToken(baseUrl, 'guest@documents.test');
    const before = await countDocumentSideEffects();
    const deniedList = await fetch(`${baseUrl}/v1/documents`, {
      headers: authHeaders(guestToken),
    });
    const deniedCreate = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(guestToken),
      body: JSON.stringify({
        title: 'Issue35 Unauthorized Create',
        documentType: 'OTHER',
        context: {},
        version: versionInput('denied.pdf'),
      }),
    });
    const after = await countDocumentSideEffects();

    expect(deniedList.status).toBe(403);
    expect(deniedCreate.status).toBe(403);
    expect(after).toEqual(before);
  });

  it('keeps protected storage identities server-side and rejects traversal keys', async () => {
    await expect(storage.put('../issue35-traversal.txt', Buffer.from('blocked'))).rejects.toThrow(
      'Invalid storage key.',
    );
    await expect(storage.put('C:/issue35-absolute.txt', Buffer.from('blocked'))).rejects.toThrow(
      'Invalid storage key.',
    );
  });
});

async function countDocumentSideEffects() {
  const [documents, versions, audits] = await Promise.all([
    prisma.document.count({ where: { title: { contains: 'Issue35' } } }),
    prisma.documentVersion.count({ where: { document: { title: { contains: 'Issue35' } } } }),
    prisma.auditLog.count({ where: { entityType: { in: ['Document', 'DocumentVersion'] } } }),
  ]);
  return { documents, versions, audits };
}
