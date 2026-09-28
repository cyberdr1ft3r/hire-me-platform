/**
 * Disposable-database-only setup for Issue #97 browser evidence personas.
 * Refuses unless TEST_DATABASE_URL names a generated hireme_test_* database.
 */
import { PasswordService } from '../apps/api/src/auth/password.service.js';
import {
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../apps/api/src/persistence/prisma/generated-client.js';

const AUDIT_PASSWORD = 'CiSyntheticAuditPassphrase123!';
const VIEW_ONLY_EMAIL = 'issue97-clients-view@test-db.hireme.test';
const CONTACT_EDITOR_EMAIL = 'issue97-contact-editor@test-db.hireme.test';

const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL,
});
const passwords = new PasswordService();

function assertDisposableDatabaseUrl(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required.');
  }
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!/^hireme_test_\d{14}_[0-9a-f]{12}$/.test(database)) {
    throw new Error('Refusing to mutate a non-disposable database.');
  }
}

async function ensurePermission(code: string): Promise<string> {
  const permission = await prisma.permission.upsert({
    where: { code },
    update: {
      description: `Synthetic ${code} for Issue #97 audit.`,
      scopeType: PermissionScopeType.EXPLICIT,
      status: 'ACTIVE',
    },
    create: {
      code,
      description: `Synthetic ${code} for Issue #97 audit.`,
      scopeType: PermissionScopeType.EXPLICIT,
      status: 'ACTIVE',
    },
  });
  return permission.id;
}

async function setRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const permissionIds = new Map<string, string>();
  for (const code of codes) {
    permissionIds.set(code, await ensurePermission(code));
  }
  const allRolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    include: { permission: true },
  });
  for (const grant of allRolePermissions) {
    const shouldKeep = permissionIds.has(grant.permission.code);
    await prisma.rolePermission.update({
      where: { id: grant.id },
      data: { archivedAt: shouldKeep ? null : new Date() },
    });
  }
  for (const [code, permissionId] of permissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId },
    });
  }
}

async function upsertAuditUser(
  email: string,
  roleName: RoleName,
  displayName: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { normalizedEmail },
    update: { email, displayName, status: UserStatus.ACTIVE, archivedAt: null },
    create: { email, normalizedEmail, displayName, status: UserStatus.ACTIVE },
  });
  await prisma.passwordCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash: await passwords.hashPassword(AUDIT_PASSWORD) },
    create: {
      userId: user.id,
      passwordHash: await passwords.hashPassword(AUDIT_PASSWORD),
    },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: { archivedAt: null },
    create: { userId: user.id, roleId: role.id },
  });
}

async function ensureSampleClient(): Promise<void> {
  const existing = await prisma.client.findFirst({
    where: { normalizedName: 'issue97 audit client' },
  });
  const client =
    existing ??
    (await prisma.client.create({
      data: {
        name: 'Issue97 Audit Client',
        normalizedName: 'issue97 audit client',
        status: 'ACTIVE',
        industry: 'Technology',
        country: 'France',
        city: 'Paris',
      },
    }));
  const contact = await prisma.clientContact.findFirst({
    where: { clientId: client.id, normalizedEmail: 'audit.contact@example.test' },
  });
  if (!contact) {
    await prisma.clientContact.create({
      data: {
        clientId: client.id,
        displayName: 'Audit Contact',
        email: 'audit.contact@example.test',
        normalizedEmail: 'audit.contact@example.test',
        status: 'ACTIVE',
        roleTitle: 'Buyer',
      },
    });
  }
}

async function main(): Promise<void> {
  assertDisposableDatabaseUrl();
  await setRolePermissions(RoleName.GUEST, [
    'records:view',
    'clients:view',
    'client_contacts:view',
  ]);
  await setRolePermissions(RoleName.EMPLOYEE, [
    'records:view',
    'clients:view',
    'client_contacts:view',
    'client_contacts:update',
  ]);
  await upsertAuditUser(VIEW_ONLY_EMAIL, RoleName.GUEST, 'Issue97 Clients View Only');
  await upsertAuditUser(CONTACT_EDITOR_EMAIL, RoleName.EMPLOYEE, 'Issue97 Contact Editor');
  await ensureSampleClient();
  console.log(
    JSON.stringify({
      viewOnlyEmail: VIEW_ONLY_EMAIL,
      contactEditorEmail: CONTACT_EDITOR_EMAIL,
      password: AUDIT_PASSWORD,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
