import { describe, expect, it } from 'vitest';

import {
  canonicalDirectKey,
  groupHasCapacity,
  isWithinHistoryWindow,
  MessagingInvariantError,
  planDirectMembers,
  planGroup,
} from './messaging-invariants.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const UPPER_B = B.toUpperCase();

function ids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
}

describe('messaging invariants (Issue #171 / D-087)', () => {
  it('builds one canonical direct key for an unordered pair', () => {
    expect(canonicalDirectKey(A, B)).toBe(`${A}:${B}`);
    expect(canonicalDirectKey(B, A)).toBe(`${A}:${B}`);
    expect(canonicalDirectKey(A, UPPER_B)).toBe(`${A}:${B}`);
  });

  it('rejects a self pair and anything that is not a UUID', () => {
    expect(() => canonicalDirectKey(A, A)).toThrow(MessagingInvariantError);
    expect(() => canonicalDirectKey(A, A.toUpperCase())).toThrow(MessagingInvariantError);
    expect(() => canonicalDirectKey(A, 'bob@example.test')).toThrow(MessagingInvariantError);
    expect(() => canonicalDirectKey(A, `${B}:x`)).toThrow(MessagingInvariantError);
  });

  it('plans exactly two MEMBER rows for a direct conversation', () => {
    expect(planDirectMembers(B, A)).toEqual([
      { userId: A, role: 'MEMBER' },
      { userId: B, role: 'MEMBER' },
    ]);
  });

  it('plans a group with the creator as the only OWNER and 3-50 distinct members', () => {
    const [creator, ...others] = ids(3);
    const plan = planGroup(creator!, [...others, others[0]!, creator!], '  Delivery  ');
    expect(plan.title).toBe('Delivery');
    expect(plan.members).toEqual([
      { userId: creator, role: 'OWNER' },
      { userId: others[0], role: 'MEMBER' },
      { userId: others[1], role: 'MEMBER' },
    ]);

    const fifty = ids(50);
    expect(planGroup(fifty[0]!, fifty.slice(1), 'Max').members).toHaveLength(50);
    expect(() => planGroup(creator!, [others[0]!], 'Too small')).toThrow(MessagingInvariantError);
    const fiftyOne = ids(51);
    expect(() => planGroup(fiftyOne[0]!, fiftyOne.slice(1), 'Too big')).toThrow(
      MessagingInvariantError,
    );
    expect(() => planGroup(creator!, others, '   ')).toThrow(MessagingInvariantError);
    expect(() => planGroup(creator!, others, 'x'.repeat(121))).toThrow(MessagingInvariantError);
  });

  it('caps active group membership at 50', () => {
    expect(groupHasCapacity(49, 1)).toBe(true);
    expect(groupHasCapacity(50, 1)).toBe(false);
    expect(groupHasCapacity(48, 3)).toBe(false);
  });

  it('treats historyAfterSequence as an exclusive boundary', () => {
    expect(isWithinHistoryWindow(7n, 7n)).toBe(false);
    expect(isWithinHistoryWindow(8n, 7n)).toBe(true);
    expect(isWithinHistoryWindow(1n, 0n)).toBe(true);
  });
});
