import { describe, expect, it } from 'vitest';

import {
  TaskFilterUserOptionsQuerySchema,
  TaskListQuerySchema,
  TaskUserOptionsResponseSchema,
} from './tasks.js';

describe('TaskFilterUserOptionsQuerySchema', () => {
  it('accepts only the owner and assignee filter roles with an optional bounded search', () => {
    expect(TaskFilterUserOptionsQuerySchema.parse({ role: 'owner' })).toEqual({ role: 'owner' });
    expect(TaskFilterUserOptionsQuerySchema.parse({ role: 'assignee', search: ' omar ' })).toEqual({
      role: 'assignee',
      search: 'omar',
    });
    for (const role of ['mention', 'reminder', 'creator', undefined]) {
      expect(TaskFilterUserOptionsQuerySchema.safeParse({ role }).success).toBe(false);
    }
    expect(
      TaskFilterUserOptionsQuerySchema.safeParse({ role: 'owner', search: 'x'.repeat(121) })
        .success,
    ).toBe(false);
  });

  it('shares the bounded id/name/email response and strips any other field', () => {
    const parsed = TaskUserOptionsResponseSchema.parse({
      users: [
        {
          displayName: 'Omar Tazi',
          email: 'omar.tazi@example.test',
          id: '00000000-0000-4000-8000-000000000001',
          roles: ['ADMIN'],
          status: 'ACTIVE',
        },
      ],
    });
    expect(Object.keys(parsed.users[0]!).sort()).toEqual(['displayName', 'email', 'id']);
    const tooMany = Array.from({ length: 21 }, (_, index) => ({
      displayName: `Person ${index}`,
      email: `person${index}@example.test`,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    expect(TaskUserOptionsResponseSchema.safeParse({ users: tooMany }).success).toBe(false);
  });
});

describe('TaskListQuerySchema', () => {
  it('accepts the self-only created-by-me filter from a query string', () => {
    expect(TaskListQuerySchema.parse({ createdByMe: 'true' }).createdByMe).toBe(true);
    expect(TaskListQuerySchema.parse({ createdByMe: 'false' }).createdByMe).toBe(false);
    expect(TaskListQuerySchema.parse({}).createdByMe).toBeUndefined();
    expect(TaskListQuerySchema.safeParse({ createdByMe: 'maybe' }).success).toBe(false);
  });

  it('has no creator ID filter, so no other creator can be targeted', () => {
    const parsed = TaskListQuerySchema.parse({
      createdByMe: 'true',
      createdByUserId: '00000000-0000-4000-8000-000000000001',
    });
    expect(parsed).not.toHaveProperty('createdByUserId');
  });
});
