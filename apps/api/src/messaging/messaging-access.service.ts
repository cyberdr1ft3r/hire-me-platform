import { Inject, Injectable } from '@nestjs/common';

import { MESSAGES_VIEW_PERMISSION } from '@hire-me/contracts';
import {
  conversationNotFound,
  messageNotFound,
  messagingConflict,
  messagingForbidden,
} from './messaging.errors.js';
import {
  canonicalDirectKey,
  groupHasCapacity,
  MessagingInvariantError,
  planDirectMembers,
  planGroup,
} from './messaging-invariants.js';
import {
  ConversationMemberRole,
  ConversationMemberStatus,
  ConversationStatus,
  ConversationType,
  UserStatus,
  UserType,
  type Prisma,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type MessagingDbClient = PrismaService | Prisma.TransactionClient;
type Conversation = Prisma.ConversationGetPayload<object>;
type ConversationMember = Prisma.ConversationMemberGetPayload<object>;
type Message = Prisma.MessageGetPayload<object>;
type PrismaTransaction = Prisma.TransactionClient;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare const lockedConversationBrand: unique symbol;

/**
 * A Conversation row read after `SELECT ... FOR UPDATE` in the current
 * transaction. Only the lock helpers below produce it, so a membership-changing
 * helper that takes one cannot be called without the Conversation lock held.
 */
export type LockedConversation = Conversation & { readonly [lockedConversationBrand]: true };

export interface ActiveMembership {
  conversation: Conversation;
  membership: ConversationMember;
}

export interface LockedMembership {
  conversation: LockedConversation;
  membership: ConversationMember;
}

/**
 * Messaging access foundation (Issue #171 / D-087).
 *
 * Every rule is data-driven: the actor must be an active INTERNAL user, record
 * scope is the actor's own ACTIVE membership, and message reads are limited to
 * the member's exclusive history window. There is no role-name check and no
 * all-conversations path for any role, SUPER_ADMIN included. Route permissions
 * (`messages:view` / `messages:create`) stay with the controller guard (PR B);
 * the `userType` check here is defense in depth, so a CLIENT or GUEST account
 * that was manually granted messaging permissions is still refused.
 *
 * Lock order for every membership- or sequence-changing write: the Conversation
 * row first (`lockConversation`), then member rows, then message rows.
 */
@Injectable()
export class MessagingAccessService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  /** The actor must exist, be ACTIVE, not archived, and INTERNAL. */
  async assertInternalActor(
    actorUserId: string,
    db: MessagingDbClient = this.prisma,
  ): Promise<void> {
    const actor = UUID_PATTERN.test(actorUserId)
      ? await db.user.findFirst({
          where: {
            id: actorUserId,
            status: UserStatus.ACTIVE,
            archivedAt: null,
            userType: UserType.INTERNAL,
          },
          select: { id: true },
        })
      : null;
    if (!actor) {
      throw messagingForbidden(
        'MESSAGING_ACTOR_NOT_ELIGIBLE',
        'Messaging is available to internal users only.',
      );
    }
  }

  /**
   * Users who may be added to or messaged in a conversation: ACTIVE, not
   * archived, INTERNAL, and currently holding effective `messages:view` through an
   * active role and an active grant (the same resolution as PermissionsService).
   */
  eligibleMessagingUserWhere(): Prisma.UserWhereInput {
    return {
      status: UserStatus.ACTIVE,
      archivedAt: null,
      userType: UserType.INTERNAL,
      roles: {
        some: {
          archivedAt: null,
          role: {
            status: 'ACTIVE',
            permissions: {
              some: {
                archivedAt: null,
                permission: { code: MESSAGES_VIEW_PERMISSION, status: 'ACTIVE' },
              },
            },
          },
        },
      },
    };
  }

  /** All-or-nothing: every listed user must be eligible. */
  async assertEligibleTargets(
    userIds: readonly string[],
    db: MessagingDbClient = this.prisma,
  ): Promise<void> {
    const distinct = [...new Set(userIds.map((id) => id.toLowerCase()))];
    if (distinct.length === 0) {
      return;
    }
    if (distinct.some((id) => !UUID_PATTERN.test(id))) {
      throw this.targetNotEligible();
    }
    const eligible = await db.user.count({
      where: { id: { in: distinct }, ...this.eligibleMessagingUserWhere() },
    });
    if (eligible !== distinct.length) {
      throw this.targetNotEligible();
    }
  }

  /** The only list scope: conversations where the actor is an ACTIVE member. */
  activeConversationsWhere(actorUserId: string): Prisma.ConversationWhereInput {
    return {
      members: { some: { userId: actorUserId, status: ConversationMemberStatus.ACTIVE } },
    };
  }

  /**
   * One scoped query. A missing conversation, a foreign one, and one the actor
   * LEFT or was REMOVED from all produce the identical CONVERSATION_NOT_FOUND.
   */
  async findActiveMembership(
    actorUserId: string,
    conversationId: string,
    db: MessagingDbClient = this.prisma,
  ): Promise<ActiveMembership> {
    if (!UUID_PATTERN.test(conversationId) || !UUID_PATTERN.test(actorUserId)) {
      throw conversationNotFound();
    }
    const membership = await db.conversationMember.findFirst({
      where: { conversationId, userId: actorUserId, status: ConversationMemberStatus.ACTIVE },
      include: { conversation: true },
    });
    if (!membership) {
      throw conversationNotFound();
    }
    const { conversation, ...member } = membership;
    return { conversation, membership: member };
  }

  /**
   * The exclusive late-join boundary: `sequence > historyAfterSequence`. A member
   * added while the conversation's last sequence was N never sees message N.
   */
  visibleMessagesWhere(membership: ConversationMember): Prisma.MessageWhereInput {
    return {
      conversationId: membership.conversationId,
      sequence: { gt: membership.historyAfterSequence },
    };
  }

  /** A message outside the actor's scope or window is MESSAGE_NOT_FOUND. */
  async findVisibleMessage(
    actorUserId: string,
    conversationId: string,
    messageId: string,
    db: MessagingDbClient = this.prisma,
  ): Promise<{ membership: ConversationMember; message: Message }> {
    const { membership } = await this.findActiveMembership(actorUserId, conversationId, db);
    const message = UUID_PATTERN.test(messageId)
      ? await db.message.findFirst({
          where: { id: messageId, ...this.visibleMessagesWhere(membership) },
        })
      : null;
    if (!message) {
      throw messageNotFound();
    }
    return { membership, message };
  }

  /** `SELECT ... FOR UPDATE` on the Conversation row; null when it does not exist. */
  async lockConversation(
    tx: PrismaTransaction,
    conversationId: string,
  ): Promise<LockedConversation | null> {
    if (!UUID_PATTERN.test(conversationId)) {
      return null;
    }
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId}::uuid FOR UPDATE`;
    const conversation = await tx.conversation.findUnique({ where: { id: conversationId } });
    return conversation as LockedConversation | null;
  }

  /**
   * Checks membership without a lock (so a non-member can never make others wait
   * on the row), takes the Conversation lock, then re-checks membership under it.
   */
  async lockConversationForActiveMember(
    tx: PrismaTransaction,
    actorUserId: string,
    conversationId: string,
  ): Promise<LockedMembership> {
    await this.findActiveMembership(actorUserId, conversationId, tx);
    const conversation = await this.lockConversation(tx, conversationId);
    if (!conversation) {
      throw conversationNotFound();
    }
    const { membership } = await this.findActiveMembership(actorUserId, conversationId, tx);
    return { conversation, membership };
  }

  async countActiveMembers(
    tx: PrismaTransaction,
    conversation: LockedConversation,
  ): Promise<number> {
    return tx.conversationMember.count({
      where: { conversationId: conversation.id, status: ConversationMemberStatus.ACTIVE },
    });
  }

  /**
   * Creates a PRIVATE conversation with exactly its two canonical MEMBER rows in
   * one statement. A concurrent create of the same pair fails on the unique
   * `directKey` (P2002); the caller's find-or-create re-reads the winner.
   */
  async insertDirectConversation(
    tx: PrismaTransaction,
    actorUserId: string,
    counterpartUserId: string,
  ): Promise<Conversation & { members: ConversationMember[] }> {
    const directKey = canonicalDirectKey(actorUserId, counterpartUserId);
    await this.assertInternalActor(actorUserId, tx);
    await this.assertEligibleTargets([counterpartUserId], tx);
    return tx.conversation.create({
      data: {
        type: ConversationType.PRIVATE,
        directKey,
        createdByUserId: actorUserId.toLowerCase(),
        members: {
          create: planDirectMembers(actorUserId, counterpartUserId).map((member) => ({
            userId: member.userId,
            role: ConversationMemberRole.MEMBER,
          })),
        },
      },
      include: { members: true },
    });
  }

  /** Creates a GROUP with the creator as OWNER and 3-50 founding members. */
  async insertGroupConversation(
    tx: PrismaTransaction,
    creatorUserId: string,
    otherMemberUserIds: readonly string[],
    title: string,
  ): Promise<Conversation & { members: ConversationMember[] }> {
    const plan = planGroup(creatorUserId, otherMemberUserIds, title);
    await this.assertInternalActor(creatorUserId, tx);
    await this.assertEligibleTargets(
      plan.members.slice(1).map((member) => member.userId),
      tx,
    );
    return tx.conversation.create({
      data: {
        type: ConversationType.GROUP,
        title: plan.title,
        createdByUserId: plan.members[0]!.userId,
        members: {
          create: plan.members.map((member) => ({
            userId: member.userId,
            role:
              member.role === 'OWNER'
                ? ConversationMemberRole.OWNER
                : ConversationMemberRole.MEMBER,
          })),
        },
      },
      include: { members: true },
    });
  }

  /**
   * Adds (or re-adds) members to a locked GROUP. Re-counts ACTIVE members under
   * the lock, so two concurrent adds can never push the group past 50. Each new
   * or returning member gets `historyAfterSequence = lastMessageSequence` (they
   * see only later messages) and a read cursor at the same point. Authority to
   * add (OWNER membership) is the caller's check (PR B).
   */
  async addGroupMembersLocked(
    tx: PrismaTransaction,
    conversation: LockedConversation,
    userIds: readonly string[],
  ): Promise<ConversationMember[]> {
    if (conversation.type !== ConversationType.GROUP) {
      throw new MessagingInvariantError('PRIVATE conversation membership is immutable.');
    }
    if (conversation.status !== ConversationStatus.ACTIVE) {
      throw messagingConflict('CONVERSATION_ARCHIVED', 'This conversation is archived.');
    }
    const distinct = [...new Set(userIds.map((id) => id.toLowerCase()))];
    if (distinct.length === 0) {
      return [];
    }
    const existing = await tx.conversationMember.findMany({
      where: { conversationId: conversation.id, userId: { in: distinct } },
    });
    if (existing.some((member) => member.status === ConversationMemberStatus.ACTIVE)) {
      throw this.targetNotEligible();
    }
    await this.assertEligibleTargets(distinct, tx);
    const activeCount = await this.countActiveMembers(tx, conversation);
    if (!groupHasCapacity(activeCount, distinct.length)) {
      throw messagingConflict('GROUP_MEMBER_LIMIT', 'This group has reached its member limit.');
    }

    const boundary = conversation.lastMessageSequence;
    const joinedAt = new Date();
    const returning = new Map(existing.map((member) => [member.userId, member]));
    const added: ConversationMember[] = [];
    for (const userId of distinct) {
      const fields = {
        role: ConversationMemberRole.MEMBER,
        status: ConversationMemberStatus.ACTIVE,
        joinedAt,
        leftAt: null,
        removedByUserId: null,
        historyAfterSequence: boundary,
        lastReadSequence: boundary,
        hiddenAt: null,
      };
      const previous = returning.get(userId);
      added.push(
        previous
          ? await tx.conversationMember.update({ where: { id: previous.id }, data: fields })
          : await tx.conversationMember.create({
              data: { ...fields, conversationId: conversation.id, userId },
            }),
      );
    }
    return added;
  }

  private targetNotEligible() {
    return messagingConflict(
      'MESSAGING_USER_NOT_ELIGIBLE',
      'One or more selected people cannot take part in this conversation.',
    );
  }
}
