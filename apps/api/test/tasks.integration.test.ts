import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  NotificationDetailResponseSchema,
  NotificationListResponseSchema,
  NotificationReadAllResponseSchema,
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
  NotificationStatus,
  TaskAssignmentStatus,
  TaskReminderStatus,
  TaskStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: {
    permissionId: string;
    grantedAt: Date;
    archivedAt: Date | null;
  }[];
};

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
  await prisma.missionRecruiter.deleteMany({
    where: {
      OR: [
        { user: { normalizedEmail: { endsWith: '@tasks.test' } } },
        { mission: { title: { contains: 'Issue31' } } },
      ],
    },
  });
  await prisma.missionCandidate.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue31' } } },
        { candidate: { normalizedEmail: { endsWith: '@tasks.test' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue31' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@tasks.test' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue31' } },
  });
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

async function ensureRoleWithOnlyPermissions(
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
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await ensureRoleWithPermissions(roleName, permissionCodes);
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

async function raceAfterTaskLock<T>(taskId: string, startRequests: () => Promise<T>): Promise<T> {
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
      await transaction.$queryRaw`SELECT id FROM "Task" WHERE id = ${taskId}::uuid FOR UPDATE`;
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

describe('internal task management, reminders, comments, and notifications', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerUserId: string;
  let assigneeUserId: string;
  let limitedUserId: string;
  let contextLimitedUserId: string;
  let createOnlyUserId: string;
  let noViewInternalUserId: string;
  let ownerToken: string;
  let assigneeToken: string;
  let limitedToken: string;
  let contextLimitedToken: string;
  let createOnlyToken: string;
  let broadManagerToken: string;
  let noViewInternalToken: string;
  let noTaskToken: string;
  let employeeRoleSnapshot: RolePermissionSnapshot;
  let guestRoleSnapshot: RolePermissionSnapshot;

  beforeAll(async () => {
    await cleanTaskTestRecords();
    employeeRoleSnapshot = await snapshotRolePermissions(RoleName.EMPLOYEE);
    guestRoleSnapshot = await snapshotRolePermissions(RoleName.GUEST);
    await ensureRoleWithOnlyPermissions(RoleName.EMPLOYEE, [
      'tasks:view',
      'tasks:create',
      'tasks:comment',
    ]);
    await ensureRoleWithPermissions(RoleName.GUEST, [
      'notifications:view_own',
      'notifications:update_own',
    ]);
    ownerUserId = await createUser('owner@tasks.test', RoleName.HR_MANAGER);
    assigneeUserId = await createUser('assignee@tasks.test', RoleName.HR_MANAGER);
    limitedUserId = await createUser('limited@tasks.test', RoleName.TEAM_LEADER);
    contextLimitedUserId = await createUser('context-limited@tasks.test', RoleName.MANAGER);
    createOnlyUserId = await createUser('create-only@tasks.test', RoleName.EMPLOYEE);
    await createUser('broad-manager@tasks.test', RoleName.HR_MANAGER);
    noViewInternalUserId = await createUser('no-view-internal@tasks.test', RoleName.GUEST);
    await createUser('notasks@tasks.test', RoleName.GUEST);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors({ origin: 'http://127.0.0.1:5173', credentials: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ownerToken = await loginAccessToken(baseUrl, 'owner@tasks.test');
    assigneeToken = await loginAccessToken(baseUrl, 'assignee@tasks.test');
    limitedToken = await loginAccessToken(baseUrl, 'limited@tasks.test');
    contextLimitedToken = await loginAccessToken(baseUrl, 'context-limited@tasks.test');
    createOnlyToken = await loginAccessToken(baseUrl, 'create-only@tasks.test');
    broadManagerToken = await loginAccessToken(baseUrl, 'broad-manager@tasks.test');
    noTaskToken = await loginAccessToken(baseUrl, 'notasks@tasks.test');
    noViewInternalToken = await loginAccessToken(baseUrl, 'no-view-internal@tasks.test');
  });

  afterAll(async () => {
    await app?.close();
    await cleanTaskTestRecords();
    await restoreRolePermissions(RoleName.EMPLOYEE, employeeRoleSnapshot);
    await restoreRolePermissions(RoleName.GUEST, guestRoleSnapshot);
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

  it('blocks task creation assignments when the creator lacks tasks:assign', async () => {
    const blocked = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(createOnlyToken),
      body: JSON.stringify({
        title: 'Issue31 create-only assignment bypass task',
        ownerUserId: createOnlyUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    expect(blocked.status).toBe(403);
    expect(await readErrorCode(blocked)).toBe('TASKS_ASSIGN_REQUIRED');
    expect(
      await prisma.task.count({ where: { title: 'Issue31 create-only assignment bypass task' } }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: {
          recipientUserId: assigneeUserId,
          type: 'tasks.assignment.created',
          task: { title: 'Issue31 create-only assignment bypass task' },
        },
      }),
    ).toBe(0);
  });

  it('does not treat internal owners or assignees without tasks:view as task-visible', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 no-view assignee task',
        ownerUserId,
        assigneeUserIds: [noViewInternalUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;

    const noViewList = await fetch(`${baseUrl}/v1/tasks`, { headers: authHeaders(noTaskToken) });
    expect(noViewList.status).toBe(403);

    const mention = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        body: 'Synthetic mention should be blocked.',
        mentionedUserIds: [noViewInternalUserId],
      }),
    });
    expect(mention.status).toBe(403);
    expect(await readErrorCode(mention)).toBe('TASK_MENTION_USER_NO_ACCESS');

    const reminder = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        recipientUserId: noViewInternalUserId,
        remindAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    expect(reminder.status).toBe(403);
    expect(await readErrorCode(reminder)).toBe('TASK_REMINDER_RECIPIENT_NO_ACCESS');

    const notifications = NotificationListResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/notifications?pageSize=100`, {
          headers: authHeaders(noTaskToken),
        })
      ).json(),
    );
    expect(notifications.notifications.map((item) => item.taskId)).not.toContain(task.id);
  });

  it('filters visible tasks by status, assignee, and search with pagination metadata', async () => {
    const matching = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 list-filter-needle task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const matchingTask = TaskDetailResponseSchema.parse(await matching.json()).task;
    await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 list-filter other task',
        ownerUserId,
        assigneeUserIds: [ownerUserId],
      }),
    });

    const listed = await fetch(
      `${baseUrl}/v1/tasks?search=list-filter-needle&status=OPEN&assigneeUserId=${assigneeUserId}&pageSize=10`,
      { headers: authHeaders(ownerToken) },
    );
    const body = TaskListResponseSchema.parse(await listed.json());
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]?.id).toBe(matchingTask.id);
    expect(body.pageInfo).toEqual({ page: 1, pageSize: 10, total: 1, hasNextPage: false });
  });

  it('records owner changes through the dedicated owner endpoint without duplicate side effects', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 owner change task',
        ownerUserId,
        assigneeUserIds: [],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;

    const changed = await fetch(`${baseUrl}/v1/tasks/${task.id}/owner`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        ownerUserId: assigneeUserId,
        reason: 'Synthetic ownership handoff.',
      }),
    });
    const changedTask = TaskDetailResponseSchema.parse(await changed.json()).task;
    expect(changedTask.ownerUserId).toBe(assigneeUserId);

    const repeated = await fetch(`${baseUrl}/v1/tasks/${task.id}/owner`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        ownerUserId: assigneeUserId,
        reason: 'Synthetic retry.',
      }),
    });
    expect(TaskDetailResponseSchema.parse(await repeated.json()).task.ownerUserId).toBe(
      assigneeUserId,
    );
    expect(
      await prisma.taskEvent.count({
        where: {
          taskId: task.id,
          action: 'OWNER_CHANGED',
          previousOwnerUserId: ownerUserId,
          nextOwnerUserId: assigneeUserId,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: {
          recipientUserId: assigneeUserId,
          taskId: task.id,
          type: 'tasks.owner.changed',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'Task', entityId: task.id, action: 'tasks.owner_changed' },
      }),
    ).toBe(1);
  });

  it('sends new assignment and owner notifications for later legitimate business events', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 reassign owner-return notification task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const initialAssignment = task.assignments.find((item) => item.userId === assigneeUserId)!;
    const initialAssignmentNotification = await prisma.notification.findFirstOrThrow({
      where: {
        taskId: task.id,
        recipientUserId: assigneeUserId,
        type: 'tasks.assignment.created',
      },
      orderBy: { createdAt: 'asc' },
    });
    await prisma.notification.update({
      where: { id: initialAssignmentNotification.id },
      data: { status: NotificationStatus.ARCHIVED, archivedAt: new Date() },
    });
    await fetch(`${baseUrl}/v1/tasks/${task.id}/assignments/${initialAssignment.id}/remove`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ reason: 'Synthetic remove before reassign.' }),
    });
    await fetch(`${baseUrl}/v1/tasks/${task.id}/assignments`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ userId: assigneeUserId, reason: 'Synthetic reassign.' }),
    });
    expect(
      await prisma.notification.count({
        where: {
          taskId: task.id,
          recipientUserId: assigneeUserId,
          type: 'tasks.assignment.created',
        },
      }),
    ).toBe(2);

    await fetch(`${baseUrl}/v1/tasks/${task.id}/owner`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ ownerUserId: assigneeUserId, reason: 'Synthetic owner handoff.' }),
    });
    const firstReturn = await fetch(`${baseUrl}/v1/tasks/${task.id}/owner`, {
      method: 'POST',
      headers: authHeaders(assigneeToken),
      body: JSON.stringify({ ownerUserId, reason: 'Synthetic owner return.' }),
    });
    expect(firstReturn.status).toBe(201);
    await fetch(`${baseUrl}/v1/tasks/${task.id}/owner`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        ownerUserId: assigneeUserId,
        reason: 'Synthetic owner handoff again.',
      }),
    });
    await fetch(`${baseUrl}/v1/tasks/${task.id}/owner`, {
      method: 'POST',
      headers: authHeaders(assigneeToken),
      body: JSON.stringify({ ownerUserId, reason: 'Synthetic owner return again.' }),
    });
    expect(
      await prisma.notification.count({
        where: {
          taskId: task.id,
          recipientUserId: ownerUserId,
          type: 'tasks.owner.changed',
        },
      }),
    ).toBe(2);
  });

  it('refuses inaccessible linked task context before creating task records', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        displayName: 'Issue31 Context Candidate',
        email: 'context-candidate@tasks.test',
        normalizedEmail: 'context-candidate@tasks.test',
        status: 'ACTIVE',
      },
    });
    const blocked = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(contextLimitedToken),
      body: JSON.stringify({
        title: 'Issue31 forbidden candidate context task',
        ownerUserId: contextLimitedUserId,
        assigneeUserIds: [],
        context: { candidateId: candidate.id },
      }),
    });
    expect(blocked.status).toBe(403);
    expect(await readErrorCode(blocked)).toMatch(
      /^(PERMISSION_DENIED|TASK_CONTEXT_CANDIDATE_FORBIDDEN)$/,
    );
    expect(
      await prisma.task.count({
        where: { title: 'Issue31 forbidden candidate context task' },
      }),
    ).toBe(0);
  });

  it('requires an active assignee before moving a task to in progress', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 in-progress invariant task',
        ownerUserId,
        assigneeUserIds: [],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const blocked = await fetch(`${baseUrl}/v1/tasks/${task.id}/status`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ status: 'IN_PROGRESS', reason: 'Synthetic start.' }),
    });
    expect(blocked.status).toBe(409);
    expect(await readErrorCode(blocked)).toBe('TASK_ACTIVE_ASSIGNEE_REQUIRED');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('OPEN');
    expect(
      await prisma.taskEvent.count({
        where: { taskId: task.id, nextStatus: 'IN_PROGRESS' },
      }),
    ).toBe(0);
  });

  it('rejects inactive assignees inside the assignment write path without side effects', async () => {
    const inactiveUserId = await createUser('inactive-assignee@tasks.test', RoleName.HR_MANAGER);
    await prisma.user.update({
      where: { id: inactiveUserId },
      data: { status: UserStatus.SUSPENDED },
    });
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 inactive assignment target task',
        ownerUserId,
        assigneeUserIds: [],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;

    const blocked = await fetch(`${baseUrl}/v1/tasks/${task.id}/assignments`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ userId: inactiveUserId, reason: 'Synthetic inactive assignment.' }),
    });
    expect(blocked.status).toBe(409);
    expect(await readErrorCode(blocked)).toBe('TASK_ASSIGNEE_NOT_ACTIVE');
    expect(
      await prisma.taskAssignment.count({ where: { taskId: task.id, userId: inactiveUserId } }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { taskId: task.id, recipientUserId: inactiveUserId },
      }),
    ).toBe(0);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: 'ASSIGNEE_ADDED' } }),
    ).toBe(0);
  });

  it('scopes reminder idempotency to task and recipient without replay side effects', async () => {
    const first = TaskDetailResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/tasks`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({
            title: 'Issue31 reminder idempotency first task',
            ownerUserId,
            assigneeUserIds: [assigneeUserId],
          }),
        })
      ).json(),
    ).task;
    const second = TaskDetailResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/tasks`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({
            title: 'Issue31 reminder idempotency second task',
            ownerUserId,
            assigneeUserIds: [assigneeUserId],
          }),
        })
      ).json(),
    ).task;
    const remindAt = new Date(Date.now() + 86_400_000).toISOString();
    const idempotencyKey = 'issue31:shared-reminder-key';
    const createReminder = (taskId: string) =>
      fetch(`${baseUrl}/v1/tasks/${taskId}/reminders`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ recipientUserId: assigneeUserId, remindAt, idempotencyKey }),
      });

    const firstReminder = TaskReminderDetailResponseSchema.parse(
      await (await createReminder(first.id)).json(),
    ).reminder;
    const firstReplay = TaskReminderDetailResponseSchema.parse(
      await (await createReminder(first.id)).json(),
    ).reminder;
    const secondReminder = TaskReminderDetailResponseSchema.parse(
      await (await createReminder(second.id)).json(),
    ).reminder;

    expect(firstReplay.id).toBe(firstReminder.id);
    expect(secondReminder.id).not.toBe(firstReminder.id);
    expect(
      await prisma.taskReminder.count({
        where: { recipientUserId: assigneeUserId, idempotencyKey },
      }),
    ).toBe(2);
    expect(
      await prisma.taskEvent.count({
        where: { taskId: first.id, action: 'REMINDER_CREATED' },
      }),
    ).toBe(1);
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

  it('rejects comment creation when concurrent assignment removal removes actor visibility', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 comment actor visibility race task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const assignment = task.assignments.find((item) => item.userId === assigneeUserId)!;
    const commentBody = 'Synthetic actor visibility race comment.';
    const commentAuditWhere = {
      action: 'tasks.comment_created',
      actorUserId: assigneeUserId,
      metadataSummary: 'Task comment created.',
    };
    const commentAuditCountBefore = await prisma.auditLog.count({ where: commentAuditWhere });

    const [removed, staleComment] = await raceAfterTaskLock(task.id, async () => {
      const removePromise = fetch(`${baseUrl}/v1/tasks/${task.id}/assignments/${assignment.id}`, {
        method: 'DELETE',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ reason: 'Synthetic scope loss before comment.' }),
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      const commentPromise = fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: authHeaders(assigneeToken),
        body: JSON.stringify({ body: commentBody, mentionedUserIds: [] }),
      });
      return Promise.all([removePromise, commentPromise]);
    });

    expect(removed.status).toBe(200);
    expect(staleComment.status).toBe(404);
    expect(await readErrorCode(staleComment)).toBe('TASK_NOT_FOUND');
    expect(await prisma.taskComment.count({ where: { taskId: task.id, body: commentBody } })).toBe(
      0,
    );
    expect(await prisma.taskMention.count({ where: { taskId: task.id } })).toBe(0);
    expect(
      await prisma.notification.count({
        where: { taskId: task.id, type: 'tasks.comment.mention' },
      }),
    ).toBe(0);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: 'COMMENT_CREATED' } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: commentAuditWhere,
      }),
    ).toBe(commentAuditCountBefore);
  });

  it('rejects mention creation when concurrent assignment removal removes mentioned-user visibility', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 comment mention visibility race task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const assignment = task.assignments.find((item) => item.userId === assigneeUserId)!;
    const commentBody = 'Synthetic mentioned-user visibility race comment.';
    const mentionAuditWhere = {
      action: 'tasks.comment_created',
      actorUserId: ownerUserId,
      metadataSummary: 'Task comment created.',
    };
    const mentionAuditCountBefore = await prisma.auditLog.count({ where: mentionAuditWhere });

    const [removed, staleMention] = await raceAfterTaskLock(task.id, async () => {
      const removePromise = fetch(`${baseUrl}/v1/tasks/${task.id}/assignments/${assignment.id}`, {
        method: 'DELETE',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ reason: 'Synthetic scope loss before mention.' }),
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      const commentPromise = fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ body: commentBody, mentionedUserIds: [assigneeUserId] }),
      });
      return Promise.all([removePromise, commentPromise]);
    });

    expect(removed.status).toBe(200);
    expect(staleMention.status).toBe(403);
    expect(await readErrorCode(staleMention)).toBe('TASK_MENTION_USER_NO_ACCESS');
    expect(await prisma.taskComment.count({ where: { taskId: task.id, body: commentBody } })).toBe(
      0,
    );
    expect(
      await prisma.taskMention.count({
        where: { taskId: task.id, mentionedUserId: assigneeUserId },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: {
          taskId: task.id,
          recipientUserId: assigneeUserId,
          type: 'tasks.comment.mention',
        },
      }),
    ).toBe(0);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: 'COMMENT_CREATED' } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: mentionAuditWhere,
      }),
    ).toBe(mentionAuditCountBefore);
  });

  it('enforces author, broad manager, and unauthorized comment edit/archive rules', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 comment matrix task',
        ownerUserId,
        assigneeUserIds: [createOnlyUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const comment = TaskCommentDetailResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({ body: 'Synthetic author comment.', mentionedUserIds: [] }),
        })
      ).json(),
    ).comment;

    const unauthorizedEdit = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments/${comment.id}`, {
      method: 'PATCH',
      headers: authHeaders(createOnlyToken),
      body: JSON.stringify({ body: 'Synthetic unauthorized edit.' }),
    });
    expect(unauthorizedEdit.status).toBe(403);
    expect(await readErrorCode(unauthorizedEdit)).toBe('TASK_COMMENT_AUTHOR_REQUIRED');

    const authorEdit = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments/${comment.id}`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ body: 'Synthetic author edit.' }),
    });
    expect(TaskCommentDetailResponseSchema.parse(await authorEdit.json()).comment.status).toBe(
      'EDITED',
    );

    const managerEdit = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments/${comment.id}`, {
      method: 'PATCH',
      headers: authHeaders(broadManagerToken),
      body: JSON.stringify({ body: 'Synthetic broad manager edit.' }),
    });
    expect(TaskCommentDetailResponseSchema.parse(await managerEdit.json()).comment.status).toBe(
      'EDITED',
    );

    const unauthorizedArchive = await fetch(
      `${baseUrl}/v1/tasks/${task.id}/comments/${comment.id}/archive`,
      { method: 'POST', headers: authHeaders(createOnlyToken) },
    );
    expect(unauthorizedArchive.status).toBe(403);
    expect(await readErrorCode(unauthorizedArchive)).toBe('TASK_COMMENT_AUTHOR_REQUIRED');

    const archived = await fetch(`${baseUrl}/v1/tasks/${task.id}/comments/${comment.id}/archive`, {
      method: 'POST',
      headers: authHeaders(broadManagerToken),
    });
    expect(TaskCommentDetailResponseSchema.parse(await archived.json()).comment.status).toBe(
      'ARCHIVED',
    );
  });

  it('lists, marks read, reads all, and archives visible notifications', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 notification lifecycle task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    await fetch(`${baseUrl}/v1/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        body: 'Synthetic notification lifecycle comment.',
        mentionedUserIds: [assigneeUserId],
      }),
    });

    const unreadList = NotificationListResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/notifications?status=UNREAD&pageSize=10`, {
          headers: authHeaders(assigneeToken),
        })
      ).json(),
    );
    const notification = unreadList.notifications.find(
      (item) => item.taskId === task.id && item.type === 'tasks.comment.mention',
    );
    expect(notification).toBeDefined();
    expect(unreadList.pageInfo.total).toBeGreaterThanOrEqual(1);

    const readOne = await fetch(`${baseUrl}/v1/notifications/${notification!.id}/read`, {
      method: 'POST',
      headers: authHeaders(assigneeToken),
    });
    expect(NotificationDetailResponseSchema.parse(await readOne.json()).notification.status).toBe(
      'READ',
    );

    const readAll = await fetch(`${baseUrl}/v1/notifications/read-all`, {
      method: 'POST',
      headers: authHeaders(assigneeToken),
      body: JSON.stringify({ status: 'UNREAD' }),
    });
    expect(
      NotificationReadAllResponseSchema.parse(await readAll.json()).updatedCount,
    ).toBeGreaterThanOrEqual(0);

    const archived = await fetch(`${baseUrl}/v1/notifications/${notification!.id}/archive`, {
      method: 'POST',
      headers: authHeaders(assigneeToken),
    });
    expect(archived.status).toBe(201);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notification!.id } })).status,
    ).toBe('ARCHIVED');
    const visible = NotificationListResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/notifications?pageSize=100`, {
          headers: authHeaders(assigneeToken),
        })
      ).json(),
    );
    expect(visible.notifications.map((item) => item.id)).not.toContain(notification!.id);
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

  it('authorizes reminder update/cancel and rejects sent or canceled reminder mutation', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 reminder authorization state task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId, createOnlyUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const reminder = TaskReminderDetailResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({
            recipientUserId: assigneeUserId,
            remindAt: new Date(Date.now() + 86_400_000).toISOString(),
            idempotencyKey: `issue31:${task.id}:auth-state`,
          }),
        })
      ).json(),
    ).reminder;

    const unauthorizedUpdate = await fetch(
      `${baseUrl}/v1/tasks/${task.id}/reminders/${reminder.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(createOnlyToken),
        body: JSON.stringify({ remindAt: new Date(Date.now() + 172_800_000).toISOString() }),
      },
    );
    expect(unauthorizedUpdate.status).toBe(403);
    expect(
      (
        await prisma.taskReminder.findUniqueOrThrow({ where: { id: reminder.id } })
      ).remindAt.toISOString(),
    ).toBe(reminder.remindAt);

    const rescheduled = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ remindAt: new Date(Date.now() + 172_800_000).toISOString() }),
    });
    expect(TaskReminderDetailResponseSchema.parse(await rescheduled.json()).reminder.status).toBe(
      TaskReminderStatus.PENDING,
    );

    const canceled = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders/${reminder.id}/cancel`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
    });
    expect(TaskReminderDetailResponseSchema.parse(await canceled.json()).reminder.status).toBe(
      TaskReminderStatus.CANCELED,
    );

    const updateCanceled = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ remindAt: new Date(Date.now() + 259_200_000).toISOString() }),
    });
    expect(updateCanceled.status).toBe(409);
    expect(await readErrorCode(updateCanceled)).toBe('TASK_REMINDER_NOT_RESCHEDULABLE');

    const sentReminder = TaskReminderDetailResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({
            recipientUserId: assigneeUserId,
            remindAt: new Date(Date.now() - 1_000).toISOString(),
            idempotencyKey: `issue31:${task.id}:sent-state`,
          }),
        })
      ).json(),
    ).reminder;
    await fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ limit: 10 }),
    });
    const updateSent = await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders/${sentReminder.id}`, {
      method: 'PATCH',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ remindAt: new Date(Date.now() + 86_400_000).toISOString() }),
    });
    expect(updateSent.status).toBe(409);
    expect(await readErrorCode(updateSent)).toBe('TASK_REMINDER_NOT_RESCHEDULABLE');
    const cancelSent = await fetch(
      `${baseUrl}/v1/tasks/${task.id}/reminders/${sentReminder.id}/cancel`,
      { method: 'POST', headers: authHeaders(ownerToken) },
    );
    expect(cancelSent.status).toBe(409);
    expect(await readErrorCode(cancelSent)).toBe('TASK_REMINDER_NOT_CANCELABLE');
    expect(
      (await prisma.taskReminder.findUniqueOrThrow({ where: { id: sentReminder.id } })).status,
    ).toBe(TaskReminderStatus.SENT);
  });

  it('rejects reminder creation when concurrent assignment removal removes recipient visibility', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 reminder recipient visibility race task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const assignment = task.assignments.find((item) => item.userId === assigneeUserId)!;
    const idempotencyKey = `issue31:${task.id}:recipient-visibility-race`;
    const reminderAuditWhere = {
      action: 'tasks.reminder_created',
      actorUserId: ownerUserId,
      metadataSummary: 'Task reminder created.',
    };
    const reminderAuditCountBefore = await prisma.auditLog.count({ where: reminderAuditWhere });

    const [removed, staleReminder] = await raceAfterTaskLock(task.id, async () => {
      const removePromise = fetch(`${baseUrl}/v1/tasks/${task.id}/assignments/${assignment.id}`, {
        method: 'DELETE',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ reason: 'Synthetic scope loss before reminder.' }),
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      const reminderPromise = fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({
          recipientUserId: assigneeUserId,
          remindAt: new Date(Date.now() + 86_400_000).toISOString(),
          idempotencyKey,
        }),
      });
      return Promise.all([removePromise, reminderPromise]);
    });

    expect(removed.status).toBe(200);
    expect(staleReminder.status).toBe(403);
    expect(await readErrorCode(staleReminder)).toBe('TASK_REMINDER_RECIPIENT_NO_ACCESS');
    expect(
      await prisma.taskReminder.count({
        where: { taskId: task.id, recipientUserId: assigneeUserId, idempotencyKey },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { taskId: task.id, type: 'tasks.reminder.due' },
      }),
    ).toBe(0);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: 'REMINDER_CREATED' } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: reminderAuditWhere,
      }),
    ).toBe(reminderAuditCountBefore);
  });

  it('keeps reminder processing serialized against update and cancel requests', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 reminder race task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const makeDueReminder = async (key: string) =>
      TaskReminderDetailResponseSchema.parse(
        await (
          await fetch(`${baseUrl}/v1/tasks/${task.id}/reminders`, {
            method: 'POST',
            headers: authHeaders(ownerToken),
            body: JSON.stringify({
              recipientUserId: assigneeUserId,
              remindAt: new Date(Date.now() - 1_000).toISOString(),
              idempotencyKey: `issue31:${task.id}:${key}`,
            }),
          })
        ).json(),
      ).reminder;

    const updateRace = await makeDueReminder('process-update-race');
    await Promise.allSettled([
      fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ limit: 10 }),
      }),
      fetch(`${baseUrl}/v1/tasks/${task.id}/reminders/${updateRace.id}`, {
        method: 'PATCH',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ remindAt: new Date(Date.now() + 86_400_000).toISOString() }),
      }),
    ]);
    const updateRaceRecord = await prisma.taskReminder.findUniqueOrThrow({
      where: { id: updateRace.id },
    });
    expect([TaskReminderStatus.PENDING, TaskReminderStatus.SENT]).toContain(
      updateRaceRecord.status,
    );
    expect(
      updateRaceRecord.status === TaskReminderStatus.SENT
        ? updateRaceRecord.deliveredAt !== null
        : updateRaceRecord.deliveredAt === null && updateRaceRecord.remindAt > new Date(),
    ).toBe(true);

    const cancelRace = await makeDueReminder('process-cancel-race');
    await Promise.allSettled([
      fetch(`${baseUrl}/v1/tasks/reminders/process-due`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ limit: 10 }),
      }),
      fetch(`${baseUrl}/v1/tasks/${task.id}/reminders/${cancelRace.id}/cancel`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
      }),
    ]);
    const cancelRaceRecord = await prisma.taskReminder.findUniqueOrThrow({
      where: { id: cancelRace.id },
    });
    expect([TaskReminderStatus.CANCELED, TaskReminderStatus.SENT]).toContain(
      cancelRaceRecord.status,
    );
    expect(
      cancelRaceRecord.status === TaskReminderStatus.SENT
        ? cancelRaceRecord.deliveredAt !== null && cancelRaceRecord.canceledAt === null
        : cancelRaceRecord.deliveredAt === null && cancelRaceRecord.canceledAt !== null,
    ).toBe(true);
  });

  it('keeps notification reads, archives, stale links, and read-all scoped to the owner', async () => {
    const created = await fetch(`${baseUrl}/v1/tasks`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        title: 'Issue31 notification safety task',
        ownerUserId,
        assigneeUserIds: [assigneeUserId, noViewInternalUserId],
      }),
    });
    const task = TaskDetailResponseSchema.parse(await created.json()).task;
    const assigneeNotification = await prisma.notification.findFirstOrThrow({
      where: {
        taskId: task.id,
        recipientUserId: assigneeUserId,
        type: 'tasks.assignment.created',
      },
    });
    const crossRead = await fetch(`${baseUrl}/v1/notifications/${assigneeNotification.id}/read`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
    });
    expect(crossRead.status).toBe(404);
    expect(await readErrorCode(crossRead)).toBe('NOTIFICATION_NOT_FOUND');
    const crossArchive = await fetch(
      `${baseUrl}/v1/notifications/${assigneeNotification.id}/archive`,
      { method: 'POST', headers: authHeaders(ownerToken) },
    );
    expect(crossArchive.status).toBe(404);
    expect(await readErrorCode(crossArchive)).toBe('NOTIFICATION_NOT_FOUND');

    const staleNotification = await prisma.notification.findFirstOrThrow({
      where: { taskId: task.id, recipientUserId: noViewInternalUserId },
    });
    const staleRead = await fetch(`${baseUrl}/v1/notifications/${staleNotification.id}/read`, {
      method: 'POST',
      headers: authHeaders(noViewInternalToken),
    });
    expect(NotificationDetailResponseSchema.parse(await staleRead.json()).notification.taskId).toBe(
      null,
    );

    const unreadBefore = await prisma.notification.count({
      where: { recipientUserId: assigneeUserId, status: NotificationStatus.UNREAD },
    });
    const invalidReadAll = await fetch(`${baseUrl}/v1/notifications/read-all`, {
      method: 'POST',
      headers: authHeaders(assigneeToken),
      body: JSON.stringify({ status: 'READ' }),
    });
    expect(invalidReadAll.status).toBe(400);
    expect(
      await prisma.notification.count({
        where: { recipientUserId: assigneeUserId, status: NotificationStatus.UNREAD },
      }),
    ).toBe(unreadBefore);
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
