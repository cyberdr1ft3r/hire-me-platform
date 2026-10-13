import {
  ConversationDetailResponseSchema,
  ConversationListResponseSchema,
  DirectConversationResponseSchema,
  GroupLeaveResponseSchema,
  MessageDetailResponseSchema,
  MessageListResponseSchema,
  MessageSendResponseSchema,
  MessagingUserOptionsResponseSchema,
  ConversationHideResponseSchema,
  ReadCursorResponseSchema,
  UnreadSummaryResponseSchema,
  type ConversationDetailResponse,
  type ConversationListFilter,
  type ConversationListResponse,
  type DirectConversationResponse,
  type GroupLeaveResponse,
  type MessageDetailResponse,
  type MessageListResponse,
  type MessageSendResponse,
  type MessagingUserOptionPurpose,
  type MessagingUserOptionsResponse,
  type ReadCursorResponse,
  type UnreadSummaryResponse,
} from '@hire-me/contracts';

import { getApiBaseUrl, readStableErrorCode } from '../api.js';

/**
 * A failed messaging request, carrying the HTTP status and the API's stable
 * error code when one was supplied. The server's free-text message is not kept:
 * the Messages workspace shows its own localized copy.
 */
export class MessagingRequestError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(status: number, code: string | null) {
    super(`Messaging request failed with status ${status}`);
    this.name = 'MessagingRequestError';
    this.code = code;
    this.status = status;
  }
}

async function messagingRequest(
  accessToken: string,
  path: string,
  init: { body?: unknown; method?: 'GET' | 'PATCH' | 'POST' } = {},
): Promise<Response> {
  const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${getApiBaseUrl()}/v1/messages${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'include',
    headers,
    method: init.method ?? 'GET',
  });
  if (!response.ok) {
    throw new MessagingRequestError(response.status, await readStableErrorCode(response));
  }
  return response;
}

function query(parameters: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

const segment = encodeURIComponent;

export async function getMessagingUnreadSummary(
  accessToken: string,
): Promise<UnreadSummaryResponse> {
  const response = await messagingRequest(accessToken, '/unread-summary');
  return UnreadSummaryResponseSchema.parse(await response.json());
}

export async function listConversations(
  accessToken: string,
  options: { cursor?: string | null; filter: ConversationListFilter },
): Promise<ConversationListResponse> {
  const response = await messagingRequest(
    accessToken,
    `/conversations${query({ cursor: options.cursor ?? undefined, filter: options.filter })}`,
  );
  return ConversationListResponseSchema.parse(await response.json());
}

export async function getConversation(
  accessToken: string,
  conversationId: string,
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(accessToken, `/conversations/${segment(conversationId)}`);
  return ConversationDetailResponseSchema.parse(await response.json());
}

export async function listMessagingUserOptions(
  accessToken: string,
  options: { conversationId?: string; purpose: MessagingUserOptionPurpose; search: string },
): Promise<MessagingUserOptionsResponse> {
  const response = await messagingRequest(
    accessToken,
    `/user-options${query({
      conversationId: options.conversationId,
      purpose: options.purpose,
      search: options.search,
    })}`,
  );
  return MessagingUserOptionsResponseSchema.parse(await response.json());
}

export async function openDirectConversation(
  accessToken: string,
  userId: string,
): Promise<DirectConversationResponse> {
  const response = await messagingRequest(accessToken, '/conversations/direct', {
    body: { userId },
    method: 'POST',
  });
  return DirectConversationResponseSchema.parse(await response.json());
}

export async function createGroupConversation(
  accessToken: string,
  input: { memberUserIds: string[]; title: string },
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(accessToken, '/conversations/groups', {
    body: input,
    method: 'POST',
  });
  return ConversationDetailResponseSchema.parse(await response.json());
}

export async function listConversationMessages(
  accessToken: string,
  conversationId: string,
  options: { after?: number; before?: number; limit?: number } = {},
): Promise<MessageListResponse> {
  const response = await messagingRequest(
    accessToken,
    `/conversations/${segment(conversationId)}/messages${query(options)}`,
  );
  return MessageListResponseSchema.parse(await response.json());
}

export async function sendConversationMessage(
  accessToken: string,
  conversationId: string,
  input: { body: string; clientMessageId: string },
): Promise<MessageSendResponse> {
  const response = await messagingRequest(
    accessToken,
    `/conversations/${segment(conversationId)}/messages`,
    { body: input, method: 'POST' },
  );
  return MessageSendResponseSchema.parse(await response.json());
}

export async function editConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  body: string,
): Promise<MessageDetailResponse> {
  const response = await messagingRequest(
    accessToken,
    `/conversations/${segment(conversationId)}/messages/${segment(messageId)}`,
    { body: { body }, method: 'PATCH' },
  );
  return MessageDetailResponseSchema.parse(await response.json());
}

export async function withdrawConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessageDetailResponse> {
  const response = await messagingRequest(
    accessToken,
    `/conversations/${segment(conversationId)}/messages/${segment(messageId)}/withdraw`,
    { method: 'POST' },
  );
  return MessageDetailResponseSchema.parse(await response.json());
}

export async function markConversationRead(
  accessToken: string,
  conversationId: string,
  upToSequence: number,
): Promise<ReadCursorResponse> {
  const response = await messagingRequest(
    accessToken,
    `/conversations/${segment(conversationId)}/read`,
    { body: { upToSequence }, method: 'POST' },
  );
  return ReadCursorResponseSchema.parse(await response.json());
}

export async function hideConversation(accessToken: string, conversationId: string): Promise<void> {
  const response = await messagingRequest(
    accessToken,
    `/conversations/${segment(conversationId)}/hide`,
    {
      method: 'POST',
    },
  );
  ConversationHideResponseSchema.parse(await response.json());
}

export async function renameGroup(
  accessToken: string,
  conversationId: string,
  title: string,
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(accessToken, `/groups/${segment(conversationId)}`, {
    body: { title },
    method: 'PATCH',
  });
  return ConversationDetailResponseSchema.parse(await response.json());
}

export async function addGroupMembers(
  accessToken: string,
  conversationId: string,
  userIds: string[],
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(
    accessToken,
    `/groups/${segment(conversationId)}/members`,
    { body: { userIds }, method: 'POST' },
  );
  return ConversationDetailResponseSchema.parse(await response.json());
}

export async function removeGroupMember(
  accessToken: string,
  conversationId: string,
  userId: string,
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(
    accessToken,
    `/groups/${segment(conversationId)}/members/${segment(userId)}/remove`,
    { method: 'POST' },
  );
  return ConversationDetailResponseSchema.parse(await response.json());
}

export async function promoteGroupMember(
  accessToken: string,
  conversationId: string,
  userId: string,
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(
    accessToken,
    `/groups/${segment(conversationId)}/members/${segment(userId)}/promote`,
    { method: 'POST' },
  );
  return ConversationDetailResponseSchema.parse(await response.json());
}

export async function leaveGroup(
  accessToken: string,
  conversationId: string,
): Promise<GroupLeaveResponse> {
  const response = await messagingRequest(accessToken, `/groups/${segment(conversationId)}/leave`, {
    method: 'POST',
  });
  return GroupLeaveResponseSchema.parse(await response.json());
}

export async function archiveGroup(
  accessToken: string,
  conversationId: string,
): Promise<ConversationDetailResponse> {
  const response = await messagingRequest(
    accessToken,
    `/groups/${segment(conversationId)}/archive`,
    { method: 'POST' },
  );
  return ConversationDetailResponseSchema.parse(await response.json());
}
