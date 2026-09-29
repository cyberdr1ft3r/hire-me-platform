import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  DocumentContextOptionLimit,
  DocumentContextOptionsResponseSchema,
  DocumentDetailResponseSchema,
  DocumentListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { loadEnvironment } from '../src/config/environment.js';
import { registerApiHttpBodyParsers } from '../src/public-applications/public-application-http-transport.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ClientStatus,
  InterviewFormat,
  InterviewStatus,
  InterviewType,
  MissionCandidateState,
  MissionRecruiterRole,
  PrismaClient,
  RecruitmentMissionState,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

/**
 * Issue #113 Document Center presentation and option-source security.
 *
 * Synthetic records only, marked `Issue113` / `@document-center.test`. Seeded
 * permissions are looked up, never created or edited, and every touched role's
 * grants are snapshotted and restored exactly.
 */

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-113!';
const emailDomain = '@document-center.test';
const documentPermissions = [
  'documents:view',
  'documents:create',
  'documents:versions:create',
  'documents:update',
  'documents:archive',
  'documents:download',
] as const;
const fullContextPermissions = [
  'clients:view',
  'candidates:view',
  'missions:view',
  'mission_candidates:view',
  'interviews:view',
] as const;
const touchedRoles = [
  RoleName.HR_MANAGER,
  RoleName.MANAGER,
  RoleName.TEAM_LEADER,
  RoleName.EMPLOYEE,
] as const;
const pdfBase64 = Buffer.from('%PDF-1.4\n% issue113 synthetic document\n').toString('base64');

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: { permissionId: string; grantedAt: Date; archivedAt: Date | null }[];
};

async function cleanRecords(): Promise<void> {
  const userFilter = { normalizedEmail: { endsWith: emailDomain } };
  await prisma.refreshSession.deleteMany({ where: { user: userFilter } });
  await prisma.passwordCredential.deleteMany({ where: { user: userFilter } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ actor: userFilter }, { targetUser: userFilter }],
    },
  });
  await prisma.document.updateMany({
    where: { title: { contains: 'Issue113' } },
    data: { currentVersionId: null },
  });
  await prisma.documentVersion.deleteMany({
    where: { document: { title: { contains: 'Issue113' } } },
  });
  await prisma.document.deleteMany({ where: { title: { contains: 'Issue113' } } });
  const candidateFilter = { candidate: userFilter };
  await prisma.interviewEvent.deleteMany({
    where: { interview: { missionCandidate: candidateFilter } },
  });
  await prisma.interviewParticipant.deleteMany({
    where: { interview: { missionCandidate: candidateFilter } },
  });
  await prisma.interview.deleteMany({ where: { missionCandidate: candidateFilter } });
  await prisma.missionCandidate.deleteMany({ where: candidateFilter });
  await prisma.missionRecruiter.deleteMany({ where: { user: userFilter } });
  await prisma.recruitmentMission.deleteMany({ where: { title: { contains: 'Issue113' } } });
  await prisma.candidate.deleteMany({ where: userFilter });
  await prisma.client.deleteMany({ where: { normalizedName: { contains: 'issue113' } } });
  await prisma.userRole.deleteMany({ where: { user: userFilter } });
  await prisma.user.deleteMany({ where: userFilter });
}

async function snapshotRolePermissions(roleName: RoleName): Promise<RolePermissionSnapshot> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    include: { permissions: true },
  });
  if (!role) {
    return { roleExisted: false, permissions: [] };
  }
  return {
    roleExisted: true,
    permissions: role.permissions.map((grant) => ({
      permissionId: grant.permissionId,
      grantedAt: grant.grantedAt,
      archivedAt: grant.archivedAt,
    })),
  };
}

async function restoreRolePermissions(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    return;
  }
  if (!snapshot.roleExisted) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    return;
  }
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: { notIn: snapshot.permissions.map((grant) => grant.permissionId) },
    },
  });
  for (const grant of snapshot.permissions) {
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: role.id, permissionId: grant.permissionId } },
      data: { grantedAt: grant.grantedAt, archivedAt: grant.archivedAt },
    });
  }
}

/** Grants exactly `codes` to the role. Codes must already be seeded. */
async function setRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id },
    data: { archivedAt: new Date() },
  });
  for (const code of codes) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function createUser(localPart: string, roleName: RoleName) {
  const email = `${localPart}${emailDomain}`;
  const user = await prisma.user.create({
    data: {
      displayName: `Issue113 ${localPart}`,
      email,
      normalizedEmail: email,
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: { userId: user.id, passwordHash: await passwords.hashPassword(testPassword) },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { id: user.id, email, displayName: user.displayName };
}

async function login(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  return AuthResponseSchema.parse(await response.json()).accessToken;
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function assign(missionId: string, userId: string): Promise<void> {
  await prisma.missionRecruiter.create({
    data: {
      missionId,
      userId,
      role: MissionRecruiterRole.RECRUITER,
      isLead: false,
      status: AssignmentStatus.ACTIVE,
    },
  });
}

async function createContext(assigneeUserId: string, label: string) {
  const suffix = randomUUID().slice(0, 8);
  const client = await prisma.client.create({
    data: {
      name: `Issue113 ${label} Client ${suffix}`,
      normalizedName: `issue113 ${label.toLowerCase()} client ${suffix}`,
      status: ClientStatus.ACTIVE,
    },
  });
  const candidateEmail = `candidate-${suffix}${emailDomain}`;
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `Issue113 ${label} Candidate ${suffix}`,
      email: candidateEmail,
      normalizedEmail: candidateEmail,
      currentJobTitle: 'Synthetic analyst',
      status: CandidateStatus.ACTIVE,
    },
  });
  const mission = await prisma.recruitmentMission.create({
    data: {
      clientId: client.id,
      title: `Issue113 ${label} Mission ${suffix}`,
      state: RecruitmentMissionState.ACTIVE,
      numberOfPositions: 1,
    },
  });
  await assign(mission.id, assigneeUserId);
  const process = await prisma.missionCandidate.create({
    data: {
      missionId: mission.id,
      candidateId: candidate.id,
      responsibleRecruiterUserId: assigneeUserId,
      state: MissionCandidateState.CLIENT_OFFER,
    },
  });
  const interview = await prisma.interview.create({
    data: {
      missionCandidateId: process.id,
      type: InterviewType.TECHNICAL,
      scheduledStartAt: new Date('2030-03-04T09:00:00.000Z'),
      scheduledEndAt: new Date('2030-03-04T10:00:00.000Z'),
      timezone: 'UTC',
      format: InterviewFormat.VIDEO,
      organizerUserId: assigneeUserId,
      status: InterviewStatus.SCHEDULED,
    },
  });
  return { client, candidate, mission, process, interview };
}

describe('Issue #113 Document Center presentation', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let snapshots: Map<RoleName, RolePermissionSnapshot>;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let operatorToken: string;
  let context: Awaited<ReturnType<typeof createContext>>;

  async function createDocument(
    token: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ documentType: 'OTHER', context: {}, ...body }),
    });
    return { status: response.status, json: await response.json() };
  }

  async function createdDocument(token: string, body: Record<string, unknown>) {
    const result = await createDocument(token, body);
    expect(result.status).toBe(201);
    return DocumentDetailResponseSchema.parse(result.json).document;
  }

  async function options(token: string, query: Record<string, string>) {
    const response = await fetch(
      `${baseUrl}/v1/documents/context-options?${new URLSearchParams(query).toString()}`,
      { headers: headers(token) },
    );
    const json: unknown = await response.json();
    return { status: response.status, json };
  }

  beforeAll(async () => {
    await cleanRecords();
    snapshots = new Map(
      await Promise.all(
        touchedRoles.map(async (role) => [role, await snapshotRolePermissions(role)] as const),
      ),
    );
    await setRolePermissions(RoleName.HR_MANAGER, [
      ...documentPermissions,
      ...fullContextPermissions,
    ]);
    await setRolePermissions(RoleName.EMPLOYEE, ['documents:view', 'documents:create']);
    operator = await createUser('operator', RoleName.HR_MANAGER);
    context = await createContext(operator.id, 'Primary');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    const environment = loadEnvironment();
    registerApiHttpBodyParsers(app, {
      generalJsonLimit: environment.JSON_BODY_LIMIT,
      publicApplicationJsonLimit: environment.PUBLIC_APPLICATION_JSON_LIMIT,
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    operatorToken = await login(baseUrl, operator.email);
  });

  afterAll(async () => {
    await cleanRecords();
    for (const [role, snapshot] of snapshots) {
      await restoreRolePermissions(role, snapshot);
    }
    await app?.close();
    await prisma.$disconnect();
  });

  it('labels every linked context, the owner, the creator, and the current version', async () => {
    const document = await createdDocument(operatorToken, {
      title: 'Issue113 Labelled Contract',
      documentType: 'CONTRAT_RECRUTEMENT',
      context: {
        clientId: context.client.id,
        candidateId: context.candidate.id,
        recruitmentMissionId: context.mission.id,
        missionCandidateId: context.process.id,
      },
      version: {
        filename: 'labelled.pdf',
        contentType: 'application/pdf',
        base64Content: pdfBase64,
      },
    });

    expect(document.contextDisplay).toEqual({
      client: { id: context.client.id, label: context.client.name },
      candidate: { id: context.candidate.id, label: context.candidate.displayName },
      mission: { id: context.mission.id, label: context.mission.title },
      missionCandidate: {
        id: context.process.id,
        candidateLabel: context.candidate.displayName,
        missionLabel: context.mission.title,
      },
      interview: null,
    });
    expect(document.ownerDisplayName).toBe(operator.displayName);
    expect(document.createdByDisplayName).toBe(operator.displayName);
    expect(document.generatedSourceType).toBeNull();
    expect(document.currentVersion).toEqual({
      id: document.versions[0]?.id,
      versionNumber: 1,
      filename: 'labelled.pdf',
      source: 'UPLOADED',
    });
    expect(document.versions[0]?.createdByDisplayName).toBe(operator.displayName);

    const list = await fetch(
      `${baseUrl}/v1/documents?search=${encodeURIComponent('Issue113 Labelled')}`,
      { headers: headers(operatorToken) },
    );
    const listed = DocumentListResponseSchema.parse(await list.json()).documents;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.contextDisplay).toEqual(document.contextDisplay);
    // Display fields only: no email, phone, or commercial detail leaks through the labels.
    expect(JSON.stringify(listed)).not.toContain(emailDomain);
  });

  it('names an interview candidate only when the actor could open that process', async () => {
    const interviewDocument = await createdDocument(operatorToken, {
      title: 'Issue113 Interview Report',
      documentType: 'INTERVIEW_REPORT',
      context: { interviewId: context.interview.id },
    });
    expect(interviewDocument.contextDisplay.interview).toEqual({
      id: context.interview.id,
      interviewType: 'TECHNICAL',
      scheduledStartAt: '2030-03-04T09:00:00.000Z',
      missionLabel: context.mission.title,
      candidateLabel: context.candidate.displayName,
    });

    // Interview scope through the archive override, process visibility without scope.
    await setRolePermissions(RoleName.MANAGER, [
      'documents:view',
      'missions:view',
      'mission_candidates:view',
      'interviews:view',
      'interviews:archive',
    ]);
    const reviewer = await createUser('interview-reviewer', RoleName.MANAGER);
    const reviewerToken = await login(baseUrl, reviewer.email);

    const unassigned = await fetch(`${baseUrl}/v1/documents/${interviewDocument.id}`, {
      headers: headers(reviewerToken),
    });
    expect(unassigned.status).toBe(200);
    const hidden = DocumentDetailResponseSchema.parse(await unassigned.json()).document;
    expect(hidden.contextDisplay.interview?.candidateLabel).toBeNull();
    expect(hidden.contextDisplay.interview?.missionLabel).toBe(context.mission.title);
    expect(JSON.stringify(hidden.contextDisplay)).not.toContain(context.candidate.displayName);

    await assign(context.mission.id, reviewer.id);
    const assigned = await fetch(`${baseUrl}/v1/documents/${interviewDocument.id}`, {
      headers: headers(reviewerToken),
    });
    const named = DocumentDetailResponseSchema.parse(await assigned.json()).document;
    expect(named.contextDisplay.interview?.candidateLabel).toBe(context.candidate.displayName);
  });

  it('keeps a hidden source context indistinguishable from a missing document', async () => {
    const candidateDocument = await createdDocument(operatorToken, {
      title: 'Issue113 Hidden Candidate File',
      context: { candidateId: context.candidate.id },
    });
    await setRolePermissions(RoleName.TEAM_LEADER, ['documents:view', 'clients:view']);
    const outsider = await createUser('outsider', RoleName.TEAM_LEADER);
    const outsiderToken = await login(baseUrl, outsider.email);

    const hidden = await fetch(`${baseUrl}/v1/documents/${candidateDocument.id}`, {
      headers: headers(outsiderToken),
    });
    const missing = await fetch(`${baseUrl}/v1/documents/${randomUUID()}`, {
      headers: headers(outsiderToken),
    });
    const hiddenBody = await hidden.text();
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hiddenBody).toBe(await missing.text());
    expect(hiddenBody).not.toContain(context.candidate.displayName);

    const versions = await fetch(`${baseUrl}/v1/documents/${candidateDocument.id}/versions`, {
      headers: headers(outsiderToken),
    });
    expect(versions.status).toBe(404);

    const list = await fetch(
      `${baseUrl}/v1/documents?candidateId=${context.candidate.id}&pageSize=100`,
      { headers: headers(outsiderToken) },
    );
    const listed = DocumentListResponseSchema.parse(await list.json());
    expect(listed.pagination.total).toBe(0);
    expect(JSON.stringify(listed)).not.toContain(context.candidate.displayName);
  });

  it('filters by current-version source and by current or archived lifecycle', async () => {
    const current = await createdDocument(operatorToken, {
      title: 'Issue113 Lifecycle Current',
      version: {
        filename: 'current.pdf',
        contentType: 'application/pdf',
        base64Content: pdfBase64,
      },
    });
    const archived = await createdDocument(operatorToken, {
      title: 'Issue113 Lifecycle Archived',
      version: {
        filename: 'archived.pdf',
        contentType: 'application/pdf',
        base64Content: pdfBase64,
      },
    });
    const draft = await createdDocument(operatorToken, { title: 'Issue113 Lifecycle Draft' });
    const archiveResponse = await fetch(`${baseUrl}/v1/documents/${archived.id}/archive`, {
      method: 'POST',
      headers: headers(operatorToken),
    });
    expect(archiveResponse.status).toBe(201);

    async function titles(query: string): Promise<string[]> {
      const response = await fetch(
        `${baseUrl}/v1/documents?search=${encodeURIComponent('Issue113 Lifecycle')}&${query}`,
        { headers: headers(operatorToken) },
      );
      expect(response.status).toBe(200);
      return DocumentListResponseSchema.parse(await response.json())
        .documents.map((document) => document.title)
        .sort();
    }

    expect(await titles('lifecycle=current')).toEqual([current.title, draft.title].sort());
    expect(await titles('lifecycle=archived')).toEqual([archived.title]);
    expect(await titles('source=UPLOADED')).toEqual([archived.title, current.title].sort());
    expect(await titles('source=GENERATED')).toEqual([]);
    expect(await titles('source=UPLOADED&lifecycle=current&status=ACTIVE')).toEqual([
      current.title,
    ]);
    const invalid = await fetch(`${baseUrl}/v1/documents?lifecycle=everything`, {
      headers: headers(operatorToken),
    });
    expect(invalid.status).toBe(400);
  });

  it('offers only readable contexts, scoped to assignment, and never more than the limit', async () => {
    const other = await createUser('other-recruiter', RoleName.HR_MANAGER);
    const foreign = await createContext(other.id, 'Foreign');

    const clients = await options(operatorToken, { kind: 'client', search: 'Issue113' });
    expect(clients.status).toBe(200);
    const clientOptions = DocumentContextOptionsResponseSchema.parse(clients.json).options;
    expect(clientOptions.map((option) => option.id)).toEqual(
      expect.arrayContaining([context.client.id, foreign.client.id]),
    );
    expect(clientOptions.length).toBeLessThanOrEqual(DocumentContextOptionLimit);
    expect(Object.keys(clients.json as object)).toEqual(['options']);

    const missions = DocumentContextOptionsResponseSchema.parse(
      (await options(operatorToken, { kind: 'mission', search: 'Issue113' })).json,
    ).options;
    const missionIds = missions.map((option) => option.id);
    expect(missionIds).toContain(context.mission.id);
    expect(missionIds).not.toContain(foreign.mission.id);
    expect(missions.find((option) => option.id === context.mission.id)?.detail).toBe(
      context.client.name,
    );

    const processes = DocumentContextOptionsResponseSchema.parse(
      (await options(operatorToken, { kind: 'missionCandidate', search: 'Issue113' })).json,
    ).options;
    expect(processes.map((option) => option.id)).toContain(context.process.id);
    expect(processes.map((option) => option.id)).not.toContain(foreign.process.id);
    expect(processes.find((option) => option.id === context.process.id)).toEqual({
      id: context.process.id,
      label: context.candidate.displayName,
      detail: context.mission.title,
      interview: null,
    });

    const interviews = DocumentContextOptionsResponseSchema.parse(
      (
        await options(operatorToken, {
          kind: 'interview',
          missionCandidateId: context.process.id,
        })
      ).json,
    ).options;
    expect(interviews).toEqual([
      {
        id: context.interview.id,
        label: context.candidate.displayName,
        detail: context.mission.title,
        interview: { interviewType: 'TECHNICAL', scheduledStartAt: '2030-03-04T09:00:00.000Z' },
      },
    ]);
    // A process outside the actor's scope yields nothing rather than an error.
    const foreignInterviews = await options(operatorToken, {
      kind: 'interview',
      missionCandidateId: foreign.process.id,
    });
    expect(foreignInterviews.status).toBe(200);
    expect(DocumentContextOptionsResponseSchema.parse(foreignInterviews.json).options).toEqual([]);

    const unscoped = await options(operatorToken, { kind: 'interview' });
    expect(unscoped.status).toBe(400);
    const unknownKind = await options(operatorToken, { kind: 'user' });
    expect(unknownKind.status).toBe(400);
    const extraParameter = await options(operatorToken, { kind: 'client', ownerUserId: other.id });
    expect(extraParameter.status).toBe(400);
  });

  it('requires the source permission for each option kind and documents:create to attach', async () => {
    const employee = await createUser('employee', RoleName.EMPLOYEE);
    const employeeToken = await login(baseUrl, employee.email);
    for (const kind of ['client', 'candidate', 'mission', 'missionCandidate'] as const) {
      const response = await options(employeeToken, { kind });
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.json)).not.toContain('Issue113');
    }

    await setRolePermissions(RoleName.TEAM_LEADER, ['documents:view', 'clients:view']);
    const viewer = await createUser('viewer', RoleName.TEAM_LEADER);
    const viewerToken = await login(baseUrl, viewer.email);
    expect((await options(viewerToken, { kind: 'client', search: 'Issue113' })).status).toBe(200);
    const attach = await options(viewerToken, { kind: 'client', purpose: 'attach' });
    expect(attach.status).toBe(403);

    const anonymous = await fetch(`${baseUrl}/v1/documents/context-options?kind=client`);
    expect(anonymous.status).toBe(401);
  });

  it('narrows attach options to writable contexts and excludes archived records', async () => {
    const closed = await prisma.recruitmentMission.create({
      data: {
        clientId: context.client.id,
        title: `Issue113 Closed Mission ${randomUUID().slice(0, 8)}`,
        state: RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
        numberOfPositions: 1,
      },
    });
    await assign(closed.id, operator.id);
    const archivedEmail = `archived-${randomUUID().slice(0, 8)}${emailDomain}`;
    const archivedCandidate = await prisma.candidate.create({
      data: {
        displayName: 'Issue113 Archived Candidate',
        email: archivedEmail,
        normalizedEmail: archivedEmail,
        status: CandidateStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });

    const filterMissions = DocumentContextOptionsResponseSchema.parse(
      (await options(operatorToken, { kind: 'mission', search: 'Issue113 Closed' })).json,
    ).options;
    expect(filterMissions.map((option) => option.id)).toContain(closed.id);
    const attachMissions = DocumentContextOptionsResponseSchema.parse(
      (
        await options(operatorToken, {
          kind: 'mission',
          purpose: 'attach',
          search: 'Issue113 Closed',
        })
      ).json,
    ).options;
    expect(attachMissions.map((option) => option.id)).not.toContain(closed.id);

    const candidates = DocumentContextOptionsResponseSchema.parse(
      (await options(operatorToken, { kind: 'candidate', search: 'Issue113' })).json,
    ).options;
    expect(candidates.map((option) => option.id)).toContain(context.candidate.id);
    expect(candidates.map((option) => option.id)).not.toContain(archivedCandidate.id);
    expect(candidates.find((option) => option.id === context.candidate.id)?.detail).toBe(
      'Synthetic analyst',
    );
  });

  it('still rejects invalid and mismatched contexts on the write path', async () => {
    const other = await createUser('mismatch-owner', RoleName.HR_MANAGER);
    const foreign = await createContext(other.id, 'Mismatch');
    await assign(foreign.mission.id, operator.id);

    const mismatch = await createDocument(operatorToken, {
      title: 'Issue113 Mismatch',
      context: { clientId: context.client.id, recruitmentMissionId: foreign.mission.id },
    });
    expect(mismatch.status).toBe(409);
    expect(JSON.stringify(mismatch.json)).toContain('DOCUMENT_CONTEXT_MISMATCH');

    const processMismatch = await createDocument(operatorToken, {
      title: 'Issue113 Process Mismatch',
      context: { recruitmentMissionId: context.mission.id, missionCandidateId: foreign.process.id },
    });
    expect(processMismatch.status).toBe(409);
    expect(JSON.stringify(processMismatch.json)).toContain('DOCUMENT_CONTEXT_MISMATCH');

    const unknownClient = await createDocument(operatorToken, {
      title: 'Issue113 Unknown Client',
      context: { clientId: randomUUID() },
    });
    expect(unknownClient.status).toBe(409);
    expect(JSON.stringify(unknownClient.json)).toContain('DOCUMENT_CLIENT_CONTEXT_INVALID');

    const unassignedMission = await createContext(other.id, 'Unassigned');
    const outOfScope = await createDocument(operatorToken, {
      title: 'Issue113 Out Of Scope',
      context: { recruitmentMissionId: unassignedMission.mission.id },
    });
    expect(outOfScope.status).toBe(403);

    const written = await prisma.document.count({
      where: {
        title: {
          in: [
            'Issue113 Mismatch',
            'Issue113 Process Mismatch',
            'Issue113 Unknown Client',
            'Issue113 Out Of Scope',
          ],
        },
      },
    });
    expect(written).toBe(0);
  });
});
