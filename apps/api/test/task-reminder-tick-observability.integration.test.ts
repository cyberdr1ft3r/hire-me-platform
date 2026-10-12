import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PasswordService } from '../src/auth/password.service.js';
import {
  PrismaClient,
  RoleName,
  TaskEventAction,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import type { PrismaService } from '../src/persistence/prisma/prisma.service.js';
import type { TaskReminderClock } from '../src/tasks/task-reminder-clock.js';
import { TaskReminderDeliveryService } from '../src/tasks/task-reminder-delivery.service.js';
import { formatTaskReminderTickAuditMetadata } from '../src/tasks/task-reminder-tick-observability.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const EMAIL_DOMAIN = '@r036-observability.test';
const BASE_NOW = new Date('2025-04-01T12:00:00.000Z');
const MINUTE = 60_000;

class FixedClock implements TaskReminderClock {
  constructor(public current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
}

function service(now = BASE_NOW) {
  const clock = new FixedClock(now);
  return new TaskReminderDeliveryService(prisma as unknown as PrismaService, clock);
}

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

describe('task reminder tick observability (R-036 PR C)', () => {
  let ownerUserId: string;
  let recipientUserId: string;

  beforeAll(async () => {
    ownerUserId = await createUser('owner', RoleName.HR_MANAGER);
    recipientUserId = await createUser('recipient', RoleName.HR_MANAGER);
  }, 30_000);

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { action: 'tasks.reminders_processed' } });
    await prisma.taskEvent.deleteMany({
      where: { task: { title: { startsWith: 'R036 obs' } } },
    });
    await prisma.notification.deleteMany({
      where: { idempotencyKey: { startsWith: 'task-reminder:' } },
    });
    await prisma.taskReminder.deleteMany({
      where: { task: { title: { startsWith: 'R036 obs' } } },
    });
    await prisma.task.deleteMany({ where: { title: { startsWith: 'R036 obs' } } });
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

  it('does not write AuditLog on an idle scheduler tick', async () => {
    await service().runDueTick({
      now: BASE_NOW,
      limit: 10,
      trigger: 'scheduler',
      actorUserId: null,
    });
    const rows = await prisma.auditLog.findMany({ where: { action: 'tasks.reminders_processed' } });
    expect(rows).toHaveLength(0);
  });

  it('writes one null-actor AuditLog with safe counts when a reminder is delivered', async () => {
    const task = await prisma.task.create({
      data: {
        title: 'R036 obs deliver',
        ownerUserId,
        createdByUserId: ownerUserId,
      },
    });
    await prisma.taskReminder.create({
      data: {
        taskId: task.id,
        recipientUserId,
        creatorUserId: ownerUserId,
        remindAt: BASE_NOW,
        idempotencyKey: `obs:${randomUUID()}`,
      },
    });

    const tick = await service().runDueTick({
      now: BASE_NOW,
      limit: 10,
      trigger: 'scheduler',
      actorUserId: null,
    });
    expect(tick.delivered).toBe(1);
    expect(tick.backlogDue).toBeGreaterThanOrEqual(1);
    expect(tick.oldestDueAgeSeconds).toBe(0);

    const rows = await prisma.auditLog.findMany({ where: { action: 'tasks.reminders_processed' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBeNull();
    expect(rows[0]!.metadataSummary).not.toMatch(/@|R036 obs|Synthetic/i);
    const metadata = JSON.parse(rows[0]!.metadataSummary!) as { delivered: number };
    expect(metadata.delivered).toBe(1);
    expect(formatTaskReminderTickAuditMetadata(tick)).toBe(rows[0]!.metadataSummary);
  });

  it('attributes manual material ticks to the manager actor', async () => {
    const task = await prisma.task.create({
      data: {
        title: 'R036 obs manual',
        ownerUserId,
        createdByUserId: ownerUserId,
      },
    });
    await prisma.taskReminder.create({
      data: {
        taskId: task.id,
        recipientUserId,
        creatorUserId: ownerUserId,
        remindAt: BASE_NOW,
        idempotencyKey: `obs-manual:${randomUUID()}`,
      },
    });

    await service().runDueTick({
      now: BASE_NOW,
      limit: 10,
      trigger: 'manual',
      actorUserId: ownerUserId,
      auditContext: { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    });

    const rows = await prisma.auditLog.findMany({ where: { action: 'tasks.reminders_processed' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(ownerUserId);
    expect(rows[0]!.ipAddress).toBe('127.0.0.1');
  });

  it('reports backlog age and budget exhaustion at the batch boundary', async () => {
    const task = await prisma.task.create({
      data: {
        title: 'R036 obs backlog',
        ownerUserId,
        createdByUserId: ownerUserId,
      },
    });
    const older = new Date(BASE_NOW.getTime() - 10 * MINUTE);
    for (let index = 0; index < 3; index += 1) {
      await prisma.taskReminder.create({
        data: {
          taskId: task.id,
          recipientUserId,
          creatorUserId: ownerUserId,
          remindAt: new Date(older.getTime() + index * 1000),
          idempotencyKey: `obs-backlog:${index}:${randomUUID()}`,
        },
      });
    }

    const tick = await service().runDueTick({
      now: BASE_NOW,
      limit: 2,
      trigger: 'scheduler',
      actorUserId: null,
    });
    expect(tick.backlogDue).toBe(3);
    expect(tick.oldestDueAgeSeconds).toBe(600);
    expect(tick.budgetExhausted).toBe(true);
    expect(tick.delivered).toBe(2);

    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id, action: TaskEventAction.REMINDER_DELIVERED },
    });
    expect(events.every((event) => event.actorUserId === null)).toBe(true);
  });
});
