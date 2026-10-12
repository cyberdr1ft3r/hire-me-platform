import { z } from 'zod';

/**
 * Issue #171 / D-087 — internal messaging V1 foundation contracts.
 *
 * Only the reviewed vocabulary and limits shared by the persistence/access layer
 * and the later API (PR B) and web (PR C). No request/response DTOs yet: those
 * arrive with the routes.
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
] as const;
export type MessagingErrorCode = (typeof MESSAGING_ERROR_CODES)[number];

export type ConversationType = z.infer<typeof ConversationTypeSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type ConversationMemberRole = z.infer<typeof ConversationMemberRoleSchema>;
export type ConversationMemberStatus = z.infer<typeof ConversationMemberStatusSchema>;
export type MessageStatus = z.infer<typeof MessageStatusSchema>;
