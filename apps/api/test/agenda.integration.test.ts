import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AgendaListResponseSchema,
  AuthResponseSchema,
  MeetingDetailResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ClientStatus,
  InterviewFormat,
  InterviewStatus,
  InterviewType,
  MissionCandidateState,
  MeetingStatus,
  MissionRecruiterRole,
  PermissionScopeType,
  PrismaClient,
  RecruitmentMissionState,
  RoleName,
  TaskStatus,
  TrainingProgramStatus,
  TrainingSessionStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

const OCTOBER_WINDOW = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-31T23:59:59.999Z',
};

async function cleanAgendaTestRecords(): Promise<void> {
  await prisma.taskReminder.deleteMany({
    where: { task: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.taskAssignment.deleteMany({
    where: { task: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.task.deleteMany({ where: { title: { contains: 'Issue124Agenda' } } });
  await prisma.interview.deleteMany({
    where: {
      missionCandidate: { mission: { title: { contains: 'Issue124Agenda' } } },
    },
  });
  await prisma.missionCandidate.deleteMany({
    where: { mission: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: { mission: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue124Agenda' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@agenda124-candidate.test' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { startsWith: 'issue124agenda' } },
  });
  await prisma.trainingSession.deleteMany({
    where: { program: { normalizedReference: { startsWith: 'issue124agenda' } } },
  });
  await prisma.trainingProgram.deleteMany({
    where: { normalizedReference: { startsWith: 'issue124agenda' } },
  });
  await prisma.meetingParticipant.deleteMany({
    where: { meeting: { title: { contains: 'Issue124Agenda' } } },
  });
  await prisma.meeting.deleteMany({ where: { title: { contains: 'Issue124Agenda' } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@agenda124.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@agenda124.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@agenda124.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@agenda124.test' } },
  });
}

async function ensureRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: { name: roleName, description: `${roleName} test`, status: 'ACTIVE' },
  });
  for (const code of codes) {
    const permission = await ensurePermissionForTest(prisma, code, {
      description: `${code} test`,
      scopeType: PermissionScopeType.EXPLICIT,
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email.toLowerCase(),
      displayName: email.split('@')[0] ?? email,
      status: UserStatus.ACTIVE,
      userType: 'INTERNAL',
      passwordCredential: {
        create: { passwordHash: await passwords.hashPassword(testPassword) },
      },
      roles: { create: { role: { connect: { name: roleName } } } },
    },
  });
  return user.id;
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  expect(response.status).toBe(201);
  return AuthResponseSchema.parse(await response.json()).accessToken;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function fetchAgenda(
  baseUrl: string,
  token: string,
  query: Record<string, string>,
): Promise<ReturnType<typeof AgendaListResponseSchema.parse>> {
  const parameters = new URLSearchParams(query);
  const response = await fetch(`${baseUrl}/v1/agenda?${parameters.toString()}`, {
    headers: authHeaders(token),
  });
  expect(response.status).toBe(200);
  return AgendaListResponseSchema.parse(await response.json());
}

describe('agenda aggregation (Issue #124)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerId: string;
  let outsiderId: string;
  let ownerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    await cleanAgendaTestRecords();
    await ensureRolePermissions(RoleName.EMPLOYEE, [
      'tasks:view',
      'tasks:create',
      'meetings:view',
      'meetings:create',
      'meetings:manage',
      'missions:view',
      'interviews:view',
      'training_programs:view',
      'training_sessions:view',
    ]);
    ownerId = await createUser('owner@agenda124.test', RoleName.EMPLOYEE);
    outsiderId = await createUser('outsider@agenda124.test', RoleName.EMPLOYEE);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ownerToken = await loginAccessToken(baseUrl, 'owner@agenda124.test');
    outsiderToken = await loginAccessToken(baseUrl, 'outsider@agenda124.test');
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await cleanAgendaTestRecords();
    await prisma.$disconnect();
  });

  it('allows any authenticated user and returns empty when no visible sources', async () => {
    const body = await fetchAgenda(baseUrl, outsiderToken, { view: 'upcoming' });
    expect(body.items).toEqual([]);
  });

  it('includes owned tasks and meetings without leaking other users meetings', async () => {
    const dueAt = new Date('2026-10-15T12:00:00.000Z');
    await prisma.task.create({
      data: {
        title: 'Issue124Agenda owned task',
        status: TaskStatus.OPEN,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt,
      },
    });
    const meetingStart = new Date('2026-10-16T09:00:00.000Z');
    await prisma.meeting.create({
      data: {
        title: 'Issue124Agenda private meeting',
        scheduledStartAt: meetingStart,
        timezone: 'UTC',
        organizerUserId: ownerId,
        participants: { create: { userId: outsiderId } },
      },
    });
    const ownerAgenda = await fetchAgenda(baseUrl, ownerToken, OCTOBER_WINDOW);
    expect(ownerAgenda.items.some((item) => item.sourceType === 'task')).toBe(true);
    expect(ownerAgenda.items.some((item) => item.sourceType === 'meeting')).toBe(true);

    const outsiderAgenda = await fetchAgenda(baseUrl, outsiderToken, {
      ...OCTOBER_WINDOW,
      sources: 'meeting',
    });
    expect(outsiderAgenda.items.some((item) => item.title.includes('private meeting'))).toBe(true);
    expect(
      outsiderAgenda.items.some(
        (item) => item.sourceType === 'task' && item.title.includes('owned task'),
      ),
    ).toBe(false);
  });

  it('dedupes follow_up reminders that share a task due timestamp', async () => {
    const dueAt = new Date('2026-10-18T08:00:00.000Z');
    const task = await prisma.task.create({
      data: {
        title: 'Issue124Agenda reminder dedupe',
        status: TaskStatus.OPEN,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt,
      },
    });
    await prisma.taskReminder.create({
      data: {
        taskId: task.id,
        recipientUserId: ownerId,
        remindAt: dueAt,
        status: 'PENDING',
        idempotencyKey: `issue124-agenda:${task.id}:dedupe`,
      },
    });
    const body = await fetchAgenda(baseUrl, ownerToken, {
      ...OCTOBER_WINDOW,
      sources: 'task,follow_up',
    });
    const taskRows = body.items.filter(
      (item) => item.sourceId === task.id || item.deepLink.includes(task.id),
    );
    expect(taskRows.filter((item) => item.sourceType === 'follow_up')).toHaveLength(0);
    expect(taskRows.filter((item) => item.sourceType === 'task')).toHaveLength(1);
  });

  it('aggregates dated tasks in a fixed window and marks overdue items', async () => {
    const pastDue = new Date(Date.now() - 86_400_000);
    await prisma.task.create({
      data: {
        title: 'Issue124Agenda overdue task',
        status: TaskStatus.OPEN,
        priority: 'HIGH',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt: pastDue,
      },
    });
    const overdueBody = await fetchAgenda(baseUrl, ownerToken, { view: 'overdue' });
    const overdueRow = overdueBody.items.find((item) => item.title.includes('overdue task'));
    expect(overdueRow).toBeTruthy();
    expect(overdueRow?.overdue).toBe(true);
    expect(overdueRow?.deepLink).toMatch(/^\/tasks\?task=/);
  });

  it('drops completed and canceled tasks from overdue results', async () => {
    const pastDue = new Date(Date.now() - 2 * 86_400_000);
    await prisma.task.create({
      data: {
        title: 'Issue124Agenda completed overdue',
        status: TaskStatus.COMPLETED,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt: pastDue,
        completedAt: pastDue,
      },
    });
    await prisma.task.create({
      data: {
        title: 'Issue124Agenda canceled overdue',
        status: TaskStatus.CANCELED,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt: pastDue,
      },
    });
    const overdueBody = await fetchAgenda(baseUrl, ownerToken, { view: 'overdue' });
    expect(overdueBody.items.some((item) => item.title.includes('completed overdue'))).toBe(false);
    expect(overdueBody.items.some((item) => item.title.includes('canceled overdue'))).toBe(false);
  });

  it('respects source filters and excludes unrequested source types', async () => {
    await prisma.task.create({
      data: {
        title: 'Issue124Agenda filter task only',
        status: TaskStatus.OPEN,
        priority: 'NORMAL',
        ownerUserId: ownerId,
        createdByUserId: ownerId,
        dueAt: new Date('2026-10-22T12:00:00.000Z'),
      },
    });
    await prisma.meeting.create({
      data: {
        title: 'Issue124Agenda filter meeting only',
        scheduledStartAt: new Date('2026-10-22T14:00:00.000Z'),
        timezone: 'UTC',
        organizerUserId: ownerId,
      },
    });
    const tasksOnly = await fetchAgenda(baseUrl, ownerToken, {
      ...OCTOBER_WINDOW,
      sources: 'task',
    });
    expect(tasksOnly.items.every((item) => item.sourceType === 'task')).toBe(true);
    expect(tasksOnly.items.some((item) => item.title.includes('filter task'))).toBe(true);

    const meetingsOnly = await fetchAgenda(baseUrl, ownerToken, {
      ...OCTOBER_WINDOW,
      sources: 'meeting',
    });
    expect(meetingsOnly.items.every((item) => item.sourceType === 'meeting')).toBe(true);
  });

  it('aggregates interviews with mission deep links and reflects reschedule and cancel', async () => {
    const clientId = (
      await prisma.client.create({
        data: {
          name: 'Issue124Agenda client',
          normalizedName: 'issue124agenda-client',
          status: ClientStatus.ACTIVE,
        },
      })
    ).id;
    const missionId = (
      await prisma.recruitmentMission.create({
        data: {
          clientId,
          title: 'Issue124Agenda mission',
          state: RecruitmentMissionState.ACTIVE,
          numberOfPositions: 1,
          filledPlacementCount: 0,
        },
      })
    ).id;
    await prisma.missionRecruiter.create({
      data: {
        missionId,
        userId: ownerId,
        role: MissionRecruiterRole.RECRUITER,
        status: AssignmentStatus.ACTIVE,
        isLead: true,
      },
    });
    const candidateId = (
      await prisma.candidate.create({
        data: {
          displayName: 'Issue124Agenda Candidate',
          email: 'candidate@agenda124-candidate.test',
          normalizedEmail: 'candidate@agenda124-candidate.test',
          status: CandidateStatus.ACTIVE,
        },
      })
    ).id;
    const processId = (
      await prisma.missionCandidate.create({
        data: {
          missionId,
          candidateId,
          responsibleRecruiterUserId: ownerId,
          state: MissionCandidateState.HR_INTERVIEW_SCHEDULED,
        },
      })
    ).id;
    const interviewStart = new Date('2026-10-19T15:00:00.000Z');
    const interview = await prisma.interview.create({
      data: {
        missionCandidateId: processId,
        organizerUserId: ownerId,
        type: InterviewType.TECHNICAL,
        status: InterviewStatus.SCHEDULED,
        scheduledStartAt: interviewStart,
        timezone: 'UTC',
        format: InterviewFormat.VIDEO,
      },
    });
    let body = await fetchAgenda(baseUrl, ownerToken, {
      ...OCTOBER_WINDOW,
      sources: 'interview',
    });
    let row = body.items.find((item) => item.sourceId === interview.id);
    expect(row?.deepLink).toBe(
      `/missions?mission=${missionId}&process=${processId}&interview=${interview.id}`,
    );

    const rescheduled = new Date('2026-10-19T17:00:00.000Z');
    await prisma.interview.update({
      where: { id: interview.id },
      data: { scheduledStartAt: rescheduled },
    });
    body = await fetchAgenda(baseUrl, ownerToken, { ...OCTOBER_WINDOW, sources: 'interview' });
    row = body.items.find((item) => item.sourceId === interview.id);
    expect(row?.startAt).toBe(rescheduled.toISOString());

    await prisma.interview.update({
      where: { id: interview.id },
      data: { status: InterviewStatus.CANCELED },
    });
    body = await fetchAgenda(baseUrl, ownerToken, { ...OCTOBER_WINDOW, sources: 'interview' });
    row = body.items.find((item) => item.sourceId === interview.id);
    expect(row?.status).toBe('CANCELED');
  });

  it('aggregates training sessions with program/session deep links', async () => {
    const program = await prisma.trainingProgram.create({
      data: {
        reference: 'ISSUE124-AGENDA-TRN',
        normalizedReference: 'issue124agenda-trn',
        name: 'Issue124Agenda training',
        status: TrainingProgramStatus.PROGRAM_ACTIVE,
        ownerUserId: ownerId,
      },
    });
    const scheduledAt = new Date('2026-10-21T13:00:00.000Z');
    const session = await prisma.trainingSession.create({
      data: {
        trainingProgramId: program.id,
        title: 'Issue124Agenda session',
        status: TrainingSessionStatus.SESSION_SCHEDULED,
        scheduledAt,
        trainerUserId: ownerId,
      },
    });
    const body = await fetchAgenda(baseUrl, ownerToken, {
      ...OCTOBER_WINDOW,
      sources: 'training',
    });
    const row = body.items.find((item) => item.sourceId === session.id);
    expect(row?.sourceType).toBe('training');
    expect(row?.deepLink).toBe(`/training?program=${program.id}&session=${session.id}`);
  });

  it('reflects meeting reschedule and cancel on agenda reads', async () => {
    const createResponse = await fetch(`${baseUrl}/v1/meetings`, {
      method: 'POST',
      headers: { ...authHeaders(ownerToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Issue124Agenda meeting lifecycle',
        scheduledStartAt: new Date('2026-10-23T09:00:00.000Z').toISOString(),
        timezone: 'UTC',
        participantUserIds: [outsiderId],
      }),
    });
    expect(createResponse.status).toBe(201);
    const meeting = MeetingDetailResponseSchema.parse(await createResponse.json()).meeting;
    let body = await fetchAgenda(baseUrl, ownerToken, { ...OCTOBER_WINDOW, sources: 'meeting' });
    expect(body.items.some((item) => item.sourceId === meeting.id)).toBe(true);

    const rescheduledAt = new Date('2026-10-23T11:00:00.000Z').toISOString();
    const rescheduleResponse = await fetch(`${baseUrl}/v1/meetings/${meeting.id}/schedule`, {
      method: 'PATCH',
      headers: { ...authHeaders(ownerToken), 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledStartAt: rescheduledAt, timezone: 'UTC' }),
    });
    expect(rescheduleResponse.status).toBe(200);
    body = await fetchAgenda(baseUrl, ownerToken, { ...OCTOBER_WINDOW, sources: 'meeting' });
    const rescheduledRow = body.items.find((item) => item.sourceId === meeting.id);
    expect(rescheduledRow?.startAt).toBe(rescheduledAt);

    const cancelResponse = await fetch(`${baseUrl}/v1/meetings/${meeting.id}/cancel`, {
      method: 'PATCH',
      headers: { ...authHeaders(ownerToken), 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Issue124Agenda cancel test' }),
    });
    expect(cancelResponse.status).toBe(200);
    body = await fetchAgenda(baseUrl, ownerToken, { ...OCTOBER_WINDOW, sources: 'meeting' });
    const canceledRow = body.items.find((item) => item.sourceId === meeting.id);
    expect(canceledRow?.status).toBe('CANCELED');
  });

  it('includes past completed meetings in the past view window', async () => {
    const pastStart = new Date(Date.now() - 7 * 86_400_000);
    await prisma.meeting.create({
      data: {
        title: 'Issue124Agenda past completed meeting',
        scheduledStartAt: pastStart,
        timezone: 'UTC',
        status: MeetingStatus.COMPLETED,
        completedAt: pastStart,
        organizerUserId: ownerId,
      },
    });
    const body = await fetchAgenda(baseUrl, ownerToken, { view: 'past' });
    expect(body.items.some((item) => item.title.includes('past completed meeting'))).toBe(true);
  });

  it('hides recruiter-scoped interviews from unrelated users', async () => {
    const clientId = (
      await prisma.client.create({
        data: {
          name: 'Issue124Agenda privacy client',
          normalizedName: 'issue124agenda-privacy-client',
          status: ClientStatus.ACTIVE,
        },
      })
    ).id;
    const missionId = (
      await prisma.recruitmentMission.create({
        data: {
          clientId,
          title: 'Issue124Agenda privacy mission',
          state: RecruitmentMissionState.ACTIVE,
          numberOfPositions: 1,
          filledPlacementCount: 0,
        },
      })
    ).id;
    await prisma.missionRecruiter.create({
      data: {
        missionId,
        userId: ownerId,
        role: MissionRecruiterRole.RECRUITER,
        status: AssignmentStatus.ACTIVE,
        isLead: true,
      },
    });
    const candidateId = (
      await prisma.candidate.create({
        data: {
          displayName: 'Issue124Agenda Privacy Candidate',
          email: 'privacy@agenda124-candidate.test',
          normalizedEmail: 'privacy@agenda124-candidate.test',
          status: CandidateStatus.ACTIVE,
        },
      })
    ).id;
    const processId = (
      await prisma.missionCandidate.create({
        data: {
          missionId,
          candidateId,
          responsibleRecruiterUserId: ownerId,
          state: MissionCandidateState.HR_INTERVIEW_SCHEDULED,
        },
      })
    ).id;
    await prisma.interview.create({
      data: {
        missionCandidateId: processId,
        organizerUserId: ownerId,
        type: InterviewType.HR,
        status: InterviewStatus.SCHEDULED,
        scheduledStartAt: new Date('2026-10-24T10:00:00.000Z'),
        timezone: 'UTC',
        format: InterviewFormat.VIDEO,
      },
    });
    const ownerBody = await fetchAgenda(baseUrl, ownerToken, {
      ...OCTOBER_WINDOW,
      sources: 'interview',
    });
    expect(ownerBody.items.some((item) => item.title.includes('Interview'))).toBe(true);
    const outsiderBody = await fetchAgenda(baseUrl, outsiderToken, {
      ...OCTOBER_WINDOW,
      sources: 'interview',
    });
    expect(outsiderBody.items.some((item) => item.sourceType === 'interview')).toBe(false);
  });
});
