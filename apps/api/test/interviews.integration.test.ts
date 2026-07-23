import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  EvaluationDetailResponseSchema,
  EvaluationListResponseSchema,
  InterviewDetailResponseSchema,
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
const interviewPermissions = [
  'interviews:view',
  'interviews:schedule',
  'interviews:reschedule',
  'interviews:complete',
  'interviews:cancel',
  'interviews:archive',
  'interview_participants:manage',
  'evaluations:view',
  'evaluations:internal:view',
  'evaluations:create',
  'evaluations:update',
  'evaluations:finalize',
  'client_feedback:view',
  'missions:archive',
] as const;
const restrictedInterviewPermissions = [
  'interviews:view',
  'evaluations:view',
  'evaluations:create',
  'evaluations:update',
  'evaluations:finalize',
] as const;

async function cleanInterviewTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@interviews.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@interviews.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          entityType: {
            in: [
              'Interview',
              'InterviewParticipant',
              'CandidateEvaluation',
              'MissionCandidate',
              'RecruitmentMission',
            ],
          },
        },
        { targetUser: { normalizedEmail: { endsWith: '@interviews.test' } } },
      ],
    },
  });
  await prisma.candidateEvaluation.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue23' } } } },
  });
  await prisma.interviewEvent.deleteMany({
    where: { interview: { missionCandidate: { mission: { title: { contains: 'Issue23' } } } } },
  });
  await prisma.interviewParticipant.deleteMany({
    where: { interview: { missionCandidate: { mission: { title: { contains: 'Issue23' } } } } },
  });
  await prisma.interview.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue23' } } } },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue23' } } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: { mission: { title: { contains: 'Issue23' } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue23' } } },
        { user: { normalizedEmail: { endsWith: '@interviews.test' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue23' } },
  });
  await prisma.clientContact.deleteMany({
    where: { normalizedEmail: { endsWith: '@interviews.test' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue23' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@interviews.test' } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@interviews.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@interviews.test' } },
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
      description: `Synthetic ${roleName} role for interview tests.`,
      status: 'ACTIVE',
    },
  });
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for interview tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for interview tests.`,
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
        code: { in: [...interviewPermissions, ...restrictedInterviewPermissions] },
      },
      NOT: { permission: { code: { in: [...permissionCodes] } } },
    },
    data: { archivedAt: new Date() },
  });
}

async function prepareCatalog(): Promise<void> {
  await ensureRoleWithPermissions(RoleName.HR_MANAGER, interviewPermissions);
  await ensureRoleWithOnlyPermissions(RoleName.TEAM_LEADER, restrictedInterviewPermissions);
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

async function createFixture(title: string, responsibleRecruiterUserId: string) {
  const client = await prisma.client.create({
    data: { name: `${title} Client`, normalizedName: `${title} client`.toLowerCase() },
  });
  const contact = await prisma.clientContact.create({
    data: {
      clientId: client.id,
      displayName: `${title} Contact`,
      email: `${title.toLowerCase().replaceAll(' ', '-')}@interviews.test`,
      normalizedEmail: `${title.toLowerCase().replaceAll(' ', '-')}@interviews.test`,
    },
  });
  const mission = await prisma.recruitmentMission.create({
    data: { clientId: client.id, title, numberOfPositions: 1 },
  });
  await prisma.missionRecruiter.create({
    data: {
      missionId: mission.id,
      userId: responsibleRecruiterUserId,
      role: MissionRecruiterRole.RECRUITER,
      status: AssignmentStatus.ACTIVE,
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `${title} Candidate`,
      email: `${title.toLowerCase().replaceAll(' ', '-')}@interviews.test`,
      normalizedEmail: `${title.toLowerCase().replaceAll(' ', '-')}@interviews.test`,
      salaryExpectationCents: 990000,
      salaryExpectationCurrency: 'EUR',
    },
  });
  const process = await prisma.missionCandidate.create({
    data: {
      missionId: mission.id,
      candidateId: candidate.id,
      responsibleRecruiterUserId,
      state: MissionCandidateState.INTERNAL_VALIDATION,
    },
  });
  return { client, contact, mission, candidate, process };
}

async function scheduleInterview(
  baseUrl: string,
  token: string,
  missionId: string,
  processId: string,
  organizerUserId: string,
  overrides: Record<string, unknown> = {},
) {
  return fetch(`${baseUrl}/v1/missions/${missionId}/candidates/${processId}/interviews`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      type: 'HR',
      scheduledStartAt: '2026-08-01T09:00:00.000Z',
      scheduledEndAt: '2026-08-01T10:00:00.000Z',
      timezone: 'Europe/Paris',
      format: 'VIDEO',
      meetingUrl: 'https://meet.example.test/interview',
      organizerUserId,
      internalUserParticipantIds: [],
      clientContactParticipantIds: [],
      externalParticipants: [],
      ...overrides,
    }),
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

describe('Interviews and structured evaluations API', () => {
  let app: INestApplication;
  let baseUrl: string;
  let hrUserId: string;
  let secondEvaluatorUserId: string;
  let restrictedUserId: string;

  beforeAll(async () => {
    await cleanInterviewTestRecords();
    await prepareCatalog();
    hrUserId = await createUser('hr@interviews.test', RoleName.HR_MANAGER);
    secondEvaluatorUserId = await createUser('evaluator@interviews.test', RoleName.HR_MANAGER);
    restrictedUserId = await createUser('restricted@interviews.test', RoleName.TEAM_LEADER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await cleanInterviewTestRecords();
    await prisma.$disconnect();
  });

  it('schedules interviews with valid participants and rejects nested IDOR and invalid contacts', async () => {
    const token = await loginAccessToken(baseUrl, 'hr@interviews.test');
    const fixture = await createFixture('Issue23 Schedule', hrUserId);
    const otherFixture = await createFixture('Issue23 Other Client', hrUserId);
    const invalidOrganizer = await createUser(
      'inactive-organizer@interviews.test',
      RoleName.HR_MANAGER,
    );
    await prisma.user.update({
      where: { id: invalidOrganizer },
      data: { status: UserStatus.SUSPENDED },
    });

    const invalidContact = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { clientContactParticipantIds: [otherFixture.contact.id] },
    );
    const inactiveOrganizer = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      invalidOrganizer,
    );
    const scheduled = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { clientContactParticipantIds: [fixture.contact.id] },
    );
    const parsed = InterviewDetailResponseSchema.parse(await scheduled.json()).interview;
    const duplicateParticipant = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${parsed.id}/participants`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ kind: 'CLIENT_CONTACT', clientContactId: fixture.contact.id }),
      },
    );
    const idor = await fetch(
      `${baseUrl}/v1/missions/${otherFixture.mission.id}/candidates/${fixture.process.id}/interviews/${parsed.id}`,
      { headers: authHeaders(token) },
    );

    expect(invalidContact.status).toBe(409);
    expect(await readErrorCode(invalidContact)).toBe('INTERVIEW_CLIENT_CONTACT_INVALID');
    expect(inactiveOrganizer.status).toBe(409);
    expect(await readErrorCode(inactiveOrganizer)).toBe('INTERVIEW_ORGANIZER_NOT_ELIGIBLE');
    expect(scheduled.status).toBe(201);
    expect(parsed.participants).toHaveLength(2);
    expect(duplicateParticipant.status).toBe(409);
    expect(await readErrorCode(duplicateParticipant)).toBe('INTERVIEW_PARTICIPANT_CONFLICT');
    expect(idor.status).toBe(404);
  });

  it('requires explicit presentation for client interviews and progression before client interview 2', async () => {
    const token = await loginAccessToken(baseUrl, 'hr@interviews.test');
    const fixture = await createFixture('Issue23 Client Interview', hrUserId);
    const blockedClientInterview = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { type: 'CLIENT_INTERVIEW_1', clientContactParticipantIds: [fixture.contact.id] },
    );
    await prisma.missionCandidate.update({
      where: { id: fixture.process.id },
      data: {
        state: MissionCandidateState.PRESENTED_TO_CLIENT,
        clientVisible: true,
        presentedAt: new Date(),
        presentedByUserId: hrUserId,
      },
    });
    const blockedSecond = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { type: 'CLIENT_INTERVIEW_2', clientContactParticipantIds: [fixture.contact.id] },
    );
    const first = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { type: 'CLIENT_INTERVIEW_1', clientContactParticipantIds: [fixture.contact.id] },
    );
    const firstId = InterviewDetailResponseSchema.parse(await first.json()).interview.id;
    await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${firstId}/complete`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ outcome: 'Synthetic client interview completed.' }),
      },
    );
    const second = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { type: 'CLIENT_INTERVIEW_2', clientContactParticipantIds: [fixture.contact.id] },
    );

    expect(blockedClientInterview.status).toBe(409);
    expect(await readErrorCode(blockedClientInterview)).toBe('INTERVIEW_PRESENTATION_REQUIRED');
    expect(blockedSecond.status).toBe(409);
    expect(await readErrorCode(blockedSecond)).toBe('INTERVIEW_CLIENT_FIRST_REQUIRED');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('preserves reschedule and postponement history and keeps completion idempotent', async () => {
    const token = await loginAccessToken(baseUrl, 'hr@interviews.test');
    const fixture = await createFixture('Issue23 History', hrUserId);
    const scheduled = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
    );
    const interviewId = InterviewDetailResponseSchema.parse(await scheduled.json()).interview.id;
    const rescheduled = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/reschedule`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          scheduledStartAt: '2026-08-02T09:00:00.000Z',
          scheduledEndAt: '2026-08-02T10:00:00.000Z',
          timezone: 'Europe/Paris',
          reason: 'Candidate availability changed.',
        }),
      },
    );
    const postponed = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/postpone`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ reason: 'Client unavailable.' }),
      },
    );
    const completed = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/complete`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ outcome: 'Completed safely.' }),
      },
    );
    const repeated = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/complete`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ outcome: 'No-op repeat.' }),
      },
    );
    const cancelAfterComplete = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/cancel`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ reason: 'Too late.' }),
      },
    );

    expect(rescheduled.status).toBe(200);
    expect(postponed.status).toBe(200);
    expect(completed.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(cancelAfterComplete.status).toBe(409);
    expect(await readErrorCode(cancelAfterComplete)).toBe('INTERVIEW_ALREADY_COMPLETED');
    expect(
      await prisma.interviewEvent.count({
        where: { interviewId, action: { in: ['RESCHEDULED', 'POSTPONED', 'COMPLETED'] } },
      }),
    ).toBe(3);
    expect(
      await prisma.missionCandidate.findUniqueOrThrow({ where: { id: fixture.process.id } }),
    ).toMatchObject({ state: MissionCandidateState.INTERNAL_VALIDATION });
  });

  it('supports multiple evaluators, author-owned drafts, idempotent finalization, and redaction', async () => {
    const token = await loginAccessToken(baseUrl, 'hr@interviews.test');
    const secondToken = await loginAccessToken(baseUrl, 'evaluator@interviews.test');
    const restrictedToken = await loginAccessToken(baseUrl, 'restricted@interviews.test');
    const fixture = await createFixture('Issue23 Evaluation', hrUserId);
    await prisma.missionRecruiter.create({
      data: {
        missionId: fixture.mission.id,
        userId: secondEvaluatorUserId,
        role: MissionRecruiterRole.CONTRIBUTOR,
        status: AssignmentStatus.ACTIVE,
      },
    });
    await prisma.missionRecruiter.create({
      data: {
        missionId: fixture.mission.id,
        userId: restrictedUserId,
        role: MissionRecruiterRole.CONTRIBUTOR,
        status: AssignmentStatus.ACTIVE,
      },
    });
    const scheduled = await scheduleInterview(
      baseUrl,
      token,
      fixture.mission.id,
      fixture.process.id,
      hrUserId,
      { internalUserParticipantIds: [secondEvaluatorUserId, restrictedUserId] },
    );
    const interviewId = InterviewDetailResponseSchema.parse(await scheduled.json()).interview.id;
    const firstEvaluation = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          evaluationType: 'INTERNAL_HR',
          overallScore: 4,
          communicationScore: 5,
          recommendation: 'YES',
          strengths: 'Synthetic strengths only.',
          risks: 'Synthetic risk, no salary values.',
          comment: 'Structured confidential comment.',
        }),
      },
    );
    const secondEvaluation = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations`,
      {
        method: 'POST',
        headers: authHeaders(secondToken),
        body: JSON.stringify({
          evaluationType: 'INTERNAL_HR',
          technicalScore: 4,
          recommendation: 'NEUTRAL',
          comment: 'Second evaluator comment.',
        }),
      },
    );
    const evaluation = EvaluationDetailResponseSchema.parse(
      await firstEvaluation.json(),
    ).evaluation;
    const unauthorizedUpdate = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations/${evaluation.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(secondToken),
        body: JSON.stringify({ comment: 'Should not update.' }),
      },
    );
    const finalized = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations/${evaluation.id}/finalize`,
      { method: 'POST', headers: authHeaders(token) },
    );
    const repeatedFinalize = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations/${evaluation.id}/finalize`,
      { method: 'POST', headers: authHeaders(token) },
    );
    const updateAfterFinalize = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations/${evaluation.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ comment: 'Finalized update.' }),
      },
    );
    const redactedList = await fetch(
      `${baseUrl}/v1/missions/${fixture.mission.id}/candidates/${fixture.process.id}/interviews/${interviewId}/evaluations`,
      { headers: authHeaders(restrictedToken) },
    );

    expect(firstEvaluation.status).toBe(201);
    expect(secondEvaluation.status).toBe(201);
    expect(unauthorizedUpdate.status).toBe(403);
    expect(await readErrorCode(unauthorizedUpdate)).toBe('EVALUATION_AUTHOR_REQUIRED');
    expect(finalized.status).toBe(200);
    expect(repeatedFinalize.status).toBe(200);
    expect(updateAfterFinalize.status).toBe(409);
    expect(await readErrorCode(updateAfterFinalize)).toBe('EVALUATION_FINALIZED');
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'CandidateEvaluation',
          entityId: evaluation.id,
          action: 'evaluations.evaluation.finalized',
        },
      }),
    ).toBe(1);
    const redacted = EvaluationListResponseSchema.parse(await redactedList.json()).evaluations[0];
    expect(redacted?.redacted).toBe(true);
    expect(redacted?.comment).toBeNull();
    expect(redacted?.scores.overall).toBeNull();
  });

  it('serializes mission archival and candidate archival races against interview scheduling', async () => {
    const token = await loginAccessToken(baseUrl, 'hr@interviews.test');
    const missionFixture = await createFixture('Issue23 Mission Race', hrUserId);
    await prisma.recruitmentMission.update({
      where: { id: missionFixture.mission.id },
      data: {
        state: RecruitmentMissionState.CANCELED,
        closureReason: 'CLIENT_CLOSED_OR_CANCELED',
        closedAt: new Date(),
      },
    });
    const [archive, scheduleAfterArchive] = await raceAfterMissionLock(
      missionFixture.mission.id,
      async () =>
        Promise.all([
          fetch(`${baseUrl}/v1/missions/${missionFixture.mission.id}/archive`, {
            method: 'POST',
            headers: authHeaders(token),
          }),
          scheduleInterview(
            baseUrl,
            token,
            missionFixture.mission.id,
            missionFixture.process.id,
            hrUserId,
          ),
        ]),
    );

    expect(archive.status).toBe(201);
    expect(scheduleAfterArchive.status).toBe(409);
    expect(await readErrorCode(scheduleAfterArchive)).toBe('MISSION_TERMINAL');
    expect(
      await prisma.interview.count({
        where: { missionCandidateId: missionFixture.process.id },
      }),
    ).toBe(0);

    const candidateFixture = await createFixture('Issue23 Candidate Race', hrUserId);
    await prisma.candidate.update({
      where: { id: candidateFixture.candidate.id },
      data: { status: CandidateStatus.ARCHIVED, archivedAt: new Date() },
    });
    const candidateBlocked = await scheduleInterview(
      baseUrl,
      token,
      candidateFixture.mission.id,
      candidateFixture.process.id,
      hrUserId,
    );

    expect(candidateBlocked.status).toBe(409);
    expect(await readErrorCode(candidateBlocked)).toBe('CANDIDATE_ARCHIVED');
  });
});
