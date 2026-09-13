import { describe, expect, it } from 'vitest';

import { TaskListQuerySchema } from './tasks.js';

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
