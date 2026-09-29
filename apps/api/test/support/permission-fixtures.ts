import {
  PermissionStatus,
  type PermissionScopeType,
  type PrismaClient,
} from '../../src/persistence/prisma/generated-client.js';

/**
 * Permission fixtures that leave the seeded catalog exactly as they found it
 * (Issue #105).
 *
 * Suites need a permission *code* to exist and resolve so they can grant it to
 * a role. They never need to rewrite a permission's description or scope type,
 * and authorization does not read either. So an existing permission, seeded or
 * not, is returned unchanged: its id, code, description, scope type, and status
 * are never written. Only a code that does not exist yet is created, with the
 * caller's test metadata; it is recorded as test-owned and removed after the
 * test file by `removeTestCreatedPermissions` (registered in
 * `test/setup-integration-env.ts`).
 *
 * An existing permission that is not ACTIVE is refused rather than
 * reactivated: silently changing a seeded status would hide a catalog problem
 * and change what other suites observe.
 */
export interface TestPermissionMetadata {
  description: string;
  scopeType: PermissionScopeType;
}

/** Ids of permissions a test in this file created. */
const testCreatedPermissionIds = new Set<string>();

export async function ensurePermissionForTest(
  prisma: PrismaClient,
  code: string,
  metadata: TestPermissionMetadata,
): Promise<{ id: string; code: string }> {
  const existing = await prisma.permission.findUnique({
    where: { code },
    select: { id: true, code: true, status: true },
  });
  if (existing) {
    if (existing.status !== PermissionStatus.ACTIVE) {
      throw new Error(
        `Permission "${code}" exists but is ${existing.status}; tests do not reactivate existing permissions.`,
      );
    }
    return { id: existing.id, code: existing.code };
  }
  const created = await prisma.permission.create({
    data: {
      code,
      description: metadata.description,
      scopeType: metadata.scopeType,
      status: PermissionStatus.ACTIVE,
    },
    select: { id: true, code: true },
  });
  testCreatedPermissionIds.add(created.id);
  return created;
}

/**
 * Deletes the permissions this test file created, and with them (cascade) any
 * grant of those permissions. Existing permissions are never touched.
 */
export async function removeTestCreatedPermissions(prisma: PrismaClient): Promise<number> {
  if (testCreatedPermissionIds.size === 0) {
    return 0;
  }
  const ids = [...testCreatedPermissionIds];
  testCreatedPermissionIds.clear();
  const { count } = await prisma.permission.deleteMany({ where: { id: { in: ids } } });
  return count;
}

export function hasTestCreatedPermissions(): boolean {
  return testCreatedPermissionIds.size > 0;
}
