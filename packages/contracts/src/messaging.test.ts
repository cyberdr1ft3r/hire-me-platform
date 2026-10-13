import { describe, expect, it } from 'vitest';

import { FINANCE_MANAGER_PERMISSION_CODES } from './finance-manager-role.js';
import {
  ClientMessageIdSchema,
  GROUP_MAX_ACTIVE_MEMBERS,
  GROUP_MIN_MEMBERS_AT_CREATION,
  GroupTitleSchema,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_MAX_EDITS,
  MESSAGING_PERMISSION_CODES,
  MessageBodySchema,
  MessageListQuerySchema,
  MessageViewSchema,
  MessagingUserOptionSchema,
  MessagingUserOptionsQuerySchema,
  MessagingUserOptionsResponseSchema,
  ReadCursorRequestSchema,
  GroupCreateRequestSchema,
} from './messaging.js';

describe('messaging contracts (Issue #171 / D-087)', () => {
  it('reuses exactly the two existing messaging permissions', () => {
    expect(MESSAGING_PERMISSION_CODES).toEqual(['messages:view', 'messages:create']);
    expect(MESSAGING_PERMISSION_CODES).not.toContain('messages:moderate');
  });

  it('grants FINANCE_MANAGER both messaging permissions', () => {
    for (const code of MESSAGING_PERMISSION_CODES) {
      expect(FINANCE_MANAGER_PERMISSION_CODES).toContain(code);
    }
  });

  it('pins the reviewed limits', () => {
    expect(MESSAGE_BODY_MAX_LENGTH).toBe(4000);
    expect(GROUP_MIN_MEMBERS_AT_CREATION).toBe(3);
    expect(GROUP_MAX_ACTIVE_MEMBERS).toBe(50);
    expect(MESSAGE_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(MESSAGE_MAX_EDITS).toBe(10);
  });

  it('bounds message bodies after trimming and keeps newlines and tabs', () => {
    expect(MessageBodySchema.parse('  hello\n\tworld  ')).toBe('hello\n\tworld');
    expect(MessageBodySchema.safeParse('   ').success).toBe(false);
    expect(MessageBodySchema.safeParse('a'.repeat(4000)).success).toBe(true);
    expect(MessageBodySchema.safeParse('a'.repeat(4001)).success).toBe(false);
    expect(MessageBodySchema.safeParse(`bell${String.fromCharCode(7)}`).success).toBe(false);
    expect(MessageBodySchema.safeParse(`nul${String.fromCharCode(0)}x`).success).toBe(false);
  });

  it('bounds group titles to one trimmed line of 1-120 characters', () => {
    expect(GroupTitleSchema.parse('  Delivery team  ')).toBe('Delivery team');
    expect(GroupTitleSchema.safeParse('').success).toBe(false);
    expect(GroupTitleSchema.safeParse('a'.repeat(121)).success).toBe(false);
    expect(GroupTitleSchema.safeParse('line\nbreak').success).toBe(false);
  });

  it('requires a UUID client message id', () => {
    expect(ClientMessageIdSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(ClientMessageIdSchema.safeParse('0b6f2a3e-8c1d-4c55-9a77-1f2e3d4c5b6a').success).toBe(
      true,
    );
  });

  describe('PR B HTTP contracts (Issue #179)', () => {
    const uuid = '0b6f2a3e-8c1d-4c55-9a77-1f2e3d4c5b6a';

    it('bounds the participant picker query and never accepts paging or limits', () => {
      expect(MessagingUserOptionsQuerySchema.safeParse({ search: 'a' }).success).toBe(false);
      expect(MessagingUserOptionsQuerySchema.safeParse({ search: ' ab ' }).success).toBe(true);
      expect(MessagingUserOptionsQuerySchema.safeParse({ search: 'a'.repeat(121) }).success).toBe(
        false,
      );
      expect(MessagingUserOptionsQuerySchema.safeParse({ search: 'ab', limit: '50' }).success).toBe(
        false,
      );
      expect(
        MessagingUserOptionsQuerySchema.safeParse({ search: 'ab', purpose: 'group-add' }).success,
      ).toBe(false);
      expect(
        MessagingUserOptionsQuerySchema.safeParse({
          search: 'ab',
          purpose: 'direct',
          conversationId: uuid,
        }).success,
      ).toBe(false);
    });

    it('returns only id, displayName, and email for at most 20 people', () => {
      expect(
        MessagingUserOptionSchema.safeParse({ id: uuid, displayName: 'A', email: 'a@x', role: 'X' })
          .success,
      ).toBe(false);
      const users = Array.from({ length: 21 }, () => ({ id: uuid, displayName: 'A', email: 'a' }));
      expect(MessagingUserOptionsResponseSchema.safeParse({ users }).success).toBe(false);
      expect(
        MessagingUserOptionsResponseSchema.safeParse({ users: users.slice(0, 20), total: 20 })
          .success,
      ).toBe(false);
    });

    it('requires 2-49 other founding members', () => {
      const ids = (count: number) => Array.from({ length: count }, () => uuid);
      expect(
        GroupCreateRequestSchema.safeParse({ title: 'T', memberUserIds: ids(1) }).success,
      ).toBe(false);
      expect(
        GroupCreateRequestSchema.safeParse({ title: 'T', memberUserIds: ids(2) }).success,
      ).toBe(true);
      expect(
        GroupCreateRequestSchema.safeParse({ title: 'T', memberUserIds: ids(50) }).success,
      ).toBe(false);
    });

    it('bounds message keyset pages and read cursors', () => {
      expect(MessageListQuerySchema.parse({})).toEqual({ limit: 30 });
      expect(MessageListQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
      expect(MessageListQuerySchema.safeParse({ before: '3', after: '1' }).success).toBe(false);
      expect(ReadCursorRequestSchema.safeParse({ upToSequence: -1 }).success).toBe(false);
      expect(ReadCursorRequestSchema.safeParse({ upToSequence: 1.5 }).success).toBe(false);
    });

    it('represents a withdrawn message with a null body', () => {
      const view = {
        id: uuid,
        conversationId: uuid,
        sequence: 1,
        author: { id: uuid, displayName: 'A', inactive: false },
        body: null,
        status: 'ARCHIVED',
        withdrawn: true,
        editCount: 0,
        editedAt: null,
        withdrawnAt: '2026-10-12T10:00:00.000Z',
        createdAt: '2026-10-12T09:59:00.000Z',
        clientMessageId: null,
      };
      expect(MessageViewSchema.safeParse(view).success).toBe(true);
      expect(MessageViewSchema.safeParse({ ...view, previousBody: 'x' }).success).toBe(false);
    });
  });
});
