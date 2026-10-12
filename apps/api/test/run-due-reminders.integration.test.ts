import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PasswordService } from '../src/auth/password.service.js';
import {
  PrismaClient,
  RoleName,
  TaskEventAction,
  TaskReminderStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { childEnvironment } from './support/disposable-database.js';
import { runNodeCaptured, TSX_CLI } from './support/child-commands.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const EMAIL_DOMAIN = '@r036-runner.test';
const RUNNER_SCRIPT = 'src/jobs/run-due-reminders.ts';
const BASE_NOW = new Date('2025-02-01T12:00:00.000Z');

async function createUser(local: string, roleName: RoleName): Promise<string> {
  const email = `${local}${EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${local}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: {
      userId: user.id,
      passwordHash: await passwords.hashPassword('Synthetic-passphrase-123!'),
    },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

function parseLastTickLine(output: string): Record<string, unknown> {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'));
  expect(lines.length).toBeGreaterThan(0);
  const last = lines[lines.length - 1]!;
  return JSON.parse(last) as Record<string, unknown>;
}

function runCli(args: string[], env: NodeJS.ProcessEnv) {
  return runNodeCaptured(TSX_CLI, [RUNNER_SCRIPT, ...args], env);
}

describe('run-due-reminders CLI (R-036 PR B)', () => {
  let ownerUserId: string;
  let recipientUserId: string;

  beforeAll(async () => {
    ownerUserId = await createUser('owner', RoleName.HR_MANAGER);
    recipientUserId = await createUser('recipient', RoleName.HR_MANAGER);
  }, 30_000);

  afterEach(async () => {
    await prisma.taskEvent.deleteMany({
      where: { task: { title: { startsWith: 'R036 runner' } } },
    });
    await prisma.notification.deleteMany({
      where: { idempotencyKey: { startsWith: 'task-reminder:' } },
    });
    await prisma.taskReminder.deleteMany({
      where: { task: { title: { startsWith: 'R036 runner' } } },
    });
    await prisma.task.deleteMany({ where: { title: { startsWith: 'R036 runner' } } });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: { user: { normalizedEmail: { endsWith: EMAIL_DOMAIN } } },
    });
    await prisma.passwordCredential.deleteMany({
      where: { user: { normalizedEmail: { endsWith: EMAIL_DOMAIN } } },
    });
    await prisma.user.deleteMany({ where: { normalizedEmail: { endsWith: EMAIL_DOMAIN } } });
    await prisma.$disconnect();
  });

  it('delivers a due reminder via one-shot CLI with null scheduler actor', async () => {
    const task = await prisma.task.create({
      data: {
        title: 'R036 runner due task',
        ownerUserId,
        createdByUserId: ownerUserId,
      },
    });
    const reminder = await prisma.taskReminder.create({
      data: {
        taskId: task.id,
        recipientUserId,
        creatorUserId: ownerUserId,
        remindAt: BASE_NOW,
        idempotencyKey: `runner:${randomUUID()}`,
      },
    });

    const env = childEnvironment(process.env.DATABASE_URL!);
    const { status, output } = runCli(['--once', '--limit=5'], env);
    expect(status).toBe(0);
    const summary = parseLastTickLine(output);
    expect(summary.event).toBe('task_reminders.tick');
    expect(summary.trigger).toBe('scheduler');
    expect(Number(summary.delivered)).toBeGreaterThanOrEqual(1);
    expect(output).not.toMatch(/R036 runner due task|Synthetic|@|postgresql:\/\//i);

    const row = await prisma.taskReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(row.status).toBe(TaskReminderStatus.SENT);
    const deliveredEvents = await prisma.taskEvent.findMany({
      where: { taskId: task.id, action: TaskEventAction.REMINDER_DELIVERED },
    });
    expect(deliveredEvents.some((event) => event.actorUserId === null)).toBe(true);
  });

  it('exits non-zero when DATABASE_URL is unreachable', () => {
    const env = childEnvironment('postgresql://127.0.0.1:1/nonexistent_db');
    const { status, output } = runCli(['--once'], env);
    expect(status).toBe(1);
    expect(output).toContain('task_reminders.fatal');
    expect(output).not.toMatch(/postgresql:\/\/127\.0\.0\.1:1/);
  });

  it('exits non-zero for malformed CLI configuration', () => {
    const env = childEnvironment(process.env.DATABASE_URL!);
    const { status, output } = runCli(['--limit=0'], env);
    expect(status).toBe(1);
    expect(output).toContain('RUNNER_ARGS_INVALID');
  });
});
