import {
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_MIN_MEMBERS_AT_CREATION,
  GROUP_TITLE_MAX_LENGTH,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_PAGE_MAX,
  MESSAGE_MAX_EDITS,
  MESSAGING_UNREAD_COUNT_CAP,
  type ConversationDetail,
  type ConversationListFilter,
  type ConversationSummary,
  type MessageView,
} from '@hire-me/contracts';

import type { MessageKey } from '../i18n/index.js';
import { MessagingRequestError } from './messages-api.js';

/** The counter and warning appear once a draft passes this length. */
export const COMPOSER_WARNING_LENGTH = 3500;
export const MESSAGE_PAGE_SIZE = 30;
export const CONVERSATION_POLL_MS = 15_000;
export const LIST_POLL_MS = 30_000;
/** How many already-loaded messages each poll re-reads, to pick up edits and withdrawals. */
export const POLL_OVERLAP = 20;
/** Matches the stacked-layout breakpoint: below this the workspace shows one pane at a time. */
export const MESSAGES_SIDE_BY_SIDE_MIN_REM = 48;
export const GROUP_MIN_OTHER_MEMBERS = GROUP_MIN_MEMBERS_AT_CREATION - 1;
export const GROUP_MAX_OTHER_MEMBERS = GROUP_MAX_ACTIVE_MEMBERS - 1;
export {
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_TITLE_MAX_LENGTH,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_PAGE_MAX,
  MESSAGING_UNREAD_COUNT_CAP,
};

export type FailureKey = Extract<MessageKey, `messages.feedback.failure.${string}`>;

const FAILURE_BY_CODE: Partial<Record<string, FailureKey>> = {
  CONVERSATION_ARCHIVED: 'messages.feedback.failure.archived',
  CONVERSATION_MEMBER_NOT_FOUND: 'messages.feedback.failure.notFound',
  CONVERSATION_NOT_FOUND: 'messages.feedback.failure.notFound',
  CONVERSATION_RECIPIENT_INACTIVE: 'messages.feedback.failure.recipientInactive',
  GROUP_LAST_OWNER: 'messages.feedback.failure.lastOwner',
  GROUP_MEMBER_ALREADY_OWNER: 'messages.feedback.failure.alreadyOwner',
  GROUP_MEMBER_COUNT_INVALID: 'messages.feedback.failure.memberCount',
  GROUP_MEMBER_LIMIT: 'messages.feedback.failure.memberLimit',
  GROUP_OWNER_NOT_REMOVABLE: 'messages.feedback.failure.ownerNotRemovable',
  GROUP_OWNER_REQUIRED: 'messages.feedback.failure.ownerRequired',
  INVALID_MESSAGING_REQUEST: 'messages.feedback.failure.invalid',
  MESSAGE_CLIENT_ID_CONFLICT: 'messages.feedback.failure.unchangedIdentifier',
  MESSAGE_EDIT_LIMIT_REACHED: 'messages.feedback.failure.editLimit',
  MESSAGE_EDIT_UNCHANGED: 'messages.feedback.failure.editUnchanged',
  MESSAGE_EDIT_WINDOW_EXPIRED: 'messages.feedback.failure.editWindow',
  MESSAGE_NOT_FOUND: 'messages.feedback.failure.messageNotFound',
  MESSAGE_WITHDRAWN: 'messages.feedback.failure.withdrawn',
  MESSAGING_ACTOR_NOT_ELIGIBLE: 'messages.feedback.failure.actorNotEligible',
  MESSAGING_RATE_LIMITED: 'messages.feedback.failure.rateLimited',
  MESSAGING_USER_NOT_ELIGIBLE: 'messages.feedback.failure.userNotEligible',
  CONVERSATION_HIDE_NOT_SUPPORTED: 'messages.feedback.failure.hideNotSupported',
  PRIVATE_CONVERSATION_IMMUTABLE: 'messages.feedback.failure.invalid',
};

/**
 * Localized copy for a failed request. The stable code wins; otherwise the
 * status decides. A missing, foreign, or removed conversation all read the same.
 */
export function messagingFailureKey(error: unknown): FailureKey {
  if (!(error instanceof MessagingRequestError)) {
    return 'messages.feedback.failure.generic';
  }
  const byCode = error.code ? FAILURE_BY_CODE[error.code] : undefined;
  if (byCode) {
    return byCode;
  }
  switch (error.status) {
    case 400:
      return 'messages.feedback.failure.invalid';
    case 403:
      return 'messages.feedback.failure.forbidden';
    case 404:
      return 'messages.feedback.failure.notFound';
    case 409:
      return 'messages.feedback.failure.conflict';
    case 429:
      return 'messages.feedback.failure.rateLimited';
    default:
      return 'messages.feedback.failure.generic';
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof MessagingRequestError && error.status === 404;
}

export type ReadOnlyReason = 'archived' | 'inactive' | 'permission';

/** Why the composer is closed, if it is. The server stays authoritative on send. */
export function composerReadOnlyReason(
  conversation: Pick<ConversationSummary, 'counterpart' | 'status' | 'type'>,
  canCreate: boolean,
): ReadOnlyReason | null {
  if (conversation.status === 'ARCHIVED') {
    return 'archived';
  }
  if (conversation.type === 'PRIVATE' && conversation.counterpart?.inactive) {
    return 'inactive';
  }
  return canCreate ? null : 'permission';
}

export function readOnlyReasonFromError(error: unknown): ReadOnlyReason | null {
  if (!(error instanceof MessagingRequestError)) {
    return null;
  }
  if (error.code === 'CONVERSATION_ARCHIVED') {
    return 'archived';
  }
  return error.code === 'CONVERSATION_RECIPIENT_INACTIVE' ? 'inactive' : null;
}

/** Ordered by sequence, one entry per message; a newer copy replaces an older one. */
export function mergeMessages(
  current: readonly MessageView[],
  incoming: readonly MessageView[],
): MessageView[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

/** Whether a summary still belongs on the list for the active server-side filter. */
export function conversationMatchesListFilter(
  summary: ConversationSummary,
  filter: ConversationListFilter,
): boolean {
  switch (filter) {
    case 'archived':
      return summary.status === 'ARCHIVED';
    case 'unread':
      return summary.unreadCount > 0;
    case 'all':
    default:
      return summary.status === 'ACTIVE';
  }
}

/**
 * Reconcile after an authoritative first-page refresh while keeping later keyset
 * pages. The refreshed first page wins for its ids; tail rows are kept only when
 * their id is absent from that page and the client already knows they still
 * match the active filter (read/archive/hide/leave updates drop rows first).
 */
export function reconcileConversationListAfterFirstPageRefresh(
  current: readonly ConversationSummary[],
  firstPage: readonly ConversationSummary[],
  filter: ConversationListFilter,
): ConversationSummary[] {
  const freshIds = new Set(firstPage.map((conversation) => conversation.id));
  const tail = current.filter(
    (conversation) =>
      !freshIds.has(conversation.id) && conversationMatchesListFilter(conversation, filter),
  );
  return [...firstPage, ...tail];
}

/** @deprecated Use reconcileConversationListAfterFirstPageRefresh with a filter. */
export function mergeFirstPage(
  current: readonly ConversationSummary[],
  firstPage: readonly ConversationSummary[],
): ConversationSummary[] {
  return reconcileConversationListAfterFirstPageRefresh(current, firstPage, 'all');
}

/** Apply a fresher row summary, or drop the row when it no longer matches the filter. */
export function applyConversationRowToList(
  current: readonly ConversationSummary[],
  summary: ConversationSummary,
  filter: ConversationListFilter,
): ConversationSummary[] {
  if (!current.some((conversation) => conversation.id === summary.id)) {
    return [...current];
  }
  if (!conversationMatchesListFilter(summary, filter)) {
    return current.filter((conversation) => conversation.id !== summary.id);
  }
  return current.map((conversation) => (conversation.id === summary.id ? summary : conversation));
}

export function appendPage(
  current: readonly ConversationSummary[],
  page: readonly ConversationSummary[],
): ConversationSummary[] {
  const seen = new Set(current.map((conversation) => conversation.id));
  return [...current, ...page.filter((conversation) => !seen.has(conversation.id))];
}

/** The list row for a conversation, rebuilt from a fresher detail response. */
export function summaryFromDetail(detail: ConversationDetail): ConversationSummary {
  return {
    activeMemberCount: detail.activeMemberCount,
    counterpart: detail.counterpart,
    createdAt: detail.createdAt,
    id: detail.id,
    lastMessageAt: detail.lastMessageAt,
    lastMessageSequence: detail.lastMessageSequence,
    lastReadSequence: detail.lastReadSequence,
    myRole: detail.myRole,
    status: detail.status,
    title: detail.title,
    type: detail.type,
    unreadCount: detail.unreadCount,
  };
}

/** The name people recognise: a group title, or the other participant's name. */
export function conversationName(
  conversation: Pick<ConversationSummary, 'counterpart' | 'title' | 'type'>,
): string {
  return conversation.type === 'GROUP'
    ? (conversation.title ?? '')
    : (conversation.counterpart?.displayName ?? '');
}

export function formatUnreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function isOwnMessage(message: MessageView, actorUserId: string): boolean {
  return message.author.id.toLowerCase() === actorUserId.toLowerCase();
}

export function canEditMessage(
  message: MessageView,
  context: { actorUserId: string; conversationActive: boolean; now: number },
): boolean {
  return (
    context.conversationActive &&
    !message.withdrawn &&
    isOwnMessage(message, context.actorUserId) &&
    message.editCount < MESSAGE_MAX_EDITS &&
    context.now - Date.parse(message.createdAt) <= MESSAGE_EDIT_WINDOW_MS
  );
}

export function canWithdrawMessage(
  message: MessageView,
  context: { actorUserId: string; conversationActive: boolean },
): boolean {
  return (
    context.conversationActive && !message.withdrawn && isOwnMessage(message, context.actorUserId)
  );
}

/** Mirrors the contract: trimmed, 1-4000 characters. */
export function messageBodyProblem(draft: string): 'empty' | 'tooLong' | null {
  const trimmed = draft.trim();
  if (trimmed.length === 0) {
    return 'empty';
  }
  return trimmed.length > MESSAGE_BODY_MAX_LENGTH ? 'tooLong' : null;
}

export function newClientMessageId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export interface MessageDay {
  date: Date;
  key: string;
  messages: MessageView[];
}

/** Consecutive messages grouped by the reader's local calendar day. */
export function groupMessagesByDay(messages: readonly MessageView[]): MessageDay[] {
  const days: MessageDay[] = [];
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const key = localDayKey(date);
    const last = days.at(-1);
    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      days.push({ date, key, messages: [message] });
    }
  }
  return days;
}

export type RelativeDay = 'today' | 'yesterday' | 'other';

export function relativeDay(date: Date, now: Date): RelativeDay {
  if (localDayKey(date) === localDayKey(now)) {
    return 'today';
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return localDayKey(date) === localDayKey(yesterday) ? 'yesterday' : 'other';
}

export function isSameLocalDay(date: Date, now: Date): boolean {
  return localDayKey(date) === localDayKey(now);
}

export function groupTitleProblem(title: string): 'required' | 'tooLong' | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return 'required';
  }
  return trimmed.length > GROUP_TITLE_MAX_LENGTH ? 'tooLong' : null;
}
