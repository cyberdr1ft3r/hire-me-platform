import { randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MessagingAccessService } from '../src/messaging/messaging-access.service.js';
import { canonicalDirectKey } from '../src/messaging/messaging-invariants.js';
import {
  ConversationMemberRole,
  ConversationMemberStatus,
  ConversationType,
  MessageStatus,
  PermissionScopeType,
  Prisma,
  RoleName,
  UserStatus,
  UserType,
  type PrismaClient,
} from '../src/persistence/prisma/generated-client.js';
import type { PrismaService } from '../src/persistence/prisma/prisma.service.js';
import { createIsolatedSchema, type IsolatedSchema } from './support/isolated-schema.js';
import { raceWhileHoldingRowLock } from './support/postgres-row-lock-barrier.js';

/**
 * Messaging persistence, constraint, and access foundation (Issue #171, D-087,
 * R-053, R-054). Runs in its own freshly migrated, unseeded `hm_found_*` schema,
 * so it owns every role, permission, and user it sees and never touches the
 * seeded catalog in `public`.
 */
let isolated: IsolatedSchema | undefined;
let prisma: PrismaClient;
let access: MessagingAccessService;
let messagingRoleId: string;
let plainRoleId: string;

type ConversationWithMembers = Prisma.ConversationGetPayload<{ include: { members: true } }>;

function errorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }
  return undefined;
}

function responseCode(error: unknown): string | undefined {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return (response as { error?: { code?: string } } | undefined)?.error?.code;
}

async function expectCheckViolation(promise: Promise<unknown>, constraint: string): Promise<void> {
  await expect(promise).rejects.toThrow(constraint);
}

async function createUser(
  label: string,
  options: { userType?: UserType; status?: UserStatus; roleId?: string | null } = {},
): Promise<string> {
  const email = `${label}-${randomUUID().slice(0, 8)}@issue171.test`;
  const user = await prisma.user.create({
    data: {
      displayName: `Issue171 ${label}`,
      email,
      normalizedEmail: email,
      userType: options.userType ?? UserType.INTERNAL,
      status: options.status ?? UserStatus.ACTIVE,
    },
  });
  const roleId = options.roleId === undefined ? messagingRoleId : options.roleId;
  if (roleId) {
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
  }
  return user.id;
}

async function createGroup(memberCount: number): Promise<{
  conversation: ConversationWithMembers;
  creator: string;
}> {
  const creator = await createUser('group-owner');
  const others: string[] = [];
  for (let index = 1; index < memberCount; index += 1) {
    others.push(await createUser(`group-member-${index}`));
  }
  const conversation = await prisma.$transaction((tx) =>
    access.insertGroupConversation(tx, creator, others, 'Synthetic group'),
  );
  return { conversation, creator };
}

/** Appends a message the way PR B will: under the Conversation lock, next sequence. */
async function appendMessage(conversationId: string, authorUserId: string, body = 'Hello') {
  return prisma.$transaction(async (tx) => {
    const locked = await access.lockConversation(tx, conversationId);
    const sequence = locked!.lastMessageSequence + 1n;
    const message = await tx.message.create({
      data: { conversationId, authorUserId, sequence, clientMessageId: randomUUID(), body },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageSequence: sequence, lastMessageAt: new Date() },
    });
    return message;
  });
}

describe('messaging foundation (Issue #171)', () => {
  beforeAll(async () => {
    isolated = await createIsolatedSchema();
    prisma = isolated.client;
    access = new MessagingAccessService(prisma as unknown as PrismaService);

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
    const messagingRole = await prisma.role.create({
      data: { name: RoleName.EMPLOYEE, description: 'Synthetic messaging role' },
    });
    messagingRoleId = messagingRole.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: messagingRole.id, permissionId: view.id },
        { roleId: messagingRole.id, permissionId: create.id },
      ],
    });
    // A role that holds messaging permissions but is meant for external accounts:
    // models a manual mis-grant to a CLIENT/GUEST user.
    const externalRole = await prisma.role.create({
      data: { name: RoleName.CLIENT_USER, description: 'Synthetic mis-granted role' },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: externalRole.id, permissionId: view.id },
        { roleId: externalRole.id, permissionId: create.id },
      ],
    });
    plainRoleId = externalRole.id;
  }, 180_000);

  afterAll(async () => {
    await isolated?.dispose();
  }, 60_000);

  describe('internal-actor defense in depth', () => {
    it('accepts an active internal actor', async () => {
      const actor = await createUser('internal');
      await expect(access.assertInternalActor(actor)).resolves.toBeUndefined();
    });

    it.each([UserType.CLIENT, UserType.GUEST])(
      'rejects a %s account even when it was manually granted both messaging permissions',
      async (userType) => {
        const external = await createUser(`external-${userType}`, {
          userType,
          roleId: plainRoleId,
        });
        const effective = await prisma.rolePermission.findMany({
          where: { roleId: plainRoleId, archivedAt: null },
          select: { permission: { select: { code: true } } },
        });
        expect(effective.map((row) => row.permission.code).sort()).toEqual([
          'messages:create',
          'messages:view',
        ]);

        const refusal = access.assertInternalActor(external);
        await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
        await refusal.catch((error: unknown) =>
          expect(responseCode(error)).toBe('MESSAGING_ACTOR_NOT_ELIGIBLE'),
        );

        // They cannot be chosen as a participant either.
        const internal = await createUser('internal-starter');
        await expect(
          prisma.$transaction((tx) => access.insertDirectConversation(tx, internal, external)),
        ).rejects.toBeInstanceOf(ConflictException);
        // And they cannot start one.
        await expect(
          prisma.$transaction((tx) => access.insertDirectConversation(tx, external, internal)),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it('rejects suspended, archived, and unknown actors', async () => {
      const suspended = await createUser('suspended', { status: UserStatus.SUSPENDED });
      const archived = await createUser('archived');
      await prisma.user.update({ where: { id: archived }, data: { archivedAt: new Date() } });
      for (const actor of [suspended, archived, randomUUID(), 'not-a-uuid']) {
        await expect(access.assertInternalActor(actor)).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('requires participants to hold effective messages:view', async () => {
      const actor = await createUser('starter');
      const noRole = await createUser('no-role', { roleId: null });
      await expect(
        prisma.$transaction((tx) => access.insertDirectConversation(tx, actor, noRole)),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('PRIVATE conversations', () => {
    it('creates exactly two canonical MEMBER rows under one canonical directKey', async () => {
      const a = await createUser('direct-a');
      const b = await createUser('direct-b');
      const conversation = await prisma.$transaction((tx) =>
        access.insertDirectConversation(tx, b, a),
      );
      expect(conversation.type).toBe(ConversationType.PRIVATE);
      expect(conversation.title).toBeNull();
      expect(conversation.directKey).toBe(canonicalDirectKey(a, b));
      expect(conversation.members).toHaveLength(2);
      expect(conversation.members.map((member) => member.role)).toEqual([
        ConversationMemberRole.MEMBER,
        ConversationMemberRole.MEMBER,
      ]);
      expect(conversation.members.map((member) => member.historyAfterSequence)).toEqual([0n, 0n]);

      // Either ordering of the pair is the same conversation.
      await expect(
        prisma.$transaction((tx) => access.insertDirectConversation(tx, a, b)),
      ).rejects.toSatisfy((error: unknown) => errorCode(error) === 'P2002');
    });

    it('lets exactly one of two concurrent creates of the same pair win', async () => {
      const a = await createUser('race-a');
      const b = await createUser('race-b');
      const results = await Promise.allSettled([
        prisma.$transaction((tx) => access.insertDirectConversation(tx, a, b)),
        prisma.$transaction((tx) => access.insertDirectConversation(tx, b, a)),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(errorCode((rejected as PromiseRejectedResult).reason)).toBe('P2002');
      await expect(
        prisma.conversation.count({ where: { directKey: canonicalDirectKey(a, b) } }),
      ).resolves.toBe(1);
    });

    it('never allows membership changes on a PRIVATE conversation', async () => {
      const a = await createUser('immutable-a');
      const b = await createUser('immutable-b');
      const c = await createUser('immutable-c');
      const direct = await prisma.$transaction((tx) => access.insertDirectConversation(tx, a, b));
      await expect(
        prisma.$transaction(async (tx) => {
          const locked = await access.lockConversation(tx, direct.id);
          return access.addGroupMembersLocked(tx, locked!, [c]);
        }),
      ).rejects.toThrow('PRIVATE conversation membership is immutable.');
    });
  });

  describe('single-row CHECK and unique constraints', () => {
    it('enforces the PRIVATE / GROUP column shape', async () => {
      const a = await createUser('shape-a');
      const b = await createUser('shape-b');
      const key = canonicalDirectKey(a, b);
      const [low, high] = key.split(':');
      await expectCheckViolation(
        prisma.conversation.create({
          data: { type: ConversationType.PRIVATE, directKey: key, title: 'x', createdByUserId: a },
        }),
        'Conversation_type_shape_check',
      );
      await expectCheckViolation(
        prisma.conversation.create({
          data: {
            type: ConversationType.PRIVATE,
            directKey: `${high}:${low}`,
            createdByUserId: a,
          },
        }),
        'Conversation_type_shape_check',
      );
      await expectCheckViolation(
        prisma.conversation.create({
          data: { type: ConversationType.PRIVATE, directKey: `${low}:${low}`, createdByUserId: a },
        }),
        'Conversation_type_shape_check',
      );
      await expectCheckViolation(
        prisma.conversation.create({
          data: { type: ConversationType.PRIVATE, directKey: 'alice:bob', createdByUserId: a },
        }),
        'Conversation_type_shape_check',
      );
      await expectCheckViolation(
        prisma.conversation.create({
          data: { type: ConversationType.PRIVATE, createdByUserId: a },
        }),
        'Conversation_type_shape_check',
      );
      for (const title of [null, '', ' padded ', 'x'.repeat(121)]) {
        await expectCheckViolation(
          prisma.conversation.create({
            data: { type: ConversationType.GROUP, title, createdByUserId: a },
          }),
          'Conversation_type_shape_check',
        );
      }
      await expectCheckViolation(
        prisma.conversation.create({
          data: { type: ConversationType.GROUP, title: 'ok', directKey: key, createdByUserId: a },
        }),
        'Conversation_type_shape_check',
      );
      await expect(
        prisma.conversation.create({
          data: { type: ConversationType.GROUP, title: 'x'.repeat(120), createdByUserId: a },
        }),
      ).resolves.toBeTruthy();
    });

    it('allows only GROUP archival, with its actor', async () => {
      const a = await createUser('archive-a');
      const b = await createUser('archive-b');
      const direct = await prisma.$transaction((tx) => access.insertDirectConversation(tx, a, b));
      await expectCheckViolation(
        prisma.conversation.update({
          where: { id: direct.id },
          data: { status: 'ARCHIVED', archivedAt: new Date(), archivedByUserId: a },
        }),
        'Conversation_archive_shape_check',
      );
      const { conversation, creator } = await createGroup(3);
      await expectCheckViolation(
        prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'ARCHIVED', archivedAt: new Date() },
        }),
        'Conversation_archive_shape_check',
      );
      await expect(
        prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'ARCHIVED', archivedAt: new Date(), archivedByUserId: creator },
        }),
      ).resolves.toBeTruthy();
    });

    it('bounds message bodies to 1-4000 characters and rejects blank bodies', async () => {
      const { conversation, creator } = await createGroup(3);
      const base = { conversationId: conversation.id, authorUserId: creator };
      for (const body of ['', '   ', 'x'.repeat(4001)]) {
        await expectCheckViolation(
          prisma.message.create({
            data: { ...base, sequence: 1n, clientMessageId: randomUUID(), body },
          }),
          'Message_body_length_check',
        );
      }
      await expect(
        prisma.message.create({
          data: { ...base, sequence: 1n, clientMessageId: randomUUID(), body: 'x'.repeat(4000) },
        }),
      ).resolves.toBeTruthy();
    });

    it('keeps message sequences unique and positive per conversation', async () => {
      const { conversation, creator } = await createGroup(3);
      const other = await createGroup(3);
      const data = { conversationId: conversation.id, authorUserId: creator, body: 'Hi' };
      await prisma.message.create({
        data: { ...data, sequence: 1n, clientMessageId: randomUUID() },
      });
      await expect(
        prisma.message.create({ data: { ...data, sequence: 1n, clientMessageId: randomUUID() } }),
      ).rejects.toSatisfy((error: unknown) => errorCode(error) === 'P2002');
      await expectCheckViolation(
        prisma.message.create({ data: { ...data, sequence: 0n, clientMessageId: randomUUID() } }),
        'Message_sequence_positive_check',
      );
      // The same sequence in another conversation is independent.
      await expect(
        prisma.message.create({
          data: {
            conversationId: other.conversation.id,
            authorUserId: other.creator,
            body: 'Hi',
            sequence: 1n,
            clientMessageId: randomUUID(),
          },
        }),
      ).resolves.toBeTruthy();
    });

    it('makes clientMessageId idempotent per conversation and author', async () => {
      const { conversation, creator } = await createGroup(3);
      const member = conversation.members.find((row) => row.userId !== creator)!.userId;
      const clientMessageId = randomUUID();
      const data = { conversationId: conversation.id, body: 'Retry me', clientMessageId };
      await prisma.message.create({ data: { ...data, authorUserId: creator, sequence: 1n } });
      await expect(
        prisma.message.create({ data: { ...data, authorUserId: creator, sequence: 2n } }),
      ).rejects.toSatisfy((error: unknown) => errorCode(error) === 'P2002');
      // Another author may coincidentally reuse the same client id.
      await expect(
        prisma.message.create({ data: { ...data, authorUserId: member, sequence: 2n } }),
      ).resolves.toBeTruthy();
    });

    it('keeps edit and archive metadata consistent with the message status', async () => {
      const { conversation, creator } = await createGroup(3);
      const base = { conversationId: conversation.id, authorUserId: creator, body: 'Hi' };
      await expectCheckViolation(
        prisma.message.create({
          data: {
            ...base,
            sequence: 1n,
            clientMessageId: randomUUID(),
            editedAt: new Date(),
          },
        }),
        'Message_edit_shape_check',
      );
      await expectCheckViolation(
        prisma.message.create({
          data: {
            ...base,
            sequence: 1n,
            clientMessageId: randomUUID(),
            status: MessageStatus.EDITED,
            editCount: 11,
            editedAt: new Date(),
          },
        }),
        'Message_edit_shape_check',
      );
      await expectCheckViolation(
        prisma.message.create({
          data: {
            ...base,
            sequence: 1n,
            clientMessageId: randomUUID(),
            status: MessageStatus.ARCHIVED,
          },
        }),
        'Message_status_shape_check',
      );
    });

    it('keeps member history and read bounds nonnegative and membership status consistent', async () => {
      const { conversation, creator } = await createGroup(3);
      const member = conversation.members.find((row) => row.userId !== creator)!;
      await expectCheckViolation(
        prisma.conversationMember.update({
          where: { id: member.id },
          data: { historyAfterSequence: -1n },
        }),
        'ConversationMember_sequence_bounds_check',
      );
      await expectCheckViolation(
        prisma.conversationMember.update({
          where: { id: member.id },
          data: { lastReadSequence: -1n },
        }),
        'ConversationMember_sequence_bounds_check',
      );
      await expectCheckViolation(
        prisma.conversationMember.update({
          where: { id: member.id },
          data: { status: ConversationMemberStatus.REMOVED, leftAt: new Date() },
        }),
        'ConversationMember_status_shape_check',
      );
      await expectCheckViolation(
        prisma.conversationMember.update({
          where: { id: member.id },
          data: { status: ConversationMemberStatus.LEFT },
        }),
        'ConversationMember_status_shape_check',
      );
      await expect(
        prisma.conversationMember.create({
          data: { conversationId: conversation.id, userId: member.userId },
        }),
      ).rejects.toSatisfy((error: unknown) => errorCode(error) === 'P2002');
    });

    it('keeps MessageRevision append-only and bounded', async () => {
      const { conversation, creator } = await createGroup(3);
      const message = await appendMessage(conversation.id, creator, 'Original');
      const revision = await prisma.messageRevision.create({
        data: {
          messageId: message.id,
          revisionNumber: 1,
          previousBody: 'Original',
          editedByUserId: creator,
        },
      });
      await expect(
        prisma.messageRevision.create({
          data: {
            messageId: message.id,
            revisionNumber: 1,
            previousBody: 'Again',
            editedByUserId: creator,
          },
        }),
      ).rejects.toSatisfy((error: unknown) => errorCode(error) === 'P2002');
      await expectCheckViolation(
        prisma.messageRevision.create({
          data: {
            messageId: message.id,
            revisionNumber: 11,
            previousBody: 'Too many',
            editedByUserId: creator,
          },
        }),
        'MessageRevision_bounds_check',
      );
      await expect(
        prisma.messageRevision.update({
          where: { id: revision.id },
          data: { previousBody: 'Rewritten history' },
        }),
      ).rejects.toThrow('HIREME_MESSAGE_REVISION_IMMUTABLE');
      await expect(prisma.messageRevision.delete({ where: { id: revision.id } })).rejects.toThrow(
        'HIREME_MESSAGE_REVISION_IMMUTABLE',
      );
      await expect(prisma.$executeRawUnsafe('TRUNCATE "MessageRevision"')).rejects.toThrow(
        'HIREME_MESSAGE_REVISION_IMMUTABLE',
      );
      await expect(
        prisma.messageRevision.findUniqueOrThrow({ where: { id: revision.id } }),
      ).resolves.toMatchObject({ previousBody: 'Original' });
    });
  });

  describe('membership-scoped access', () => {
    it('hides missing, foreign, LEFT, and REMOVED conversations identically', async () => {
      const { conversation, creator } = await createGroup(4);
      const [left, removed] = conversation.members
        .filter((member) => member.userId !== creator)
        .slice(0, 2);
      await prisma.conversationMember.update({
        where: { id: left!.id },
        data: { status: ConversationMemberStatus.LEFT, leftAt: new Date() },
      });
      await prisma.conversationMember.update({
        where: { id: removed!.id },
        data: {
          status: ConversationMemberStatus.REMOVED,
          leftAt: new Date(),
          removedByUserId: creator,
        },
      });
      const outsider = await createUser('outsider');
      const message = await appendMessage(conversation.id, creator, 'Members only');

      const attempts: Array<[string, string]> = [
        [outsider, conversation.id],
        [left!.userId, conversation.id],
        [removed!.userId, conversation.id],
        [creator, randomUUID()],
        [creator, 'not-a-uuid'],
      ];
      const failures: unknown[] = [];
      for (const [actor, conversationId] of attempts) {
        const error = await access
          .findActiveMembership(actor, conversationId)
          .catch((e: unknown) => e);
        failures.push(error);
        const messageError = await access
          .findVisibleMessage(actor, conversationId, message.id)
          .catch((e: unknown) => e);
        expect(messageError).toBeInstanceOf(NotFoundException);
        expect(responseCode(messageError)).toBe('CONVERSATION_NOT_FOUND');
      }
      const shapes = failures.map((error) => {
        expect(error).toBeInstanceOf(NotFoundException);
        return JSON.stringify((error as NotFoundException).getResponse());
      });
      expect(new Set(shapes).size).toBe(1);
      expect(JSON.parse(shapes[0]!)).toEqual({
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found.' },
      });

      // Neither a LEFT nor a REMOVED member appears in the list scope.
      for (const actor of [left!.userId, removed!.userId, outsider]) {
        await expect(
          prisma.conversation.count({ where: access.activeConversationsWhere(actor) }),
        ).resolves.toBe(0);
      }
      await expect(
        prisma.conversation.count({ where: access.activeConversationsWhere(creator) }),
      ).resolves.toBe(1);
    });

    it('excludes sequence N from a member who joined when lastMessageSequence was N', async () => {
      const { conversation, creator } = await createGroup(3);
      const before = [
        await appendMessage(conversation.id, creator, 'Confidential 1'),
        await appendMessage(conversation.id, creator, 'Confidential 2'),
        await appendMessage(conversation.id, creator, 'Confidential 3 (sequence N)'),
      ];
      expect(before.map((message) => message.sequence)).toEqual([1n, 2n, 3n]);

      const late = await createUser('late-joiner');
      const [added] = await prisma.$transaction(async (tx) => {
        const locked = await access.lockConversation(tx, conversation.id);
        return access.addGroupMembersLocked(tx, locked!, [late]);
      });
      expect(added!.historyAfterSequence).toBe(3n);
      expect(added!.lastReadSequence).toBe(3n);

      const after = await appendMessage(conversation.id, creator, 'After join');
      expect(after.sequence).toBe(4n);

      const { membership } = await access.findActiveMembership(late, conversation.id);
      const visible = await prisma.message.findMany({
        where: access.visibleMessagesWhere(membership),
        orderBy: { sequence: 'asc' },
      });
      expect(visible.map((message) => message.sequence)).toEqual([4n]);

      // Sequence N itself, and everything earlier, resolves as not found.
      for (const hidden of before) {
        const error = await access
          .findVisibleMessage(late, conversation.id, hidden.id)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(NotFoundException);
        expect(responseCode(error)).toBe('MESSAGE_NOT_FOUND');
      }
      await expect(
        access.findVisibleMessage(late, conversation.id, after.id),
      ).resolves.toMatchObject({ message: { sequence: 4n } });

      // Founding members (boundary 0) see the whole history.
      const founder = await access.findActiveMembership(creator, conversation.id);
      expect(founder.membership.historyAfterSequence).toBe(0n);
      await expect(
        prisma.message.count({ where: access.visibleMessagesWhere(founder.membership) }),
      ).resolves.toBe(4);
    });

    it('re-adding a REMOVED member moves the boundary to the current sequence', async () => {
      const { conversation, creator } = await createGroup(3);
      const member = conversation.members.find((row) => row.userId !== creator)!;
      await appendMessage(conversation.id, creator, 'Seen while a member');
      await prisma.conversationMember.update({
        where: { id: member.id },
        data: {
          status: ConversationMemberStatus.REMOVED,
          leftAt: new Date(),
          removedByUserId: creator,
        },
      });
      await appendMessage(conversation.id, creator, 'Sent while removed');
      const [readded] = await prisma.$transaction(async (tx) => {
        const locked = await access.lockConversation(tx, conversation.id);
        return access.addGroupMembersLocked(tx, locked!, [member.userId]);
      });
      expect(readded!.id).toBe(member.id);
      expect(readded!.status).toBe(ConversationMemberStatus.ACTIVE);
      expect(readded!.historyAfterSequence).toBe(2n);
      expect(readded!.leftAt).toBeNull();
      expect(readded!.removedByUserId).toBeNull();
      await expect(
        prisma.message.count({ where: access.visibleMessagesWhere(readded!) }),
      ).resolves.toBe(0);
    });
  });

  describe('Conversation-first locking and the 50-member cap', () => {
    it('creates groups of 3-50 with the creator as the only OWNER', async () => {
      const { conversation, creator } = await createGroup(3);
      expect(conversation.type).toBe(ConversationType.GROUP);
      expect(conversation.directKey).toBeNull();
      expect(
        conversation.members.filter((member) => member.role === ConversationMemberRole.OWNER),
      ).toEqual([expect.objectContaining({ userId: creator })]);
      const creatorOnly = await createUser('lonely');
      const one = await createUser('one-other');
      await expect(
        prisma.$transaction((tx) =>
          access.insertGroupConversation(tx, creatorOnly, [one], 'Too small'),
        ),
      ).rejects.toThrow('A group starts with 3-50 members.');
    });

    it('refuses an add that would exceed 50 active members', async () => {
      const { conversation } = await createGroup(50);
      const extra = await createUser('fifty-first');
      const error = await prisma
        .$transaction(async (tx) => {
          const locked = await access.lockConversation(tx, conversation.id);
          return access.addGroupMembersLocked(tx, locked!, [extra]);
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(responseCode(error)).toBe('GROUP_MEMBER_LIMIT');
      await expect(
        prisma.conversationMember.count({
          where: { conversationId: conversation.id, status: ConversationMemberStatus.ACTIVE },
        }),
      ).resolves.toBe(50);
    }, 60_000);

    it('serializes concurrent adds on the Conversation lock so the cap holds', async () => {
      const { conversation } = await createGroup(49);
      const first = await createUser('contender-1');
      const second = await createUser('contender-2');
      const add = (userId: string) =>
        prisma
          .$transaction(
            async (tx) => {
              const locked = await access.lockConversation(tx, conversation.id);
              return access.addGroupMembersLocked(tx, locked!, [userId]);
            },
            { timeout: 30_000 },
          )
          .then(
            () => 'added' as const,
            (error: unknown) => responseCode(error) ?? String(error),
          );

      // Both adds queue behind a test-held Conversation row lock and only then race.
      const outcomes = await raceWhileHoldingRowLock({
        prisma,
        table: 'Conversation',
        rowId: conversation.id,
        primaryRequest: () => add(first),
        secondaryRequest: () => add(second),
      });
      expect([...outcomes].sort()).toEqual(['GROUP_MEMBER_LIMIT', 'added']);
      await expect(
        prisma.conversationMember.count({
          where: { conversationId: conversation.id, status: ConversationMemberStatus.ACTIVE },
        }),
      ).resolves.toBe(50);
    }, 60_000);

    it('takes the lock only after confirming the actor is an active member', async () => {
      const { conversation, creator } = await createGroup(3);
      const outsider = await createUser('lock-outsider');
      await expect(
        prisma.$transaction((tx) =>
          access.lockConversationForActiveMember(tx, outsider, conversation.id),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      const locked = await prisma.$transaction((tx) =>
        access.lockConversationForActiveMember(tx, creator, conversation.id),
      );
      expect(locked.conversation.id).toBe(conversation.id);
      expect(locked.membership.userId).toBe(creator);
    });

    it('refuses to add someone who is already an active member', async () => {
      const { conversation, creator } = await createGroup(3);
      const error = await prisma
        .$transaction(async (tx) => {
          const locked = await access.lockConversation(tx, conversation.id);
          return access.addGroupMembersLocked(tx, locked!, [creator]);
        })
        .catch((e: unknown) => e);
      expect(responseCode(error)).toBe('MESSAGING_USER_NOT_ELIGIBLE');
    });
  });
});
