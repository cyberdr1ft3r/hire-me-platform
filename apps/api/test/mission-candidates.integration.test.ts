import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  MissionCandidateDetailResponseSchema,
  MissionCandidateListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
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
const testPassword = 'Synthetic-passphrase-123!';
const missionCandidatePermissions = [
  'mission_candidates:view',
  'mission_candidates:create',
  'mission_candidates:transition',
  'mission_candidates:transfer',
  'mission_candidates:present',
  'mission_candidate_notes:view',
  'mission_candidate_notes:manage',
  'mission_candidates:outcome:manage',
  'mission_candidates:integration:confirm',
] as const;
const restrictedMissionCandidatePermissions = [
  'mission_candidates:view',
  'mission_candidates:create',
  'mission_candidates:transition',
  'mission_candidates:transfer',
  'mission_candidates:present',
  'mission_candidates:integration:confirm',
] as const;
const supportingMissionPermissions = ['missions:archive'] as const;
const sensitiveCandidatePermissions = [
  'candidate_compensation:view',
  'candidate_consent:view',
] as const;

async function cleanMissionCandidateTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@mission-candidates.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@mission-candidates.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['MissionCandidate', 'RecruitmentMission', 'MissionRecruiter'] } },
        { targetUser: { normalizedEmail: { endsWith: '@mission-candidates.test' } } },
      ],
    },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue21' } } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue21' } } },
        { candidate: { normalizedEmail: { endsWith: '@mission-candidates.test' } } },
      ],
    },
  });
  await prisma.missionRecruiter.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue21' } } },
        { user: { normalizedEmail: { endsWith: '@mission-candidates.test' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue21' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue21' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@mission-candidates.test' } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@mission-candidates.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@mission-candidates.test' } },
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
      description: `Synthetic ${roleName} role for mission candidate tests.`,
      status: 'ACTIVE',
    },
  });

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for mission candidate tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for mission candidate tests.`,
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

async function ensureRoleWithOnlyPermissions(
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
            ...missionCandidatePermissions,
            ...restrictedMissionCandidatePermissions,
            ...sensitiveCandidatePermissions,
            ...supportingMissionPermissions,
          ],
        },
      },
      NOT: { permission: { code: { in: [...permissionCodes] } } },
    },
    data: { archivedAt: new Date() },
  });
}

async function prepareMissionCandidateCatalog(): Promise<void> {
  await ensureRoleWithPermissions(RoleName.SUPER_ADMIN, [
    ...missionCandidatePermissions,
    ...sensitiveCandidatePermissions,
    ...supportingMissionPermissions,
  ]);
  await ensureRoleWithPermissions(RoleName.HR_MANAGER, [
    ...missionCandidatePermissions,
    ...supportingMissionPermissions,
  ]);
  await ensureRoleWithOnlyPermissions(RoleName.TEAM_LEADER, restrictedMissionCandidatePermissions);
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

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

async function createIssue21ClientAndMission(title: string): Promise<string> {
  const client = await prisma.client.create({
    data: {
      name: `${title} Client`,
      normalizedName: `${title} client`.trim().toLowerCase(),
    },
  });
  const mission = await prisma.recruitmentMission.create({
    data: {
      clientId: client.id,
      title,
      numberOfPositions: 1,
    },
  });
  return mission.id;
}

async function assignUserToMission(
  missionId: string,
  userId: string,
  role: MissionRecruiterRole = MissionRecruiterRole.RECRUITER,
  isLead = false,
): Promise<void> {
  await prisma.missionRecruiter.create({
    data: {
      missionId,
      userId,
      role,
      isLead,
      status: AssignmentStatus.ACTIVE,
    },
  });
}

async function createCandidate(email: string) {
  return prisma.candidate.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      salaryExpectationCents: 120000,
      salaryExpectationCurrency: 'EUR',
      consentStatus: 'GRANTED',
      consentRecordedAt: new Date(),
    },
  });
}

async function createProcess(
  baseUrl: string,
  accessToken: string,
  missionId: string,
  candidateId: string,
  responsibleRecruiterUserId: string,
  includeInternalNotes = true,
) {
  return fetch(`${baseUrl}/v1/missions/${missionId}/candidates`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      candidateId,
      responsibleRecruiterUserId,
      source: 'Synthetic test',
      ...(includeInternalNotes ? { internalNotes: 'Protected process note' } : {}),
    }),
  });
}

async function transitionProcess(
  baseUrl: string,
  accessToken: string,
  missionId: string,
  processId: string,
  state: MissionCandidateState,
  reason = 'Synthetic transition reason.',
  skip = false,
) {
  return fetch(`${baseUrl}/v1/missions/${missionId}/candidates/${processId}/transition`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ state, reason, skip }),
  });
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
  await new Promise((resolve) => setTimeout(resolve, 75));
  releaseLock?.();
  const result = await resultPromise;
  await lockPromise;
  return result;
}

describe('Mission candidate process API', () => {
  let app: INestApplication;
  let baseUrl: string;
  let hrUserId: string;
  let restrictedUserId: string;
  let alternateRecruiterUserId: string;

  beforeAll(async () => {
    await cleanMissionCandidateTestRecords();
    await prepareMissionCandidateCatalog();
    await createUser('mission-candidate-admin@mission-candidates.test', RoleName.SUPER_ADMIN);
    hrUserId = await createUser(
      'mission-candidate-hr@mission-candidates.test',
      RoleName.HR_MANAGER,
    );
    restrictedUserId = await createUser(
      'mission-candidate-restricted@mission-candidates.test',
      RoleName.TEAM_LEADER,
    );
    alternateRecruiterUserId = await createUser(
      'mission-candidate-alt@mission-candidates.test',
      RoleName.HR_MANAGER,
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await cleanMissionCandidateTestRecords();
    await prisma.$disconnect();
  });

  it('links one reusable candidate to different missions but never twice to the same mission', async () => {
    const token = await loginAccessToken(baseUrl, 'mission-candidate-hr@mission-candidates.test');
    const firstMissionId = await createIssue21ClientAndMission('Issue21 Permanent Unique One');
    const secondMissionId = await createIssue21ClientAndMission('Issue21 Permanent Unique Two');
    const candidate = await createCandidate('unique@mission-candidates.test');
    await assignUserToMission(firstMissionId, hrUserId);
    await assignUserToMission(secondMissionId, hrUserId);

    const first = await createProcess(baseUrl, token, firstMissionId, candidate.id, hrUserId);
    const duplicate = await createProcess(baseUrl, token, firstMissionId, candidate.id, hrUserId);
    const otherMission = await createProcess(
      baseUrl,
      token,
      secondMissionId,
      candidate.id,
      hrUserId,
    );
    const raceMissionId = await createIssue21ClientAndMission('Issue21 Permanent Unique Race');
    const raceCandidate = await createCandidate('unique-race@mission-candidates.test');
    await assignUserToMission(raceMissionId, hrUserId);
    const [raceA, raceB] = await Promise.all([
      createProcess(baseUrl, token, raceMissionId, raceCandidate.id, hrUserId),
      createProcess(baseUrl, token, raceMissionId, raceCandidate.id, hrUserId),
    ]);

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(await readErrorCode(duplicate)).toBe('MISSION_CANDIDATE_ALREADY_EXISTS');
    expect(otherMission.status).toBe(201);
    expect([raceA.status, raceB.status].sort()).toEqual([201, 409]);
    expect(
      await prisma.missionCandidate.count({
        where: { missionId: raceMissionId, candidateId: raceCandidate.id },
      }),
    ).toBe(1);
  });

  it('enforces the approved pipeline transitions and optional skip reasons', async () => {
    const token = await loginAccessToken(baseUrl, 'mission-candidate-hr@mission-candidates.test');
    const missionId = await createIssue21ClientAndMission('Issue21 Pipeline Mission');
    const candidate = await createCandidate('pipeline@mission-candidates.test');
    await assignUserToMission(missionId, hrUserId);
    const create = await createProcess(baseUrl, token, missionId, candidate.id, hrUserId);
    const processId = MissionCandidateDetailResponseSchema.parse(await create.json())
      .candidateProcess.id;

    const invalid = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.CLIENT_OFFER,
    );
    const cvReview = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.CV_TO_REVIEW,
    );
    const hrPreselection = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.HR_PRESELECTION,
    );
    const scheduled = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.HR_INTERVIEW_SCHEDULED,
    );
    const completed = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.HR_INTERVIEW_COMPLETED,
    );
    const missingSkipFlag = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.INTERNAL_VALIDATION,
    );
    const missingReason = await fetch(
      `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/transition`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ state: MissionCandidateState.INTERNAL_VALIDATION, skip: true }),
      },
    );
    const skipped = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.INTERNAL_VALIDATION,
      'Technical test not required for this already validated profile.',
      true,
    );

    expect(invalid.status).toBe(409);
    expect(await readErrorCode(invalid)).toBe('MISSION_CANDIDATE_TRANSITION_BLOCKED');
    expect(cvReview.status).toBe(200);
    expect(hrPreselection.status).toBe(200);
    expect(scheduled.status).toBe(200);
    expect(completed.status).toBe(200);
    expect(missingSkipFlag.status).toBe(409);
    expect(await readErrorCode(missingSkipFlag)).toBe('MISSION_CANDIDATE_SKIP_REQUIRED');
    expect(missingReason.status).toBe(400);
    expect(await readErrorCode(missingReason)).toBe('INVALID_MISSION_CANDIDATE_TRANSITION_REQUEST');
    expect(
      MissionCandidateDetailResponseSchema.parse(await skipped.json()).candidateProcess.state,
    ).toBe('INTERNAL_VALIDATION');
    expect(
      await prisma.missionCandidateEvent.count({
        where: { missionCandidateId: processId, action: 'OPTIONAL_STAGE_SKIPPED' },
      }),
    ).toBe(1);
  });

  it('transfers responsible recruiter atomically and rejects ineligible ownership', async () => {
    const token = await loginAccessToken(baseUrl, 'mission-candidate-hr@mission-candidates.test');
    const missionId = await createIssue21ClientAndMission('Issue21 Transfer Mission');
    const candidate = await createCandidate('transfer@mission-candidates.test');
    await assignUserToMission(missionId, hrUserId, MissionRecruiterRole.LEAD_RECRUITER, true);
    await assignUserToMission(missionId, alternateRecruiterUserId);
    const create = await createProcess(baseUrl, token, missionId, candidate.id, hrUserId);
    const processId = MissionCandidateDetailResponseSchema.parse(await create.json())
      .candidateProcess.id;
    await prisma.user.update({
      where: { id: alternateRecruiterUserId },
      data: { status: UserStatus.SUSPENDED },
    });

    const blocked = await fetch(
      `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/transfer`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          responsibleRecruiterUserId: alternateRecruiterUserId,
          reason: 'Synthetic blocked transfer.',
        }),
      },
    );
    await prisma.user.update({
      where: { id: alternateRecruiterUserId },
      data: { status: UserStatus.ACTIVE },
    });
    const allowed = await fetch(
      `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/transfer`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          responsibleRecruiterUserId: alternateRecruiterUserId,
          reason: 'Synthetic allowed transfer.',
        }),
      },
    );

    expect(blocked.status).toBe(409);
    expect(await readErrorCode(blocked)).toBe('MISSION_CANDIDATE_RECRUITER_NOT_ELIGIBLE');
    expect(
      MissionCandidateDetailResponseSchema.parse(await allowed.json()).candidateProcess
        .responsibleRecruiterUserId,
    ).toBe(alternateRecruiterUserId);
    expect(
      await prisma.missionCandidateEvent.count({
        where: {
          missionCandidateId: processId,
          action: 'RESPONSIBLE_RECRUITER_TRANSFERRED',
        },
      }),
    ).toBe(1);
  });

  it('keeps linking internal-only until explicit presentation and blocks legacy integration counting', async () => {
    const token = await loginAccessToken(baseUrl, 'mission-candidate-hr@mission-candidates.test');
    const missionId = await createIssue21ClientAndMission('Issue21 Visibility Mission');
    const candidate = await createCandidate('visibility@mission-candidates.test');
    await assignUserToMission(missionId, hrUserId);
    const create = await createProcess(baseUrl, token, missionId, candidate.id, hrUserId);
    const createdProcess = MissionCandidateDetailResponseSchema.parse(
      await create.json(),
    ).candidateProcess;
    const processId = createdProcess.id;
    expect(createdProcess.clientVisible).toBe(false);

    const path = [
      MissionCandidateState.CV_TO_REVIEW,
      MissionCandidateState.HR_PRESELECTION,
      MissionCandidateState.HR_INTERVIEW_SCHEDULED,
      MissionCandidateState.HR_INTERVIEW_COMPLETED,
      MissionCandidateState.INTERNAL_VALIDATION,
    ];
    for (const state of path) {
      const skip = state === MissionCandidateState.INTERNAL_VALIDATION;
      const response = await transitionProcess(
        baseUrl,
        token,
        missionId,
        processId,
        state,
        'Synthetic path transition.',
        skip,
      );
      expect(response.status).toBe(200);
    }

    const blockedPresentationTransition = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.PRESENTED_TO_CLIENT,
      'Synthetic transition-only presentation.',
    );
    const processAfterBlockedPresentation = await prisma.missionCandidate.findUniqueOrThrow({
      where: { id: processId },
    });
    expect(blockedPresentationTransition.status).toBe(409);
    expect(await readErrorCode(blockedPresentationTransition)).toBe(
      'MISSION_CANDIDATE_PRESENTATION_ACTION_REQUIRED',
    );
    expect(processAfterBlockedPresentation.state).toBe(MissionCandidateState.INTERNAL_VALIDATION);
    expect(processAfterBlockedPresentation.clientVisible).toBe(false);
    expect(processAfterBlockedPresentation.presentedAt).toBeNull();
    expect(processAfterBlockedPresentation.presentedByUserId).toBeNull();

    const failedPresentationMissionId = await createIssue21ClientAndMission(
      'Issue21 Failed Presentation Mission',
    );
    const failedPresentationCandidate = await createCandidate(
      'failed-presentation@mission-candidates.test',
    );
    await assignUserToMission(failedPresentationMissionId, hrUserId);
    const failedPresentationCreate = await createProcess(
      baseUrl,
      token,
      failedPresentationMissionId,
      failedPresentationCandidate.id,
      hrUserId,
    );
    const failedPresentationProcessId = MissionCandidateDetailResponseSchema.parse(
      await failedPresentationCreate.json(),
    ).candidateProcess.id;
    const failedPresentation = await fetch(
      `${baseUrl}/v1/missions/${failedPresentationMissionId}/candidates/${failedPresentationProcessId}/present`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ reason: 'Should not partially present from NEW.' }),
      },
    );
    const processAfterFailedPresentation = await prisma.missionCandidate.findUniqueOrThrow({
      where: { id: failedPresentationProcessId },
    });
    expect(failedPresentation.status).toBe(409);
    expect(await readErrorCode(failedPresentation)).toBe('MISSION_CANDIDATE_TRANSITION_BLOCKED');
    expect(processAfterFailedPresentation.state).toBe(MissionCandidateState.NEW);
    expect(processAfterFailedPresentation.clientVisible).toBe(false);
    expect(processAfterFailedPresentation.presentedAt).toBeNull();
    expect(processAfterFailedPresentation.presentedByUserId).toBeNull();
    expect(
      await prisma.missionCandidateEvent.count({
        where: {
          missionCandidateId: failedPresentationProcessId,
          action: 'PRESENTED_TO_CLIENT',
        },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'MissionCandidate',
          entityId: failedPresentationProcessId,
          action: 'mission_candidates.process.presented_to_client',
        },
      }),
    ).toBe(0);

    const presented = await fetch(
      `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/present`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ reason: 'Explicit client presentation.' }),
      },
    );
    const presentedProcess = MissionCandidateDetailResponseSchema.parse(
      await presented.json(),
    ).candidateProcess;
    const storedPresentation = await prisma.missionCandidate.findUniqueOrThrow({
      where: { id: processId },
    });
    expect(presented.status).toBe(200);
    expect(presentedProcess.state).toBe('PRESENTED_TO_CLIENT');
    expect(presentedProcess.clientVisible).toBe(true);
    expect(storedPresentation.clientVisible).toBe(true);
    expect(storedPresentation.presentedAt).toBeInstanceOf(Date);
    expect(storedPresentation.presentedByUserId).toBe(hrUserId);
    expect(
      await prisma.missionCandidateEvent.count({
        where: { missionCandidateId: processId, action: 'PRESENTED_TO_CLIENT' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'MissionCandidate',
          entityId: processId,
          action: 'mission_candidates.process.presented_to_client',
        },
      }),
    ).toBe(1);

    for (const state of [
      MissionCandidateState.CLIENT_INTERVIEW_1,
      MissionCandidateState.CLIENT_INTERVIEW_2,
      MissionCandidateState.CLIENT_OFFER,
      MissionCandidateState.ACCEPTED,
    ]) {
      const response = await transitionProcess(
        baseUrl,
        token,
        missionId,
        processId,
        state,
        'Synthetic placement path.',
      );
      expect(response.status).toBe(200);
    }
    const blockedIntegrationTransition = await transitionProcess(
      baseUrl,
      token,
      missionId,
      processId,
      MissionCandidateState.INTEGRATED,
      'Synthetic legacy integration attempt.',
    );
    expect(
      (await prisma.recruitmentMission.findUniqueOrThrow({ where: { id: missionId } }))
        .filledPlacementCount,
    ).toBe(0);

    const legacyConfirmation = await fetch(
      `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/confirm-integration`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ reason: 'Legacy integration confirmation.' }),
      },
    );

    expect(blockedIntegrationTransition.status).toBe(409);
    expect(await readErrorCode(blockedIntegrationTransition)).toBe(
      'PLACEMENT_OFFER_CONFIRMATION_REQUIRED',
    );
    expect(legacyConfirmation.status).toBe(409);
    expect(await readErrorCode(legacyConfirmation)).toBe('PLACEMENT_OFFER_CONFIRMATION_REQUIRED');
    const mission = await prisma.recruitmentMission.findUniqueOrThrow({ where: { id: missionId } });
    const storedProcess = await prisma.missionCandidate.findUniqueOrThrow({
      where: { id: processId },
    });
    expect(mission.filledPlacementCount).toBe(0);
    expect(mission.state).not.toMatch(/CLOSED/);
    expect(storedProcess.state).toBe(MissionCandidateState.ACCEPTED);
    expect(storedProcess.placementConfirmedAt).toBeNull();
    expect(storedProcess.placementConfirmedByUserId).toBeNull();
    expect(
      await prisma.missionCandidateEvent.count({
        where: { missionCandidateId: processId, action: 'INTEGRATION_CONFIRMED' },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'MissionCandidate',
          entityId: processId,
          action: 'mission_candidates.integration.confirmed',
        },
      }),
    ).toBe(0);
  });

  it('applies mission scope, nested IDOR, and protected field redaction', async () => {
    const restrictedToken = await loginAccessToken(
      baseUrl,
      'mission-candidate-restricted@mission-candidates.test',
    );
    const adminToken = await loginAccessToken(
      baseUrl,
      'mission-candidate-admin@mission-candidates.test',
    );
    const missionId = await createIssue21ClientAndMission('Issue21 Scope Mission');
    const otherMissionId = await createIssue21ClientAndMission('Issue21 Other Scope Mission');
    const candidate = await createCandidate('scope@mission-candidates.test');
    await assignUserToMission(missionId, restrictedUserId);
    await assignUserToMission(missionId, hrUserId);
    await assignUserToMission(otherMissionId, restrictedUserId);
    const create = await createProcess(
      baseUrl,
      restrictedToken,
      missionId,
      candidate.id,
      restrictedUserId,
      false,
    );
    expect(create.status).toBe(201);
    const parsed = MissionCandidateDetailResponseSchema.parse(await create.json());
    const processId = parsed.candidateProcess.id;
    const listed = await fetch(`${baseUrl}/v1/missions/${missionId}/candidates`, {
      headers: authHeaders(restrictedToken),
    });
    const idor = await fetch(`${baseUrl}/v1/missions/${otherMissionId}/candidates/${processId}`, {
      headers: authHeaders(restrictedToken),
    });
    const adminDetail = await fetch(`${baseUrl}/v1/missions/${missionId}/candidates/${processId}`, {
      headers: authHeaders(adminToken),
    });

    expect(parsed.candidateProcess.internalNotes).toBeNull();
    expect(parsed.candidateProcess.candidate.compensation).toBeNull();
    expect(parsed.candidateProcess.candidate.consent).toBeNull();
    expect(
      MissionCandidateListResponseSchema.parse(await listed.json()).candidates[0]?.candidate
        .compensation,
    ).toBeNull();
    expect(idor.status).toBe(404);
    expect(
      MissionCandidateDetailResponseSchema.parse(await adminDetail.json()).candidateProcess
        .candidate.compensation,
    ).toEqual(
      expect.objectContaining({
        salaryExpectationCents: 120000,
        salaryExpectationCurrency: 'EUR',
      }),
    );
  });

  it('serializes mission archival and candidate archival races against process creation', async () => {
    const token = await loginAccessToken(baseUrl, 'mission-candidate-hr@mission-candidates.test');
    const missionRaceId = await createIssue21ClientAndMission('Issue21 Mission Race');
    const missionRaceCandidate = await createCandidate('mission-race@mission-candidates.test');
    await assignUserToMission(missionRaceId, hrUserId);
    await prisma.recruitmentMission.update({
      where: { id: missionRaceId },
      data: {
        state: RecruitmentMissionState.CANCELED,
        closureReason: 'CLIENT_CLOSED_OR_CANCELED',
        closedAt: new Date(),
      },
    });

    const [archive, createAfterArchive] = await raceAfterMissionLock(missionRaceId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/missions/${missionRaceId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const createPromise = createProcess(
        baseUrl,
        token,
        missionRaceId,
        missionRaceCandidate.id,
        hrUserId,
      );
      return Promise.all([archivePromise, createPromise]);
    });

    expect(archive.status).toBe(201);
    expect(createAfterArchive.status).toBe(409);
    expect(await readErrorCode(createAfterArchive)).toBe('MISSION_TERMINAL');
    expect(
      await prisma.missionCandidate.count({
        where: { missionId: missionRaceId, candidateId: missionRaceCandidate.id },
      }),
    ).toBe(0);

    const candidateRaceMissionId = await createIssue21ClientAndMission('Issue21 Candidate Race');
    const candidateRace = await createCandidate('candidate-race@mission-candidates.test');
    await assignUserToMission(candidateRaceMissionId, hrUserId);

    const [archiveCandidate, createAfterCandidateArchive] = await raceAfterCandidateLock(
      candidateRace.id,
      async () => {
        const archivePromise = prisma.candidate.update({
          where: { id: candidateRace.id },
          data: { status: CandidateStatus.ARCHIVED, archivedAt: new Date() },
        });
        const createPromise = createProcess(
          baseUrl,
          token,
          candidateRaceMissionId,
          candidateRace.id,
          hrUserId,
        );
        return Promise.all([archivePromise, createPromise]);
      },
    );

    expect(archiveCandidate.status).toBe(CandidateStatus.ARCHIVED);
    expect(createAfterCandidateArchive.status).toBe(409);
    expect(await readErrorCode(createAfterCandidateArchive)).toBe('CANDIDATE_ARCHIVED');
    expect(
      await prisma.missionCandidate.count({
        where: { missionId: candidateRaceMissionId, candidateId: candidateRace.id },
      }),
    ).toBe(0);
  });
});
