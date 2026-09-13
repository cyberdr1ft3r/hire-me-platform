import { TaskFilterUserOptionsQuerySchema } from '@hire-me/contracts';
import { describe, expect, it } from 'vitest';

import { TasksService } from './tasks.service.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';

type FindManyArgs = {
  orderBy: unknown;
  select: Record<string, boolean>;
  take: number;
  where: { AND: Record<string, unknown>[] };
};

/** A service over recording fakes: only the filter-only people lookup is exercised. */
function serviceFor(permissions: string[]) {
  const calls: FindManyArgs[] = [];
  const prisma = {
    user: {
      findMany: (args: FindManyArgs) => {
        calls.push(args);
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

const query = (value: Record<string, string>) => TaskFilterUserOptionsQuerySchema.parse(value);

describe('TasksService filter-only people lookup', () => {
  it('lists owners of visible tasks only, with the three identity fields and a bound', async () => {
    const { calls, service } = serviceFor(['tasks:view']);
    await service.listFilterUserOptions(ACTOR, query({ role: 'owner' }));
    const args = calls[0]!;
    const represented = args.where.AND[0] as { ownedTasks: { some: Record<string, unknown> } };
    // A scoped viewer's predicate is the normal visibility rule, not "every task".
    expect(represented.ownedTasks.some).toHaveProperty('OR');
    expect(represented.ownedTasks.some).toHaveProperty('archivedAt', null);
    expect(args.select).toEqual({ displayName: true, email: true, id: true });
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
  });

  it('lists only active, non-archived assignments on visible tasks for the assignee role', async () => {
    const { calls, service } = serviceFor(['tasks:view', 'tasks:view_all']);
    await service.listFilterUserOptions(ACTOR, query({ role: 'assignee', search: 'omar' }));
    const [represented, search] = calls[0]!.where.AND;
    expect(represented).toEqual({
      taskAssignments: { some: { archivedAt: null, status: 'ACTIVE', task: {} } },
    });
    expect(search).toEqual({
      OR: [
        { displayName: { contains: 'omar', mode: 'insensitive' } },
        { email: { contains: 'omar', mode: 'insensitive' } },
      ],
    });
  });

  it('needs task view permission and nothing more', async () => {
    const withoutView = serviceFor(['tasks:assign']);
    await expect(
      withoutView.service.listFilterUserOptions(ACTOR, query({ role: 'owner' })),
    ).rejects.toMatchObject({ status: 403 });
    expect(withoutView.calls).toHaveLength(0);

    // A viewer without assignment rights is served.
    const viewer = serviceFor(['tasks:view']);
    await expect(
      viewer.service.listFilterUserOptions(ACTOR, query({ role: 'assignee' })),
    ).resolves.toEqual({ users: [] });
  });
});
