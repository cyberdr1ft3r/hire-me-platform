import { TaskListQuerySchema } from '@hire-me/contracts';
import { describe, expect, it } from 'vitest';

import { TasksService } from './tasks.service.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

type FindManyArgs = { where: { AND: Record<string, unknown>[] }; orderBy: unknown };

/** A service over recording fakes: only the list read is exercised. */
function serviceFor(permissions: string[]) {
  const calls: { count: unknown[]; findMany: FindManyArgs[] } = { count: [], findMany: [] };
  const prisma = {
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    task: {
      count: (args: unknown) => {
        calls.count.push(args);
        return Promise.resolve(0);
      },
      findMany: (args: FindManyArgs) => {
        calls.findMany.push(args);
        return Promise.resolve([]);
      },
    },
  };
  const permissionsService = { getEffectivePermissionCodes: () => Promise.resolve(permissions) };
  const service = new TasksService(
    {} as never,
    {} as never,
    permissionsService as never,
    prisma as never,
  );
  return { calls, service };
}

function filterPart(args: FindManyArgs): Record<string, unknown> {
  return args.where.AND[1]!;
}

describe('TasksService list filter: created by me', () => {
  it('binds created-by-me to the authenticated actor and keeps the visibility predicate', async () => {
    const { calls, service } = serviceFor(['tasks:view']);
    await service.listTasks(ACTOR, TaskListQuerySchema.parse({ createdByMe: 'true' }));

    const args = calls.findMany[0]!;
    expect(filterPart(args)).toEqual({ AND: [{ createdByUserId: ACTOR }] });
    // Scoped actors still see only their visible tasks.
    expect(args.where.AND[0]).toHaveProperty('OR');
    expect(calls.count[0]).toEqual({ where: args.where });
  });

  it('ignores any creator ID in the request', async () => {
    const { calls, service } = serviceFor(['tasks:view', 'tasks:view_all']);
    await service.listTasks(
      ACTOR,
      TaskListQuerySchema.parse({ createdByMe: 'true', createdByUserId: OTHER }),
    );
    expect(JSON.stringify(calls.findMany[0]!.where)).not.toContain(OTHER);
    expect(filterPart(calls.findMany[0]!)).toEqual({ AND: [{ createdByUserId: ACTOR }] });
  });

  it('combines with the other filters and keeps a deterministic order', async () => {
    const { calls, service } = serviceFor(['tasks:view', 'tasks:view_all']);
    await service.listTasks(
      ACTOR,
      TaskListQuerySchema.parse({
        createdByMe: 'true',
        priority: 'HIGH',
        search: 'brief',
        sortBy: 'createdAt',
        status: 'OPEN',
      }),
    );
    const args = calls.findMany[0]!;
    const filters = (filterPart(args) as { AND: Record<string, unknown>[] }).AND;
    expect(filters).toContainEqual({ createdByUserId: ACTOR });
    expect(filters).toContainEqual({ status: 'OPEN' });
    expect(filters).toContainEqual({ priority: 'HIGH' });
    // The search predicate is still there alongside the creator filter.
    expect(filters.some((filter) => 'OR' in filter)).toBe(true);
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('adds no creator predicate unless created-by-me is requested', async () => {
    const { calls, service } = serviceFor(['tasks:view', 'tasks:view_all']);
    await service.listTasks(ACTOR, TaskListQuerySchema.parse({ createdByMe: 'false' }));
    await service.listTasks(ACTOR, TaskListQuerySchema.parse({}));
    for (const args of calls.findMany) {
      expect(JSON.stringify(filterPart(args))).not.toContain('createdByUserId');
    }
  });
});
