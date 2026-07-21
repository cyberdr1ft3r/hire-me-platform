import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AdminPermissionListResponseSchema,
  AdminRoleListResponseSchema,
  AdminSessionListResponseSchema,
  AdminEffectivePermissionsResponseSchema,
  AdminUserDetailResponseSchema,
  AdminUserListResponseSchema,
  AuthResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const adminPermissionCodes = [
  'users:view',
  'users:create',
  'users:update',
  'users:roles:manage',
  'users:status:manage',
  'users:sessions:revoke',
  'roles:view',
  'permissions:view',
] as const;

async function cleanAdminTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@admin.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@admin.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['User', 'RefreshSession'] } },
        { targetUser: { normalizedEmail: { endsWith: '@admin.test' } } },
      ],
    },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@admin.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@admin.test' } },
  });
}

async function ensureRoleWithPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<string> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for administration tests.`,
      status: 'ACTIVE',
    },
  });

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for administration tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for administration tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: { archivedAt: null },
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });
  }

  return role.id;
}

async function prepareAdminCatalog(): Promise<void> {
  const allPermissionCodes = [
    ...adminPermissionCodes,
    'records:view',
    'records:create',
    'records:update',
    'records:archive',
    'records:delete',
    'records:export',
    'documents:download',
    'users:admin',
    'commercial_data:access',
    'messages:view',
    'messages:create',
    'training_enrollments:manage',
    'mission_recruiters:manage',
  ];

  await ensureRoleWithPermissions(RoleName.SUPER_ADMIN, allPermissionCodes);
  await ensureRoleWithPermissions(RoleName.ADMIN, [
    ...adminPermissionCodes,
    'records:view',
    'messages:create',
  ]);
  await ensureRoleWithPermissions(RoleName.EMPLOYEE, ['records:view', 'messages:create']);
  await ensureRoleWithPermissions(RoleName.GUEST, ['records:view']);
}

async function createUser(
  email: string,
  options: { roleName?: RoleName; status?: UserStatus } = {},
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: options.status ?? UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: {
      userId: user.id,
      passwordHash: await passwords.hashPassword(testPassword),
    },
  });

  if (options.roleName) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: options.roleName },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  return user.id;
}

async function login(baseUrl: string, email: string, password = testPassword) {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await login(baseUrl, email);
  const body = AuthResponseSchema.parse(await response.json());
  return body.accessToken;
}

describe('administration user access management', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    await cleanAdminTestRecords();
    await prepareAdminCatalog();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await cleanAdminTestRecords();
    await app.close();
    await prisma.$disconnect();
  });

  it('allows authorized user listing and denies missing user permissions', async () => {
    await createUser('viewer-admin@admin.test', { roleName: RoleName.ADMIN });
    await createUser('viewer-denied@admin.test');
    await createUser('viewer-target@admin.test');
    const allowedToken = await loginAccessToken(baseUrl, 'viewer-admin@admin.test');
    const deniedToken = await loginAccessToken(baseUrl, 'viewer-denied@admin.test');

    const allowed = await fetch(`${baseUrl}/v1/admin/users?search=viewer&page=1&pageSize=5`, {
      headers: authHeaders(allowedToken),
    });
    const denied = await fetch(`${baseUrl}/v1/admin/users`, {
      headers: authHeaders(deniedToken),
    });
    const body = AdminUserListResponseSchema.parse(await allowed.json());

    expect(allowed.status).toBe(200);
    expect(body.users.some((user) => user.email === 'viewer-target@admin.test')).toBe(true);
    expect(denied.status).toBe(403);
  });

  it('creates users with normalized unique email and Argon2id credentials', async () => {
    const adminToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('create-admin@admin.test', RoleName.ADMIN),
    );
    const response = await fetch(`${baseUrl}/v1/admin/users`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        displayName: 'Created Admin Test User',
        email: 'Created.User@ADMIN.test',
        initialPassword: testPassword,
        locale: 'en',
      }),
    });
    const duplicate = await fetch(`${baseUrl}/v1/admin/users`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        displayName: 'Duplicate Admin Test User',
        email: 'created.user@admin.test',
        initialPassword: testPassword,
        locale: 'en',
      }),
    });
    const body = AdminUserDetailResponseSchema.parse(await response.json());
    const credential = await prisma.passwordCredential.findUniqueOrThrow({
      where: { userId: body.user.id },
    });
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(201);
    expect(body.user.normalizedEmail).toBe('created.user@admin.test');
    expect(duplicate.status).toBe(409);
    expect(credential.passwordHash).toContain('$argon2id$');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain(testPassword);
  });

  it('assigns and removes roles while resolving multiple-role effective permissions', async () => {
    const adminToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('roles-admin@admin.test', RoleName.ADMIN),
    );
    const targetId = await createUser('roles-target@admin.test');

    const employee = await fetch(`${baseUrl}/v1/admin/users/${targetId}/roles`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ roleName: RoleName.EMPLOYEE }),
    });
    const guest = await fetch(`${baseUrl}/v1/admin/users/${targetId}/roles`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ roleName: RoleName.GUEST }),
    });
    const detail = AdminUserDetailResponseSchema.parse(await guest.json());

    expect(employee.status).toBe(201);
    expect(guest.status).toBe(201);
    expect(detail.user.roles).toEqual(expect.arrayContaining([RoleName.EMPLOYEE, RoleName.GUEST]));
    expect(detail.user.effectivePermissions).toEqual(
      expect.arrayContaining(['records:view', 'messages:create']),
    );

    const removed = await fetch(`${baseUrl}/v1/admin/users/${targetId}/roles/${RoleName.GUEST}`, {
      method: 'DELETE',
      headers: authHeaders(adminToken),
    });
    const removedBody = AdminUserDetailResponseSchema.parse(await removed.json());

    expect(removed.status).toBe(200);
    expect(removedBody.user.roles).not.toContain(RoleName.GUEST);
  });

  it('protects the last active SUPER_ADMIN under concurrent demotion attempts', async () => {
    const actorToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('concurrency-admin@admin.test', RoleName.ADMIN),
    );
    const firstSuperAdmin = await createUser('concurrency-super-one@admin.test', {
      roleName: RoleName.SUPER_ADMIN,
    });
    const secondSuperAdmin = await createUser('concurrency-super-two@admin.test', {
      roleName: RoleName.SUPER_ADMIN,
    });
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.SUPER_ADMIN },
    });
    await prisma.userRole.updateMany({
      where: {
        roleId: superAdminRole.id,
        archivedAt: null,
        user: {
          normalizedEmail: {
            not: {
              contains: 'concurrency-super-',
            },
          },
        },
      },
      data: { archivedAt: new Date() },
    });

    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/v1/admin/users/${firstSuperAdmin}/roles/${RoleName.SUPER_ADMIN}`, {
        method: 'DELETE',
        headers: authHeaders(actorToken),
      }),
      fetch(`${baseUrl}/v1/admin/users/${secondSuperAdmin}/roles/${RoleName.SUPER_ADMIN}`, {
        method: 'DELETE',
        headers: authHeaders(actorToken),
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    const remainingSuperAdmins = await prisma.userRole.count({
      where: {
        archivedAt: null,
        role: { name: RoleName.SUPER_ADMIN },
        user: { normalizedEmail: { contains: 'concurrency-super-' }, status: UserStatus.ACTIVE },
      },
    });

    expect(statuses).toEqual([200, 409]);
    expect(remainingSuperAdmins).toBe(1);
  });

  it('prevents unsafe self-demotion, self-suspension, and self-archival', async () => {
    const actorEmail = await createUserEmail('self-admin@admin.test', RoleName.ADMIN);
    const actorToken = await loginAccessToken(baseUrl, actorEmail);
    const actor = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: actorEmail },
    });

    const demotion = await fetch(`${baseUrl}/v1/admin/users/${actor.id}/roles/${RoleName.ADMIN}`, {
      method: 'DELETE',
      headers: authHeaders(actorToken),
    });
    const suspension = await fetch(`${baseUrl}/v1/admin/users/${actor.id}/status`, {
      method: 'PATCH',
      headers: authHeaders(actorToken),
      body: JSON.stringify({ status: UserStatus.SUSPENDED }),
    });
    const archival = await fetch(`${baseUrl}/v1/admin/users/${actor.id}/status`, {
      method: 'PATCH',
      headers: authHeaders(actorToken),
      body: JSON.stringify({ status: UserStatus.ARCHIVED }),
    });

    expect(demotion.status).toBe(409);
    expect(suspension.status).toBe(409);
    expect(archival.status).toBe(409);
  });

  it('revokes sessions on suspension and blocks suspended or archived authentication', async () => {
    const adminToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('status-admin@admin.test', RoleName.ADMIN),
    );
    const suspendedId = await createUser('suspend-target@admin.test');
    await login(baseUrl, 'suspend-target@admin.test');

    const suspension = await fetch(`${baseUrl}/v1/admin/users/${suspendedId}/status`, {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ status: UserStatus.SUSPENDED }),
    });
    const activeSessions = await prisma.refreshSession.count({
      where: { userId: suspendedId, revokedAt: null },
    });
    const suspendedLogin = await login(baseUrl, 'suspend-target@admin.test');

    const archivedId = await createUser('archive-target@admin.test');
    const archival = await fetch(`${baseUrl}/v1/admin/users/${archivedId}/status`, {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ status: UserStatus.ARCHIVED }),
    });
    const archivedLogin = await login(baseUrl, 'archive-target@admin.test');

    expect(suspension.status).toBe(200);
    expect(activeSessions).toBe(0);
    expect(suspendedLogin.status).toBe(401);
    expect(archival.status).toBe(200);
    expect(archivedLogin.status).toBe(401);
  });

  it('revokes selected and all active refresh sessions without exposing token hashes', async () => {
    const adminToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('sessions-admin@admin.test', RoleName.ADMIN),
    );
    const targetId = await createUser('sessions-target@admin.test');
    await login(baseUrl, 'sessions-target@admin.test');
    await login(baseUrl, 'sessions-target@admin.test');

    const sessions = await fetch(`${baseUrl}/v1/admin/users/${targetId}/sessions`, {
      headers: authHeaders(adminToken),
    });
    const sessionsBody = AdminSessionListResponseSchema.parse(await sessions.json());
    const selected = sessionsBody.sessions[0]!;
    const selectedRevoke = await fetch(
      `${baseUrl}/v1/admin/users/${targetId}/sessions/${selected.id}`,
      {
        method: 'DELETE',
        headers: authHeaders(adminToken),
      },
    );
    const allRevoke = await fetch(`${baseUrl}/v1/admin/users/${targetId}/sessions`, {
      method: 'DELETE',
      headers: authHeaders(adminToken),
    });
    const serialized = JSON.stringify(await allRevoke.clone().json());
    const remainingActive = await prisma.refreshSession.count({
      where: { userId: targetId, revokedAt: null },
    });

    expect(sessionsBody.sessions.length).toBeGreaterThanOrEqual(2);
    expect(selectedRevoke.status).toBe(200);
    expect(allRevoke.status).toBe(200);
    expect(remainingActive).toBe(0);
    expect(serialized).not.toContain('tokenHash');
  });

  it('lists role and permission catalogs and effective permission previews', async () => {
    const adminToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('catalog-admin@admin.test', RoleName.ADMIN),
    );
    const targetId = await createUser('catalog-target@admin.test', { roleName: RoleName.EMPLOYEE });

    const roles = await fetch(`${baseUrl}/v1/admin/roles`, { headers: authHeaders(adminToken) });
    const permissions = await fetch(`${baseUrl}/v1/admin/permissions`, {
      headers: authHeaders(adminToken),
    });
    const effective = await fetch(`${baseUrl}/v1/admin/users/${targetId}/effective-permissions`, {
      headers: authHeaders(adminToken),
    });

    expect(AdminRoleListResponseSchema.parse(await roles.json()).roles.length).toBeGreaterThan(0);
    expect(
      AdminPermissionListResponseSchema.parse(await permissions.json()).permissions.map(
        (permission) => permission.code,
      ),
    ).toEqual(expect.arrayContaining([...adminPermissionCodes]));
    expect(
      AdminEffectivePermissionsResponseSchema.parse(await effective.json()).permissions,
    ).toContain('records:view');
  });

  it('validates pagination and stores only safe administration audit metadata', async () => {
    const adminToken = await loginAccessToken(
      baseUrl,
      await createUserEmail('audit-admin@admin.test', RoleName.ADMIN),
    );
    const invalid = await fetch(`${baseUrl}/v1/admin/users?page=0`, {
      headers: authHeaders(adminToken),
    });
    await fetch(`${baseUrl}/v1/admin/users`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        displayName: 'Audit Target',
        email: 'audit-target@admin.test',
        initialPassword: testPassword,
        locale: 'en',
      }),
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { action: { startsWith: 'admin.' } },
    });
    const serialized = JSON.stringify(auditLogs);

    expect(invalid.status).toBe(400);
    expect(serialized).toContain('admin.user.created');
    expect(serialized).not.toContain(testPassword);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('hire_me_refresh');
  });
});

async function createUserEmail(email: string, roleName: RoleName): Promise<string> {
  await createUser(email, { roleName });
  return email;
}
