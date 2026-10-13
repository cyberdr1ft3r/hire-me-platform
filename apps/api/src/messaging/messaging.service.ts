import { Inject, Injectable } from '@nestjs/common';
import {
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_MAX_EDITS,
  MESSAGING_UNREAD_COUNT_CAP,
  MESSAGING_USER_OPTION_LIMIT,
  CONVERSATION_PAGE_SIZE,
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_MIN_MEMBERS_AT_CREATION,
  type ConversationDetail,
  type ConversationDetailResponse,
  type ConversationListQuery,
  type ConversationListResponse,
  type ConversationParticipant,
  type ConversationSummary,
  type DirectConversationRequest,
  type DirectConversationResponse,
  type GroupAddMembersRequest,
  type GroupCreateRequest,
  type ConversationHideResponse,
  type GroupLeaveResponse,
  type GroupRenameRequest,
  type MessageDetailResponse,
  type MessageEditRequest,
  type MessageListQuery,
  type MessageListResponse,
  type MessageSendRequest,
  type MessageSendResponse,
  type MessageView,
  type MessagingUserOptionsQuery,
  type MessagingUserOptionsResponse,
  type ReadCursorRequest,
  type ReadCursorResponse,
  type UnreadSummaryResponse,
} from '@hire-me/contracts';

import type { RequestContext } from '../auth/auth.types.js';
import {
  ConversationMemberRole,
  ConversationMemberStatus,
  ConversationStatus,
  ConversationType,
  MessageStatus,
  Prisma,
  UserStatus,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { MessagingAccessService, type LockedConversation } from './messaging-access.service.js';
import { MESSAGING_CLOCK, type MessagingClock } from './messaging-clock.js';
import {
  conversationNotFound,
  invalidMessagingRequest,
  messageNotFound,
  messagingBadRequest,
  messagingConflict,
  messagingForbidden,
  messagingNotFound,
} from './messaging.errors.js';
import { canonicalDirectKey } from './messaging-invariants.js';
import { MessagingRateLimiter } from './messaging-rate-limiter.js';

type Tx = Prisma.TransactionClient;
type ConversationMember = Prisma.ConversationMemberGetPayload<object>;

const USER_SELECT = {
  id: true,
  displayName: true,
  email: true,
  status: true,
  archivedAt: true,
} as const satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const CONVERSATION_INCLUDE = {
  members: {
    where: { status: ConversationMemberStatus.ACTIVE },
    include: { user: { select: USER_SELECT } },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.ConversationInclude;

type ConversationWithMembers = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;

const MESSAGE_INCLUDE = {
  author: { select: USER_SELECT },
} as const satisfies Prisma.MessageInclude;

type MessageWithAuthor = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** Lock waits under concurrent sends/adds need more room than Prisma's 2s/5s defaults. */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
const UNIQUE_VIOLATION = 'P2002';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type AuditEntity = 'Conversation' | 'Message';

/**
 * Internal messaging API layer (Issue #179, D-087), on top of the PR A access
 * foundation.
 *
 * Every operation re-checks that the actor is an ACTIVE, non-archived INTERNAL
 * user (route permissions are checked by the controller guard first), and every
 * conversation or message is reached only through the actor's own ACTIVE
 * membership. There is no role-name check and no all-conversations path for any
 * role. Writes lock the Conversation row first, then member rows, then message
 * rows, and re-check membership under the lock.
 */
@Injectable()
export class MessagingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingAccessService) private readonly access: MessagingAccessService,
    @Inject(MessagingRateLimiter) private readonly limiter: MessagingRateLimiter,
    @Inject(MESSAGING_CLOCK) private readonly clock: MessagingClock,
  ) {}

  // --- Participant picker ----------------------------------------------------

  async listUserOptions(
    actorUserId: string,
    query: MessagingUserOptionsQuery,
  ): Promise<MessagingUserOptionsResponse> {
    const actor = await this.internalActor(actorUserId);
    this.limiter.consume('user-search', actor);

    const excluded = new Set([actor]);
    if (query.purpose === 'group-add') {
      const { conversation, membership } = await this.access.findActiveMembership(
        actor,
        query.conversationId!.toLowerCase(),
      );
      if (
        conversation.type !== ConversationType.GROUP ||
        conversation.status !== ConversationStatus.ACTIVE ||
        membership.role !== ConversationMemberRole.OWNER
      ) {
        throw conversationNotFound();
      }
      const active = await this.prisma.conversationMember.findMany({
        where: { conversationId: conversation.id, status: ConversationMemberStatus.ACTIVE },
        select: { userId: true },
      });
      for (const member of active) {
        excluded.add(member.userId);
      }
    }

    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          this.access.eligibleMessagingUserWhere(),
          { id: { notIn: [...excluded] } },
          {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { startsWith: query.search, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, displayName: true, email: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: MESSAGING_USER_OPTION_LIMIT,
    });
    return { users };
  }

  // --- Conversation reads ----------------------------------------------------

  async listConversations(
    actorUserId: string,
    query: ConversationListQuery,
  ): Promise<ConversationListResponse> {
    const actor = await this.internalActor(actorUserId);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);

    const filter =
      query.filter === 'archived'
        ? Prisma.sql`c."status" = 'archived'`
        : query.filter === 'unread'
          ? Prisma.sql`c."lastMessageSequence" > GREATEST(m."lastReadSequence", m."historyAfterSequence")`
          : Prisma.sql`c."status" = 'active'`;
    const after = cursor
      ? Prisma.sql`AND (COALESCE(c."lastMessageAt", c."createdAt"), c."id") < (${cursor.activity}::timestamp(3), ${cursor.id}::uuid)`
      : Prisma.empty;

    // A PRIVATE conversation the counterpart opened stays out of the list until it
    // has a message, so opening a direct conversation is not itself a signal.
    const rows = await this.prisma.$queryRaw<{ id: string; activity: Date; unread: number }[]>`
      SELECT c."id",
             COALESCE(c."lastMessageAt", c."createdAt") AS "activity",
             (
               SELECT count(*)::int FROM (
                 SELECT 1 FROM "Message" msg
                 WHERE msg."conversationId" = c."id"
                   AND msg."sequence" > GREATEST(m."lastReadSequence", m."historyAfterSequence")
                 LIMIT ${MESSAGING_UNREAD_COUNT_CAP}
               ) AS unread_window
             ) AS "unread"
      FROM "Conversation" c
      JOIN "ConversationMember" m ON m."conversationId" = c."id"
      WHERE m."userId" = ${actor}::uuid
        AND m."status" = 'active'
        AND (m."hiddenAt" IS NULL OR c."lastMessageAt" > m."hiddenAt")
        AND NOT (c."type" = 'private' AND c."lastMessageSequence" = 0 AND c."createdByUserId" <> ${actor}::uuid)
        AND ${filter}
        ${after}
      ORDER BY "activity" DESC, c."id" DESC
      LIMIT ${CONVERSATION_PAGE_SIZE + 1}
    `;

    const page = rows.slice(0, CONVERSATION_PAGE_SIZE);
    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: page.map((row) => row.id) } },
      include: CONVERSATION_INCLUDE,
    });
    const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const summaries: ConversationSummary[] = [];
    for (const row of page) {
      const conversation = byId.get(row.id);
      const membership = conversation?.members.find((member) => member.userId === actor);
      if (conversation && membership) {
        summaries.push(this.toSummary(conversation, membership, row.unread));
      }
    }
    const last = page.at(-1);
    return {
      conversations: summaries,
      nextCursor:
        rows.length > CONVERSATION_PAGE_SIZE && last ? encodeCursor(last.activity, last.id) : null,
    };
  }

  async getConversation(
    actorUserId: string,
    conversationId: string,
  ): Promise<ConversationDetailResponse> {
    const actor = await this.internalActor(actorUserId);
    return { conversation: await this.loadDetail(this.prisma, actor, conversationId) };
  }

  async unreadSummary(actorUserId: string): Promise<UnreadSummaryResponse> {
    const actor = await this.internalActor(actorUserId);
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS "count"
      FROM "ConversationMember" m
      JOIN "Conversation" c ON c."id" = m."conversationId"
      WHERE m."userId" = ${actor}::uuid
        AND m."status" = 'active'
        AND (m."hiddenAt" IS NULL OR c."lastMessageAt" > m."hiddenAt")
        AND c."lastMessageSequence" > GREATEST(m."lastReadSequence", m."historyAfterSequence")
    `;
    return { unreadConversationCount: row?.count ?? 0 };
  }

  async hidePrivateConversation(
    actorUserId: string,
    conversationId: string,
  ): Promise<ConversationHideResponse> {
    const actor = await this.internalActor(actorUserId);
    await this.prisma.$transaction(async (tx) => {
      const { conversation, membership } = await this.access.lockConversationForActiveMember(
        tx,
        actor,
        conversationId,
      );
      if (conversation.type !== ConversationType.PRIVATE) {
        throw messagingConflict(
          'CONVERSATION_HIDE_NOT_SUPPORTED',
          'Only direct conversations can be hidden.',
        );
      }
      this.assertActive(conversation);
      const now = this.clock.now();
      await tx.conversationMember.update({
        where: { id: membership.id },
        data: { hiddenAt: now },
      });
    }, TRANSACTION_OPTIONS);
    return { hidden: true };
  }

  // --- PRIVATE ---------------------------------------------------------------

  async openDirectConversation(
    actorUserId: string,
    input: DirectConversationRequest,
    context: RequestContext,
  ): Promise<DirectConversationResponse> {
    const actor = await this.internalActor(actorUserId);
    const counterpart = input.userId.toLowerCase();
    if (counterpart === actor) {
      throw this.targetNotEligible();
    }
    const directKey = canonicalDirectKey(actor, counterpart);

    const existing = await this.findDirect(directKey, actor);
    if (existing) {
      return { conversation: await this.loadDetail(this.prisma, actor, existing), created: false };
    }

    this.limiter.consume('conversation-create', actor);
    try {
      const conversation = await this.prisma.$transaction(async (tx) => {
        const created = await this.access.insertDirectConversation(tx, actor, counterpart);
        await this.audit(tx, context, {
          action: 'messages.conversation.direct_created',
          actorUserId: actor,
          targetUserId: counterpart,
          entityType: 'Conversation',
          entityId: created.id,
          metadata: { conversationId: created.id, type: 'PRIVATE', memberCount: 2 },
        });
        return this.loadDetail(tx, actor, created.id);
      }, TRANSACTION_OPTIONS);
      return { conversation, created: true };
    } catch (error) {
      // A concurrent request created the same pair first: converge on its row.
      if (isUniqueViolation(error)) {
        const winner = await this.findDirect(directKey, actor);
        if (winner) {
          return {
            conversation: await this.loadDetail(this.prisma, actor, winner),
            created: false,
          };
        }
      }
      throw error;
    }
  }

  // --- GROUP -----------------------------------------------------------------

  async createGroup(
    actorUserId: string,
    input: GroupCreateRequest,
    context: RequestContext,
  ): Promise<ConversationDetailResponse> {
    const actor = await this.internalActor(actorUserId);
    const others = distinctIds(input.memberUserIds).filter((id) => id !== actor);
    const total = others.length + 1;
    if (total < GROUP_MIN_MEMBERS_AT_CREATION || total > GROUP_MAX_ACTIVE_MEMBERS) {
      throw messagingBadRequest(
        'GROUP_MEMBER_COUNT_INVALID',
        `A group starts with ${GROUP_MIN_MEMBERS_AT_CREATION}-${GROUP_MAX_ACTIVE_MEMBERS} members.`,
      );
    }
    this.limiter.consume('conversation-create', actor);
    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await this.access.insertGroupConversation(tx, actor, others, input.title);
      await this.audit(tx, context, {
        action: 'messages.group.created',
        actorUserId: actor,
        entityType: 'Conversation',
        entityId: created.id,
        metadata: { conversationId: created.id, type: 'GROUP', memberCount: total },
      });
      return this.loadDetail(tx, actor, created.id);
    }, TRANSACTION_OPTIONS);
    return { conversation };
  }

  async addGroupMembers(
    actorUserId: string,
    conversationId: string,
    input: GroupAddMembersRequest,
    context: RequestContext,
  ): Promise<ConversationDetailResponse> {
    return this.groupMutation(actorUserId, conversationId, true, async (tx, actor, locked) => {
      const userIds = distinctIds(input.userIds);
      const previous = await tx.conversationMember.findMany({
        where: { conversationId: locked.id, userId: { in: userIds } },
        select: { userId: true },
      });
      const returning = new Set(previous.map((member) => member.userId));
      const added = await this.access.addGroupMembersLocked(tx, locked, userIds);
      const activeCount = await this.access.countActiveMembers(tx, locked);
      for (const member of added) {
        await this.audit(tx, context, {
          action: returning.has(member.userId)
            ? 'messages.group.member_readded'
            : 'messages.group.member_added',
          actorUserId: actor,
          targetUserId: member.userId,
          entityType: 'Conversation',
          entityId: locked.id,
          metadata: {
            conversationId: locked.id,
            historyAfterSequence: Number(member.historyAfterSequence),
            activeMemberCount: activeCount,
          },
        });
      }
    });
  }

  async removeGroupMember(
    actorUserId: string,
    conversationId: string,
    targetUserId: string,
    context: RequestContext,
  ): Promise<ConversationDetailResponse> {
    return this.groupMutation(actorUserId, conversationId, true, async (tx, actor, locked) => {
      const target = await this.activeMemberOrThrow(tx, locked.id, targetUserId);
      // Owners cannot remove owners (themselves included): no takeover fights.
      if (target.role === ConversationMemberRole.OWNER) {
        throw messagingConflict('GROUP_OWNER_NOT_REMOVABLE', 'Group owners cannot be removed.');
      }
      await tx.conversationMember.update({
        where: { id: target.id },
        data: {
          status: ConversationMemberStatus.REMOVED,
          leftAt: this.clock.now(),
          removedByUserId: actor,
        },
      });
      await this.audit(tx, context, {
        action: 'messages.group.member_removed',
        actorUserId: actor,
        targetUserId: target.userId,
        entityType: 'Conversation',
        entityId: locked.id,
        metadata: { conversationId: locked.id },
      });
    });
  }

  async promoteGroupMember(
    actorUserId: string,
    conversationId: string,
    targetUserId: string,
    context: RequestContext,
  ): Promise<ConversationDetailResponse> {
    return this.groupMutation(actorUserId, conversationId, true, async (tx, actor, locked) => {
      const target = await this.activeMemberOrThrow(tx, locked.id, targetUserId);
      if (target.role === ConversationMemberRole.OWNER) {
        throw messagingConflict('GROUP_MEMBER_ALREADY_OWNER', 'This member is already an owner.');
      }
      await tx.conversationMember.update({
        where: { id: target.id },
        data: { role: ConversationMemberRole.OWNER },
      });
      await this.audit(tx, context, {
        action: 'messages.group.owner_promoted',
        actorUserId: actor,
        targetUserId: target.userId,
        entityType: 'Conversation',
        entityId: locked.id,
        metadata: { conversationId: locked.id },
      });
    });
  }

  async renameGroup(
    actorUserId: string,
    conversationId: string,
    input: GroupRenameRequest,
    context: RequestContext,
  ): Promise<ConversationDetailResponse> {
    return this.groupMutation(actorUserId, conversationId, true, async (tx, actor, locked) => {
      await tx.conversation.update({ where: { id: locked.id }, data: { title: input.title } });
      // The title is user-authored free text, so the audit row records only the event.
      await this.audit(tx, context, {
        action: 'messages.group.renamed',
        actorUserId: actor,
        entityType: 'Conversation',
        entityId: locked.id,
        metadata: { conversationId: locked.id },
      });
    });
  }

  async archiveGroup(
    actorUserId: string,
    conversationId: string,
    context: RequestContext,
  ): Promise<ConversationDetailResponse> {
    return this.groupMutation(actorUserId, conversationId, true, async (tx, actor, locked) => {
      await tx.conversation.update({
        where: { id: locked.id },
        data: {
          status: ConversationStatus.ARCHIVED,
          archivedAt: this.clock.now(),
          archivedByUserId: actor,
        },
      });
      await this.audit(tx, context, {
        action: 'messages.group.archived',
        actorUserId: actor,
        entityType: 'Conversation',
        entityId: locked.id,
        metadata: { conversationId: locked.id },
      });
    });
  }

  async leaveGroup(
    actorUserId: string,
    conversationId: string,
    context: RequestContext,
  ): Promise<GroupLeaveResponse> {
    const actor = await this.internalActor(actorUserId);
    await this.prisma.$transaction(async (tx) => {
      const { conversation, membership } = await this.lockGroupForMember(tx, actor, conversationId);
      if (membership.role === ConversationMemberRole.OWNER) {
        // D-087: the last owner cannot leave while other members remain; they must
        // promote another owner first. Ownership is never transferred implicitly.
        const [otherOwners, otherMembers] = await Promise.all([
          tx.conversationMember.count({
            where: {
              conversationId: conversation.id,
              status: ConversationMemberStatus.ACTIVE,
              role: ConversationMemberRole.OWNER,
              userId: { not: actor },
            },
          }),
          tx.conversationMember.count({
            where: {
              conversationId: conversation.id,
              status: ConversationMemberStatus.ACTIVE,
              userId: { not: actor },
            },
          }),
        ]);
        if (otherOwners === 0 && otherMembers > 0) {
          throw messagingConflict(
            'GROUP_LAST_OWNER',
            'Promote another owner before leaving this group.',
          );
        }
      }
      await tx.conversationMember.update({
        where: { id: membership.id },
        data: { status: ConversationMemberStatus.LEFT, leftAt: this.clock.now() },
      });
      await this.audit(tx, context, {
        action: 'messages.group.member_left',
        actorUserId: actor,
        targetUserId: actor,
        entityType: 'Conversation',
        entityId: conversation.id,
        metadata: { conversationId: conversation.id },
      });
    }, TRANSACTION_OPTIONS);
    return { left: true };
  }

  // --- Messages --------------------------------------------------------------

  async listMessages(
    actorUserId: string,
    conversationId: string,
    query: MessageListQuery,
  ): Promise<MessageListResponse> {
    const actor = await this.internalActor(actorUserId);
    const { membership } = await this.access.findActiveMembership(actor, conversationId);
    const window = this.access.visibleMessagesWhere(membership);

    if (query.after !== undefined) {
      const rows = await this.prisma.message.findMany({
        where: { AND: [window, { sequence: { gt: BigInt(query.after) } }] },
        include: MESSAGE_INCLUDE,
        orderBy: { sequence: 'asc' },
        take: query.limit + 1,
      });
      return {
        messages: rows.slice(0, query.limit).map((row) => toMessageView(row, actor)),
        hasMore: rows.length > query.limit,
      };
    }

    const rows = await this.prisma.message.findMany({
      where: {
        AND: [window, query.before === undefined ? {} : { sequence: { lt: BigInt(query.before) } }],
      },
      include: MESSAGE_INCLUDE,
      orderBy: { sequence: 'desc' },
      take: query.limit + 1,
    });
    return {
      messages: rows
        .slice(0, query.limit)
        .reverse()
        .map((row) => toMessageView(row, actor)),
      hasMore: rows.length > query.limit,
    };
  }

  async getMessage(
    actorUserId: string,
    conversationId: string,
    messageId: string,
  ): Promise<MessageDetailResponse> {
    const actor = await this.internalActor(actorUserId);
    const { message } = await this.access.findVisibleMessage(actor, conversationId, messageId);
    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: message.authorUserId },
      select: USER_SELECT,
    });
    return { message: toMessageView({ ...message, author }, actor) };
  }

  async sendMessage(
    actorUserId: string,
    conversationId: string,
    input: MessageSendRequest,
  ): Promise<MessageSendResponse> {
    const actor = await this.internalActor(actorUserId);
    this.limiter.consume('message-write', actor);
    const clientMessageId = input.clientMessageId.toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      const { conversation, membership } = await this.access.lockConversationForActiveMember(
        tx,
        actor,
        conversationId,
      );

      // A retry of a send that already committed returns the original message.
      const existing = await tx.message.findUnique({
        where: {
          conversationId_authorUserId_clientMessageId: {
            conversationId: conversation.id,
            authorUserId: actor,
            clientMessageId,
          },
        },
        include: MESSAGE_INCLUDE,
      });
      if (existing) {
        // Sent before the actor left and was re-added: outside their window now.
        if (existing.sequence <= membership.historyAfterSequence) {
          throw messagingConflict(
            'MESSAGE_CLIENT_ID_CONFLICT',
            'This message identifier was already used.',
          );
        }
        return { message: toMessageView(existing, actor), replayed: true };
      }

      this.assertActive(conversation);
      if (conversation.type === ConversationType.PRIVATE) {
        await this.assertCounterpartEligible(tx, conversation.id, actor);
      }

      const now = this.clock.now();
      const sequence = conversation.lastMessageSequence + 1n;
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          authorUserId: actor,
          sequence,
          clientMessageId,
          body: input.body,
          createdAt: now,
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageSequence: sequence, lastMessageAt: now },
      });
      // A newer message resurfaces hidden conversations for every active member.
      await tx.conversationMember.updateMany({
        where: {
          conversationId: conversation.id,
          status: ConversationMemberStatus.ACTIVE,
          hiddenAt: { not: null },
        },
        data: { hiddenAt: null },
      });
      // The sender has seen everything up to their own message.
      await tx.conversationMember.update({
        where: { id: membership.id },
        data: { lastReadSequence: sequence },
      });
      return { message: toMessageView(message, actor), replayed: false };
    }, TRANSACTION_OPTIONS);
  }

  async editMessage(
    actorUserId: string,
    conversationId: string,
    messageId: string,
    input: MessageEditRequest,
    context: RequestContext,
  ): Promise<MessageDetailResponse> {
    const actor = await this.internalActor(actorUserId);
    this.limiter.consume('message-write', actor);
    return this.prisma.$transaction(async (tx) => {
      const { conversation, message } = await this.lockOwnMessage(
        tx,
        actor,
        conversationId,
        messageId,
      );
      const now = this.clock.now();
      if (now.getTime() - message.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
        throw messagingConflict(
          'MESSAGE_EDIT_WINDOW_EXPIRED',
          'Messages can be edited only within 15 minutes of sending.',
        );
      }
      if (message.editCount >= MESSAGE_MAX_EDITS) {
        throw messagingConflict(
          'MESSAGE_EDIT_LIMIT_REACHED',
          'This message has reached its edit limit.',
        );
      }
      if (input.body === message.body) {
        throw messagingBadRequest('MESSAGE_EDIT_UNCHANGED', 'The message text is unchanged.');
      }
      const revisionNumber = message.editCount + 1;
      // The previous text is kept as an append-only revision before the change.
      await tx.messageRevision.create({
        data: {
          messageId: message.id,
          revisionNumber,
          previousBody: message.body,
          editedByUserId: actor,
          editedAt: now,
        },
      });
      const updated = await tx.message.update({
        where: { id: message.id },
        data: {
          body: input.body,
          status: MessageStatus.EDITED,
          editCount: revisionNumber,
          editedAt: now,
        },
        include: MESSAGE_INCLUDE,
      });
      await this.audit(tx, context, {
        action: 'messages.message.edited',
        actorUserId: actor,
        entityType: 'Message',
        entityId: message.id,
        metadata: { conversationId: conversation.id, messageId: message.id, revisionNumber },
      });
      return { message: toMessageView(updated, actor) };
    }, TRANSACTION_OPTIONS);
  }

  async withdrawMessage(
    actorUserId: string,
    conversationId: string,
    messageId: string,
    context: RequestContext,
  ): Promise<MessageDetailResponse> {
    const actor = await this.internalActor(actorUserId);
    this.limiter.consume('message-write', actor);
    return this.prisma.$transaction(async (tx) => {
      const { conversation, message } = await this.lockOwnMessage(
        tx,
        actor,
        conversationId,
        messageId,
      );
      // Tombstone only: the row, its sequence, and its revisions stay.
      const updated = await tx.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.ARCHIVED,
          archivedAt: this.clock.now(),
          archivedByUserId: actor,
        },
        include: MESSAGE_INCLUDE,
      });
      await this.audit(tx, context, {
        action: 'messages.message.withdrawn',
        actorUserId: actor,
        entityType: 'Message',
        entityId: message.id,
        metadata: { conversationId: conversation.id, messageId: message.id },
      });
      return { message: toMessageView(updated, actor) };
    }, TRANSACTION_OPTIONS);
  }

  async markRead(
    actorUserId: string,
    conversationId: string,
    input: ReadCursorRequest,
  ): Promise<ReadCursorResponse> {
    const actor = await this.internalActor(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const { conversation, membership } = await this.access.lockConversationForActiveMember(
        tx,
        actor,
        conversationId,
      );
      // Never past the last real message, never backwards.
      const requested = BigInt(input.upToSequence);
      const target =
        requested < conversation.lastMessageSequence ? requested : conversation.lastMessageSequence;
      let lastReadSequence = membership.lastReadSequence;
      if (target > lastReadSequence) {
        await tx.conversationMember.update({
          where: { id: membership.id },
          data: { lastReadSequence: target },
        });
        lastReadSequence = target;
      }
      const unreadCount = await countUnread(tx, conversation.id, {
        ...membership,
        lastReadSequence,
      });
      return { lastReadSequence: Number(lastReadSequence), unreadCount };
    }, TRANSACTION_OPTIONS);
  }

  // --- Internals -------------------------------------------------------------

  private async internalActor(actorUserId: string): Promise<string> {
    const actor = actorUserId.toLowerCase();
    await this.access.assertInternalActor(actor);
    return actor;
  }

  private async findDirect(directKey: string, actor: string): Promise<string | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        directKey,
        members: { some: { userId: actor, status: ConversationMemberStatus.ACTIVE } },
      },
      select: { id: true },
    });
    return conversation?.id ?? null;
  }

  private async loadDetail(
    db: PrismaService | Tx,
    actor: string,
    conversationId: string,
  ): Promise<ConversationDetail> {
    const { membership } = await this.access.findActiveMembership(actor, conversationId, db);
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { id: membership.conversationId },
      include: CONVERSATION_INCLUDE,
    });
    const unread = await countUnread(db, conversation.id, membership);
    return {
      ...this.toSummary(conversation, membership, unread),
      members: conversation.members.map((member) => ({
        user: toParticipant(member.user),
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
      historyAfterSequence: Number(membership.historyAfterSequence),
    };
  }

  private toSummary(
    conversation: ConversationWithMembers,
    membership: ConversationMember,
    unreadCount: number,
  ): ConversationSummary {
    const counterpart =
      conversation.type === ConversationType.PRIVATE
        ? conversation.members.find((member) => member.userId !== membership.userId)
        : undefined;
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.type === ConversationType.GROUP ? conversation.title : null,
      status: conversation.status,
      counterpart: counterpart ? toParticipant(counterpart.user) : null,
      activeMemberCount: conversation.members.length,
      myRole: membership.role,
      lastMessageSequence: Number(conversation.lastMessageSequence),
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      lastReadSequence: Number(membership.lastReadSequence),
      unreadCount,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  /**
   * Shared frame for GROUP management: locks the Conversation, re-checks the
   * actor's ACTIVE membership under the lock, requires a GROUP that is still
   * ACTIVE and (for owner actions) an OWNER membership, then returns the
   * refreshed detail from inside the same transaction.
   */
  private async groupMutation(
    actorUserId: string,
    conversationId: string,
    requireOwner: boolean,
    mutate: (tx: Tx, actor: string, locked: LockedConversation) => Promise<void>,
  ): Promise<ConversationDetailResponse> {
    const actor = await this.internalActor(actorUserId);
    const conversation = await this.prisma.$transaction(async (tx) => {
      const { conversation: locked, membership } = await this.lockGroupForMember(
        tx,
        actor,
        conversationId,
      );
      if (requireOwner && membership.role !== ConversationMemberRole.OWNER) {
        throw messagingForbidden('GROUP_OWNER_REQUIRED', 'Only a group owner can do this.');
      }
      await mutate(tx, actor, locked);
      return this.loadDetail(tx, actor, locked.id);
    }, TRANSACTION_OPTIONS);
    return { conversation };
  }

  private async lockGroupForMember(tx: Tx, actor: string, conversationId: string) {
    const locked = await this.access.lockConversationForActiveMember(tx, actor, conversationId);
    if (locked.conversation.type !== ConversationType.GROUP) {
      throw messagingConflict(
        'PRIVATE_CONVERSATION_IMMUTABLE',
        'Direct conversations cannot be changed.',
      );
    }
    this.assertActive(locked.conversation);
    return locked;
  }

  /**
   * Conversation lock, then the Message row lock. A message that is not the
   * actor's own, outside their history window, or in another conversation is
   * the same MESSAGE_NOT_FOUND as a missing one.
   */
  private async lockOwnMessage(tx: Tx, actor: string, conversationId: string, messageId: string) {
    const { conversation, membership } = await this.access.lockConversationForActiveMember(
      tx,
      actor,
      conversationId,
    );
    this.assertActive(conversation);
    if (!UUID_PATTERN.test(messageId)) {
      throw messageNotFound();
    }
    await tx.$queryRaw`SELECT id FROM "Message" WHERE id = ${messageId}::uuid AND "conversationId" = ${conversation.id}::uuid FOR UPDATE`;
    const message = await tx.message.findFirst({
      where: {
        AND: [{ id: messageId, authorUserId: actor }, this.access.visibleMessagesWhere(membership)],
      },
    });
    if (!message) {
      throw messageNotFound();
    }
    if (message.status === MessageStatus.ARCHIVED) {
      throw messagingConflict('MESSAGE_WITHDRAWN', 'This message was withdrawn.');
    }
    return { conversation, membership, message };
  }

  private async activeMemberOrThrow(
    tx: Tx,
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember> {
    const member = await tx.conversationMember.findFirst({
      where: {
        conversationId,
        userId: userId.toLowerCase(),
        status: ConversationMemberStatus.ACTIVE,
      },
    });
    if (!member) {
      throw messagingNotFound('CONVERSATION_MEMBER_NOT_FOUND', 'Member was not found.');
    }
    return member;
  }

  private async assertCounterpartEligible(tx: Tx, conversationId: string, actor: string) {
    const counterpart = await tx.conversationMember.findFirst({
      where: { conversationId, userId: { not: actor } },
      select: { userId: true },
    });
    const eligible = counterpart
      ? await tx.user.count({
          where: { id: counterpart.userId, ...this.access.eligibleMessagingUserWhere() },
        })
      : 0;
    if (eligible === 0) {
      throw messagingConflict(
        'CONVERSATION_RECIPIENT_INACTIVE',
        'This person can no longer receive messages.',
      );
    }
  }

  private assertActive(conversation: { status: ConversationStatus }): void {
    if (conversation.status !== ConversationStatus.ACTIVE) {
      throw messagingConflict('CONVERSATION_ARCHIVED', 'This conversation is archived.');
    }
  }

  private targetNotEligible() {
    return messagingConflict(
      'MESSAGING_USER_NOT_ELIGIBLE',
      'One or more selected people cannot take part in this conversation.',
    );
  }

  /** Metadata-only audit row: IDs, action, and counts. Never bodies, titles, or search text. */
  private async audit(
    tx: Tx,
    context: RequestContext,
    entry: {
      action: string;
      actorUserId: string;
      targetUserId?: string;
      entityType: AuditEntity;
      entityId: string;
      metadata: Record<string, string | number | boolean>;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId,
        targetUserId: entry.targetUserId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: JSON.stringify(entry.metadata),
      },
    });
  }
}

function distinctIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))];
}

function isInactive(user: UserRow): boolean {
  return user.status !== UserStatus.ACTIVE || user.archivedAt !== null;
}

function toParticipant(user: UserRow): ConversationParticipant {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    inactive: isInactive(user),
  };
}

export function toMessageView(message: MessageWithAuthor, actor: string): MessageView {
  const withdrawn = message.status === MessageStatus.ARCHIVED;
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: Number(message.sequence),
    author: {
      id: message.author.id,
      displayName: message.author.displayName,
      inactive: isInactive(message.author),
    },
    body: withdrawn ? null : message.body,
    status: message.status,
    withdrawn,
    editCount: message.editCount,
    editedAt: message.editedAt?.toISOString() ?? null,
    withdrawnAt: message.archivedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    clientMessageId: message.authorUserId === actor ? message.clientMessageId : null,
  };
}

/** Messages after `max(lastReadSequence, historyAfterSequence)`, capped for display. */
async function countUnread(
  db: PrismaService | Tx,
  conversationId: string,
  membership: Pick<ConversationMember, 'lastReadSequence' | 'historyAfterSequence'>,
): Promise<number> {
  const floor =
    membership.lastReadSequence > membership.historyAfterSequence
      ? membership.lastReadSequence
      : membership.historyAfterSequence;
  return db.message.count({
    where: { conversationId, sequence: { gt: floor } },
    take: MESSAGING_UNREAD_COUNT_CAP,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

function encodeCursor(activity: Date, id: string): string {
  return Buffer.from(JSON.stringify([activity.toISOString(), id])).toString('base64url');
}

/** The list cursor is opaque to clients; anything malformed is a 400, never a guess. */
function decodeCursor(cursor: string): { activity: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      UUID_PATTERN.test(parsed[1]) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed[0]) &&
      !Number.isNaN(Date.parse(parsed[0]))
    ) {
      // Columns are `timestamp(3)` holding UTC; compare without a zone.
      return { activity: parsed[0].slice(0, -1), id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw invalidMessagingRequest();
}
