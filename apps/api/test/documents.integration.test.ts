import type { NestExpressApplication } from '@nestjs/platform-express';
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
import { loadEnvironment } from '../src/config/environment.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { ProtectedStorageService } from '../src/storage/protected-storage.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ClientStatus,
  DocumentVisibility,
  InterviewFormat,
  InterviewStatus,
  InterviewType,
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
  'interviews:view',
] as const;
const pdfBase64 = Buffer.from('%PDF-1.4\n% issue35 synthetic document\n').toString('base64');
const docxContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function versionPayload(filename: string, contentType: string, content: Buffer) {
  return {
    filename,
    contentType,
    base64Content: content.toString('base64'),
    outputFamily: contentType === xlsxContentType ? ('EXCEL' as const) : ('WORD' as const),
  };
}

function textVersionInput(filename: string, byteCount: number) {
  return {
    filename,
    contentType: 'text/plain',
    base64Content: Buffer.alloc(byteCount, 'a').toString('base64'),
    outputFamily: 'OTHER' as const,
  };
}

function minimalDocx(): Buffer {
  return createZipBuffer({
    '[Content_Types].xml':
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
  });
}

function minimalXlsx(): Buffer {
  return createZipBuffer({
    '[Content_Types].xml':
      '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
  });
}

function arbitraryZip(): Buffer {
  return createZipBuffer({ 'payload.txt': 'not an Office document' });
}

function createZipBuffer(files: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name);
    const content = Buffer.from(value);
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createDocumentThroughApi(
  baseUrl: string,
  token: string,
  input: {
    title: string;
    documentType?: string;
    visibility?: string;
    context?: Record<string, string>;
    version?: {
      filename: string;
      contentType: string;
      base64Content: string;
      outputFamily: 'PDF' | 'WORD' | 'EXCEL' | 'OTHER';
    };
  },
) {
  const response = await fetch(`${baseUrl}/v1/documents`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      documentType: 'OTHER',
      context: {},
      ...input,
    }),
  });
  return DocumentDetailResponseSchema.parse(await response.json()).document;
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
  let app: NestExpressApplication;
  let baseUrl: string;
  let actorUserId: string;
  let accessToken: string;
  let documentsService: DocumentsService;

  beforeAll(async () => {
    await cleanDocumentTestRecords();
    await prepareDocumentCatalog();
    actorUserId = await createUser('operator@documents.test', RoleName.HR_MANAGER);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useBodyParser('json', { limit: loadEnvironment().PUBLIC_APPLICATION_JSON_LIMIT });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    documentsService = app.get(DocumentsService);
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
    expect(body.document.versions[0]?.filename).toBe('unsafe_contract.pdf');
    expect(body.document.versions[0]?.originalFilename).toBe('unsafe contract.pdf');
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

  it('denies mission documents to callers with permission codes but no mission assignment scope', async () => {
    const context = await createRecruitmentContext(actorUserId);
    const document = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Mission Scope Required',
      context: { recruitmentMissionId: context.mission.id },
      version: versionInput('mission-scope.pdf'),
    });
    await setRolePermissions(RoleName.MANAGER, [
      'documents:view',
      'documents:update',
      'documents:download',
      'missions:view',
    ]);
    await createUser('out-of-scope@documents.test', RoleName.MANAGER);
    const outOfScopeToken = await loginAccessToken(baseUrl, 'out-of-scope@documents.test');

    const list = await fetch(`${baseUrl}/v1/documents?search=Issue35%20Mission%20Scope`, {
      headers: authHeaders(outOfScopeToken),
    });
    const listBody = (await list.json()) as { documents: unknown[]; pagination: { total: number } };
    const detail = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
      headers: authHeaders(outOfScopeToken),
    });
    const download = await fetch(
      `${baseUrl}/v1/documents/${document.id}/versions/${document.versions[0]?.id}/download`,
      { headers: authHeaders(outOfScopeToken) },
    );
    const update = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
      method: 'PATCH',
      headers: authHeaders(outOfScopeToken),
      body: JSON.stringify({ title: 'Issue35 Out Of Scope Mutation' }),
    });

    expect(listBody.pagination.total).toBe(0);
    expect(listBody.documents).toHaveLength(0);
    expect(detail.status).toBe(404);
    expect(download.status).toBe(404);
    expect(update.status).toBe(404);
  });

  it('enforces document visibility across list, detail, versions, download, and mutation paths', async () => {
    const privateDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Private Visibility',
      visibility: DocumentVisibility.PRIVATE,
      version: versionInput('private.pdf'),
    });
    const assignedDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Assigned Visibility',
      visibility: DocumentVisibility.ASSIGNED_ONLY,
      version: versionInput('assigned.pdf'),
    });
    const clientSharedDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Client Shared Internal Only',
      visibility: DocumentVisibility.CLIENT_SHARED,
      version: versionInput('client-shared.pdf'),
    });
    await setRolePermissions(RoleName.MANAGER, [...documentPermissions]);
    await createUser('ordinary-visibility@documents.test', RoleName.MANAGER);
    const ordinaryToken = await loginAccessToken(baseUrl, 'ordinary-visibility@documents.test');

    const list = await fetch(`${baseUrl}/v1/documents?search=Issue35&pageSize=100`, {
      headers: authHeaders(ordinaryToken),
    });
    const listBody = (await list.json()) as {
      documents: { id: string }[];
      pagination: { total: number };
    };
    const privateDetail = await fetch(`${baseUrl}/v1/documents/${privateDocument.id}`, {
      headers: authHeaders(ordinaryToken),
    });
    const assignedVersions = await fetch(
      `${baseUrl}/v1/documents/${assignedDocument.id}/versions`,
      {
        headers: authHeaders(ordinaryToken),
      },
    );
    const privateDownload = await fetch(
      `${baseUrl}/v1/documents/${privateDocument.id}/versions/${privateDocument.versions[0]?.id}/download`,
      { headers: authHeaders(ordinaryToken) },
    );
    const assignedUpdate = await fetch(`${baseUrl}/v1/documents/${assignedDocument.id}`, {
      method: 'PATCH',
      headers: authHeaders(ordinaryToken),
      body: JSON.stringify({ title: 'Issue35 Illicit Assigned Update' }),
    });

    expect(listBody.documents.map((document) => document.id)).not.toContain(privateDocument.id);
    expect(listBody.documents.map((document) => document.id)).not.toContain(assignedDocument.id);
    expect(listBody.documents.map((document) => document.id)).toContain(clientSharedDocument.id);
    expect(privateDetail.status).toBe(404);
    expect(assignedVersions.status).toBe(404);
    expect(privateDownload.status).toBe(404);
    expect(assignedUpdate.status).toBe(404);

    await fetch(`${baseUrl}/v1/documents/${privateDocument.id}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ ownerUserId: null }),
    });
    const ownerlessPrivate = await fetch(`${baseUrl}/v1/documents/${privateDocument.id}`, {
      headers: authHeaders(accessToken),
    });
    expect(ownerlessPrivate.status).toBe(404);
  });

  it('applies database-level visibility, stale-context filtering, totals, and bounded pagination', async () => {
    const visibleOne = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Visible 01',
      version: versionInput('visible-01.pdf'),
    });
    const visibleTwo = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Visible 02',
      version: versionInput('visible-02.pdf'),
    });
    const context = await createRecruitmentContext(actorUserId);
    const archivedClientDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Archived Client',
      context: { clientId: context.client.id },
      version: versionInput('archived-client.pdf'),
    });
    const archivedCandidateDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Archived Candidate',
      context: { candidateId: context.candidate.id },
      version: versionInput('archived-candidate.pdf'),
    });
    const archivedMissionDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Archived Mission',
      context: { recruitmentMissionId: context.mission.id },
      version: versionInput('archived-mission.pdf'),
    });
    const archivedProcessDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Archived Process',
      context: { missionCandidateId: context.process.id },
      version: versionInput('archived-process.pdf'),
    });
    const interview = await prisma.interview.create({
      data: {
        missionCandidateId: context.process.id,
        type: InterviewType.HR,
        scheduledStartAt: new Date('2026-09-15T10:00:00.000Z'),
        timezone: 'UTC',
        format: InterviewFormat.VIDEO,
        organizerUserId: actorUserId,
      },
    });
    const archivedInterviewDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 List Archived Interview',
      context: { interviewId: interview.id },
      version: versionInput('archived-interview.pdf'),
    });

    await prisma.client.update({
      where: { id: context.client.id },
      data: { status: ClientStatus.ARCHIVED, archivedAt: new Date() },
    });
    await prisma.candidate.update({
      where: { id: context.candidate.id },
      data: { status: CandidateStatus.ARCHIVED, archivedAt: new Date() },
    });
    await prisma.recruitmentMission.update({
      where: { id: context.mission.id },
      data: { archivedAt: new Date() },
    });
    await prisma.missionCandidate.update({
      where: { id: context.process.id },
      data: { archivedAt: new Date() },
    });
    await prisma.interview.update({
      where: { id: interview.id },
      data: { status: InterviewStatus.ARCHIVED, archivedAt: new Date() },
    });

    const firstPage = await fetch(
      `${baseUrl}/v1/documents?search=Issue35%20List&pageSize=1&page=1`,
      {
        headers: authHeaders(accessToken),
      },
    );
    const secondPage = await fetch(
      `${baseUrl}/v1/documents?search=Issue35%20List&pageSize=1&page=2`,
      {
        headers: authHeaders(accessToken),
      },
    );
    const firstBody = (await firstPage.json()) as {
      documents: { id: string }[];
      pagination: { total: number };
    };
    const secondBody = (await secondPage.json()) as {
      documents: { id: string }[];
      pagination: { total: number };
    };
    const staleDetail = await fetch(`${baseUrl}/v1/documents/${archivedClientDocument.id}`, {
      headers: authHeaders(accessToken),
    });

    expect(firstBody.pagination.total).toBe(2);
    expect(firstBody.documents).toHaveLength(1);
    expect(secondBody.pagination.total).toBe(2);
    expect(secondBody.documents).toHaveLength(1);
    expect(firstBody.documents[0]?.id).not.toBe(secondBody.documents[0]?.id);
    expect(staleDetail.status).toBe(404);
    expect([
      archivedCandidateDocument.id,
      archivedMissionDocument.id,
      archivedProcessDocument.id,
      archivedInterviewDocument.id,
      archivedClientDocument.id,
    ]).not.toContain(firstBody.documents[0]?.id);
    expect([visibleOne.id, visibleTwo.id]).toContain(firstBody.documents[0]?.id);
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

  it('re-checks exact operation permissions at controller and service boundaries', async () => {
    const document = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Exact Permission Matrix',
      version: versionInput('matrix.pdf'),
    });
    await setRolePermissions(RoleName.MANAGER, ['documents:view', 'documents:update']);
    await setRolePermissions(RoleName.TEAM_LEADER, ['documents:view', 'documents:archive']);
    await setRolePermissions(RoleName.EMPLOYEE, ['documents:view', 'documents:versions:create']);
    const updateOnlyUserId = await createUser('update-only@documents.test', RoleName.MANAGER);
    await createUser('archive-only@documents.test', RoleName.TEAM_LEADER);
    await createUser('version-only@documents.test', RoleName.EMPLOYEE);
    const updateOnlyToken = await loginAccessToken(baseUrl, 'update-only@documents.test');
    const archiveOnlyToken = await loginAccessToken(baseUrl, 'archive-only@documents.test');
    const versionOnlyToken = await loginAccessToken(baseUrl, 'version-only@documents.test');

    const updateOnlyArchive = await fetch(`${baseUrl}/v1/documents/${document.id}/archive`, {
      method: 'POST',
      headers: authHeaders(updateOnlyToken),
    });
    const updateOnlyVersion = await fetch(`${baseUrl}/v1/documents/${document.id}/versions`, {
      method: 'POST',
      headers: authHeaders(updateOnlyToken),
      body: JSON.stringify(versionInput('blocked-update-only.pdf')),
    });
    const archiveOnlyUpdate = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
      method: 'PATCH',
      headers: authHeaders(archiveOnlyToken),
      body: JSON.stringify({ title: 'Issue35 Blocked Archive Only Update' }),
    });
    const archiveOnlyVersion = await fetch(`${baseUrl}/v1/documents/${document.id}/versions`, {
      method: 'POST',
      headers: authHeaders(archiveOnlyToken),
      body: JSON.stringify(versionInput('blocked-archive-only.pdf')),
    });
    const versionOnlyUpdate = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
      method: 'PATCH',
      headers: authHeaders(versionOnlyToken),
      body: JSON.stringify({ title: 'Issue35 Blocked Version Only Update' }),
    });
    const versionOnlyArchive = await fetch(`${baseUrl}/v1/documents/${document.id}/archive`, {
      method: 'POST',
      headers: authHeaders(versionOnlyToken),
    });

    let serviceError: unknown;
    try {
      await documentsService.createDocument(
        {
          title: 'Issue35 Direct Service Create Denied',
          documentType: 'OTHER',
          visibility: 'INTERNAL_ONLY',
          context: {},
          version: versionInput('direct-denied.pdf'),
        },
        updateOnlyUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
    } catch (error) {
      serviceError = error;
    }
    expect((serviceError as { getResponse: () => unknown }).getResponse()).toMatchObject({
      error: { code: 'DOCUMENT_PERMISSION_REQUIRED' },
    });

    expect(updateOnlyArchive.status).toBe(403);
    expect(updateOnlyVersion.status).toBe(403);
    expect(archiveOnlyUpdate.status).toBe(403);
    expect(archiveOnlyVersion.status).toBe(403);
    expect(versionOnlyUpdate.status).toBe(403);
    expect(versionOnlyArchive.status).toBe(403);
  });

  it('rolls back metadata updates when required audit persistence fails', async () => {
    const document = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Audit Atomic Original',
      version: versionInput('audit-atomic.pdf'),
    });
    await prisma.$executeRaw`ALTER TABLE "AuditLog" ADD CONSTRAINT "issue35_audit_metadata_block" CHECK (action <> 'documents.document.metadata_updated') NOT VALID`;
    try {
      const rejected = await fetch(`${baseUrl}/v1/documents/${document.id}`, {
        method: 'PATCH',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ title: 'Issue35 Audit Atomic Mutated' }),
      });
      const persisted = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
      const auditCount = await prisma.auditLog.count({
        where: { entityId: document.id, action: 'documents.document.metadata_updated' },
      });

      expect(rejected.status).toBe(500);
      expect(persisted.title).toBe('Issue35 Audit Atomic Original');
      expect(auditCount).toBe(0);
    } finally {
      await prisma.$executeRaw`ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "issue35_audit_metadata_block"`;
    }

    const archiveDocument = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Audit Atomic Archive Original',
      version: versionInput('audit-archive.pdf'),
    });
    await prisma.$executeRaw`ALTER TABLE "AuditLog" ADD CONSTRAINT "issue35_audit_archive_block" CHECK (action <> 'documents.document.archived') NOT VALID`;
    try {
      const rejected = await fetch(`${baseUrl}/v1/documents/${archiveDocument.id}/archive`, {
        method: 'POST',
        headers: authHeaders(accessToken),
      });
      const persisted = await prisma.document.findUniqueOrThrow({
        where: { id: archiveDocument.id },
      });
      const auditCount = await prisma.auditLog.count({
        where: { entityId: archiveDocument.id, action: 'documents.document.archived' },
      });

      expect(rejected.status).toBe(500);
      expect(persisted.status).toBe('ACTIVE');
      expect(persisted.archivedAt).toBeNull();
      expect(auditCount).toBe(0);
    } finally {
      await prisma.$executeRaw`ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "issue35_audit_archive_block"`;
    }
  });

  it('accepts real synthetic DOCX/XLSX and rejects spoofed or mismatched payloads', async () => {
    const docx = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Accepted DOCX',
      documentType: 'HR_DOCUMENT',
      version: versionPayload('document.docx', docxContentType, minimalDocx()),
    });
    const xlsx = await createDocumentThroughApi(baseUrl, accessToken, {
      title: 'Issue35 Accepted XLSX',
      documentType: 'HR_DOCUMENT',
      version: versionPayload('workbook.xlsx', xlsxContentType, minimalXlsx()),
    });
    const spoofedZipAsDocx = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Spoofed DOCX',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: versionPayload('spoof.docx', docxContentType, arbitraryZip()),
      }),
    });
    const exeAsPdf = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 EXE As PDF',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: {
          filename: 'malware.pdf',
          contentType: 'application/pdf',
          base64Content: Buffer.from('MZ executable').toString('base64'),
          outputFamily: 'PDF',
        },
      }),
    });
    const pngMismatch = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 PNG Spoof',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: {
          filename: 'spoof.png',
          contentType: 'image/png',
          base64Content: Buffer.from('not really png').toString('base64'),
          outputFamily: 'OTHER',
        },
      }),
    });

    expect(docx.versions[0]?.mimeType).toBe(docxContentType);
    expect(xlsx.versions[0]?.mimeType).toBe(xlsxContentType);
    expect(spoofedZipAsDocx.status).toBe(400);
    expect(exeAsPdf.status).toBe(400);
    expect(pngMismatch.status).toBe(400);
  });

  it('enforces strict base64 and coherent runtime upload-size bounds', async () => {
    const accepted = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Max Text Payload',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: textVersionInput('max.txt', 4_000_000),
      }),
    });
    const tooLarge = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Too Large Text Payload',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: textVersionInput('too-large.txt', 4_000_001),
      }),
    });
    const invalidBase64 = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Invalid Base64',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: {
          filename: 'invalid.txt',
          contentType: 'text/plain',
          base64Content: 'not strict base64!',
          outputFamily: 'OTHER',
        },
      }),
    });
    const empty = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        title: 'Issue35 Empty File',
        documentType: 'HR_DOCUMENT',
        context: {},
        version: {
          filename: 'empty.txt',
          contentType: 'text/plain',
          base64Content: '',
          outputFamily: 'OTHER',
        },
      }),
    });

    expect(accepted.status).toBe(201);
    expect(tooLarge.status).toBe(400);
    expect(invalidBase64.status).toBe(400);
    expect(empty.status).toBe(400);
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
