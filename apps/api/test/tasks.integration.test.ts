import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  NotificationListResponseSchema,
  TaskCommentDetailResponseSchema,
  TaskDetailResponseSchema,
  TaskListResponseSchema,
  TaskReminderDetailResponseSchema,
  TaskReminderProcessResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  PermissionScopeType,
  PrismaClient,
  RoleName,
  TaskAssignmentStatus,
  TaskReminderStatus,
  TaskStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const taskPermissions = [
  'tasks:view',
  'tasks:create',
  'tasks:update',
  'tasks:assign',
  'tasks:transition',
  'tasks:comment',
  'tasks:reminders:manage',
  'tasks:archive',
  'notifications:view_own',
  'notifications:update_own',
] as const;

async function cleanTaskTestRecords(): Promise<void> {
  await prisma.taskMention.deleteMany({
    where: { task: { title: { contains: 'Issue31' } } },
  });
  await prisma.taskComment.deleteMany({
    where: { task: { title: { contains: 'Issue31' } } },
  });
  await prisma.taskReminder.deleteMany({
    where: { task: { title: { contains: 'Issue31' } } },
  });
  await prisma.taskEvent.deleteMany({
    where: { task: { title: { contains: 'Issue31' } } },
  });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { task: { title: { contains: 'Issue31' } } },
        { recipient: { normalizedEmail: { endsWith: '@tasks.test' } } },
      ],
    },
  });
  await prisma.taskAssignment.deleteMany({
    where: { task: { title: { contains: 'Issue31' } } },
  });
  await prisma.task.deleteMany({ where: { title: { contains: 'Issue31' } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['Task', 'TaskComment', 'TaskReminder', 'Notification'] } },
        { targetUser: { normalizedEmail: { endsWith: '@tasks.test' } } },
      ],
    },
  });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@tasks.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@tasks.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@tasks.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@tasks.test' } },
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
      description: `Synthetic ${roleName} role for task tests.`,
      status: 'ACTIVE',
    },
  });
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for task tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for task tests.`,
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
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for task tests.`,
      status: 'ACTIVE',
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  return AuthResponseSchema.parse(await response.json()).accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

describe('internal task management, reminders, comments, and notifications', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerUserId: string;
  let assigneeUserId: string;
  let limitedUserId: string;
  let ownerToken: string;
  let assigneeToken: string;
  let limitedToken: string;
  let noTaskToken: string;

  beforeAll(async () => {
    await cleanTaskTestRecords();
    await ensureRoleWithPermissions(RoleName.HR_MANAGER, taskPermissions);
    await ensureRoleWithPermissions(RoleName.TEAM_LEADER, ['tasks:view']);
    ownerUserId = await createUser('owner@tasks.test', RoleName.HR_MANAGER);
    assigneeUserId = await createUser('assignee@tasks.test', RoleName.HR_MANAGER);
    limitedUserId = await createUser('limited@tasks.test', RoleName.TEAM_LEADER);
    await createUser('notasks@tasks.test', RoleName.CLIENT_USER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors({ origin: 'http://127.0.0.1:5173', credentials: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ownerToken = await loginAccessToken(baseUrl, 'owner@tasks.test');
    assigneeToken = await loginAccessToken(baseUrl, 'assignee@tasks.test');
    limitedToken = await loginAccessToken(baseUrl, 'limited@tasks.test');
    noTaskToken = await loginAccessToken(baseUrl, 'notasks@tasks.test');
  });

  afterAll(async () => {
    await app?.close();
    await cleanTaskTestRecords();
    await prisma.$disconnect();
  });

  it('creates a task with multiple assignees and prevents duplicate active assignments', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 multiple assignment task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId, ownerUserId],
        priority: 'HIGH',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    expect(created.status).toBe(201);
    const body = TaskDetailResponseSchema.parse(await created.json());
    expect(body.task.assigneeUserIds.sort()).toEqual([assigneeUserId, ownerUserId].sort());

    const duplicateResponses = await Promise.all([
      fetch(`${baseUrl}/v1/tasks/${body.task.id}/assignments`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ userId: assigneeUserId, reason: 'Duplicate race.' }),
      }),
      fetch(`${baseUrl}/v1/tasks/${body.task.id}/assignments`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ userId: assigneeUserId, reason: 'Duplicate race.' }),
      }),
    ]);
    expect(duplicateResponses.every((response) => response.status === 409)).toBe(true);
    expect(await readErrorCode(duplicateResponses[0])).toBe('TASK_ASSIGNMENT_ALREADY_ACTIVE');
    const activeAssignments = await prisma.taskAssignment.count({
      where: { taskId: body.task.id, userId: assigneeUserId, status: TaskAssignmentStatus.ACTIVE },
    });
    expect(activeAssignments).toBe(1);
  });

  it('enforces scoped visibility instead of letting tasks:view expose every task', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 private visibility task',
        ownerUserId,
        assigneeUserIds: [],
      }),
    });
    const body = TaskDetailResponseSchema.parse(await created.json());
    const limitedDetail = await fetch(`${baseUrl}/v1/tasks/${body.task.id}`, {
      headers: authHeaders(limitedToken),
    });
    const noPermissionList = await fetch(`${baseUrl}/v1/tasks`, {
      headers: authHeaders(noTaskToken),
    });
    const ownerList = await fetch(`${baseUrl}/v1/tasks`, { headers: authHeaders(ownerToken) });

    expect(limitedDetail.status).toBe(404);
    expect(await readErrorCode(limitedDetail)).toBe('TASK_NOT_FOUND');
    expect(noPermissionList.status).toBe(403);
    expect(TaskListResponseSchema.parse(await ownerList.json()).tasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: body.task.id })]),
    );
  });

  it('keeps comment mentions explicit and refuses mentions that do not grant access', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 mention task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const blockedMention = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        body: 'Synthetic internal task comment.',
        mentionedUserIds: [limitedUserId],
      }),
    });
    expect(blockedMention.status).toBe(403);
    expect(await readErrorCode(blockedMention)).toBe('TASK_MENTION_USER_NO_ACCESS');

    const commentResponse = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        body: 'Synthetic internal task comment.',
        mentionedUserIds: [assigneeUserId, ownerUserId],
      }),
    });
    expect(commentResponse.status).toBe(201);
    const comment = TaskCommentDetailResponseSchema.parse(await commentResponse.json()).comment;
    expect(comment.mentionedUserIds.sort()).toEqual([assigneeUserId, ownerUserId].sort());

    const notifications = NotificationListResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/notifications`, { headers: authHeaders(assigneeToken) })
      ).json(),
    ).notifications;
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: task.id, type: 'tasks.comment.mention' }),
      ]),
    );
    const ownerMentionNotifications = await prisma.notification.count({
      where: {
        recipientUserId: ownerUserId,
        taskId: task.id,
        type: 'tasks.comment.mention',
      },
    });
    expect(ownerMentionNotifications).toBe(0);
  });

  it('processes reminders durably, retries failures, and cancels pending reminders on completion', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 reminder task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
        dueAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const dueReminderResponse = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        recipientUserId: assigneeUserId,
        remindAt: new Date(Date.now() - 1_000).toISOString(),
        idempotencyKey: `issue31:${task.id}:due`,
      }),
    });
    const dueReminder = TaskReminderDetailResponseSchema.parse(
      await dueReminderResponse.json(),
    ).reminder;
    await prisma.taskReminder.update({
      where: { id: dueReminder.id },
      data: {
        status: TaskReminderStatus.FAILED,
        failureReason: 'Synthetic prior delivery failure.',
        attemptCount: 1,
      },
    });
    expect(
      (await prisma.taskReminder.findUniqueOrThrow({ where: { id: dueReminder.id } })).status,
    ).toBe(TaskReminderStatus.FAILED);

    const retried = await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ limit: 10 }),
    });
    const retryBody = TaskReminderProcessResponseSchema.parse(await retried.json());
    expect(retryBody.remindersDelivered).toBe(1);
    expect(retryBody.overdueNotificationsCreated).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.notification.count({
        where: { idempotencyKey: `task-reminder:${dueReminder.id}` },
      }),
    ).toBe(1);

    const concurrentReminderResponse = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        recipientUserId: assigneeUserId,
        remindAt: new Date(Date.now() - 1_000).toISOString(),
        idempotencyKey: `issue31:${task.id}:concurrent`,
      }),
    });
    const concurrentReminder = TaskReminderDetailResponseSchema.parse(
      await concurrentReminderResponse.json(),
    ).reminder;
    await Promise.all([
      fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ limit: 10 }),
      }),
      fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ limit: 10 }),
      }),
    ]);
    expect(
      await prisma.notification.count({
        where: { idempotencyKey: `task-reminder:${concurrentReminder.id}` },
      }),
    ).toBe(1);

    const pendingReminderResponse = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        recipientUserId: assigneeUserId,
        remindAt: new Date(Date.now() + 86_400_000).toISOString(),
        idempotencyKey: `issue31:${task.id}:future`,
      }),
    });
    const pendingReminder = TaskReminderDetailResponseSchema.parse(
      await pendingReminderResponse.json(),
    ).reminder;
    await fetch(`${baseUrl}/v1/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ reason: 'Synthetic work done.' }),
    });
    expect(
      (await prisma.taskReminder.findUniqueOrThrow({ where: { id: pendingReminder.id } })).status,
    ).toBe(TaskReminderStatus.CANCELED);
  });

  it('keeps task completion and cancellation idempotent without duplicate audit or history', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 idempotent lifecycle task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const firstComplete = await fetch(`${baseUrl}/v1/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ reason: 'Synthetic complete.' }),
    });
    const secondComplete = await fetch(`${baseUrl}/v1/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ reason: 'Synthetic retry.' }),
    });
    expect(TaskDetailResponseSchema.parse(await firstComplete.json()).task.status).toBe(
      TaskStatus.COMPLETED,
    );
    expect(TaskDetailResponseSchema.parse(await secondComplete.json()).task.status).toBe(
      TaskStatus.COMPLETED,
    );
    expect(
      await prisma.taskEvent.count({
        where: { taskId: task.id, action: 'COMPLETED' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'Task', entityId: task.id, action: 'tasks.completed' },
      }),
    ).toBe(1);
  });
});
