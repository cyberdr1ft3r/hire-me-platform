import { describe, expect, it } from 'vitest';

import {
  ensurePermissionForTest,
  hasTestCreatedPermissions,
  removeTestCreatedPermissions,
} from './permission-fixtures.js';
import {
  PermissionScopeType,
  PermissionStatus,
  type PrismaClient,
} from '../../src/persistence/prisma/generated-client.js';

/**
 * Issue #105: permission fixtures never write an existing permission, and
 * create, track, and remove only codes that did not exist. The real catalog
 * outcome is enforced by `pnpm test:db:check-catalog` after each D-071 pass.
 */
interface Row {
  id: string;
  code: string;
  description: string;
  scopeType: PermissionScopeType;
  status: PermissionStatus;
}

function fakePrisma(rows: Row[]) {
  const writes: string[] = [];
  let next = 0;
  const client = {
    permission: {
      findUnique: ({ where }: { where: { code: string } }) =>
        Promise.resolve(rows.find((row) => row.code === where.code) ?? null),
      create: ({ data }: { data: Omit<Row, 'id'> }) => {
        writes.push(`create:${data.code}`);
        const row = { ...data, id: `created-${(next += 1)}` };
        rows.push(row);
        return Promise.resolve({ id: row.id, code: row.code });
      },
      deleteMany: ({ where }: { where: { id: { in: string[] } } }) => {
        writes.push(`delete:${where.id.in.join(',')}`);
        const before = rows.length;
        rows.splice(0, rows.length, ...rows.filter((row) => !where.id.in.includes(row.id)));
        return Promise.resolve({ count: before - rows.length });
      },
      update: () => {
        writes.push('update');
        return Promise.resolve();
      },
      upsert: () => {
        writes.push('upsert');
        return Promise.resolve();
      },
    },
  };
  return { client: client as unknown as PrismaClient, rows, writes };
}

const seeded: Row = {
  id: 'seeded-1',
  code: 'records:view',
  description: 'Seeded description',
  scopeType: PermissionScopeType.ASSIGNED,
  status: PermissionStatus.ACTIVE,
};
const metadata = {
  description: 'Synthetic test permission.',
  scopeType: PermissionScopeType.EXPLICIT,
};

describe('permission fixtures', () => {
  it('returns an existing permission unchanged, with no write', async () => {
    const { client, rows, writes } = fakePrisma([{ ...seeded }]);
    await expect(ensurePermissionForTest(client, 'records:view', metadata)).resolves.toEqual({
      id: 'seeded-1',
      code: 'records:view',
    });
    expect(writes).toEqual([]);
    expect(rows[0]).toEqual(seeded);
    expect(hasTestCreatedPermissions()).toBe(false);
  });

  it('refuses to reactivate an existing permission that is not ACTIVE', async () => {
    const { client, writes } = fakePrisma([{ ...seeded, status: PermissionStatus.DEPRECATED }]);
    await expect(ensurePermissionForTest(client, 'records:view', metadata)).rejects.toThrow(
      'tests do not reactivate existing permissions',
    );
    expect(writes).toEqual([]);
  });

  it('creates only a missing code, and removes only what it created', async () => {
    const { client, rows, writes } = fakePrisma([{ ...seeded }]);
    const created = await ensurePermissionForTest(client, 'synthetic:only', metadata);
    expect(rows.find((row) => row.id === created.id)).toMatchObject({
      code: 'synthetic:only',
      ...metadata,
      status: PermissionStatus.ACTIVE,
    });
    expect(hasTestCreatedPermissions()).toBe(true);

    await expect(removeTestCreatedPermissions(client)).resolves.toBe(1);
    expect(rows).toEqual([seeded]);
    expect(writes).toEqual(['create:synthetic:only', `delete:${created.id}`]);
    expect(hasTestCreatedPermissions()).toBe(false);
    await expect(removeTestCreatedPermissions(client)).resolves.toBe(0);
  });
});
