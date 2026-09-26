import { readFileSync } from 'node:fs';

import type { PrismaClient } from '../../src/persistence/prisma/generated-client.js';

/**
 * The synthetic development administrator the provisioning command bootstraps
 * into a disposable test database. Test fixtures only; never a real account.
 */
export const TEST_BOOTSTRAP_ADMIN_EMAIL = 'bootstrap-admin@test-db.hireme.test';
export const TEST_BOOTSTRAP_ADMIN_PASSWORD = 'CiSyntheticAdminPassphrase123!';

/** Roles whose seeded grants must survive every run exactly (Issue #90 critical gate). */
export const CRITICAL_ROLES = ['SUPER_ADMIN'] as const;

export interface CatalogSnapshot {
  version: 1;
  database: string;
  takenAt: string;
  roles: { id: string; name: string }[];
  permissions: { id: string; code: string }[];
  grants: { id: string; role: string; permission: string; active: boolean }[];
  bootstrapAdmin: { id: string; normalizedEmail: string; credentialId: string };
}

/**
 * Records the seeded authorization catalog by stable identifier and name, so a
 * later check can tell a surviving row from a deleted-and-recreated one even
 * when counts match.
 */
export async function takeCatalogSnapshot(
  client: PrismaClient,
  database: string,
): Promise<CatalogSnapshot> {
  const [roles, permissions, grants, admin] = await Promise.all([
    client.role.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    client.permission.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } }),
    client.rolePermission.findMany({
      select: {
        id: true,
        archivedAt: true,
        role: { select: { name: true } },
        permission: { select: { code: true } },
      },
    }),
    client.user.findUnique({
      where: { normalizedEmail: TEST_BOOTSTRAP_ADMIN_EMAIL },
      select: { id: true, normalizedEmail: true, passwordCredential: { select: { id: true } } },
    }),
  ]);
  if (!admin?.passwordCredential) {
    throw new Error('The bootstrap administrator or its credential is missing after provisioning.');
  }
  return {
    version: 1,
    database,
    takenAt: new Date().toISOString(),
    roles: roles.map(({ id, name }) => ({ id, name })),
    permissions,
    grants: grants
      .map((grant) => ({
        id: grant.id,
        role: grant.role.name,
        permission: grant.permission.code,
        active: grant.archivedAt === null,
      }))
      .sort((a, b) => `${a.role}:${a.permission}`.localeCompare(`${b.role}:${b.permission}`)),
    bootstrapAdmin: {
      id: admin.id,
      normalizedEmail: admin.normalizedEmail,
      credentialId: admin.passwordCredential.id,
    },
  };
}

export function readCatalogSnapshot(path: string): CatalogSnapshot {
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as CatalogSnapshot;
  if (snapshot.version !== 1) {
    throw new Error('Unsupported catalog snapshot.');
  }
  return snapshot;
}
