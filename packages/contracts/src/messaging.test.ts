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
});
