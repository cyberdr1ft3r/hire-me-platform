import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  CandidateStatus,
  ClientContactStatus,
  ClientStatus,
  ExternalParticipantStatus,
  PermissionScopeType,
  PrismaClient,
  RoleName,
  TrainingEnrollmentStatus,
  TrainingProgramStatus,
  TrainingSessionParticipationStatus,
  TrainingSessionStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

/**
 * Issue #37 training operations integration coverage.
 *
 * Every test runs against real PostgreSQL so that lifecycle rules, nested parent
 * integrity, record scope, unique constraints, row locking, and audit atomicity are
 * verified against the database rather than mocks.
 */

/**
 * Full training operator: every training capability PLUS the source-domain read
 * capabilities that the participant types require. The source capabilities are listed
 * explicitly so the fixture cannot silently mask the cross-domain boundary.
 */
const operatorPermissions = [
  'training_programs:view',
  'training_programs:view_all',
  'training_programs:manage',
  'training_programs:status:manage',
  'training_programs:archive',
  'training_sessions:view',
  'training_sessions:manage',
  'training_sessions:archive',
  'training_enrollments:view',
  'training_enrollments:manage',
  'training_participation:view',
  'training_participation:manage',
  'training_participation:correct',
  'training_participation:archive',
  'clients:view',
  'client_contacts:view',
  'candidates:view',
] as const;

/**
 * Full training write capability but NO source-domain read capability. This actor
 * proves that training permissions alone cannot discover or link a candidate or a
 * client contact.
 */
const trainingOnlyPermissions = [
  'training_programs:view',
  'training_programs:view_all',
  'training_sessions:view',
  'training_sessions:manage',
  'training_enrollments:view',
  'training_enrollments:manage',
  'training_participation:view',
  'training_participation:manage',
] as const;

/**
 * Source-domain read capability but NO training write capability. This actor proves
 * that CRM visibility alone cannot create a training enrollment.
 */
const sourceReadOnlyPermissions = [
  'training_programs:view',
  'training_programs:view_all',
  'training_enrollments:view',
  'clients:view',
  'client_contacts:view',
  'candidates:view',
] as const;

/** Broad training oversight WITHOUT client read scope. */
const clientBlindPermissions = [
  'training_programs:view',
  'training_programs:view_all',
  'training_sessions:view',
  'training_enrollments:view',
  'training_participation:view',
] as const;

/** May record attendance but may never correct or archive recorded attendance. */
const attendanceOnlyPermissions = [
  'training_programs:view',
  'training_programs:view_all',
  'training_sessions:view',
  'training_enrollments:view',
  'training_participation:view',
  'training_participation:manage',
] as const;

/** Assigned scope only: no broad oversight capability. */
const scopedPermissions = [
  'training_programs:view',
  'training_sessions:view',
  'training_enrollments:view',
] as const;

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: {
    permissionId: string;
    grantedAt: Date;
    archivedAt: Date | null;
  }[];
};

async function cleanTrainingTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@training.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@training.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          entityType: {
            in: [
              'TrainingProgram',
              'TrainingSession',
              'TrainingEnrollment',
              'TrainingSessionParticipation',
            ],
          },
        },
        { actor: { normalizedEmail: { endsWith: '@training.test' } } },
      ],
    },
  });
  await prisma.trainingSessionParticipation.deleteMany({
    where: { session: { program: { normalizedReference: { startsWith: 'issue37' } } } },
  });
  await prisma.trainingEnrollment.deleteMany({
    where: { program: { normalizedReference: { startsWith: 'issue37' } } },
  });
  await prisma.trainingSession.deleteMany({
    where: { program: { normalizedReference: { startsWith: 'issue37' } } },
  });
  await prisma.trainingProgram.deleteMany({
    where: { normalizedReference: { startsWith: 'issue37' } },
  });
  await prisma.externalTrainingParticipant.deleteMany({
    where: { displayName: { startsWith: 'Issue37' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@training.test' } },
  });
  await prisma.clientContact.deleteMany({
    where: { normalizedEmail: { endsWith: '@training.test' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { startsWith: 'issue37' } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@training.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@training.test' } },
  });
}

async function setRolePermissions(roleName: RoleName, permissionCodes: readonly string[]) {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for training tests.`,
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
      update: { status: 'ACTIVE' },
      create: {
        code,
        description: `Synthetic ${code} permission for training tests.`,
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
    permissions: role.permissions.map((rolePermission) => ({
      permissionId: rolePermission.permissionId,
      grantedAt: rolePermission.grantedAt,
      archivedAt: rolePermission.archivedAt,
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
      permissionId: {
        notIn: snapshot.permissions.map((rolePermission) => rolePermission.permissionId),
      },
    },
  });
  for (const rolePermission of snapshot.permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: rolePermission.permissionId },
      },
      update: { grantedAt: rolePermission.grantedAt, archivedAt: rolePermission.archivedAt },
      create: {
        roleId: role.id,
        permissionId: rolePermission.permissionId,
        grantedAt: rolePermission.grantedAt,
        archivedAt: rolePermission.archivedAt,
      },
    });
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

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

// Each case drives several authenticated HTTP round trips against real PostgreSQL,
// so the suite uses an explicit timeout rather than the 5s vitest default. Assertions
// are unchanged; only the time budget differs.
describe('training operations foundation', { timeout: 30_000 }, () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let operatorUserId: string;
  let scopedUserId: string;
  let operatorToken: string;
  let clientBlindToken: string;
  let attendanceOnlyToken: string;
  let trainingOnlyToken: string;
  let sourceReadOnlyToken: string;
  let roleSnapshots: Map<RoleName, RolePermissionSnapshot>;

  // --- Helpers bound to the running application -------------------------------

  async function loginAccessToken(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword }),
    });
    return AuthResponseSchema.parse(await response.json()).accessToken;
  }

  async function api(
    token: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}/v1/training${path}`, {
      method: init.method ?? 'GET',
      headers: authHeaders(token),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
  }

  async function createProgram(
    overrides: Record<string, unknown> = {},
    token = operatorToken,
  ): Promise<Record<string, unknown>> {
    const created = await api(token, '/programs', {
      method: 'POST',
      body: {
        reference: `Issue37-${randomUUID().slice(0, 8)}`,
        name: 'Issue37 Training Program',
        ...overrides,
      },
    });
    expect(created.status).toBe(201);
    return (created.body as { program: Record<string, unknown> }).program;
  }

  async function activateProgram(programId: string): Promise<void> {
    const response = await api(operatorToken, `/programs/${programId}/status`, {
      method: 'POST',
      body: { status: 'PROGRAM_ACTIVE' },
    });
    expect(response.status).toBe(201);
  }

  async function createSession(
    programId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const created = await api(operatorToken, `/programs/${programId}/sessions`, {
      method: 'POST',
      body: {
        title: 'Issue37 Session',
        scheduledAt: futureIso(24),
        scheduledEndAt: futureIso(27),
        ...overrides,
      },
    });
    expect(created.status).toBe(201);
    return (created.body as { session: Record<string, unknown> }).session;
  }

  /** Moves a session into a state where attendance may legitimately be recorded. */
  async function scheduleSession(programId: string, sessionId: string): Promise<void> {
    const response = await api(
      operatorToken,
      `/programs/${programId}/sessions/${sessionId}/status`,
      {
        method: 'POST',
        body: { status: 'SESSION_SCHEDULED' },
      },
    );
    expect(response.status).toBe(201);
  }

  async function createCandidate(status: CandidateStatus = CandidateStatus.ACTIVE) {
    const email = `candidate-${randomUUID()}@training.test`;
    return prisma.candidate.create({
      data: {
        displayName: 'Issue37 Candidate',
        email,
        normalizedEmail: email,
        status,
        ...(status === CandidateStatus.ARCHIVED ? { archivedAt: new Date() } : {}),
      },
    });
  }

  async function enrollCandidate(
    programId: string,
    candidateId: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return api(operatorToken, `/programs/${programId}/enrollments`, {
      method: 'POST',
      body: { participantType: 'CANDIDATE', candidateId },
    });
  }

  async function countAudit(action: string, entityId?: string): Promise<number> {
    return prisma.auditLog.count({
      where: { action, ...(entityId ? { entityId } : {}) },
    });
  }

  beforeAll(async () => {
    await cleanTrainingTestRecords();
    roleSnapshots = new Map(
      await Promise.all(
        [
          RoleName.HR_MANAGER,
          RoleName.MANAGER,
          RoleName.TEAM_LEADER,
          RoleName.EMPLOYEE,
          RoleName.GUEST,
          RoleName.ADMIN,
        ].map(async (roleName) => [roleName, await snapshotRolePermissions(roleName)] as const),
      ),
    );

    await setRolePermissions(RoleName.HR_MANAGER, operatorPermissions);
    await setRolePermissions(RoleName.MANAGER, clientBlindPermissions);
    await setRolePermissions(RoleName.TEAM_LEADER, attendanceOnlyPermissions);
    await setRolePermissions(RoleName.EMPLOYEE, scopedPermissions);
    await setRolePermissions(RoleName.ADMIN, trainingOnlyPermissions);
    await setRolePermissions(RoleName.GUEST, sourceReadOnlyPermissions);

    operatorUserId = await createUser('operator@training.test', RoleName.HR_MANAGER);
    await createUser('client-blind@training.test', RoleName.MANAGER);
    await createUser('attendance@training.test', RoleName.TEAM_LEADER);
    scopedUserId = await createUser('scoped@training.test', RoleName.EMPLOYEE);
    await createUser('training-only@training.test', RoleName.ADMIN);
    await createUser('source-only@training.test', RoleName.GUEST);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    operatorToken = await loginAccessToken('operator@training.test');
    clientBlindToken = await loginAccessToken('client-blind@training.test');
    attendanceOnlyToken = await loginAccessToken('attendance@training.test');
    trainingOnlyToken = await loginAccessToken('training-only@training.test');
    sourceReadOnlyToken = await loginAccessToken('source-only@training.test');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await cleanTrainingTestRecords();
    for (const [roleName, snapshot] of roleSnapshots) {
      await restoreRolePermissions(roleName, snapshot);
    }
    await prisma.$disconnect();
  }, 120_000);

  // ---------------------------------------------------------------------------
  // Programs
  // ---------------------------------------------------------------------------

  it('creates and updates a training program with safe audit metadata', async () => {
    const program = await createProgram({
      description: 'Issue37 description',
      targetAudience: 'Internal staff',
      ownerUserId: operatorUserId,
      plannedStartDate: futureIso(48),
      plannedEndDate: futureIso(120),
    });

    expect(program.status).toBe(TrainingProgramStatus.PROGRAM_DRAFT);
    expect(program.ownerUserId).toBe(operatorUserId);

    const updated = await api(operatorToken, `/programs/${String(program.id)}`, {
      method: 'PATCH',
      body: { name: 'Issue37 Updated Program' },
    });
    expect(updated.status).toBe(200);
    expect((updated.body as { program: { name: string } }).program.name).toBe(
      'Issue37 Updated Program',
    );

    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: 'TrainingProgram', entityId: String(program.id) },
    });
    expect(auditEntries.length).toBe(2);
    for (const entry of auditEntries) {
      expect(entry.actorUserId).toBe(operatorUserId);
      // Audit summaries stay short and operational; never confidential content.
      expect(entry.metadataSummary).not.toContain('Issue37 description');
    }
  });

  it('rejects a duplicate training program reference', async () => {
    const reference = `Issue37-dup-${randomUUID().slice(0, 8)}`;
    await createProgram({ reference });

    const duplicate = await api(operatorToken, '/programs', {
      method: 'POST',
      body: { reference: reference.toUpperCase(), name: 'Issue37 Duplicate' },
    });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PROGRAM_REFERENCE_TAKEN',
    );
  });

  it('applies valid program lifecycle transitions and rejects invalid ones', async () => {
    const program = await createProgram();
    const programId = String(program.id);

    const skipToClosed = await api(operatorToken, `/programs/${programId}/status`, {
      method: 'POST',
      body: { status: 'PROGRAM_CLOSED' },
    });
    expect(skipToClosed.status).toBe(409);
    expect((skipToClosed.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PROGRAM_STATUS_TRANSITION_BLOCKED',
    );

    await activateProgram(programId);

    const closed = await api(operatorToken, `/programs/${programId}/status`, {
      method: 'POST',
      body: { status: 'PROGRAM_CLOSED' },
    });
    expect(closed.status).toBe(201);

    const backToDraft = await api(operatorToken, `/programs/${programId}/status`, {
      method: 'POST',
      body: { status: 'PROGRAM_DRAFT' },
    });
    expect(backToDraft.status).toBe(409);

    const archived = await api(operatorToken, `/programs/${programId}/archive`, { method: 'POST' });
    expect(archived.status).toBe(201);
    expect((archived.body as { program: { status: string } }).program.status).toBe(
      TrainingProgramStatus.PROGRAM_ARCHIVED,
    );
  });

  it('refuses to archive a training program that is not closed', async () => {
    const program = await createProgram();
    const blocked = await api(operatorToken, `/programs/${String(program.id)}/archive`, {
      method: 'POST',
    });
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PROGRAM_ARCHIVE_BLOCKED',
    );
  });

  it('blocks operations on an archived training program and leaves no partial state', async () => {
    const program = await createProgram();
    const programId = String(program.id);
    await activateProgram(programId);
    await api(operatorToken, `/programs/${programId}/status`, {
      method: 'POST',
      body: { status: 'PROGRAM_CLOSED' },
    });
    await api(operatorToken, `/programs/${programId}/archive`, { method: 'POST' });

    const blockedSession = await api(operatorToken, `/programs/${programId}/sessions`, {
      method: 'POST',
      body: {
        title: 'Issue37 Rejected Session',
        scheduledAt: futureIso(24),
        scheduledEndAt: futureIso(26),
      },
    });
    expect(blockedSession.status).toBe(409);
    expect((blockedSession.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PROGRAM_ARCHIVED',
    );

    // A rejected mutation must leave neither a record nor a misleading audit entry.
    expect(await prisma.trainingSession.count({ where: { trainingProgramId: programId } })).toBe(0);
    expect(await countAudit('training.session.created')).toBe(
      await prisma.trainingSession.count({
        where: { program: { normalizedReference: { startsWith: 'issue37' } } },
      }),
    );

    const blockedUpdate = await api(operatorToken, `/programs/${programId}`, {
      method: 'PATCH',
      body: { name: 'Issue37 Should Not Apply' },
    });
    expect(blockedUpdate.status).toBe(409);
    const reloaded = await prisma.trainingProgram.findUniqueOrThrow({ where: { id: programId } });
    expect(reloaded.name).not.toBe('Issue37 Should Not Apply');
  });

  it('hides client-linked training programs from actors without client read scope', async () => {
    const client = await prisma.client.create({
      data: {
        name: `Issue37 Client ${randomUUID().slice(0, 8)}`,
        normalizedName: `issue37 client ${randomUUID().slice(0, 8)}`,
        status: ClientStatus.ACTIVE,
      },
    });
    const program = await createProgram({ clientId: client.id });
    const programId = String(program.id);
    expect(program.clientId).toBe(client.id);

    // Broad training oversight alone must not expose client-linked training records.
    const denied = await api(clientBlindToken, `/programs/${programId}`);
    expect(denied.status).toBe(404);

    const list = await api(clientBlindToken, '/programs?pageSize=100');
    const listed = (list.body as { programs: { id: string }[] }).programs;
    expect(listed.some((entry) => entry.id === programId)).toBe(false);

    const allowed = await api(operatorToken, `/programs/${programId}`);
    expect(allowed.status).toBe(200);
  });

  it('refuses to link a training program to a client without client read scope', async () => {
    const client = await prisma.client.create({
      data: {
        name: `Issue37 Client ${randomUUID().slice(0, 8)}`,
        normalizedName: `issue37 client ${randomUUID().slice(0, 8)}`,
        status: ClientStatus.ACTIVE,
      },
    });

    // The actor can create programs but has no client scope, so linking is refused.
    await setRolePermissions(RoleName.EMPLOYEE, [...scopedPermissions, 'training_programs:manage']);
    const scopedManageToken = await loginAccessToken('scoped@training.test');
    const refused = await api(scopedManageToken, '/programs', {
      method: 'POST',
      body: {
        reference: `Issue37-noclient-${randomUUID().slice(0, 8)}`,
        name: 'Issue37 Client Scope Test',
        clientId: client.id,
      },
    });
    expect(refused.status).toBe(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_CLIENT_SCOPE_REQUIRED',
    );
    await setRolePermissions(RoleName.EMPLOYEE, scopedPermissions);
  });

  it('limits assigned-scope actors to their own training programs', async () => {
    const ownProgram = await createProgram({ ownerUserId: scopedUserId });
    const otherProgram = await createProgram({ ownerUserId: operatorUserId });

    const freshScopedToken = await loginAccessToken('scoped@training.test');
    const own = await api(freshScopedToken, `/programs/${String(ownProgram.id)}`);
    expect(own.status).toBe(200);

    const other = await api(freshScopedToken, `/programs/${String(otherProgram.id)}`);
    expect(other.status).toBe(404);
  });

  it('paginates, filters, and orders training programs deterministically', async () => {
    const reference = `Issue37-page-${randomUUID().slice(0, 8)}`;
    const program = await createProgram({ reference, name: 'Issue37 Pagination Program' });
    await activateProgram(String(program.id));

    const filtered = await api(
      operatorToken,
      `/programs?search=${encodeURIComponent(reference)}&status=PROGRAM_ACTIVE&sortBy=reference&sortDirection=asc&page=1&pageSize=5`,
    );
    expect(filtered.status).toBe(200);
    const payload = filtered.body as {
      programs: { id: string }[];
      pagination: { page: number; pageSize: number; total: number };
    };
    expect(payload.pagination).toEqual({ page: 1, pageSize: 5, total: 1 });
    expect(payload.programs[0]?.id).toBe(String(program.id));
  });

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  it('creates a session under its own program and rejects cross-program nested access', async () => {
    const programA = await createProgram();
    const programB = await createProgram();
    await activateProgram(String(programA.id));
    await activateProgram(String(programB.id));

    const sessionB = await createSession(String(programB.id), { title: 'Issue37 Session B' });

    // Program A must never be able to read or mutate a session owned by program B.
    const crossRead = await api(
      operatorToken,
      `/programs/${String(programA.id)}/sessions/${String(sessionB.id)}`,
    );
    expect(crossRead.status).toBe(404);

    const crossCancel = await api(
      operatorToken,
      `/programs/${String(programA.id)}/sessions/${String(sessionB.id)}/cancel`,
      { method: 'POST', body: { reason: 'Issue37 cross-program attempt' } },
    );
    expect(crossCancel.status).toBe(404);

    const untouched = await prisma.trainingSession.findUniqueOrThrow({
      where: { id: String(sessionB.id) },
    });
    expect(untouched.status).toBe(TrainingSessionStatus.SESSION_PLANNED);
    expect(untouched.canceledAt).toBeNull();
  });

  it('rejects an invalid session schedule window', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));

    const invalid = await api(operatorToken, `/programs/${String(program.id)}/sessions`, {
      method: 'POST',
      body: {
        title: 'Issue37 Invalid Window',
        scheduledAt: futureIso(30),
        scheduledEndAt: futureIso(24),
      },
    });
    expect(invalid.status).toBe(400);
    expect(
      await prisma.trainingSession.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
  });

  it('rejects a duplicate session sequence inside the same program', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    await createSession(String(program.id), { sequence: 1 });

    const duplicate = await api(operatorToken, `/programs/${String(program.id)}/sessions`, {
      method: 'POST',
      body: {
        title: 'Issue37 Duplicate Sequence',
        sequence: 1,
        scheduledAt: futureIso(48),
        scheduledEndAt: futureIso(50),
      },
    });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_SESSION_SEQUENCE_TAKEN',
    );
  });

  it('reschedules a session and preserves reschedule history', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const session = await createSession(String(program.id));
    const originalStart = String(session.scheduledAt);

    const rescheduled = await api(
      operatorToken,
      `/programs/${String(program.id)}/sessions/${String(session.id)}/reschedule`,
      {
        method: 'POST',
        body: {
          scheduledAt: futureIso(72),
          scheduledEndAt: futureIso(75),
          reason: 'Issue37 trainer unavailable',
        },
      },
    );
    expect(rescheduled.status).toBe(201);
    const payload = (
      rescheduled.body as {
        session: {
          status: string;
          rescheduleCount: number;
          previousScheduledAt: string | null;
          lastRescheduleReason: string | null;
        };
      }
    ).session;
    expect(payload.status).toBe(TrainingSessionStatus.SESSION_SCHEDULED);
    expect(payload.rescheduleCount).toBe(1);
    expect(payload.previousScheduledAt).toBe(originalStart);
    // The accepted reason must be preserved, not silently discarded.
    expect(payload.lastRescheduleReason).toBe('Issue37 trainer unavailable');
    const storedSession = await prisma.trainingSession.findUniqueOrThrow({
      where: { id: String(session.id) },
    });
    expect(storedSession.lastRescheduleReason).toBe('Issue37 trainer unavailable');
  });

  it('cancels a scheduled session with a recorded reason and blocks later reschedule', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const session = await createSession(String(program.id));
    const sessionPath = `/programs/${String(program.id)}/sessions/${String(session.id)}`;

    await api(operatorToken, `${sessionPath}/status`, {
      method: 'POST',
      body: { status: 'SESSION_SCHEDULED' },
    });

    const canceled = await api(operatorToken, `${sessionPath}/cancel`, {
      method: 'POST',
      body: { reason: 'Issue37 client postponed indefinitely' },
    });
    expect(canceled.status).toBe(201);
    expect((canceled.body as { session: { status: string } }).session.status).toBe(
      TrainingSessionStatus.SESSION_CANCELED,
    );

    const blocked = await api(operatorToken, `${sessionPath}/reschedule`, {
      method: 'POST',
      body: { scheduledAt: futureIso(96), scheduledEndAt: futureIso(98) },
    });
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_SESSION_RESCHEDULE_BLOCKED',
    );
  });

  it('keeps concurrent reschedule and cancel from producing contradictory terminal state', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const session = await createSession(String(program.id));
    const sessionPath = `/programs/${String(program.id)}/sessions/${String(session.id)}`;
    await api(operatorToken, `${sessionPath}/status`, {
      method: 'POST',
      body: { status: 'SESSION_SCHEDULED' },
    });

    const [reschedule, cancel] = await Promise.all([
      api(operatorToken, `${sessionPath}/reschedule`, {
        method: 'POST',
        body: { scheduledAt: futureIso(120), scheduledEndAt: futureIso(123) },
      }),
      api(operatorToken, `${sessionPath}/cancel`, {
        method: 'POST',
        body: { reason: 'Issue37 concurrent cancel' },
      }),
    ]);

    // Program and session row locks serialize the two writes. Whatever the order,
    // the stored session must be internally consistent.
    const stored = await prisma.trainingSession.findUniqueOrThrow({
      where: { id: String(session.id) },
    });

    if (stored.status === TrainingSessionStatus.SESSION_CANCELED) {
      expect(stored.canceledAt).not.toBeNull();
      expect(stored.cancellationReason).toBe('Issue37 concurrent cancel');
      expect(cancel.status).toBe(201);
    } else {
      expect(stored.status).toBe(TrainingSessionStatus.SESSION_SCHEDULED);
      expect(stored.canceledAt).toBeNull();
      expect(reschedule.status).toBe(201);
      // A cancel that lost the race must have been rejected, not silently dropped.
      expect(cancel.status).toBe(201);
    }

    expect(
      [reschedule.status, cancel.status].filter((status) => status === 201).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('archives only completed or canceled sessions', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const session = await createSession(String(program.id));
    const sessionPath = `/programs/${String(program.id)}/sessions/${String(session.id)}`;

    const tooEarly = await api(operatorToken, `${sessionPath}/archive`, { method: 'POST' });
    expect(tooEarly.status).toBe(409);

    await api(operatorToken, `${sessionPath}/status`, {
      method: 'POST',
      body: { status: 'SESSION_SCHEDULED' },
    });
    await api(operatorToken, `${sessionPath}/cancel`, {
      method: 'POST',
      body: { reason: 'Issue37 canceled before archive' },
    });

    const archived = await api(operatorToken, `${sessionPath}/archive`, { method: 'POST' });
    expect(archived.status).toBe(201);
    expect((archived.body as { session: { status: string } }).session.status).toBe(
      TrainingSessionStatus.SESSION_ARCHIVED,
    );
  });

  // ---------------------------------------------------------------------------
  // Enrollment
  // ---------------------------------------------------------------------------

  it('enrolls an eligible candidate participant', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();

    const created = await enrollCandidate(String(program.id), candidate.id);
    expect(created.status).toBe(201);
    const enrollment = (
      created.body as {
        enrollment: { status: string; createdByUserId: string; certificateReady: boolean };
      }
    ).enrollment;
    expect(enrollment.status).toBe(TrainingEnrollmentStatus.REGISTERED);
    expect(enrollment.createdByUserId).toBe(operatorUserId);
    expect(enrollment.certificateReady).toBe(false);
  });

  it('prevents a duplicate active enrollment for the same participant', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();

    expect((await enrollCandidate(String(program.id), candidate.id)).status).toBe(201);

    const duplicate = await enrollCandidate(String(program.id), candidate.id);
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_ENROLLMENT_ALREADY_ACTIVE',
    );
    expect(
      await prisma.trainingEnrollment.count({
        where: { trainingProgramId: String(program.id), candidateId: candidate.id },
      }),
    ).toBe(1);
  });

  it('resolves concurrent duplicate enrollment attempts deterministically', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();

    const results = await Promise.all([
      enrollCandidate(String(program.id), candidate.id),
      enrollCandidate(String(program.id), candidate.id),
      enrollCandidate(String(program.id), candidate.id),
    ]);

    expect(results.filter((result) => result.status === 201).length).toBe(1);
    expect(results.filter((result) => result.status === 409).length).toBe(2);
    expect(
      await prisma.trainingEnrollment.count({
        where: { trainingProgramId: String(program.id), candidateId: candidate.id },
      }),
    ).toBe(1);
  });

  it('rejects archived and ineligible participants', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));

    const archivedCandidate = await createCandidate(CandidateStatus.ARCHIVED);
    const archived = await enrollCandidate(String(program.id), archivedCandidate.id);
    expect(archived.status).toBe(409);
    expect((archived.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPANT_ARCHIVED',
    );

    const inactiveCandidate = await createCandidate(CandidateStatus.INACTIVE);
    const ineligible = await enrollCandidate(String(program.id), inactiveCandidate.id);
    expect(ineligible.status).toBe(409);
    expect((ineligible.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPANT_INELIGIBLE',
    );

    const external = await prisma.externalTrainingParticipant.create({
      data: {
        displayName: 'Issue37 Inactive External',
        status: ExternalParticipantStatus.INACTIVE,
      },
    });
    const externalRejected = await api(
      operatorToken,
      `/programs/${String(program.id)}/enrollments`,
      {
        method: 'POST',
        body: { participantType: 'EXTERNAL', externalTrainingParticipantId: external.id },
      },
    );
    expect(externalRejected.status).toBe(409);

    // Every rejection must leave the program with no enrollment rows at all.
    expect(
      await prisma.trainingEnrollment.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
    expect(await countAudit('training.enrollment.created', String(program.id))).toBe(0);
  });

  it('rejects a client contact from outside the training program client context', async () => {
    const programClient = await prisma.client.create({
      data: {
        name: `Issue37 Program Client ${randomUUID().slice(0, 8)}`,
        normalizedName: `issue37 program client ${randomUUID().slice(0, 8)}`,
        status: ClientStatus.ACTIVE,
      },
    });
    const otherClient = await prisma.client.create({
      data: {
        name: `Issue37 Other Client ${randomUUID().slice(0, 8)}`,
        normalizedName: `issue37 other client ${randomUUID().slice(0, 8)}`,
        status: ClientStatus.ACTIVE,
      },
    });
    const foreignEmail = `contact-${randomUUID()}@training.test`;
    const foreignContact = await prisma.clientContact.create({
      data: {
        clientId: otherClient.id,
        displayName: 'Issue37 Foreign Contact',
        email: foreignEmail,
        normalizedEmail: foreignEmail,
        status: ClientContactStatus.ACTIVE,
      },
    });

    const program = await createProgram({ clientId: programClient.id });
    await activateProgram(String(program.id));

    const mismatch = await api(operatorToken, `/programs/${String(program.id)}/enrollments`, {
      method: 'POST',
      body: { participantType: 'CLIENT_CONTACT', clientContactId: foreignContact.id },
    });
    expect(mismatch.status).toBe(400);
    expect((mismatch.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPANT_CONTEXT_MISMATCH',
    );
    expect(
      await prisma.trainingEnrollment.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
  });

  it('records the completion boundary and exposes certificate readiness', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();
    const created = await enrollCandidate(String(program.id), candidate.id);
    const enrollmentId = String((created.body as { enrollment: { id: string } }).enrollment.id);
    const enrollmentPath = `/programs/${String(program.id)}/enrollments/${enrollmentId}`;

    for (const status of ['APPROVAL_PENDING', 'APPROVED', 'ENROLLED', 'EVALUATED']) {
      const response = await api(operatorToken, `${enrollmentPath}/status`, {
        method: 'POST',
        body: { status },
      });
      expect(response.status).toBe(201);
    }

    const evaluated = await api(operatorToken, enrollmentPath);
    const enrollment = (
      evaluated.body as {
        enrollment: {
          completedAt: string | null;
          certificateReady: boolean;
          certificateStatus: string;
        };
      }
    ).enrollment;
    expect(enrollment.completedAt).not.toBeNull();
    // NOT_APPLICABLE means no certificate is expected, so completion alone is not ready.
    expect(enrollment.certificateStatus).toBe('NOT_APPLICABLE');
    expect(enrollment.certificateReady).toBe(false);

    const applicable = await api(operatorToken, `${enrollmentPath}/certificate-status`, {
      method: 'POST',
      body: { certificateStatus: 'PENDING' },
    });
    expect(applicable.status).toBe(201);
    expect(
      (applicable.body as { enrollment: { certificateReady: boolean } }).enrollment
        .certificateReady,
    ).toBe(true);

    const readyFiltered = await api(
      operatorToken,
      `/programs/${String(program.id)}/enrollments?certificateReadyOnly=true`,
    );
    expect((readyFiltered.body as { enrollments: unknown[] }).enrollments.length).toBe(1);

    // Once a certificate is recorded as issued the enrollment is no longer "ready".
    await api(operatorToken, `${enrollmentPath}/status`, {
      method: 'POST',
      body: { status: 'CERTIFICATE_ISSUED' },
    });
    const issued = await api(operatorToken, enrollmentPath);
    expect(
      (issued.body as { enrollment: { certificateReady: boolean } }).enrollment.certificateReady,
    ).toBe(false);

    const readyOnly = await api(
      operatorToken,
      `/programs/${String(program.id)}/enrollments?certificateReadyOnly=true`,
    );
    expect((readyOnly.body as { enrollments: unknown[] }).enrollments.length).toBe(0);
  });

  it('rejects an invalid enrollment transition without changing stored state', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();
    const created = await enrollCandidate(String(program.id), candidate.id);
    const enrollmentId = String((created.body as { enrollment: { id: string } }).enrollment.id);

    const invalid = await api(
      operatorToken,
      `/programs/${String(program.id)}/enrollments/${enrollmentId}/status`,
      { method: 'POST', body: { status: 'CERTIFICATE_ISSUED' } },
    );
    expect(invalid.status).toBe(409);

    const stored = await prisma.trainingEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    expect(stored.status).toBe(TrainingEnrollmentStatus.REGISTERED);
    expect(await countAudit('training.enrollment.status_updated', enrollmentId)).toBe(0);
  });

  it('withdraws an enrollment, preserves history, and frees the active participant slot', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();
    const created = await enrollCandidate(String(program.id), candidate.id);
    const enrollmentId = String((created.body as { enrollment: { id: string } }).enrollment.id);

    const withdrawn = await api(
      operatorToken,
      `/programs/${String(program.id)}/enrollments/${enrollmentId}/withdraw`,
      { method: 'POST', body: { reason: 'Issue37 participant left the company' } },
    );
    expect(withdrawn.status).toBe(201);
    const payload = (
      withdrawn.body as { enrollment: { status: string; withdrawnAt: string | null } }
    ).enrollment;
    expect(payload.status).toBe(TrainingEnrollmentStatus.CANCELED);
    expect(payload.withdrawnAt).not.toBeNull();

    // History is never physically deleted.
    const stored = await prisma.trainingEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    expect(stored.withdrawalReason).toBe('Issue37 participant left the company');
    expect(stored.activeParticipantKey).toBeNull();

    // The freed slot allows a new enrollment while the withdrawn row remains.
    const reEnrolled = await enrollCandidate(String(program.id), candidate.id);
    expect(reEnrolled.status).toBe(201);
    expect(
      await prisma.trainingEnrollment.count({
        where: { trainingProgramId: String(program.id), candidateId: candidate.id },
      }),
    ).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Session participation and attendance
  // ---------------------------------------------------------------------------

  async function participationFixture({ schedule = true }: { schedule?: boolean } = {}) {
    const program = await createProgram();
    const programId = String(program.id);
    await activateProgram(programId);
    const session = await createSession(programId);
    const sessionId = String(session.id);
    if (schedule) {
      await scheduleSession(programId, sessionId);
    }
    const candidate = await createCandidate();
    const created = await enrollCandidate(programId, candidate.id);
    const enrollmentId = String((created.body as { enrollment: { id: string } }).enrollment.id);
    return { programId, sessionId, enrollmentId };
  }

  /** Creates a participation record and returns its id. */
  async function addParticipation(
    programId: string,
    sessionId: string,
    enrollmentId: string,
  ): Promise<string> {
    const created = await api(
      operatorToken,
      `/programs/${programId}/sessions/${sessionId}/participations`,
      { method: 'POST', body: { trainingEnrollmentId: enrollmentId } },
    );
    expect(created.status).toBe(201);
    return String((created.body as { participation: { id: string } }).participation.id);
  }

  it('links participation for a matching session and enrollment pair', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();

    const created = await api(
      operatorToken,
      `/programs/${programId}/sessions/${sessionId}/participations`,
      { method: 'POST', body: { trainingEnrollmentId: enrollmentId } },
    );
    expect(created.status).toBe(201);
    expect((created.body as { participation: { status: string } }).participation.status).toBe(
      TrainingSessionParticipationStatus.EXPECTED,
    );
  });

  it('rejects a session and enrollment pair from different training programs', async () => {
    const first = await participationFixture();
    const second = await participationFixture();

    // Program A session + program B enrollment must never be linked.
    const mismatch = await api(
      operatorToken,
      `/programs/${first.programId}/sessions/${first.sessionId}/participations`,
      { method: 'POST', body: { trainingEnrollmentId: second.enrollmentId } },
    );
    expect(mismatch.status).toBe(400);
    expect((mismatch.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPATION_PROGRAM_MISMATCH',
    );
    expect(
      await prisma.trainingSessionParticipation.count({
        where: { trainingSessionId: first.sessionId },
      }),
    ).toBe(0);
    expect(await countAudit('training.participation.created', first.sessionId)).toBe(0);
  });

  it('prevents duplicate participation for the same session and enrollment', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const path = `/programs/${programId}/sessions/${sessionId}/participations`;

    expect(
      (
        await api(operatorToken, path, {
          method: 'POST',
          body: { trainingEnrollmentId: enrollmentId },
        })
      ).status,
    ).toBe(201);

    const duplicate = await api(operatorToken, path, {
      method: 'POST',
      body: { trainingEnrollmentId: enrollmentId },
    });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPATION_ALREADY_EXISTS',
    );
  });

  it('resolves concurrent duplicate participation attempts deterministically', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const path = `/programs/${programId}/sessions/${sessionId}/participations`;

    const results = await Promise.all([
      api(operatorToken, path, { method: 'POST', body: { trainingEnrollmentId: enrollmentId } }),
      api(operatorToken, path, { method: 'POST', body: { trainingEnrollmentId: enrollmentId } }),
      api(operatorToken, path, { method: 'POST', body: { trainingEnrollmentId: enrollmentId } }),
    ]);

    expect(results.filter((result) => result.status === 201).length).toBe(1);
    expect(
      await prisma.trainingSessionParticipation.count({
        where: { trainingSessionId: sessionId, trainingEnrollmentId: enrollmentId },
      }),
    ).toBe(1);
  });

  it('records attendance and rejects a non-sequential attendance transition', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const attendancePath = `/programs/${programId}/sessions/${sessionId}/participations/${participationId}/attendance`;

    const attended = await api(operatorToken, attendancePath, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });
    expect(attended.status).toBe(201);
    const payload = (
      attended.body as { participation: { status: string; attendanceRecordedAt: string | null } }
    ).participation;
    expect(payload.status).toBe(TrainingSessionParticipationStatus.ATTENDED);
    expect(payload.attendanceRecordedAt).not.toBeNull();

    // Flipping a recorded attendance value requires an explicit correction.
    const flip = await api(operatorToken, attendancePath, {
      method: 'POST',
      body: { status: 'ABSENT' },
    });
    expect(flip.status).toBe(409);
    expect((flip.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_ATTENDANCE_TRANSITION_BLOCKED',
    );

    const stored = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(stored.status).toBe(TrainingSessionParticipationStatus.ATTENDED);
    expect(stored.correctionCount).toBe(0);
  });

  it('applies an auditable attendance correction and denies unauthorized correction', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const basePath = `/programs/${programId}/sessions/${sessionId}/participations/${participationId}`;

    await api(operatorToken, `${basePath}/attendance`, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });

    // An actor who may record attendance but lacks the correction capability is denied.
    const unauthorized = await api(attendanceOnlyToken, `${basePath}/correction`, {
      method: 'POST',
      body: { status: 'ABSENT', correctionReason: 'Issue37 unauthorized attempt' },
    });
    expect(unauthorized.status).toBe(403);
    const untouched = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(untouched.status).toBe(TrainingSessionParticipationStatus.ATTENDED);
    expect(untouched.correctionCount).toBe(0);
    expect(await countAudit('training.participation.attendance_corrected', participationId)).toBe(
      0,
    );

    const corrected = await api(operatorToken, `${basePath}/correction`, {
      method: 'POST',
      body: { status: 'ABSENT', correctionReason: 'Issue37 trainer sign-in sheet review' },
    });
    expect(corrected.status).toBe(201);
    const payload = (
      corrected.body as {
        participation: { status: string; correctionCount: number; lastCorrectionReason: string };
      }
    ).participation;
    expect(payload.status).toBe(TrainingSessionParticipationStatus.ABSENT);
    expect(payload.correctionCount).toBe(1);
    expect(payload.lastCorrectionReason).toBe('Issue37 trainer sign-in sheet review');
    expect(await countAudit('training.participation.attendance_corrected', participationId)).toBe(
      1,
    );
  });

  it('redacts trainer notes from actors who may not manage participation', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    await api(
      operatorToken,
      `/programs/${programId}/sessions/${sessionId}/participations/${participationId}/attendance`,
      {
        method: 'POST',
        body: { status: 'ATTENDED', trainerNotes: 'Issue37 confidential trainer note' },
      },
    );

    const listPath = `/programs/${programId}/sessions/${sessionId}/participations`;

    const managed = await api(operatorToken, listPath);
    expect(
      (managed.body as { participations: { trainerNotes: string | null }[] }).participations[0]
        ?.trainerNotes,
    ).toBe('Issue37 confidential trainer note');

    const readOnly = await api(clientBlindToken, listPath);
    expect(
      (readOnly.body as { participations: { trainerNotes: string | null }[] }).participations[0]
        ?.trainerNotes,
    ).toBeNull();
  });

  it('blocks attendance on an archived session and leaves recorded history unchanged', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const sessionPath = `/programs/${programId}/sessions/${sessionId}`;

    await api(operatorToken, `${sessionPath}/cancel`, {
      method: 'POST',
      body: { reason: 'Issue37 canceled session' },
    });
    await api(operatorToken, `${sessionPath}/archive`, { method: 'POST' });

    const blocked = await api(
      operatorToken,
      `${sessionPath}/participations/${participationId}/attendance`,
      { method: 'POST', body: { status: 'ATTENDED' } },
    );
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_SESSION_NOT_ACCEPTING_ATTENDANCE',
    );

    const stored = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(stored.status).toBe(TrainingSessionParticipationStatus.EXPECTED);
    expect(stored.attendanceRecordedAt).toBeNull();
    expect(await countAudit('training.participation.attendance_updated', participationId)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Participant source-record authorization
  // ---------------------------------------------------------------------------

  it('refuses candidate enrollment to a training operator without candidate read scope', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();

    const denied = await api(trainingOnlyToken, `/programs/${String(program.id)}/enrollments`, {
      method: 'POST',
      body: { participantType: 'CANDIDATE', candidateId: candidate.id },
    });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPANT_SOURCE_SCOPE_REQUIRED',
    );

    // The rejected write leaves no enrollment and no misleading audit history.
    expect(
      await prisma.trainingEnrollment.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
    expect(await countAudit('training.enrollment.created')).toBe(
      await prisma.trainingEnrollment.count(),
    );
  });

  it('does not let an actor without candidate scope distinguish candidate ids', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const active = await createCandidate();
    const archived = await createCandidate(CandidateStatus.ARCHIVED);
    const inactive = await createCandidate(CandidateStatus.INACTIVE);
    const missing = randomUUID();

    const responses = await Promise.all(
      [active.id, archived.id, inactive.id, missing].map((candidateId) =>
        api(trainingOnlyToken, `/programs/${String(program.id)}/enrollments`, {
          method: 'POST',
          body: { participantType: 'CANDIDATE', candidateId },
        }),
      ),
    );

    // Existent, archived, inactive, and nonexistent must be indistinguishable.
    const shapes = responses.map((response) => JSON.stringify([response.status, response.body]));
    expect(new Set(shapes).size).toBe(1);
    expect(responses[0]?.status).toBe(403);
  });

  it('refuses enrollment to an actor with candidate read but no training write capability', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();

    const denied = await api(sourceReadOnlyToken, `/programs/${String(program.id)}/enrollments`, {
      method: 'POST',
      body: { participantType: 'CANDIDATE', candidateId: candidate.id },
    });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: { code: string } }).error.code).toBe('PERMISSION_DENIED');
    expect(
      await prisma.trainingEnrollment.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
  });

  it('allows candidate enrollment when both candidate read and training write are held', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();

    const created = await enrollCandidate(String(program.id), candidate.id);
    expect(created.status).toBe(201);
    expect(
      (created.body as { enrollment: { participant: { candidateId: string | null } } }).enrollment
        .participant.candidateId,
    ).toBe(candidate.id);
  });

  it('does not let an actor without contact scope distinguish client contact ids', async () => {
    const client = await prisma.client.create({
      data: {
        name: `Issue37 Contact Client ${randomUUID().slice(0, 8)}`,
        normalizedName: `issue37 contact client ${randomUUID().slice(0, 8)}`,
        status: ClientStatus.ACTIVE,
      },
    });
    const email = `contact-${randomUUID()}@training.test`;
    const contact = await prisma.clientContact.create({
      data: {
        clientId: client.id,
        displayName: 'Issue37 Contact',
        email,
        normalizedEmail: email,
        status: ClientContactStatus.ACTIVE,
      },
    });
    const program = await createProgram();
    await activateProgram(String(program.id));

    const responses = await Promise.all(
      [contact.id, randomUUID()].map((clientContactId) =>
        api(trainingOnlyToken, `/programs/${String(program.id)}/enrollments`, {
          method: 'POST',
          body: { participantType: 'CLIENT_CONTACT', clientContactId },
        }),
      ),
    );

    const shapes = responses.map((response) => JSON.stringify([response.status, response.body]));
    expect(new Set(shapes).size).toBe(1);
    expect(responses[0]?.status).toBe(403);
    expect((responses[0]?.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPANT_SOURCE_SCOPE_REQUIRED',
    );
    expect(
      await prisma.trainingEnrollment.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
  });

  it('allows client contact enrollment with client and contact read scope in matching context', async () => {
    const suffix = randomUUID().slice(0, 8);
    const client = await prisma.client.create({
      data: {
        name: `Issue37 Own Client ${suffix}`,
        normalizedName: `issue37 own client ${suffix}`,
        status: ClientStatus.ACTIVE,
      },
    });
    const email = `own-contact-${randomUUID()}@training.test`;
    const contact = await prisma.clientContact.create({
      data: {
        clientId: client.id,
        displayName: 'Issue37 Own Contact',
        email,
        normalizedEmail: email,
        status: ClientContactStatus.ACTIVE,
      },
    });
    const program = await createProgram({ clientId: client.id });
    await activateProgram(String(program.id));

    const created = await api(operatorToken, `/programs/${String(program.id)}/enrollments`, {
      method: 'POST',
      body: { participantType: 'CLIENT_CONTACT', clientContactId: contact.id },
    });
    expect(created.status).toBe(201);
    expect(
      (created.body as { enrollment: { participant: { clientContactId: string | null } } })
        .enrollment.participant.clientContactId,
    ).toBe(contact.id);
  });

  it('redacts source identifiers from enrollment reads without source visibility', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));
    const candidate = await createCandidate();
    await enrollCandidate(String(program.id), candidate.id);
    const listPath = `/programs/${String(program.id)}/enrollments`;

    const authorized = await api(operatorToken, listPath);
    expect(
      (authorized.body as { enrollments: { participant: { candidateId: string | null } }[] })
        .enrollments[0]?.participant.candidateId,
    ).toBe(candidate.id);

    // The same training record stays visible, but the CRM identifier is redacted.
    const redacted = await api(trainingOnlyToken, listPath);
    const redactedEnrollments = (
      redacted.body as {
        enrollments: { participantType: string; participant: { candidateId: string | null } }[];
      }
    ).enrollments;
    expect(redactedEnrollments.length).toBe(1);
    expect(redactedEnrollments[0]?.participantType).toBe('CANDIDATE');
    expect(redactedEnrollments[0]?.participant.candidateId).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Legacy active-enrollment uniqueness
  // ---------------------------------------------------------------------------

  it('keeps a migrated legacy active enrollment unique and rejects keyless active rows', async () => {
    const program = await createProgram();
    const programId = String(program.id);
    await activateProgram(programId);
    const candidate = await createCandidate();

    // Represents a pre-existing active enrollment as the migration backfill leaves it.
    const legacy = await prisma.trainingEnrollment.create({
      data: {
        trainingProgramId: programId,
        participantType: 'CANDIDATE',
        candidateId: candidate.id,
        status: TrainingEnrollmentStatus.ENROLLED,
        activeParticipantKey: `CANDIDATE:${candidate.id}`,
      },
    });
    expect(legacy.activeParticipantKey).toBe(`CANDIDATE:${candidate.id}`);

    // A post-migration duplicate for the same participant must be refused.
    const duplicate = await enrollCandidate(programId, candidate.id);
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_ENROLLMENT_ALREADY_ACTIVE',
    );
    expect(
      await prisma.trainingEnrollment.count({
        where: { trainingProgramId: programId, candidateId: candidate.id },
      }),
    ).toBe(1);

    // The database invariant also refuses an active enrollment with no key at all,
    // so an active row can never escape the uniqueness index by holding NULL.
    await expect(
      prisma.trainingEnrollment.create({
        data: {
          trainingProgramId: programId,
          participantType: 'CANDIDATE',
          candidateId: candidate.id,
          status: TrainingEnrollmentStatus.REGISTERED,
        },
      }),
    ).rejects.toThrow(/TrainingEnrollment_active_participant_key_required/);
  });

  // ---------------------------------------------------------------------------
  // Participation archival
  // ---------------------------------------------------------------------------

  it('archives participation from a recorded outcome, idempotently and auditably', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const basePath = `/programs/${programId}/sessions/${sessionId}/participations/${participationId}`;

    const tooEarly = await api(operatorToken, `${basePath}/archive`, { method: 'POST' });
    expect(tooEarly.status).toBe(409);
    expect((tooEarly.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPATION_ARCHIVE_BLOCKED',
    );
    expect(await countAudit('training.participation.archived', participationId)).toBe(0);

    await api(operatorToken, `${basePath}/attendance`, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });
    await api(operatorToken, `${basePath}/attendance`, {
      method: 'POST',
      body: { status: 'SESSION_OUTCOME_RECORDED' },
    });

    const archived = await api(operatorToken, `${basePath}/archive`, { method: 'POST' });
    expect(archived.status).toBe(201);
    const payload = (
      archived.body as { participation: { status: string; archivedAt: string | null } }
    ).participation;
    expect(payload.status).toBe(TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED);
    expect(payload.archivedAt).not.toBeNull();

    // Retrying returns the same state without duplicating history or audit entries.
    const retried = await api(operatorToken, `${basePath}/archive`, { method: 'POST' });
    expect(retried.status).toBe(201);
    expect(await countAudit('training.participation.archived', participationId)).toBe(1);

    const stored = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    // History is preserved rather than deleted.
    expect(stored.attendanceRecordedAt).not.toBeNull();
    expect(stored.recordedByUserId).toBe(operatorUserId);

    const blocked = await api(operatorToken, `${basePath}/attendance`, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_PARTICIPATION_NOT_MUTABLE',
    );
  });

  it('denies participation archive without the archive capability', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const basePath = `/programs/${programId}/sessions/${sessionId}/participations/${participationId}`;

    await api(operatorToken, `${basePath}/attendance`, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });
    await api(operatorToken, `${basePath}/attendance`, {
      method: 'POST',
      body: { status: 'SESSION_OUTCOME_RECORDED' },
    });

    const denied = await api(attendanceOnlyToken, `${basePath}/archive`, { method: 'POST' });
    expect(denied.status).toBe(403);

    const stored = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(stored.status).toBe(TrainingSessionParticipationStatus.SESSION_OUTCOME_RECORDED);
    expect(stored.archivedAt).toBeNull();
    expect(await countAudit('training.participation.archived', participationId)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Attendance lifecycle and correction bypass
  // ---------------------------------------------------------------------------

  it('refuses a same-status attendance rewrite without the correction capability', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const attendancePath = `/programs/${programId}/sessions/${sessionId}/participations/${participationId}/attendance`;

    const recorded = await api(attendanceOnlyToken, attendancePath, {
      method: 'POST',
      body: { status: 'ATTENDED', trainerNotes: 'Issue37 original note' },
    });
    expect(recorded.status).toBe(201);
    const original = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });

    // Resubmitting the same status with different detail is a historical rewrite.
    const rewrite = await api(attendanceOnlyToken, attendancePath, {
      method: 'POST',
      body: { status: 'ATTENDED', trainerNotes: 'Issue37 rewritten note' },
    });
    expect(rewrite.status).toBe(409);
    expect((rewrite.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_ATTENDANCE_ALREADY_RECORDED',
    );

    const stored = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(stored.trainerNotes).toBe('Issue37 original note');
    expect(stored.attendanceRecordedAt?.toISOString()).toBe(
      original.attendanceRecordedAt?.toISOString(),
    );
    expect(stored.correctionCount).toBe(0);
    expect(await countAudit('training.participation.attendance_updated', participationId)).toBe(1);

    // The correction capability is the only way to rewrite it.
    const corrected = await api(
      operatorToken,
      `${attendancePath.replace('/attendance', '')}/correction`,
      {
        method: 'POST',
        body: {
          status: 'ATTENDED',
          correctionReason: 'Issue37 authorized rewrite',
          trainerNotes: 'Issue37 rewritten note',
        },
      },
    );
    expect(corrected.status).toBe(201);
    const afterCorrection = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(afterCorrection.trainerNotes).toBe('Issue37 rewritten note');
    expect(afterCorrection.correctionCount).toBe(1);
  });

  it('treats a repeated identical attendance request as a side-effect-free no-op', async () => {
    const { programId, sessionId, enrollmentId } = await participationFixture();
    const participationId = await addParticipation(programId, sessionId, enrollmentId);
    const attendancePath = `/programs/${programId}/sessions/${sessionId}/participations/${participationId}/attendance`;

    await api(attendanceOnlyToken, attendancePath, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });
    const first = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });

    const repeated = await api(attendanceOnlyToken, attendancePath, {
      method: 'POST',
      body: { status: 'ATTENDED' },
    });
    expect(repeated.status).toBe(201);

    const second = await prisma.trainingSessionParticipation.findUniqueOrThrow({
      where: { id: participationId },
    });
    expect(second.attendanceRecordedAt?.toISOString()).toBe(
      first.attendanceRecordedAt?.toISOString(),
    );
    expect(second.updatedAt.toISOString()).toBe(first.updatedAt.toISOString());
    expect(await countAudit('training.participation.attendance_updated', participationId)).toBe(1);
  });

  it('refuses attendance while the training session is planned or postponed', async () => {
    const planned = await participationFixture({ schedule: false });
    const plannedParticipation = await addParticipation(
      planned.programId,
      planned.sessionId,
      planned.enrollmentId,
    );
    const plannedResponse = await api(
      operatorToken,
      `/programs/${planned.programId}/sessions/${planned.sessionId}/participations/${plannedParticipation}/attendance`,
      { method: 'POST', body: { status: 'ATTENDED' } },
    );
    expect(plannedResponse.status).toBe(409);
    expect((plannedResponse.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_SESSION_NOT_ACCEPTING_ATTENDANCE',
    );
    expect(
      await countAudit('training.participation.attendance_updated', plannedParticipation),
    ).toBe(0);

    const postponed = await participationFixture();
    const postponedParticipation = await addParticipation(
      postponed.programId,
      postponed.sessionId,
      postponed.enrollmentId,
    );
    await api(
      operatorToken,
      `/programs/${postponed.programId}/sessions/${postponed.sessionId}/status`,
      { method: 'POST', body: { status: 'SESSION_POSTPONED' } },
    );
    const postponedResponse = await api(
      operatorToken,
      `/programs/${postponed.programId}/sessions/${postponed.sessionId}/participations/${postponedParticipation}/attendance`,
      { method: 'POST', body: { status: 'ATTENDED' } },
    );
    expect(postponedResponse.status).toBe(409);
    expect((postponedResponse.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_SESSION_NOT_ACCEPTING_ATTENDANCE',
    );
  });

  it('allows attendance and correction on a completed session but not a canceled one', async () => {
    const completed = await participationFixture();
    const completedParticipation = await addParticipation(
      completed.programId,
      completed.sessionId,
      completed.enrollmentId,
    );
    const completedSessionPath = `/programs/${completed.programId}/sessions/${completed.sessionId}`;
    await api(operatorToken, `${completedSessionPath}/status`, {
      method: 'POST',
      body: { status: 'SESSION_IN_PROGRESS' },
    });
    await api(operatorToken, `${completedSessionPath}/status`, {
      method: 'POST',
      body: { status: 'SESSION_COMPLETED' },
    });

    // Post-completion recording and correction are deliberately supported: trainers
    // routinely reconcile a sign-in sheet after delivery.
    const recorded = await api(
      operatorToken,
      `${completedSessionPath}/participations/${completedParticipation}/attendance`,
      { method: 'POST', body: { status: 'ATTENDED' } },
    );
    expect(recorded.status).toBe(201);

    const corrected = await api(
      operatorToken,
      `${completedSessionPath}/participations/${completedParticipation}/correction`,
      {
        method: 'POST',
        body: { status: 'ABSENT', correctionReason: 'Issue37 post-completion fix' },
      },
    );
    expect(corrected.status).toBe(201);

    const canceled = await participationFixture();
    const canceledParticipation = await addParticipation(
      canceled.programId,
      canceled.sessionId,
      canceled.enrollmentId,
    );
    const canceledSessionPath = `/programs/${canceled.programId}/sessions/${canceled.sessionId}`;
    await api(operatorToken, `${canceledSessionPath}/cancel`, {
      method: 'POST',
      body: { reason: 'Issue37 canceled before delivery' },
    });

    const blockedAttendance = await api(
      operatorToken,
      `${canceledSessionPath}/participations/${canceledParticipation}/attendance`,
      { method: 'POST', body: { status: 'ATTENDED' } },
    );
    expect(blockedAttendance.status).toBe(409);
    expect((blockedAttendance.body as { error: { code: string } }).error.code).toBe(
      'TRAINING_SESSION_NOT_ACCEPTING_ATTENDANCE',
    );

    const blockedCorrection = await api(
      operatorToken,
      `${canceledSessionPath}/participations/${canceledParticipation}/correction`,
      { method: 'POST', body: { status: 'ABSENT', correctionReason: 'Issue37 should fail' } },
    );
    expect(blockedCorrection.status).toBe(409);
    expect(
      await countAudit('training.participation.attendance_corrected', canceledParticipation),
    ).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Query boolean parsing
  // ---------------------------------------------------------------------------

  it('parses training query booleans explicitly instead of coercing strings', async () => {
    const program = await createProgram();
    const programId = String(program.id);
    await activateProgram(programId);
    await api(operatorToken, `/programs/${programId}/status`, {
      method: 'POST',
      body: { status: 'PROGRAM_CLOSED' },
    });
    await api(operatorToken, `/programs/${programId}/archive`, { method: 'POST' });

    const omitted = await api(operatorToken, `/programs?search=${String(program.reference)}`);
    expect((omitted.body as { programs: unknown[] }).programs.length).toBe(0);

    const explicitFalse = await api(
      operatorToken,
      `/programs?search=${String(program.reference)}&includeArchived=false`,
    );
    expect(explicitFalse.status).toBe(200);
    expect((explicitFalse.body as { programs: unknown[] }).programs.length).toBe(0);

    const explicitTrue = await api(
      operatorToken,
      `/programs?search=${String(program.reference)}&includeArchived=true`,
    );
    expect(explicitTrue.status).toBe(200);
    expect((explicitTrue.body as { programs: unknown[] }).programs.length).toBe(1);

    for (const invalid of ['1', 'yes', 'TRUE', '']) {
      const rejected = await api(
        operatorToken,
        `/programs?includeArchived=${encodeURIComponent(invalid)}`,
      );
      expect(rejected.status).toBe(400);
      expect((rejected.body as { error: { code: string } }).error.code).toBe(
        'INVALID_TRAINING_PROGRAM_LIST_QUERY',
      );
    }
  });

  it('applies certificateReadyOnly=false without dropping the filter', async () => {
    const program = await createProgram();
    const programId = String(program.id);
    await activateProgram(programId);
    const candidate = await createCandidate();
    await enrollCandidate(programId, candidate.id);

    // The enrollment is not certificate-ready, so an explicit false must still list it.
    const explicitFalse = await api(
      operatorToken,
      `/programs/${programId}/enrollments?certificateReadyOnly=false`,
    );
    expect(explicitFalse.status).toBe(200);
    expect((explicitFalse.body as { enrollments: unknown[] }).enrollments.length).toBe(1);

    const explicitTrue = await api(
      operatorToken,
      `/programs/${programId}/enrollments?certificateReadyOnly=true`,
    );
    expect((explicitTrue.body as { enrollments: unknown[] }).enrollments.length).toBe(0);

    const rejected = await api(
      operatorToken,
      `/programs/${programId}/enrollments?certificateReadyOnly=maybe`,
    );
    expect(rejected.status).toBe(400);
  });

  it('denies training endpoints to an actor without the required capability', async () => {
    const program = await createProgram();
    await activateProgram(String(program.id));

    const denied = await api(clientBlindToken, `/programs/${String(program.id)}/sessions`, {
      method: 'POST',
      body: {
        title: 'Issue37 Denied Session',
        scheduledAt: futureIso(24),
        scheduledEndAt: futureIso(26),
      },
    });
    expect(denied.status).toBe(403);
    expect(
      await prisma.trainingSession.count({ where: { trainingProgramId: String(program.id) } }),
    ).toBe(0);
  });
});
