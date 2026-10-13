import { z } from 'zod';

/**
 * Issue #171 / D-087 — internal messaging V1 foundation contracts.
 *
 * The reviewed vocabulary and limits shared by the persistence/access layer, the
 * API (Issue #179, PR B), and the later web workspace (PR C), plus the HTTP
 * request/response DTOs of the `/v1/messages` routes.
 */

/** Existing seeded permission codes; V1 adds no messaging permission. */
export const MESSAGING_PERMISSION_CODES = ['messages:view', 'messages:create'] as const;
export type MessagingPermissionCode = (typeof MESSAGING_PERMISSION_CODES)[number];
export const MESSAGES_VIEW_PERMISSION: MessagingPermissionCode = 'messages:view';
export const MESSAGES_CREATE_PERMISSION: MessagingPermissionCode = 'messages:create';

export const ConversationTypeSchema = z.enum(['PRIVATE', 'GROUP']);
export const ConversationStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const ConversationMemberRoleSchema = z.enum(['OWNER', 'MEMBER']);
export const ConversationMemberStatusSchema = z.enum(['ACTIVE', 'LEFT', 'REMOVED']);
export const MessageStatusSchema = z.enum(['ACTIVE', 'EDITED', 'ARCHIVED']);

export const MESSAGE_BODY_MAX_LENGTH = 4000;
export const GROUP_TITLE_MAX_LENGTH = 120;
/** Including the creator. */
export const GROUP_MIN_MEMBERS_AT_CREATION = 3;
export const GROUP_MAX_ACTIVE_MEMBERS = 50;
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MESSAGE_MAX_EDITS = 10;
export const MESSAGING_USER_OPTION_LIMIT = 20;
export const MESSAGING_USER_OPTION_SEARCH_MIN_LENGTH = 2;
export const MESSAGING_USER_OPTION_SEARCH_MAX_LENGTH = 120;
export const CONVERSATION_PAGE_SIZE = 25;
export const MESSAGE_PAGE_MAX = 50;

function hasDisallowedControlCharacter(value: string, allowLineBreaks: boolean): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (allowLineBreaks && (code === 0x09 || code === 0x0a)) {
      continue;
    }
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

/** Plain text, trimmed, 1-4000 characters; newlines and tabs are kept. */
export const MessageBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(MESSAGE_BODY_MAX_LENGTH)
  .refine((value) => !hasDisallowedControlCharacter(value, true), {
    message: 'Message text contains unsupported control characters.',
  });

/** One trimmed line of 1-120 characters. */
export const GroupTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(GROUP_TITLE_MAX_LENGTH)
  .refine((value) => !hasDisallowedControlCharacter(value, false), {
    message: 'Group title contains unsupported control characters.',
  });

/** Client-generated UUID that makes a retried send idempotent. */
export const ClientMessageIdSchema = z.string().uuid();

/** Stable error codes shared by the API and web layers. */
export const MESSAGING_ERROR_CODES = [
  'CONVERSATION_NOT_FOUND',
  'MESSAGE_NOT_FOUND',
  'CONVERSATION_ARCHIVED',
  'CONVERSATION_RECIPIENT_INACTIVE',
  'MESSAGE_EDIT_WINDOW_EXPIRED',
  'MESSAGE_WITHDRAWN',
  'GROUP_MEMBER_LIMIT',
  'GROUP_LAST_OWNER',
  'MESSAGING_USER_NOT_ELIGIBLE',
  'MESSAGING_ACTOR_NOT_ELIGIBLE',
  'MESSAGING_RATE_LIMITED',
  'MESSAGE_EDIT_LIMIT_REACHED',
  'MESSAGE_EDIT_UNCHANGED',
  'MESSAGE_CLIENT_ID_CONFLICT',
  'GROUP_OWNER_REQUIRED',
  'GROUP_OWNER_NOT_REMOVABLE',
  'GROUP_MEMBER_ALREADY_OWNER',
  'GROUP_MEMBER_COUNT_INVALID',
  'CONVERSATION_MEMBER_NOT_FOUND',
  'PRIVATE_CONVERSATION_IMMUTABLE',
  'CONVERSATION_HIDE_NOT_SUPPORTED',
  'INVALID_MESSAGING_REQUEST',
] as const;
export type MessagingErrorCode = (typeof MESSAGING_ERROR_CODES)[number];

export type ConversationType = z.infer<typeof ConversationTypeSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type ConversationMemberRole = z.infer<typeof ConversationMemberRoleSchema>;
export type ConversationMemberStatus = z.infer<typeof ConversationMemberStatusSchema>;
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

/** Unread counts above this are reported as the cap (displayed as "99+"). */
export const MESSAGING_UNREAD_COUNT_CAP = 100;
export const MESSAGE_PAGE_DEFAULT = 30;

const SequenceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const QuerySequenceSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const UuidSchema = z.string().uuid();
/** At most this many people per add request: the whole cap minus the owner. */
const GROUP_ADD_MAX = GROUP_MAX_ACTIVE_MEMBERS - 1;

// --- Participant picker ------------------------------------------------------

export const MessagingUserOptionPurposeSchema = z.enum(['direct', 'group-create', 'group-add']);

export const MessagingUserOptionsQuerySchema = z
  .object({
    purpose: MessagingUserOptionPurposeSchema.default('direct'),
    search: z
      .string()
      .trim()
      .min(MESSAGING_USER_OPTION_SEARCH_MIN_LENGTH)
      .max(MESSAGING_USER_OPTION_SEARCH_MAX_LENGTH),
    conversationId: UuidSchema.optional(),
  })
  .strict()
  .refine((query) => (query.purpose === 'group-add') === (query.conversationId !== undefined), {
    message: 'conversationId is required for group-add and not allowed otherwise.',
  });

/** Only what is needed to recognise a colleague; no role, status, or session data. */
export const MessagingUserOptionSchema = z
  .object({ id: UuidSchema, displayName: z.string(), email: z.string() })
  .strict();

export const MessagingUserOptionsResponseSchema = z
  .object({ users: z.array(MessagingUserOptionSchema).max(MESSAGING_USER_OPTION_LIMIT) })
  .strict();

// --- Conversations -----------------------------------------------------------

export const ConversationListFilterSchema = z.enum(['all', 'unread', 'archived']);

export const ConversationListQuerySchema = z
  .object({
    filter: ConversationListFilterSchema.default('all'),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict();

export const ConversationParticipantSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string(),
    email: z.string(),
    /** Suspended or archived account: history stays, but they cannot take part. */
    inactive: z.boolean(),
  })
  .strict();

export const ConversationMemberViewSchema = z
  .object({
    user: ConversationParticipantSchema,
    role: ConversationMemberRoleSchema,
    joinedAt: z.string().datetime(),
  })
  .strict();

export const ConversationSummarySchema = z
  .object({
    id: UuidSchema,
    type: ConversationTypeSchema,
    /** GROUP title; null for PRIVATE. */
    title: z.string().nullable(),
    status: ConversationStatusSchema,
    /** PRIVATE: the other participant; null for GROUP. */
    counterpart: ConversationParticipantSchema.nullable(),
    activeMemberCount: z.number().int().min(0).max(GROUP_MAX_ACTIVE_MEMBERS),
    myRole: ConversationMemberRoleSchema,
    lastMessageSequence: SequenceSchema,
    lastMessageAt: z.string().datetime().nullable(),
    lastReadSequence: SequenceSchema,
    unreadCount: z.number().int().min(0).max(MESSAGING_UNREAD_COUNT_CAP),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ConversationListResponseSchema = z
  .object({
    conversations: z.array(ConversationSummarySchema).max(CONVERSATION_PAGE_SIZE),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const ConversationDetailSchema = ConversationSummarySchema.extend({
  /** Only the conversation's ACTIVE members; former members are never listed. */
  members: z.array(ConversationMemberViewSchema).max(GROUP_MAX_ACTIVE_MEMBERS),
  /** Exclusive boundary: the actor sees only messages with a larger sequence. */
  historyAfterSequence: SequenceSchema,
}).strict();

export const ConversationDetailResponseSchema = z
  .object({ conversation: ConversationDetailSchema })
  .strict();

export const DirectConversationRequestSchema = z.object({ userId: UuidSchema }).strict();

export const DirectConversationResponseSchema = z
  .object({ conversation: ConversationDetailSchema, created: z.boolean() })
  .strict();

export const GroupCreateRequestSchema = z
  .object({
    title: GroupTitleSchema,
    /** The other founding members; the creator is added as OWNER. */
    memberUserIds: z
      .array(UuidSchema)
      .min(GROUP_MIN_MEMBERS_AT_CREATION - 1)
      .max(GROUP_ADD_MAX),
  })
  .strict();

export const GroupRenameRequestSchema = z.object({ title: GroupTitleSchema }).strict();

export const GroupAddMembersRequestSchema = z
  .object({ userIds: z.array(UuidSchema).min(1).max(GROUP_ADD_MAX) })
  .strict();

/** After leaving, the group is no longer visible to the actor at all. */
export const GroupLeaveResponseSchema = z.object({ left: z.literal(true) }).strict();

/** Per-member hide of a PRIVATE conversation (Issue #188, D-087). */
export const ConversationHideResponseSchema = z.object({ hidden: z.literal(true) }).strict();

export const UnreadSummaryResponseSchema = z
  .object({ unreadConversationCount: z.number().int().min(0) })
  .strict();

// --- Messages ----------------------------------------------------------------

export const MessageListQuerySchema = z
  .object({
    before: QuerySequenceSchema.optional(),
    after: QuerySequenceSchema.optional(),
    limit: z.coerce.number().int().min(1).max(MESSAGE_PAGE_MAX).default(MESSAGE_PAGE_DEFAULT),
  })
  .strict()
  .refine((query) => query.before === undefined || query.after === undefined, {
    message: 'Use either before or after, not both.',
  });

export const MessageSendRequestSchema = z
  .object({ body: MessageBodySchema, clientMessageId: ClientMessageIdSchema })
  .strict();

export const MessageEditRequestSchema = z.object({ body: MessageBodySchema }).strict();

export const ReadCursorRequestSchema = z.object({ upToSequence: SequenceSchema }).strict();

export const MessageAuthorSchema = z
  .object({ id: UuidSchema, displayName: z.string(), inactive: z.boolean() })
  .strict();

export const MessageViewSchema = z
  .object({
    id: UuidSchema,
    conversationId: UuidSchema,
    sequence: SequenceSchema.min(1),
    author: MessageAuthorSchema,
    /** Null once withdrawn: the API never returns a withdrawn body. */
    body: z.string().nullable(),
    status: MessageStatusSchema,
    withdrawn: z.boolean(),
    editCount: z.number().int().min(0).max(MESSAGE_MAX_EDITS),
    editedAt: z.string().datetime().nullable(),
    withdrawnAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    /** Returned only on the actor's own messages, so a client can reconcile retries. */
    clientMessageId: UuidSchema.nullable(),
  })
  .strict();

export const MessageListResponseSchema = z
  .object({ messages: z.array(MessageViewSchema).max(MESSAGE_PAGE_MAX), hasMore: z.boolean() })
  .strict();

export const MessageDetailResponseSchema = z.object({ message: MessageViewSchema }).strict();

export const MessageSendResponseSchema = z
  .object({ message: MessageViewSchema, replayed: z.boolean() })
  .strict();

export const ReadCursorResponseSchema = z
  .object({
    lastReadSequence: SequenceSchema,
    unreadCount: z.number().int().min(0).max(MESSAGING_UNREAD_COUNT_CAP),
  })
  .strict();

export type MessagingUserOptionPurpose = z.infer<typeof MessagingUserOptionPurposeSchema>;
export type MessagingUserOptionsQuery = z.infer<typeof MessagingUserOptionsQuerySchema>;
export type MessagingUserOption = z.infer<typeof MessagingUserOptionSchema>;
export type MessagingUserOptionsResponse = z.infer<typeof MessagingUserOptionsResponseSchema>;
export type ConversationListFilter = z.infer<typeof ConversationListFilterSchema>;
export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;
export type ConversationParticipant = z.infer<typeof ConversationParticipantSchema>;
export type ConversationMemberView = z.infer<typeof ConversationMemberViewSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;
export type ConversationDetailResponse = z.infer<typeof ConversationDetailResponseSchema>;
export type DirectConversationRequest = z.infer<typeof DirectConversationRequestSchema>;
export type DirectConversationResponse = z.infer<typeof DirectConversationResponseSchema>;
export type GroupCreateRequest = z.infer<typeof GroupCreateRequestSchema>;
export type GroupRenameRequest = z.infer<typeof GroupRenameRequestSchema>;
export type GroupAddMembersRequest = z.infer<typeof GroupAddMembersRequestSchema>;
export type GroupLeaveResponse = z.infer<typeof GroupLeaveResponseSchema>;
export type ConversationHideResponse = z.infer<typeof ConversationHideResponseSchema>;
export type UnreadSummaryResponse = z.infer<typeof UnreadSummaryResponseSchema>;
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;
export type MessageSendRequest = z.infer<typeof MessageSendRequestSchema>;
export type MessageEditRequest = z.infer<typeof MessageEditRequestSchema>;
export type ReadCursorRequest = z.infer<typeof ReadCursorRequestSchema>;
export type MessageAuthor = z.infer<typeof MessageAuthorSchema>;
export type MessageView = z.infer<typeof MessageViewSchema>;
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;
export type MessageDetailResponse = z.infer<typeof MessageDetailResponseSchema>;
export type MessageSendResponse = z.infer<typeof MessageSendResponseSchema>;
export type ReadCursorResponse = z.infer<typeof ReadCursorResponseSchema>;
