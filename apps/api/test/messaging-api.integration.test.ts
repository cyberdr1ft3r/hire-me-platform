import './setup-env.js';

import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AuthResponseSchema, MESSAGE_EDIT_WINDOW_MS } from '@hire-me/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';
import { MessagingAccessService } from '../src/messaging/messaging-access.service.js';
import { MESSAGING_CLOCK, type MessagingClock } from '../src/messaging/messaging-clock.js';
import {
  MESSAGING_RATE_LIMITS,
  type MessagingRateLimits,
} from '../src/messaging/messaging-rate-limiter.js';
import {
  ConversationMemberRole,
  ConversationMemberStatus,
  MessageStatus,
  PermissionScopeType,
  type Prisma,
  RoleName,
  UserStatus,
  UserType,
  type PrismaClient,
} from '../src/persistence/prisma/generated-client.js';
import { PrismaService } from '../src/persistence/prisma/prisma.service.js';
import { createIsolatedSchema, type IsolatedSchema } from './support/isolated-schema.js';

/**
 * Messaging PR B route-level security and concurrency matrix (Issue #179,
 * D-087, R-054). The whole Nest application runs against a freshly migrated,
 * unseeded `hm_found_*` schema, so this suite owns every role, permission, user,
 * and message it sees and never touches the seeded catalog in `public` (D-071).
 */
const PASSWORD = 'Synthetic-passphrase-179!';
const UNLIMITED: MessagingRateLimits = {
  'user-search': { limit: 1_000_000, windowMs: 60_000 },
  'conversation-create': { limit: 1_000_000, windowMs: 60_000 },
  'message-write': { limit: 1_000_000, windowMs: 60_000 },
};

let isolated: IsolatedSchema | undefined;
let prisma: PrismaClient;
let app: NestExpressApplication;
let baseUrl: string;
let passwordHash: string;
const roleIds = new Map<RoleName, string>();

/** Wall clock plus an adjustable offset, so edit-window tests never sleep. */
let clockOffsetMs = 0;
const clock: MessagingClock = { now: () => new Date(Date.now() + clockOffsetMs) };

type Actor = { id: string; token: string; email: string };
type ApiResult = { status: number; body: Record<string, unknown> };

async function createUser(
  label: string,
  options: {
    role?: RoleName | null;
    userType?: UserType;
    status?: UserStatus;
    displayName?: string;
    archived?: boolean;
  } = {},
): Promise<{ id: string; email: string }> {
  const email = `${label}-${randomUUID().slice(0, 8)}@issue179.test`.toLowerCase();
  const user = await prisma.user.create({
    data: {
      displayName: options.displayName ?? `Issue179 ${label}`,
      email,
      normalizedEmail: email,
      userType: options.userType ?? UserType.INTERNAL,
      status: options.status ?? UserStatus.ACTIVE,
      archivedAt: options.archived ? new Date() : null,
    },
  });
  const role = options.role === undefined ? RoleName.EMPLOYEE : options.role;
  if (role) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: roleIds.get(role)! } });
  }
  return { id: user.id, email };
}

async function createActor(
  label: string,
  options: Parameters<typeof createUser>[1] = {},
): Promise<Actor> {
  const user = await createUser(label, options);
  await prisma.passwordCredential.create({ data: { userId: user.id, passwordHash } });
  // The suite signs in more synthetic actors than the per-IP login limit allows.
  app.get(RateLimitService).reset();
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: PASSWORD }),
  });
  return { ...user, token: AuthResponseSchema.parse(await response.json()).accessToken };
}

async function api(actor: Actor, method: string, path: string, body?: unknown): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}/v1/messages${path}`, {
    method,
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

function code(result: ApiResult): string | undefined {
  return (result.body.error as { code?: string } | undefined)?.code;
}

type ConversationBody = {
  id: string;
  type: string;
  members: { user: { id: string }; role: string }[];
  historyAfterSequence: number;
  lastMessageSequence: number;
  lastReadSequence: number;
  unreadCount: number;
  activeMemberCount: number;
};
type MessageBody = {
  id: string;
  sequence: number;
  body: string | null;
  status: string;
  withdrawn: boolean;
  editCount: number;
  clientMessageId: string | null;
};

function conversationOf(result: ApiResult): ConversationBody {
  return result.body.conversation as ConversationBody;
}

function messageOf(result: ApiResult): MessageBody {
  return result.body.message as MessageBody;
}

async function openDirect(actor: Actor, counterpartId: string): Promise<string> {
  const result = await api(actor, 'POST', '/conversations/direct', { userId: counterpartId });
  expect(result.status).toBe(201);
  return conversationOf(result).id;
}

async function createGroup(owner: Actor, memberIds: string[], title = 'Issue179 group') {
  const result = await api(owner, 'POST', '/conversations/groups', {
    title,
    memberUserIds: memberIds,
  });
  expect(result.status).toBe(201);
  return conversationOf(result).id;
}

async function send(
  actor: Actor,
  conversationId: string,
  body = 'Hello',
  clientMessageId?: string,
) {
  return api(actor, 'POST', `/conversations/${conversationId}/messages`, {
    body,
    clientMessageId: clientMessageId ?? randomUUID(),
  });
}

async function sendOk(actor: Actor, conversationId: string, body = 'Hello'): Promise<MessageBody> {
  const result = await send(actor, conversationId, body);
  expect(result.status).toBe(201);
  return messageOf(result);
}

async function listMessages(actor: Actor, conversationId: string, query = ''): Promise<ApiResult> {
  return api(actor, 'GET', `/conversations/${conversationId}/messages${query}`);
}

function sequencesOf(result: ApiResult): number[] {
  return (result.body.messages as MessageBody[]).map((message) => message.sequence);
}

/**
 * Deterministic race: a test transaction runs `hold` and keeps its locks while
 * `start` launches the requests; the locks are released only once PostgreSQL
 * shows `waiters` backends blocked behind the holder, so every request has
 * really queued on the same lock before any of them proceeds.
 */
async function raceBehindHeldLock<T, H>(
  hold: (tx: Prisma.TransactionClient) => Promise<H>,
  waiters: number,
  start: () => Promise<T>[],
): Promise<{ held: H; results: T[] }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready!: (value: { pid: number; held: H }) => void;
  const readyPromise = new Promise<{ pid: number; held: H }>((resolve) => {
    ready = resolve;
  });
  const holder = prisma.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
      ready({ pid: row!.pid, held: await hold(tx) });
      await released;
    },
    { timeout: 60_000 },
  );
  const { pid, held } = await Promise.race([
    readyPromise,
    holder.then(() => {
      throw new Error('Lock holder finished before signalling.');
    }),
  ]);
  const pending = start();
  try {
    const deadline = Date.now() + 20_000;
    for (;;) {
      // Row-lock waiters queue behind each other, so count the whole wait chain.
      const [row] = await prisma.$queryRaw<{ blocked: number }[]>`
        WITH RECURSIVE chain AS (
          SELECT pid FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))
          UNION
          SELECT activity.pid FROM pg_stat_activity activity
          JOIN chain ON chain.pid = ANY(pg_blocking_pids(activity.pid))
        )
        SELECT count(*)::int AS "blocked" FROM chain`;
      if ((row?.blocked ?? 0) >= waiters) {
        break;
      }
      if (Date.now() > deadline) {
        throw new Error(`Only ${row?.blocked ?? 0} of ${waiters} requests queued on the lock.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    release();
  }
  await holder;
  return { held, results: await Promise.all(pending) };
}

async function extraMembers(count: number, label = 'member'): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push((await createUser(`${label}-${index}`)).id);
  }
  return ids;
}

describe('messaging API (Issue #179)', { timeout: 120_000 }, () => {
  beforeAll(async () => {
    isolated = await createIsolatedSchema();
    prisma = isolated.client;
    passwordHash = await new PasswordService().hashPassword(PASSWORD);

    const view = await prisma.permission.create({
      data: {
        code: 'messages:view',
        description: 'Synthetic',
        scopeType: PermissionScopeType.ASSIGNED,
      },
    });
    const create = await prisma.permission.create({
      data: {
        code: 'messages:create',
        description: 'Synthetic',
        scopeType: PermissionScopeType.ASSIGNED,
      },
    });
    const grants: [RoleName, string[]][] = [
      [RoleName.EMPLOYEE, [view.id, create.id]],
      [RoleName.SUPER_ADMIN, [view.id, create.id]],
      [RoleName.MANAGER, [view.id]],
      [RoleName.GUEST, []],
    ];
    for (const [name, permissionIds] of grants) {
      const role = await prisma.role.create({ data: { name, description: `Synthetic ${name}` } });
      roleIds.set(name, role.id);
      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MESSAGING_CLOCK)
      .useValue(clock)
      .overrideProvider(MESSAGING_RATE_LIMITS)
      .useValue(UNLIMITED)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await isolated?.dispose();
  }, 60_000);

  describe('actor eligibility', () => {
    it.each([UserType.CLIENT, UserType.GUEST])(
      'refuses a %s account on every route even with both messaging permissions',
      async (userType) => {
        const owner = await createActor('owner');
        const peer = await createActor('peer');
        const third = await createUser('third');
        const groupId = await createGroup(owner, [peer.id, third.id]);
        const message = await sendOk(owner, groupId);
        const external = await createActor(`external-${userType}`, {
          userType,
          role: RoleName.EMPLOYEE,
        });
        const before = {
          conversations: await prisma.conversation.count(),
          members: await prisma.conversationMember.count(),
          messages: await prisma.message.count(),
        };

        const calls: [string, string, unknown?][] = [
          ['GET', '/user-options?search=Issue179'],
          ['GET', '/unread-summary'],
          ['GET', '/conversations'],
          ['GET', `/conversations/${groupId}`],
          ['GET', `/conversations/${groupId}/messages`],
          ['GET', `/conversations/${groupId}/messages/${message.id}`],
          ['POST', '/conversations/direct', { userId: owner.id }],
          ['POST', '/conversations/groups', { title: 'x', memberUserIds: [owner.id, peer.id] }],
          [
            'POST',
            `/conversations/${groupId}/messages`,
            { body: 'x', clientMessageId: randomUUID() },
          ],
          ['PATCH', `/conversations/${groupId}/messages/${message.id}`, { body: 'x' }],
          ['POST', `/conversations/${groupId}/messages/${message.id}/withdraw`],
          ['POST', `/conversations/${groupId}/read`, { upToSequence: 1 }],
          ['PATCH', `/groups/${groupId}`, { title: 'x' }],
          ['POST', `/groups/${groupId}/members`, { userIds: [external.id] }],
          ['POST', `/groups/${groupId}/members/${peer.id}/remove`],
          ['POST', `/groups/${groupId}/members/${peer.id}/promote`],
          ['POST', `/groups/${groupId}/leave`],
          ['POST', `/groups/${groupId}/archive`],
        ];
        for (const [method, path, body] of calls) {
          const result = await api(external, method, path, body);
          expect({ path, status: result.status, code: code(result) }).toEqual({
            path,
            status: 403,
            code: 'MESSAGING_ACTOR_NOT_ELIGIBLE',
          });
        }
        expect({
          conversations: await prisma.conversation.count(),
          members: await prisma.conversationMember.count(),
          messages: await prisma.message.count(),
        }).toEqual(before);
      },
    );

    it('refuses an internal user without messaging permissions at the route guard', async () => {
      const owner = await createActor('owner');
      const peer = await createActor('peer');
      const directId = await openDirect(owner, peer.id);
      const outsider = await createActor('no-messaging', { role: RoleName.GUEST });
      for (const [method, path] of [
        ['GET', '/conversations'],
        ['GET', `/conversations/${directId}`],
        ['GET', '/user-options?search=Issue179'],
        ['POST', `/conversations/${directId}/messages`],
      ] as const) {
        const result = await api(
          outsider,
          method,
          path,
          method === 'POST' ? { body: 'x', clientMessageId: randomUUID() } : undefined,
        );
        expect([path, result.status, code(result)]).toEqual([path, 403, 'PERMISSION_DENIED']);
      }
    });

    it('lets a view-only member read but not write', async () => {
      const owner = await createActor('owner');
      const viewer = await createActor('viewer', { role: RoleName.MANAGER });
      const third = await createUser('third');
      const groupId = await createGroup(owner, [viewer.id, third.id]);
      await sendOk(owner, groupId, 'Visible');
      expect((await listMessages(viewer, groupId)).status).toBe(200);
      const write = await send(viewer, groupId);
      expect([write.status, code(write)]).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('gives SUPER_ADMIN no global conversation or message access', async () => {
      const owner = await createActor('owner');
      const peer = await createActor('peer');
      const third = await createUser('third');
      const groupId = await createGroup(owner, [peer.id, third.id]);
      const directId = await openDirect(owner, peer.id);
      const message = await sendOk(owner, groupId, 'Not for admins');
      await sendOk(owner, directId, 'Not for admins either');
      const admin = await createActor('super-admin', { role: RoleName.SUPER_ADMIN });

      const list = await api(admin, 'GET', '/conversations');
      expect(list.status).toBe(200);
      expect(list.body.conversations).toEqual([]);
      expect((await api(admin, 'GET', '/unread-summary')).body).toEqual({
        unreadConversationCount: 0,
      });
      const missing = await api(admin, 'GET', `/conversations/${randomUUID()}`);
      for (const id of [groupId, directId]) {
        const detail = await api(admin, 'GET', `/conversations/${id}`);
        expect([detail.status, detail.body]).toEqual([404, missing.body]);
        expect((await listMessages(admin, id)).body).toEqual(missing.body);
        expect((await send(admin, id)).body).toEqual(missing.body);
        expect((await api(admin, 'POST', `/groups/${id}/archive`)).body).toEqual(missing.body);
      }
      const messageDetail = await api(
        admin,
        'GET',
        `/conversations/${groupId}/messages/${message.id}`,
      );
      expect([messageDetail.status, messageDetail.body]).toEqual([404, missing.body]);
    });
  });

  describe('participant picker', () => {
    it('returns at most 20 eligible internal users with safe fields only', async () => {
      const token = `Pick${randomUUID().slice(0, 6)}`;
      const actor = await createActor('picker', { displayName: `${token} Actor` });
      const eligible: string[] = [];
      for (let index = 0; index < 22; index += 1) {
        eligible.push(
          (
            await createUser(`eligible-${index}`, {
              displayName: `${token} ${String(index).padStart(2, '0')}`,
            })
          ).id,
        );
      }
      const excluded = [
        await createUser('no-perm', { role: RoleName.GUEST, displayName: `${token} NoPerm` }),
        await createUser('suspended', {
          status: UserStatus.SUSPENDED,
          displayName: `${token} Suspended`,
        }),
        await createUser('archived', { archived: true, displayName: `${token} Archived` }),
        await createUser('client', { userType: UserType.CLIENT, displayName: `${token} Client` }),
        await createUser('guest', { userType: UserType.GUEST, displayName: `${token} Guest` }),
      ].map((user) => user.id);

      const result = await api(actor, 'GET', `/user-options?search=${token}`);
      expect(result.status).toBe(200);
      expect(Object.keys(result.body)).toEqual(['users']);
      const users = result.body.users as { id: string; displayName: string; email: string }[];
      expect(users).toHaveLength(20);
      for (const user of users) {
        expect(Object.keys(user).sort()).toEqual(['displayName', 'email', 'id']);
        expect(eligible).toContain(user.id);
        expect(excluded).not.toContain(user.id);
      }
      expect(users.map((user) => user.id)).not.toContain(actor.id);
      const names = users.map((user) => user.displayName);
      expect(names).toEqual([...names].sort());

      for (const search of ['', 'a', ' a ']) {
        const short = await api(actor, 'GET', `/user-options?search=${encodeURIComponent(search)}`);
        expect([short.status, code(short)]).toEqual([400, 'INVALID_MESSAGING_REQUEST']);
      }
      expect((await api(actor, 'GET', '/user-options')).status).toBe(400);
      expect((await api(actor, 'GET', `/user-options?search=${token}&limit=500`)).status).toBe(400);
    });

    it('matches email prefixes and scopes group-add to owners, excluding active members', async () => {
      const token = `pk${randomUUID().slice(0, 6)}`;
      const owner = await createActor('owner');
      const member = await createActor('member');
      const inGroup = await createUser(`${token}-in`);
      const outside = await createUser(`${token}-out`);
      const groupId = await createGroup(owner, [member.id, inGroup.id]);

      const byEmail = await api(owner, 'GET', `/user-options?search=${token}`);
      expect((byEmail.body.users as { id: string }[]).map((user) => user.id).sort()).toEqual(
        [inGroup.id, outside.id].sort(),
      );
      const add = await api(
        owner,
        'GET',
        `/user-options?purpose=group-add&conversationId=${groupId}&search=${token}`,
      );
      expect((add.body.users as { id: string }[]).map((user) => user.id)).toEqual([outside.id]);

      const missing = await api(
        owner,
        'GET',
        `/user-options?purpose=group-add&conversationId=${randomUUID()}&search=${token}`,
      );
      const notOwner = await api(
        member,
        'GET',
        `/user-options?purpose=group-add&conversationId=${groupId}&search=${token}`,
      );
      expect([notOwner.status, notOwner.body]).toEqual([404, missing.body]);
      expect(
        (await api(owner, 'GET', `/user-options?purpose=group-add&search=${token}`)).status,
      ).toBe(400);
    });
  });

  describe('PRIVATE conversations', () => {
    it('converges concurrent creates of the same pair on exactly one conversation', async () => {
      const first = await createActor('pair-a');
      const second = await createActor('pair-b');
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          index % 2 === 0
            ? api(first, 'POST', '/conversations/direct', { userId: second.id })
            : api(second, 'POST', '/conversations/direct', { userId: first.id }),
        ),
      );
      expect(results.map((result) => result.status)).toEqual(Array(8).fill(201));
      const ids = new Set(results.map((result) => conversationOf(result).id));
      expect(ids.size).toBe(1);
      expect(results.filter((result) => result.body.created === true)).toHaveLength(1);

      const conversations = await prisma.conversation.findMany({
        where: { members: { some: { userId: first.id } } },
        include: { members: true },
      });
      expect(conversations).toHaveLength(1);
      expect(conversations[0]!.members.map((member) => member.role)).toEqual([
        ConversationMemberRole.MEMBER,
        ConversationMemberRole.MEMBER,
      ]);
      expect(
        await prisma.auditLog.count({
          where: { action: 'messages.conversation.direct_created', entityId: [...ids][0] },
        }),
      ).toBe(1);
    });

    it('re-reads the winner when its own insert loses the directKey unique race', async () => {
      const first = await createActor('unique-a');
      const second = await createActor('unique-b');
      const access = app.get(MessagingAccessService);
      // The test transaction inserts the pair and holds it uncommitted; the HTTP
      // request finds nothing yet, blocks on the unique index, then hits P2002.
      const { held, results } = await raceBehindHeldLock(
        (tx) => access.insertDirectConversation(tx, first.id, second.id),
        1,
        () => [api(second, 'POST', '/conversations/direct', { userId: first.id })],
      );
      const [result] = results;
      expect(result!.status).toBe(201);
      expect(result!.body.created).toBe(false);
      expect(conversationOf(result!).id).toBe(held.id);
      expect(await prisma.conversation.count({ where: { directKey: held.directKey } })).toBe(1);
    });

    it('refuses self, ineligible, and external counterparts without creating rows', async () => {
      const actor = await createActor('direct');
      const before = await prisma.conversation.count();
      for (const userId of [
        actor.id,
        (await createUser('no-perm', { role: RoleName.GUEST })).id,
        (await createUser('client', { userType: UserType.CLIENT })).id,
        (await createUser('suspended', { status: UserStatus.SUSPENDED })).id,
        randomUUID(),
      ]) {
        const result = await api(actor, 'POST', '/conversations/direct', { userId });
        expect([result.status, code(result)]).toEqual([409, 'MESSAGING_USER_NOT_ELIGIBLE']);
      }
      expect(await prisma.conversation.count()).toBe(before);
    });

    it('keeps PRIVATE membership immutable and never archivable', async () => {
      const first = await createActor('immutable-a');
      const second = await createActor('immutable-b');
      const outsider = await createUser('outsider');
      const directId = await openDirect(first, second.id);
      for (const [method, path, body] of [
        ['POST', `/groups/${directId}/members`, { userIds: [outsider.id] }],
        ['POST', `/groups/${directId}/members/${second.id}/remove`],
        ['POST', `/groups/${directId}/members/${second.id}/promote`],
        ['POST', `/groups/${directId}/leave`],
        ['POST', `/groups/${directId}/archive`],
        ['PATCH', `/groups/${directId}`, { title: 'Renamed' }],
      ] as const) {
        const result = await api(first, method, path, body);
        expect([path, result.status, code(result)]).toEqual([
          path,
          409,
          'PRIVATE_CONVERSATION_IMMUTABLE',
        ]);
      }
      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: directId },
        include: { members: true },
      });
      expect(row.status).toBe('ACTIVE');
      expect(row.title).toBeNull();
      expect(row.members.map((member) => [member.status, member.role])).toEqual([
        [ConversationMemberStatus.ACTIVE, ConversationMemberRole.MEMBER],
        [ConversationMemberStatus.ACTIVE, ConversationMemberRole.MEMBER],
      ]);
    });

    it('makes a direct conversation read-only once the counterpart is inactive', async () => {
      const first = await createActor('inactive-a');
      const second = await createActor('inactive-b');
      const directId = await openDirect(first, second.id);
      await sendOk(first, directId, 'Before');
      await prisma.user.update({
        where: { id: second.id },
        data: { status: UserStatus.SUSPENDED },
      });
      const result = await send(first, directId);
      expect([result.status, code(result)]).toEqual([409, 'CONVERSATION_RECIPIENT_INACTIVE']);
      expect(sequencesOf(await listMessages(first, directId))).toEqual([1]);
    });
  });

  describe('GROUP lifecycle', () => {
    it('enforces 3-50 founding members, all eligible', async () => {
      const owner = await createActor('founder');
      const one = await createUser('one');
      const tooFew = await api(owner, 'POST', '/conversations/groups', {
        title: 'Too few',
        memberUserIds: [one.id],
      });
      expect([tooFew.status, code(tooFew)]).toEqual([400, 'INVALID_MESSAGING_REQUEST']);
      const duplicates = await api(owner, 'POST', '/conversations/groups', {
        title: 'Duplicates',
        memberUserIds: [one.id, one.id.toUpperCase(), owner.id],
      });
      expect([duplicates.status, code(duplicates)]).toEqual([400, 'GROUP_MEMBER_COUNT_INVALID']);

      const fortyNine = await extraMembers(49, 'cap');
      const full = await api(owner, 'POST', '/conversations/groups', {
        title: 'Fifty',
        memberUserIds: fortyNine,
      });
      expect(full.status).toBe(201);
      expect(conversationOf(full).activeMemberCount).toBe(50);
      const tooMany = await api(owner, 'POST', '/conversations/groups', {
        title: 'Fifty-one',
        memberUserIds: [...fortyNine, one.id],
      });
      expect(tooMany.status).toBe(400);

      const before = await prisma.conversation.count();
      const ineligible = await createUser('client', { userType: UserType.CLIENT });
      const refused = await api(owner, 'POST', '/conversations/groups', {
        title: 'Has a client',
        memberUserIds: [one.id, ineligible.id],
      });
      expect([refused.status, code(refused)]).toEqual([409, 'MESSAGING_USER_NOT_ELIGIBLE']);
      expect(await prisma.conversation.count()).toBe(before);

      const title = await api(owner, 'POST', '/conversations/groups', {
        title: '   ',
        memberUserIds: fortyNine.slice(0, 2),
      });
      expect(title.status).toBe(400);
    });

    it('never exceeds 50 active members under two concurrent adds at 49', async () => {
      const owner = await createActor('cap-owner');
      const groupId = await createGroup(owner, await extraMembers(48, 'cap49'));
      const [first, second] = await extraMembers(2, 'cap-race');
      const { results } = await raceBehindHeldLock(
        (tx) => tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${groupId}::uuid FOR UPDATE`,
        2,
        () => [
          api(owner, 'POST', `/groups/${groupId}/members`, { userIds: [first] }),
          api(owner, 'POST', `/groups/${groupId}/members`, { userIds: [second] }),
        ],
      );
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(results.map(code).filter(Boolean)).toEqual(['GROUP_MEMBER_LIMIT']);
      expect(
        await prisma.conversationMember.count({
          where: { conversationId: groupId, status: ConversationMemberStatus.ACTIVE },
        }),
      ).toBe(50);
    });

    it('applies owner authority, last-owner, and owner-protection rules', async () => {
      const owner = await createActor('owner');
      const member = await createActor('member');
      const other = await createActor('other');
      const groupId = await createGroup(owner, [member.id, other.id]);

      for (const [method, path, body] of [
        ['PATCH', `/groups/${groupId}`, { title: 'Member rename' }],
        ['POST', `/groups/${groupId}/members`, { userIds: [(await createUser('x')).id] }],
        ['POST', `/groups/${groupId}/members/${other.id}/remove`],
        ['POST', `/groups/${groupId}/members/${other.id}/promote`],
        ['POST', `/groups/${groupId}/archive`],
      ] as const) {
        const result = await api(member, method, path, body);
        expect([path, result.status, code(result)]).toEqual([path, 403, 'GROUP_OWNER_REQUIRED']);
      }

      const lastOwner = await api(owner, 'POST', `/groups/${groupId}/leave`);
      expect([lastOwner.status, code(lastOwner)]).toEqual([409, 'GROUP_LAST_OWNER']);
      const self = await api(owner, 'POST', `/groups/${groupId}/members/${owner.id}/remove`);
      expect([self.status, code(self)]).toEqual([409, 'GROUP_OWNER_NOT_REMOVABLE']);

      const promoted = await api(owner, 'POST', `/groups/${groupId}/members/${member.id}/promote`);
      expect(promoted.status).toBe(201);
      const again = await api(owner, 'POST', `/groups/${groupId}/members/${member.id}/promote`);
      expect([again.status, code(again)]).toEqual([409, 'GROUP_MEMBER_ALREADY_OWNER']);
      const removeOwner = await api(
        owner,
        'POST',
        `/groups/${groupId}/members/${member.id}/remove`,
      );
      expect([removeOwner.status, code(removeOwner)]).toEqual([409, 'GROUP_OWNER_NOT_REMOVABLE']);
      const notMember = await api(
        owner,
        'POST',
        `/groups/${groupId}/members/${randomUUID()}/remove`,
      );
      expect([notMember.status, code(notMember)]).toEqual([404, 'CONVERSATION_MEMBER_NOT_FOUND']);

      const renamed = await api(owner, 'PATCH', `/groups/${groupId}`, { title: '  Renamed  ' });
      expect(renamed.status).toBe(200);
      expect((renamed.body.conversation as { title: string }).title).toBe('Renamed');

      expect((await api(owner, 'POST', `/groups/${groupId}/leave`)).status).toBe(201);
      const gone = await api(owner, 'GET', `/conversations/${groupId}`);
      expect([gone.status, code(gone)]).toEqual([404, 'CONVERSATION_NOT_FOUND']);
      const remaining = await api(member, 'GET', `/conversations/${groupId}`);
      expect(
        conversationOf(remaining)
          .members.map((entry) => entry.user.id)
          .sort(),
      ).toEqual([member.id, other.id].sort());
    });

    it('makes an archived group read-only for sends and membership changes', async () => {
      const owner = await createActor('archive-owner');
      const member = await createActor('archive-member');
      const other = await createUser('archive-other');
      const groupId = await createGroup(owner, [member.id, other.id]);
      const message = await sendOk(member, groupId, 'Before archive');
      expect((await api(owner, 'POST', `/groups/${groupId}/archive`)).status).toBe(201);

      for (const [actor, method, path, body] of [
        [
          member,
          'POST',
          `/conversations/${groupId}/messages`,
          { body: 'x', clientMessageId: randomUUID() },
        ],
        [member, 'PATCH', `/conversations/${groupId}/messages/${message.id}`, { body: 'Edited' }],
        [member, 'POST', `/conversations/${groupId}/messages/${message.id}/withdraw`],
        [owner, 'POST', `/groups/${groupId}/members`, { userIds: [(await createUser('late')).id] }],
        [owner, 'POST', `/groups/${groupId}/members/${member.id}/remove`],
        [owner, 'POST', `/groups/${groupId}/members/${member.id}/promote`],
        [owner, 'PATCH', `/groups/${groupId}`, { title: 'Renamed' }],
        [owner, 'POST', `/groups/${groupId}/archive`],
        [member, 'POST', `/groups/${groupId}/leave`],
      ] as const) {
        const result = await api(actor, method, path, body);
        expect([path, result.status, code(result)]).toEqual([path, 409, 'CONVERSATION_ARCHIVED']);
      }
      expect(sequencesOf(await listMessages(member, groupId))).toEqual([1]);
      const archived = await api(member, 'GET', '/conversations?filter=archived');
      expect((archived.body.conversations as { id: string }[]).map((entry) => entry.id)).toContain(
        groupId,
      );
      const active = await api(member, 'GET', '/conversations');
      expect(
        (active.body.conversations as { id: string }[]).map((entry) => entry.id),
      ).not.toContain(groupId);
    });
  });

  describe('history boundary and revocation', () => {
    it('shows a late joiner only messages after the exclusive boundary and revokes on removal', async () => {
      const owner = await createActor('history-owner');
      const member = await createActor('history-member');
      const third = await createUser('history-third');
      const groupId = await createGroup(owner, [member.id, third.id]);
      const early = [];
      for (let index = 1; index <= 3; index += 1) {
        early.push(await sendOk(owner, groupId, `Early ${index}`));
      }

      const late = await createActor('late-joiner');
      const added = await api(owner, 'POST', `/groups/${groupId}/members`, { userIds: [late.id] });
      expect(added.status).toBe(201);
      const lateView = await api(late, 'GET', `/conversations/${groupId}`);
      expect(conversationOf(lateView).historyAfterSequence).toBe(3);
      expect(conversationOf(lateView).unreadCount).toBe(0);
      expect(sequencesOf(await listMessages(late, groupId))).toEqual([]);
      expect(sequencesOf(await listMessages(late, groupId, '?after=0'))).toEqual([]);

      const missingMessage = await api(
        late,
        'GET',
        `/conversations/${groupId}/messages/${randomUUID()}`,
      );
      expect([missingMessage.status, code(missingMessage)]).toEqual([404, 'MESSAGE_NOT_FOUND']);
      const atBoundary = await api(
        late,
        'GET',
        `/conversations/${groupId}/messages/${early[2]!.id}`,
      );
      expect([atBoundary.status, atBoundary.body]).toEqual([404, missingMessage.body]);
      const edit = await api(late, 'PATCH', `/conversations/${groupId}/messages/${early[2]!.id}`, {
        body: 'x',
      });
      expect([edit.status, edit.body]).toEqual([404, missingMessage.body]);

      const fourth = await sendOk(member, groupId, 'After join');
      expect(sequencesOf(await listMessages(late, groupId))).toEqual([4]);
      expect(conversationOf(await api(late, 'GET', `/conversations/${groupId}`)).unreadCount).toBe(
        1,
      );
      // Reading "up to 0" cannot pull the cursor below the join boundary.
      const read = await api(late, 'POST', `/conversations/${groupId}/read`, { upToSequence: 0 });
      expect(read.body).toEqual({ lastReadSequence: 3, unreadCount: 1 });
      expect((await api(late, 'GET', '/unread-summary')).body).toEqual({
        unreadConversationCount: 1,
      });

      // Removal revokes everything immediately, including what they saw as a member.
      expect(
        (await api(owner, 'POST', `/groups/${groupId}/members/${late.id}/remove`)).status,
      ).toBe(201);
      const missingConversation = await api(late, 'GET', `/conversations/${randomUUID()}`);
      for (const [method, path, body] of [
        ['GET', `/conversations/${groupId}`],
        ['GET', `/conversations/${groupId}/messages`],
        ['GET', `/conversations/${groupId}/messages/${fourth.id}`],
        [
          'POST',
          `/conversations/${groupId}/messages`,
          { body: 'x', clientMessageId: randomUUID() },
        ],
        ['POST', `/conversations/${groupId}/read`, { upToSequence: 4 }],
        ['POST', `/groups/${groupId}/leave`],
      ] as const) {
        const result = await api(late, method, path, body);
        expect([path, result.status, result.body]).toEqual([path, 404, missingConversation.body]);
      }
      const list = await api(late, 'GET', '/conversations');
      expect((list.body.conversations as { id: string }[]).map((entry) => entry.id)).not.toContain(
        groupId,
      );
      expect((await api(late, 'GET', '/unread-summary')).body).toEqual({
        unreadConversationCount: 0,
      });

      // Re-add: a fresh exclusive boundary; earlier messages, including #4, stay hidden.
      await sendOk(owner, groupId, 'While away 5');
      await sendOk(owner, groupId, 'While away 6');
      const readded = await api(owner, 'POST', `/groups/${groupId}/members`, {
        userIds: [late.id],
      });
      expect(readded.status).toBe(201);
      expect(
        conversationOf(await api(late, 'GET', `/conversations/${groupId}`)).historyAfterSequence,
      ).toBe(6);
      expect(sequencesOf(await listMessages(late, groupId))).toEqual([]);
      const old = await api(late, 'GET', `/conversations/${groupId}/messages/${fourth.id}`);
      expect([old.status, old.body]).toEqual([404, missingMessage.body]);
      await sendOk(owner, groupId, 'After return');
      expect(sequencesOf(await listMessages(late, groupId))).toEqual([7]);

      const audit = await prisma.auditLog.findMany({
        where: { entityId: groupId, targetUserId: late.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      });
      expect(audit.map((entry) => entry.action)).toEqual([
        'messages.group.member_added',
        'messages.group.member_removed',
        'messages.group.member_readded',
      ]);
    });

    it('revokes access immediately when a member leaves', async () => {
      const owner = await createActor('leave-owner');
      const leaver = await createActor('leaver');
      const third = await createUser('leave-third');
      const groupId = await createGroup(owner, [leaver.id, third.id]);
      const message = await sendOk(owner, groupId, 'Seen before leaving');
      expect((await api(leaver, 'POST', `/groups/${groupId}/leave`)).status).toBe(201);
      const missing = await api(leaver, 'GET', `/conversations/${randomUUID()}`);
      expect((await api(leaver, 'GET', `/conversations/${groupId}`)).body).toEqual(missing.body);
      expect(
        (await api(leaver, 'GET', `/conversations/${groupId}/messages/${message.id}`)).body,
      ).toEqual(missing.body);
      expect((await send(leaver, groupId)).body).toEqual(missing.body);
    });

    it('uses one not-found envelope for missing, foreign, and malformed-scope objects', async () => {
      const owner = await createActor('envelope-owner');
      const peer = await createActor('envelope-peer');
      const stranger = await createActor('envelope-stranger');
      const directId = await openDirect(owner, peer.id);
      const message = await sendOk(owner, directId, 'Private');
      const otherDirect = await openDirect(stranger, owner.id);

      const missing = await api(stranger, 'GET', `/conversations/${randomUUID()}`);
      expect(missing).toEqual({
        status: 404,
        body: { error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found.' } },
      });
      expect(await api(stranger, 'GET', `/conversations/${directId}`)).toEqual(missing);
      expect(
        await api(stranger, 'GET', `/conversations/${directId}/messages/${message.id}`),
      ).toEqual(missing);
      // A real message ID under a conversation the actor does belong to.
      const crossed = await api(
        stranger,
        'GET',
        `/conversations/${otherDirect}/messages/${message.id}`,
      );
      expect(crossed).toEqual({
        status: 404,
        body: { error: { code: 'MESSAGE_NOT_FOUND', message: 'Message was not found.' } },
      });
      expect(
        await api(stranger, 'GET', `/conversations/${otherDirect}/messages/${randomUUID()}`),
      ).toEqual(crossed);
    });
  });

  describe('sending', () => {
    it('allocates strictly increasing, gap-free sequences under concurrent sends', async () => {
      const owner = await createActor('seq-owner');
      const second = await createActor('seq-second');
      const third = await createActor('seq-third');
      const groupId = await createGroup(owner, [second.id, third.id]);
      const results = await Promise.all(
        [owner, second, third].flatMap((actor) =>
          Array.from({ length: 6 }, (_, index) => send(actor, groupId, `Burst ${index}`)),
        ),
      );
      expect(results.every((result) => result.status === 201)).toBe(true);
      const sequences = results.map((result) => messageOf(result).sequence).sort((a, b) => a - b);
      expect(sequences).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: groupId } });
      expect(conversation.lastMessageSequence).toBe(18n);
      expect(sequencesOf(await listMessages(owner, groupId, '?limit=50'))).toEqual(sequences);
      expect(await prisma.notification.count()).toBe(0);

      // Deterministic: three sends all queued on the held Conversation lock.
      const { results: queued } = await raceBehindHeldLock(
        (tx) => tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${groupId}::uuid FOR UPDATE`,
        3,
        () => [owner, second, third].map((actor) => send(actor, groupId, 'Queued')),
      );
      expect(queued.map((result) => messageOf(result).sequence).sort((a, b) => a - b)).toEqual([
        19, 20, 21,
      ]);
    });

    it('is idempotent per conversation, author, and clientMessageId', async () => {
      const owner = await createActor('idem-owner');
      const peer = await createActor('idem-peer');
      const third = await createUser('idem-third');
      const groupId = await createGroup(owner, [peer.id, third.id]);
      const directId = await openDirect(owner, peer.id);
      const clientMessageId = randomUUID();

      const racing = await Promise.all(
        Array.from({ length: 5 }, () => send(owner, groupId, 'Once', clientMessageId)),
      );
      expect(racing.every((result) => result.status === 201)).toBe(true);
      expect(new Set(racing.map((result) => messageOf(result).id)).size).toBe(1);
      expect(racing.filter((result) => result.body.replayed === false)).toHaveLength(1);
      expect(messageOf(racing[0]!).clientMessageId).toBe(clientMessageId);

      const retry = await send(owner, groupId, 'Different text', clientMessageId.toUpperCase());
      expect(retry.body.replayed).toBe(true);
      expect(messageOf(retry).body).toBe('Once');
      expect(
        await prisma.message.count({ where: { conversationId: groupId, clientMessageId } }),
      ).toBe(1);

      // Another author in the same conversation, and the same author elsewhere.
      const otherAuthor = await send(peer, groupId, 'Mine', clientMessageId);
      expect([otherAuthor.status, otherAuthor.body.replayed]).toEqual([201, false]);
      expect(messageOf(otherAuthor).sequence).toBe(2);
      const otherConversation = await send(owner, directId, 'Elsewhere', clientMessageId);
      expect([otherConversation.status, otherConversation.body.replayed]).toEqual([201, false]);

      // Peer sees the owner's message without the owner's client identifier.
      const peerView = await listMessages(peer, groupId);
      const ownMessage = (peerView.body.messages as MessageBody[]).find(
        (entry) => entry.sequence === 1,
      );
      expect(ownMessage?.clientMessageId).toBeNull();
    });

    it('rejects blank, oversized, and control-character bodies', async () => {
      const owner = await createActor('body-owner');
      const peer = await createActor('body-peer');
      const directId = await openDirect(owner, peer.id);
      for (const body of ['', '   ', 'x'.repeat(4001), 'bell\u0007']) {
        const result = await send(owner, directId, body);
        expect([result.status, code(result)]).toEqual([400, 'INVALID_MESSAGING_REQUEST']);
      }
      const trimmed = await sendOk(owner, directId, '  line one\nline two  ');
      expect(trimmed.body).toBe('line one\nline two');
      const bad = await api(owner, 'POST', `/conversations/${directId}/messages`, {
        body: 'x',
        clientMessageId: 'not-a-uuid',
      });
      expect(bad.status).toBe(400);
    });
  });

  describe('read cursor', () => {
    it('is monotonic and never passes the last message', async () => {
      const owner = await createActor('cursor-owner');
      const reader = await createActor('cursor-reader');
      const directId = await openDirect(owner, reader.id);
      for (let index = 1; index <= 4; index += 1) {
        await sendOk(owner, directId, `Message ${index}`);
      }
      const read = (upToSequence: number) =>
        api(reader, 'POST', `/conversations/${directId}/read`, { upToSequence });
      expect((await read(2)).body).toEqual({ lastReadSequence: 2, unreadCount: 2 });
      expect((await read(1)).body).toEqual({ lastReadSequence: 2, unreadCount: 2 });
      expect((await read(999)).body).toEqual({ lastReadSequence: 4, unreadCount: 0 });
      expect((await read(-1)).status).toBe(400);

      await sendOk(owner, directId, 'Message 5');
      await sendOk(owner, directId, 'Message 6');
      const concurrent = await Promise.all([read(6), read(5), read(3), read(6), read(1)]);
      expect(concurrent.every((result) => result.status === 201)).toBe(true);
      const member = await prisma.conversationMember.findFirstOrThrow({
        where: { conversationId: directId, userId: reader.id },
      });
      expect(member.lastReadSequence).toBe(6n);

      const unread = await api(reader, 'GET', '/conversations?filter=unread');
      expect(
        (unread.body.conversations as { id: string }[]).map((entry) => entry.id),
      ).not.toContain(directId);
      await sendOk(owner, directId, 'Message 7');
      const unreadAgain = await api(reader, 'GET', '/conversations?filter=unread');
      const summary = (
        unreadAgain.body.conversations as { id: string; unreadCount: number }[]
      ).find((entry) => entry.id === directId);
      expect(summary?.unreadCount).toBe(1);
    });
  });

  describe('edit and withdraw', () => {
    it('allows author edits within 15 minutes and up to 10 times, each with one revision', async () => {
      const author = await createActor('edit-author');
      const peer = await createActor('edit-peer');
      const directId = await openDirect(author, peer.id);
      const original = await sendOk(author, directId, 'Version 0');

      const foreign = await api(
        peer,
        'PATCH',
        `/conversations/${directId}/messages/${original.id}`,
        {
          body: 'Hijack',
        },
      );
      const missing = await api(
        peer,
        'PATCH',
        `/conversations/${directId}/messages/${randomUUID()}`,
        {
          body: 'Hijack',
        },
      );
      expect([foreign.status, foreign.body]).toEqual([404, missing.body]);
      expect(code(missing)).toBe('MESSAGE_NOT_FOUND');
      const unchanged = await api(
        author,
        'PATCH',
        `/conversations/${directId}/messages/${original.id}`,
        {
          body: 'Version 0',
        },
      );
      expect([unchanged.status, code(unchanged)]).toEqual([400, 'MESSAGE_EDIT_UNCHANGED']);

      try {
        clockOffsetMs = MESSAGE_EDIT_WINDOW_MS - 60_000;
        for (let index = 1; index <= 10; index += 1) {
          const edited = await api(
            author,
            'PATCH',
            `/conversations/${directId}/messages/${original.id}`,
            {
              body: `Version ${index}`,
            },
          );
          expect(edited.status).toBe(200);
          expect(messageOf(edited)).toMatchObject({
            body: `Version ${index}`,
            status: 'EDITED',
            editCount: index,
            sequence: original.sequence,
          });
        }
        const eleventh = await api(
          author,
          'PATCH',
          `/conversations/${directId}/messages/${original.id}`,
          {
            body: 'Version 11',
          },
        );
        expect([eleventh.status, code(eleventh)]).toEqual([409, 'MESSAGE_EDIT_LIMIT_REACHED']);
      } finally {
        clockOffsetMs = 0;
      }

      const revisions = await prisma.messageRevision.findMany({
        where: { messageId: original.id },
        orderBy: { revisionNumber: 'asc' },
      });
      expect(revisions.map((revision) => [revision.revisionNumber, revision.previousBody])).toEqual(
        Array.from({ length: 10 }, (_, index) => [index + 1, `Version ${index}`]),
      );
      expect(revisions.every((revision) => revision.editedByUserId === author.id)).toBe(true);
      await expect(
        prisma.messageRevision.update({
          where: { id: revisions[0]!.id },
          data: { previousBody: 'Rewritten' },
        }),
      ).rejects.toThrow('HIREME_MESSAGE_REVISION_IMMUTABLE');
      const stored = await prisma.message.findUniqueOrThrow({ where: { id: original.id } });
      expect([stored.body, stored.editCount]).toEqual(['Version 10', 10]);
    });

    it('rejects an edit after the 15-minute window using the injected clock', async () => {
      const author = await createActor('window-author');
      const peer = await createActor('window-peer');
      const directId = await openDirect(author, peer.id);
      const message = await sendOk(author, directId, 'Timed');
      try {
        clockOffsetMs = MESSAGE_EDIT_WINDOW_MS + 1_000;
        const late = await api(
          author,
          'PATCH',
          `/conversations/${directId}/messages/${message.id}`,
          {
            body: 'Too late',
          },
        );
        expect([late.status, code(late)]).toEqual([409, 'MESSAGE_EDIT_WINDOW_EXPIRED']);
      } finally {
        clockOffsetMs = 0;
      }
      expect(await prisma.messageRevision.count({ where: { messageId: message.id } })).toBe(0);
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).body).toBe(
        'Timed',
      );
    });

    it('withdraws to a tombstone without deleting the row, sequence, or revisions', async () => {
      const author = await createActor('withdraw-author');
      const peer = await createActor('withdraw-peer');
      const directId = await openDirect(author, peer.id);
      const message = await sendOk(author, directId, 'Draft text');
      await api(author, 'PATCH', `/conversations/${directId}/messages/${message.id}`, {
        body: 'Final text',
      });
      await sendOk(peer, directId, 'Reply');

      const foreign = await api(
        peer,
        'POST',
        `/conversations/${directId}/messages/${message.id}/withdraw`,
      );
      expect([foreign.status, code(foreign)]).toEqual([404, 'MESSAGE_NOT_FOUND']);
      const withdrawn = await api(
        author,
        'POST',
        `/conversations/${directId}/messages/${message.id}/withdraw`,
      );
      expect(withdrawn.status).toBe(201);
      expect(messageOf(withdrawn)).toMatchObject({
        body: null,
        withdrawn: true,
        status: 'ARCHIVED',
      });

      for (const viewer of [author, peer]) {
        const detail = await api(
          viewer,
          'GET',
          `/conversations/${directId}/messages/${message.id}`,
        );
        expect(messageOf(detail)).toMatchObject({ body: null, withdrawn: true, sequence: 1 });
        const page = await listMessages(viewer, directId);
        expect(sequencesOf(page)).toEqual([1, 2]);
        expect(JSON.stringify(page.body)).not.toContain('Final text');
        expect(JSON.stringify(page.body)).not.toContain('Draft text');
      }
      const again = await api(
        author,
        'POST',
        `/conversations/${directId}/messages/${message.id}/withdraw`,
      );
      expect([again.status, code(again)]).toEqual([409, 'MESSAGE_WITHDRAWN']);
      const edit = await api(author, 'PATCH', `/conversations/${directId}/messages/${message.id}`, {
        body: 'Revive',
      });
      expect([edit.status, code(edit)]).toEqual([409, 'MESSAGE_WITHDRAWN']);

      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect([row.status, row.sequence, row.body, row.archivedByUserId]).toEqual([
        MessageStatus.ARCHIVED,
        1n,
        'Final text',
        author.id,
      ]);
      expect(await prisma.messageRevision.count({ where: { messageId: message.id } })).toBe(1);
    });
  });

  describe('audit', () => {
    it('records metadata-only events with no bodies, titles, or search text', async () => {
      const marker = `SECRET${randomUUID().replace(/-/g, '')}`;
      const owner = await createActor('audit-owner');
      const member = await createActor('audit-member');
      const third = await createUser('audit-third');
      const groupId = await createGroup(owner, [member.id, third.id], `${marker} title`);
      await api(owner, 'PATCH', `/groups/${groupId}`, { title: `${marker} renamed` });
      await api(owner, 'GET', `/user-options?search=${marker.slice(0, 20)}`);
      const message = await sendOk(member, groupId, `${marker} body`);
      await api(member, 'PATCH', `/conversations/${groupId}/messages/${message.id}`, {
        body: `${marker} edited`,
      });
      await api(member, 'POST', `/conversations/${groupId}/messages/${message.id}/withdraw`);
      await api(owner, 'POST', `/groups/${groupId}/members/${member.id}/promote`);
      await api(owner, 'POST', `/groups/${groupId}/archive`);

      const rows = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'messages.' } },
      });
      for (const row of rows) {
        expect(JSON.stringify(row)).not.toContain(marker);
        expect(row.metadataSummary ?? '').not.toMatch(/@issue179\.test/);
      }
      const forGroup = rows.filter(
        (row) =>
          row.entityId === groupId ||
          (JSON.parse(row.metadataSummary ?? '{}') as { conversationId?: string })
            .conversationId === groupId,
      );
      expect(new Set(forGroup.map((row) => row.action))).toEqual(
        new Set([
          'messages.group.created',
          'messages.group.renamed',
          'messages.message.sent',
          'messages.message.edited',
          'messages.message.withdrawn',
          'messages.group.owner_promoted',
          'messages.group.archived',
        ]),
      );
      const edited = forGroup.find((row) => row.action === 'messages.message.edited');
      expect(JSON.parse(edited!.metadataSummary!)).toEqual({
        conversationId: groupId,
        messageId: message.id,
        revisionNumber: 1,
      });
    });
  });

  describe('conversation list', () => {
    it('pages active memberships by last activity with an opaque cursor', async () => {
      const actor = await createActor('lister');
      const ids: string[] = [];
      for (let index = 0; index < 27; index += 1) {
        const peer = await createUser(`list-peer-${index}`);
        const id = await openDirect(actor, peer.id);
        clockOffsetMs = index * 1_000;
        await sendOk(actor, id, `Hello ${index}`);
        ids.push(id);
      }
      clockOffsetMs = 0;
      // Opened by someone else with no message yet: not listed for the actor.
      const opener = await createActor('opener');
      const silent = await openDirect(opener, actor.id);

      const first = await api(actor, 'GET', '/conversations');
      const firstIds = (first.body.conversations as { id: string }[]).map((entry) => entry.id);
      expect(firstIds).toEqual([...ids].reverse().slice(0, 25));
      expect(typeof first.body.nextCursor).toBe('string');
      const second = await api(
        actor,
        'GET',
        `/conversations?cursor=${encodeURIComponent(first.body.nextCursor as string)}`,
      );
      expect((second.body.conversations as { id: string }[]).map((entry) => entry.id)).toEqual(
        [...ids].reverse().slice(25),
      );
      expect(second.body.nextCursor).toBeNull();
      expect([...firstIds, ...ids]).not.toContain(silent);
      expect((await api(actor, 'GET', '/conversations?cursor=bogus')).status).toBe(400);
      expect((await api(opener, 'GET', `/conversations/${silent}`)).status).toBe(200);
    });
  });
});
