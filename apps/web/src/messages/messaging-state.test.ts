import type { ConversationSummary } from '@hire-me/contracts';
import { describe, expect, it } from 'vitest';

import { DICTIONARIES } from '../i18n/messages/index.js';
import { MessagingRequestError } from './messages-api.js';
import { resolveMessagingAccess } from './messaging-access.js';
import {
  appendPage,
  canEditMessage,
  canWithdrawMessage,
  composerReadOnlyReason,
  formatUnreadBadge,
  groupMessagesByDay,
  groupTitleProblem,
  mergeFirstPage,
  mergeMessages,
  messageBodyProblem,
  messagingFailureKey,
  newClientMessageId,
  readOnlyReasonFromError,
  relativeDay,
} from './messaging-state.js';
import { ACTOR_ID, DIRECT_ID, PEER_ID, syntheticMessage } from './messages-test-data.js';

function row(id: string, title = id): ConversationSummary {
  return {
    activeMemberCount: 3,
    counterpart: null,
    createdAt: '2026-10-13T08:00:00.000Z',
    id,
    lastMessageAt: null,
    lastMessageSequence: 0,
    lastReadSequence: 0,
    myRole: 'MEMBER',
    status: 'ACTIVE',
    title,
    type: 'GROUP',
    unreadCount: 0,
  };
}

function keys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null || 'other' in node) {
    return [prefix];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    keys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('messaging state helpers', () => {
  it('derives access from permission codes only', () => {
    expect(resolveMessagingAccess(['messages:view', 'messages:create'])).toEqual({
      create: true,
      view: true,
    });
    expect(resolveMessagingAccess(['messages:create'])).toEqual({ create: false, view: false });
    expect(resolveMessagingAccess(['SUPER_ADMIN', 'users:manage'])).toEqual({
      create: false,
      view: false,
    });
  });

  it('maps stable codes first, then status, to safe copy keys', () => {
    expect(messagingFailureKey(new MessagingRequestError(409, 'GROUP_LAST_OWNER'))).toBe(
      'messages.feedback.failure.lastOwner',
    );
    expect(messagingFailureKey(new MessagingRequestError(404, null))).toBe(
      'messages.feedback.failure.notFound',
    );
    expect(messagingFailureKey(new MessagingRequestError(403, 'SOMETHING_NEW'))).toBe(
      'messages.feedback.failure.forbidden',
    );
    expect(messagingFailureKey(new MessagingRequestError(429, null))).toBe(
      'messages.feedback.failure.rateLimited',
    );
    expect(
      messagingFailureKey(new MessagingRequestError(409, 'CONVERSATION_HIDE_NOT_SUPPORTED')),
    ).toBe('messages.feedback.failure.hideNotSupported');
    expect(messagingFailureKey(new Error('network'))).toBe('messages.feedback.failure.generic');
    expect(readOnlyReasonFromError(new MessagingRequestError(409, 'CONVERSATION_ARCHIVED'))).toBe(
      'archived',
    );
    expect(readOnlyReasonFromError(new MessagingRequestError(409, 'CONVERSATION_CONFLICT'))).toBe(
      null,
    );
  });

  it('closes the composer for archived, inactive counterpart, or missing create permission', () => {
    const base = { counterpart: null, status: 'ACTIVE', type: 'GROUP' } as const;
    expect(composerReadOnlyReason(base, true)).toBeNull();
    expect(composerReadOnlyReason({ ...base, status: 'ARCHIVED' }, true)).toBe('archived');
    expect(
      composerReadOnlyReason(
        {
          counterpart: { displayName: 'x', email: 'x@example.test', id: PEER_ID, inactive: true },
          status: 'ACTIVE',
          type: 'PRIVATE',
        },
        true,
      ),
    ).toBe('inactive');
    expect(composerReadOnlyReason(base, false)).toBe('permission');
  });

  it('merges message pages by sequence and lets a newer copy replace an older one', () => {
    const first = syntheticMessage(DIRECT_ID, 1, ACTOR_ID, 'one');
    const second = syntheticMessage(DIRECT_ID, 2, PEER_ID, 'two');
    const withdrawn = { ...second, body: null, withdrawn: true };
    expect(mergeMessages([second], [first]).map((message) => message.sequence)).toEqual([1, 2]);
    expect(mergeMessages([first, second], [withdrawn])[1]).toEqual(withdrawn);
  });

  it('refreshes the first list page in place and appends keyset pages without duplicates', () => {
    expect(mergeFirstPage([row('a'), row('b'), row('c')], [row('c', 'C'), row('a')])).toEqual([
      row('c', 'C'),
      row('a'),
      row('b'),
    ]);
    expect(appendPage([row('a')], [row('a'), row('b')]).map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('applies the author, window, edit-count, and active-conversation edit rules', () => {
    const now = Date.parse('2026-10-13T12:00:00.000Z');
    const recent = syntheticMessage(DIRECT_ID, 1, ACTOR_ID, 'mine', {
      createdAt: '2026-10-13T11:50:00.000Z',
    });
    const context = { actorUserId: ACTOR_ID.toUpperCase(), conversationActive: true, now };
    expect(canEditMessage(recent, context)).toBe(true);
    expect(canEditMessage({ ...recent, createdAt: '2026-10-13T11:40:00.000Z' }, context)).toBe(
      false,
    );
    expect(canEditMessage({ ...recent, editCount: 10 }, context)).toBe(false);
    expect(canEditMessage(recent, { ...context, conversationActive: false })).toBe(false);
    expect(canEditMessage({ ...recent, author: { ...recent.author, id: PEER_ID } }, context)).toBe(
      false,
    );
    expect(canWithdrawMessage({ ...recent, withdrawn: true }, context)).toBe(false);
    expect(canWithdrawMessage(recent, context)).toBe(true);
  });

  it('validates bodies and titles like the contract', () => {
    expect(messageBodyProblem('   ')).toBe('empty');
    expect(messageBodyProblem(`  ${'a'.repeat(4000)}  `)).toBeNull();
    expect(messageBodyProblem('a'.repeat(4001))).toBe('tooLong');
    expect(groupTitleProblem(' ')).toBe('required');
    expect(groupTitleProblem('a'.repeat(121))).toBe('tooLong');
    expect(groupTitleProblem('Team')).toBeNull();
  });

  it('caps the unread badge and generates UUID client ids', () => {
    expect(formatUnreadBadge(3)).toBe('3');
    expect(formatUnreadBadge(99)).toBe('99');
    expect(formatUnreadBadge(100)).toBe('99+');
    const id = newClientMessageId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientMessageId()).not.toBe(id);
  });

  it('groups by local calendar day and names today and yesterday', () => {
    const now = new Date(2026, 9, 13, 9, 0);
    const days = groupMessagesByDay([
      syntheticMessage(DIRECT_ID, 1, ACTOR_ID, 'a', {
        createdAt: new Date(2026, 9, 12, 23, 30).toISOString(),
      }),
      syntheticMessage(DIRECT_ID, 2, ACTOR_ID, 'b', {
        createdAt: new Date(2026, 9, 13, 0, 10).toISOString(),
      }),
      syntheticMessage(DIRECT_ID, 3, ACTOR_ID, 'c', {
        createdAt: new Date(2026, 9, 13, 8, 0).toISOString(),
      }),
    ]);
    expect(days.map((day) => day.messages.length)).toEqual([1, 2]);
    expect(days.map((day) => relativeDay(day.date, now))).toEqual(['yesterday', 'today']);
    expect(relativeDay(new Date(2026, 9, 1), now)).toBe('other');
  });

  it('keeps EN and FR messaging dictionaries in key parity', () => {
    expect(keys(DICTIONARIES.fr.messages).sort()).toEqual(keys(DICTIONARIES.en.messages).sort());
    expect(DICTIONARIES.fr.navigation.destinations.messages).toBe('Messages');
  });
});
