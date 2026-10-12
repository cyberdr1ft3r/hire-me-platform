import { afterAll, describe, expect, it } from 'vitest';

import { MESSAGING_PERMISSION_CODES } from '@hire-me/contracts';
import { PrismaClient, RoleName } from '../src/persistence/prisma/generated-client.js';
import { runTsx } from './support/child-commands.js';
import { childEnvironment } from './support/disposable-database.js';
import { createIsolatedSchema } from './support/isolated-schema.js';

/**
 * Messaging authorization catalog (Issue #171 / D-087 / R-053).
 *
 * The first block reads the seeded catalog of the provisioned disposable
 * database. The second runs the real seed in an isolated schema to prove the
 * seed reconciles a database seeded before the correction without disturbing
 * any other grant.
 */
const prisma = new PrismaClient();

const MESSAGING_ROLES = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.HR_MANAGER,
  RoleName.MANAGER,
  RoleName.TEAM_LEADER,
  RoleName.EMPLOYEE,
  RoleName.FINANCE_MANAGER,
].sort();

type GrantRow = { id: string; role: string; permission: string; active: boolean };

async function grants(client: PrismaClient): Promise<GrantRow[]> {
  const rows = await client.rolePermission.findMany({
    select: {
      id: true,
      archivedAt: true,
      role: { select: { name: true } },
      permission: { select: { code: true } },
    },
  });
  return rows
    .map((row) => ({
      id: row.id,
      role: row.role.name as string,
      permission: row.permission.code,
      active: row.archivedAt === null,
    }))
    .sort((a, b) => `${a.role}:${a.permission}`.localeCompare(`${b.role}:${b.permission}`));
}

async function activeHolders(client: PrismaClient, code: string): Promise<string[]> {
  return (await grants(client))
    .filter((grant) => grant.active && grant.permission === code)
    .map((grant) => grant.role)
    .sort();
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seeded messaging permissions', () => {
  it('adds no new messaging permission', async () => {
    const codes = await prisma.permission.findMany({
      where: { code: { startsWith: 'messages:' } },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    expect(codes.map((row) => row.code)).toEqual(['messages:create', 'messages:view']);
    expect([...MESSAGING_PERMISSION_CODES].sort()).toEqual(['messages:create', 'messages:view']);
  });

  it.each(MESSAGING_PERMISSION_CODES)(
    'grants %s to every internal role and to no external role',
    async (code) => {
      const holders = await activeHolders(prisma, code);
      expect(holders).toEqual(MESSAGING_ROLES);
      expect(holders).not.toContain(RoleName.CLIENT_USER);
      expect(holders).not.toContain(RoleName.GUEST);
    },
  );

  it('leaves CLIENT_USER with only its non-messaging grants', async () => {
    const clientGrants = (await grants(prisma)).filter(
      (grant) => grant.role === RoleName.CLIENT_USER && grant.active,
    );
    expect(clientGrants.map((grant) => grant.permission).sort()).toEqual([
      'documents:download',
      'records:view',
    ]);
  });
});

describe('seed reconciliation of a pre-correction catalog', () => {
  it('revokes CLIENT_USER messaging grants and changes nothing else', async () => {
    const isolated = await createIsolatedSchema();
    try {
      const env = childEnvironment(isolated.schemaUrl);
      runTsx('prisma/seed.ts', env);
      const baseline = await grants(isolated.client);
      expect(await activeHolders(isolated.client, 'messages:view')).toEqual(MESSAGING_ROLES);

      // Recreate what the old seed left behind: active CLIENT_USER messaging grants.
      const clientRole = await isolated.client.role.findUniqueOrThrow({
        where: { name: RoleName.CLIENT_USER },
      });
      for (const code of MESSAGING_PERMISSION_CODES) {
        const permission = await isolated.client.permission.findUniqueOrThrow({ where: { code } });
        await isolated.client.rolePermission.create({
          data: { roleId: clientRole.id, permissionId: permission.id },
        });
      }
      expect(await activeHolders(isolated.client, 'messages:view')).toContain(RoleName.CLIENT_USER);

      runTsx('prisma/seed.ts', env);
      runTsx('prisma/seed.ts', env);

      const after = await grants(isolated.client);
      expect(await activeHolders(isolated.client, 'messages:view')).toEqual(MESSAGING_ROLES);
      expect(await activeHolders(isolated.client, 'messages:create')).toEqual(MESSAGING_ROLES);
      const revoked = after.filter((grant) => grant.role === RoleName.CLIENT_USER && !grant.active);
      expect(revoked.map((grant) => grant.permission).sort()).toEqual([
        'messages:create',
        'messages:view',
      ]);
      // Every grant that existed before keeps its row identifier and active state.
      const others = after.filter(
        (grant) =>
          !(grant.role === RoleName.CLIENT_USER && grant.permission.startsWith('messages:')),
      );
      expect(others).toEqual(baseline);
    } finally {
      await isolated.dispose();
    }
  }, 240_000);
});
