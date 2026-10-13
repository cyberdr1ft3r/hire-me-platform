import type {
  ConversationDetail,
  ConversationMemberView,
  ConversationParticipant,
  ConversationSummary,
  MessageView,
} from '@hire-me/contracts';
import { vi } from 'vitest';

/** Synthetic messaging fixtures. No real person or conversation is represented. */

export const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
export const PEER_ID = '22222222-2222-4222-8222-222222222222';
export const THIRD_ID = '33333333-3333-4333-8333-333333333333';
export const FOURTH_ID = '44444444-4444-4444-8444-444444444444';
export const OWNER_ID = '55555555-5555-4555-8555-555555555555';
export const DIRECT_ID = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
export const GROUP_ID = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
export const ARCHIVED_ID = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
export const INACTIVE_DIRECT_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';

export const MESSAGING_ACCESS = ['messages:view', 'messages:create'];
export const VIEW_ONLY_ACCESS = ['messages:view'];

export interface RecordedCall {
  authorization: string | null;
  body: Record<string, unknown> | null;
  method: string;
  path: string;
  search: URLSearchParams;
}

export const PEOPLE: Record<string, ConversationParticipant> = {
  [ACTOR_ID]: {
    displayName: 'Synthetic Actor',
    email: 'actor@example.test',
    id: ACTOR_ID,
    inactive: false,
  },
  [PEER_ID]: {
    displayName: 'Nadia Peer',
    email: 'peer@example.test',
    id: PEER_ID,
    inactive: false,
  },
  [THIRD_ID]: {
    displayName: 'Omar Third',
    email: 'third@example.test',
    id: THIRD_ID,
    inactive: false,
  },
  [FOURTH_ID]: {
    displayName: 'Lina Fourth',
    email: 'fourth@example.test',
    id: FOURTH_ID,
    inactive: false,
  },
  [OWNER_ID]: {
    displayName: 'Karim Owner',
    email: 'owner@example.test',
    id: OWNER_ID,
    inactive: false,
  },
};

interface FakeConversation {
  createdAt: string;
  hidden: boolean;
  id: string;
  lastReadSequence: number;
  members: ConversationMemberView[];
  messages: MessageView[];
  status: 'ACTIVE' | 'ARCHIVED';
  title: string | null;
  type: 'PRIVATE' | 'GROUP';
  counterpartInactive?: boolean;
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

let messageCounter = 0;

export function syntheticMessage(
  conversationId: string,
  sequence: number,
  authorId: string,
  body: string,
  overrides: Partial<MessageView> = {},
): MessageView {
  messageCounter += 1;
  const author = PEOPLE[authorId];
  return {
    author: { displayName: author?.displayName ?? '', id: authorId, inactive: false },
    body,
    clientMessageId: null,
    conversationId,
    createdAt: minutesAgo(Math.max(0, 60 - sequence)),
    editCount: 0,
    editedAt: null,
    id: `0000${String(messageCounter).padStart(4, '0')}-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    sequence,
    status: 'ACTIVE',
    withdrawn: false,
    withdrawnAt: null,
    ...overrides,
  };
}

function member(id: string, role: 'OWNER' | 'MEMBER'): ConversationMemberView {
  const user = PEOPLE[id];
  if (!user) {
    throw new Error(`Unknown fixture user ${id}`);
  }
  return { joinedAt: minutesAgo(600), role, user: { ...user } };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

export function apiError(status: number, code: string): Response {
  return json(status, { error: { code, message: 'Synthetic failure' } });
}

export interface FakeMessagingOptions {
  /** Optional first look at every call; return a Response to short-circuit the fake. */
  override?: (call: RecordedCall) => Promise<Response> | Response | undefined;
}

/**
 * A small in-memory stand-in for `/v1/messages`, following the API's rules
 * closely enough for the web workspace: keyset list paging, ascending message
 * pages, idempotent send, read cursors, find-or-create direct, group roles, and
 * PRIVATE hide that resurfaces on a newer message.
 */
export function createFakeMessaging(options: FakeMessagingOptions = {}) {
  const conversations = new Map<string, FakeConversation>();
  const calls: RecordedCall[] = [];
  let pageSize = 25;
  const userOptions = [PEOPLE[PEER_ID], PEOPLE[THIRD_ID], PEOPLE[FOURTH_ID]].filter(
    (person): person is ConversationParticipant => Boolean(person),
  );

  function add(conversation: FakeConversation): void {
    conversations.set(conversation.id, conversation);
  }

  add({
    createdAt: minutesAgo(900),
    hidden: false,
    id: DIRECT_ID,
    lastReadSequence: 1,
    members: [member(ACTOR_ID, 'MEMBER'), member(PEER_ID, 'MEMBER')],
    messages: [
      syntheticMessage(DIRECT_ID, 1, ACTOR_ID, 'Hello Nadia, are you free later?'),
      syntheticMessage(DIRECT_ID, 2, PEER_ID, 'Private body that must never be previewed'),
      syntheticMessage(DIRECT_ID, 3, PEER_ID, '', {
        body: null,
        status: 'ARCHIVED',
        withdrawn: true,
        withdrawnAt: minutesAgo(1),
      }),
    ],
    status: 'ACTIVE',
    title: null,
    type: 'PRIVATE',
  });
  add({
    createdAt: minutesAgo(800),
    hidden: false,
    id: GROUP_ID,
    lastReadSequence: 2,
    members: [
      member(ACTOR_ID, 'OWNER'),
      member(OWNER_ID, 'OWNER'),
      member(PEER_ID, 'MEMBER'),
      member(THIRD_ID, 'MEMBER'),
    ],
    messages: [
      syntheticMessage(GROUP_ID, 1, OWNER_ID, 'Welcome to the synthetic group'),
      syntheticMessage(GROUP_ID, 2, ACTOR_ID, 'Thanks, glad to be here', {
        editCount: 1,
        editedAt: minutesAgo(2),
        status: 'EDITED',
      }),
    ],
    status: 'ACTIVE',
    title: 'Synthetic sourcing circle',
    type: 'GROUP',
  });
  add({
    createdAt: minutesAgo(1200),
    hidden: false,
    id: ARCHIVED_ID,
    lastReadSequence: 1,
    members: [member(ACTOR_ID, 'MEMBER'), member(OWNER_ID, 'OWNER'), member(PEER_ID, 'MEMBER')],
    messages: [syntheticMessage(ARCHIVED_ID, 1, OWNER_ID, 'Archived history stays readable')],
    status: 'ARCHIVED',
    title: 'Synthetic archived group',
    type: 'GROUP',
  });
  add({
    counterpartInactive: true,
    createdAt: minutesAgo(1500),
    hidden: false,
    id: INACTIVE_DIRECT_ID,
    lastReadSequence: 1,
    members: [member(ACTOR_ID, 'MEMBER'), member(FOURTH_ID, 'MEMBER')],
    messages: [syntheticMessage(INACTIVE_DIRECT_ID, 1, FOURTH_ID, 'Last note before leaving')],
    status: 'ACTIVE',
    title: null,
    type: 'PRIVATE',
  });

  function counterpart(conversation: FakeConversation): ConversationParticipant | null {
    if (conversation.type !== 'PRIVATE') {
      return null;
    }
    const other = conversation.members.find((entry) => entry.user.id !== ACTOR_ID);
    return other ? { ...other.user, inactive: Boolean(conversation.counterpartInactive) } : null;
  }

  function lastSequence(conversation: FakeConversation): number {
    return conversation.messages.at(-1)?.sequence ?? 0;
  }

  function unreadCount(conversation: FakeConversation): number {
    return Math.min(
      100,
      conversation.messages.filter(
        (message) =>
          message.sequence > conversation.lastReadSequence && message.author.id !== ACTOR_ID,
      ).length,
    );
  }

  function summary(conversation: FakeConversation): ConversationSummary {
    return {
      activeMemberCount: conversation.members.length,
      counterpart: counterpart(conversation),
      createdAt: conversation.createdAt,
      id: conversation.id,
      lastMessageAt: conversation.messages.at(-1)?.createdAt ?? null,
      lastMessageSequence: lastSequence(conversation),
      lastReadSequence: conversation.lastReadSequence,
      myRole: conversation.members.find((entry) => entry.user.id === ACTOR_ID)?.role ?? 'MEMBER',
      status: conversation.status,
      title: conversation.title,
      type: conversation.type,
      unreadCount: unreadCount(conversation),
    };
  }

  function detail(conversation: FakeConversation): ConversationDetail {
    return { ...summary(conversation), historyAfterSequence: 0, members: conversation.members };
  }

  function visible(): FakeConversation[] {
    return [...conversations.values()]
      .filter((conversation) => conversation.members.some((entry) => entry.user.id === ACTOR_ID))
      .sort((left, right) =>
        (right.messages.at(-1)?.createdAt ?? right.createdAt).localeCompare(
          left.messages.at(-1)?.createdAt ?? left.createdAt,
        ),
      );
  }

  function list(search: URLSearchParams): Response {
    const filter = search.get('filter') ?? 'all';
    const rows = visible().filter((conversation) => {
      if (conversation.hidden) {
        return false;
      }
      if (filter === 'archived') {
        return conversation.status === 'ARCHIVED';
      }
      if (filter === 'unread') {
        return unreadCount(conversation) > 0;
      }
      return conversation.status === 'ACTIVE';
    });
    const cursor = search.get('cursor');
    const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
    const page = rows.slice(start, start + pageSize);
    const next = start + pageSize < rows.length ? (page.at(-1)?.id ?? null) : null;
    return json(200, { conversations: page.map(summary), nextCursor: next });
  }

  function find(id: string | undefined): FakeConversation | null {
    const conversation = id ? conversations.get(id) : undefined;
    return conversation && conversation.members.some((entry) => entry.user.id === ACTOR_ID)
      ? conversation
      : null;
  }

  function messages(conversation: FakeConversation, search: URLSearchParams): Response {
    const limit = Number(search.get('limit') ?? 30);
    const after = search.get('after');
    const before = search.get('before');
    if (after !== null) {
      const rows = conversation.messages.filter((message) => message.sequence > Number(after));
      return json(200, { hasMore: rows.length > limit, messages: rows.slice(0, limit) });
    }
    const rows = conversation.messages.filter(
      (message) => before === null || message.sequence < Number(before),
    );
    return json(200, { hasMore: rows.length > limit, messages: rows.slice(-limit) });
  }

  function append(conversation: FakeConversation, authorId: string, body: string): MessageView {
    const message = syntheticMessage(
      conversation.id,
      lastSequence(conversation) + 1,
      authorId,
      body,
      {
        createdAt: new Date().toISOString(),
      },
    );
    conversation.messages.push(message);
    conversation.hidden = false;
    return message;
  }

  async function handle(call: RecordedCall): Promise<Response | undefined> {
    const overridden = await options.override?.(call);
    if (overridden) {
      return overridden;
    }
    const parts = call.path.replace(/^\/v1\/messages\/?/, '').split('/');
    const [root, id, sub, subId, action] = parts;
    if (root === 'unread-summary' && call.method === 'GET') {
      return json(200, {
        unreadConversationCount: visible().filter(
          (conversation) => !conversation.hidden && unreadCount(conversation) > 0,
        ).length,
      });
    }
    if (root === 'user-options' && call.method === 'GET') {
      const term = (call.search.get('search') ?? '').toLowerCase();
      return json(200, {
        users: userOptions
          .filter((person) => person.displayName.toLowerCase().includes(term))
          .map(({ displayName, email, id: userId }) => ({ displayName, email, id: userId })),
      });
    }
    if (root === 'conversations' && id === undefined && call.method === 'GET') {
      return list(call.search);
    }
    if (root === 'conversations' && id === 'direct' && call.method === 'POST') {
      const userId = String(call.body?.userId);
      const existing = visible().find(
        (conversation) =>
          conversation.type === 'PRIVATE' &&
          conversation.members.some((entry) => entry.user.id === userId),
      );
      if (existing) {
        return json(200, { conversation: detail(existing), created: false });
      }
      const created: FakeConversation = {
        createdAt: new Date().toISOString(),
        hidden: false,
        id: `9${userId.slice(1)}`,
        lastReadSequence: 0,
        members: [member(ACTOR_ID, 'MEMBER'), member(userId, 'MEMBER')],
        messages: [],
        status: 'ACTIVE',
        title: null,
        type: 'PRIVATE',
      };
      add(created);
      return json(201, { conversation: detail(created), created: true });
    }
    if (root === 'conversations' && id === 'groups' && call.method === 'POST') {
      const memberIds = (call.body?.memberUserIds as string[]) ?? [];
      const created: FakeConversation = {
        createdAt: new Date().toISOString(),
        hidden: false,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        lastReadSequence: 0,
        members: [
          member(ACTOR_ID, 'OWNER'),
          ...memberIds.map((userId) => member(userId, 'MEMBER')),
        ],
        messages: [],
        status: 'ACTIVE',
        title: String(call.body?.title),
        type: 'GROUP',
      };
      add(created);
      return json(201, { conversation: detail(created) });
    }
    if (root === 'conversations') {
      const conversation = find(id);
      if (!conversation) {
        return apiError(404, 'CONVERSATION_NOT_FOUND');
      }
      if (sub === undefined && call.method === 'GET') {
        return json(200, { conversation: detail(conversation) });
      }
      if (sub === 'messages' && subId === undefined && call.method === 'GET') {
        return messages(conversation, call.search);
      }
      if (sub === 'messages' && subId === undefined && call.method === 'POST') {
        if (conversation.status === 'ARCHIVED') {
          return apiError(409, 'CONVERSATION_ARCHIVED');
        }
        const clientMessageId = String(call.body?.clientMessageId);
        const replay = conversation.messages.find(
          (message) => message.clientMessageId === clientMessageId,
        );
        if (replay) {
          return json(200, { message: replay, replayed: true });
        }
        const message = append(conversation, ACTOR_ID, String(call.body?.body));
        message.clientMessageId = clientMessageId;
        conversation.lastReadSequence = message.sequence;
        return json(201, { message, replayed: false });
      }
      if (sub === 'messages' && subId !== undefined) {
        const index = conversation.messages.findIndex((message) => message.id === subId);
        const message = conversation.messages[index];
        if (!message) {
          return apiError(404, 'MESSAGE_NOT_FOUND');
        }
        const next: MessageView =
          action === 'withdraw'
            ? {
                ...message,
                body: null,
                status: 'ARCHIVED',
                withdrawn: true,
                withdrawnAt: new Date().toISOString(),
              }
            : {
                ...message,
                body: String(call.body?.body),
                editCount: message.editCount + 1,
                editedAt: new Date().toISOString(),
                status: 'EDITED',
              };
        conversation.messages[index] = next;
        return json(200, { message: next });
      }
      if (sub === 'read' && call.method === 'POST') {
        conversation.lastReadSequence = Math.max(
          conversation.lastReadSequence,
          Number(call.body?.upToSequence),
        );
        return json(200, {
          lastReadSequence: conversation.lastReadSequence,
          unreadCount: unreadCount(conversation),
        });
      }
      if (sub === 'hide' && call.method === 'POST') {
        if (conversation.type !== 'PRIVATE') {
          return apiError(409, 'CONVERSATION_HIDE_NOT_SUPPORTED');
        }
        conversation.hidden = true;
        return json(201, { hidden: true });
      }
    }
    if (root === 'groups') {
      const conversation = find(id);
      if (!conversation || conversation.type !== 'GROUP') {
        return apiError(404, 'CONVERSATION_NOT_FOUND');
      }
      const mine = conversation.members.find((entry) => entry.user.id === ACTOR_ID);
      const ownerOnly = () =>
        mine?.role === 'OWNER' ? null : apiError(403, 'GROUP_OWNER_REQUIRED');
      if (sub === undefined && call.method === 'PATCH') {
        const refused = ownerOnly();
        if (refused) return refused;
        conversation.title = String(call.body?.title);
        return json(200, { conversation: detail(conversation) });
      }
      if (sub === 'members' && subId === undefined) {
        const refused = ownerOnly();
        if (refused) return refused;
        for (const userId of (call.body?.userIds as string[]) ?? []) {
          conversation.members.push(member(userId, 'MEMBER'));
        }
        return json(200, { conversation: detail(conversation) });
      }
      if (sub === 'members' && subId && action) {
        const refused = ownerOnly();
        if (refused) return refused;
        const target = conversation.members.find((entry) => entry.user.id === subId);
        if (!target) return apiError(404, 'CONVERSATION_MEMBER_NOT_FOUND');
        if (action === 'remove') {
          if (target.role === 'OWNER') return apiError(409, 'GROUP_OWNER_NOT_REMOVABLE');
          conversation.members = conversation.members.filter((entry) => entry !== target);
        } else {
          target.role = 'OWNER';
        }
        return json(200, { conversation: detail(conversation) });
      }
      if (sub === 'leave') {
        const owners = conversation.members.filter((entry) => entry.role === 'OWNER');
        if (mine?.role === 'OWNER' && owners.length === 1 && conversation.members.length > 1) {
          return apiError(409, 'GROUP_LAST_OWNER');
        }
        conversation.members = conversation.members.filter((entry) => entry.user.id !== ACTOR_ID);
        return json(200, { left: true });
      }
      if (sub === 'archive') {
        const refused = ownerOnly();
        if (refused) return refused;
        conversation.status = 'ARCHIVED';
        return json(200, { conversation: detail(conversation) });
      }
    }
    return undefined;
  }

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const rawBody = typeof init?.body === 'string' ? init.body : null;
    const call: RecordedCall = {
      authorization: new Headers(init?.headers).get('Authorization'),
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
    };
    calls.push(call);
    const response = await handle(call);
    if (!response) {
      throw new Error(`Unexpected request ${call.method} ${call.path}`);
    }
    return response;
  });

  return {
    calls,
    conversations,
    /** A colleague writes into a conversation, as another session would. */
    incoming(conversationId: string, authorId: string, body: string): MessageView {
      const conversation = conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Unknown conversation ${conversationId}`);
      }
      return append(conversation, authorId, body);
    },
    setPageSize(size: number) {
      pageSize = size;
    },
  };
}

/** Every fixture id, so a test can prove none of them is rendered as text. */
export const FIXTURE_IDS = [
  ACTOR_ID,
  PEER_ID,
  THIRD_ID,
  FOURTH_ID,
  OWNER_ID,
  DIRECT_ID,
  GROUP_ID,
  ARCHIVED_ID,
  INACTIVE_DIRECT_ID,
];

export function setDocumentVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}
