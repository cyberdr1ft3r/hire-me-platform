import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthErrorResponseSchema, AuthResponseSchema, MeResponseSchema } from '@hire-me/contracts';
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
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

async function cleanAuthTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany();
  await prisma.passwordCredential.deleteMany();
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: 'Authentication' },
        { targetUser: { normalizedEmail: { endsWith: '@auth.test' } } },
      ],
    },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@auth.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@auth.test' } },
  });
}

async function ensurePermissionRole(
  permissionCode = 'records:view',
  roleName: RoleName = RoleName.EMPLOYEE,
): Promise<string> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: 'Synthetic test employee role.',
      status: 'ACTIVE',
    },
  });
  const permission = await prisma.permission.upsert({
    where: { code: permissionCode },
    update: {
      description: 'Synthetic test permission.',
      scopeType: PermissionScopeType.ASSIGNED,
      status: 'ACTIVE',
    },
    create: {
      code: permissionCode,
      description: 'Synthetic test permission.',
      scopeType: PermissionScopeType.ASSIGNED,
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

  return role.id;
}

async function createUser(
  email: string,
  options: { status?: UserStatus; withPermission?: boolean } = {},
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

  if (options.withPermission) {
    const roleId = await ensurePermissionRole();
    await prisma.userRole.create({
      data: { userId: user.id, roleId },
    });
  }

  return user.id;
}

function refreshCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  return cookie?.split(';')[0] ?? '';
}

async function login(baseUrl: string, email: string, password = testPassword) {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('authentication and RBAC foundation', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    await cleanAuthTestRecords();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await cleanAuthTestRecords();
    await app.close();
    await prisma.$disconnect();
  });

  it('logs in with normalized email, returns safe DTOs, and serves me', async () => {
    await createUser('success@auth.test', { withPermission: true });

    const response = await login(baseUrl, 'SUCCESS@auth.test');
    const body: unknown = await response.json();
    const parsed = AuthResponseSchema.parse(body);

    expect(response.status).toBe(201);
    expect(parsed.user.email).toBe('success@auth.test');
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    const meResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${parsed.accessToken}` },
    });
    const me = MeResponseSchema.parse(await meResponse.json());

    expect(meResponse.status).toBe(200);
    expect(me.user.permissions).toContain('records:view');

    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'success@auth.test' },
    });
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  it('returns equivalent generic login failures for wrong password and unknown email', async () => {
    await createUser('failure@auth.test');

    const wrongPassword = await login(baseUrl, 'failure@auth.test', 'Wrong-password-123!');
    const unknownEmail = await login(baseUrl, 'unknown@auth.test', 'Wrong-password-123!');
    const wrongBody = AuthErrorResponseSchema.parse(await wrongPassword.json());
    const unknownBody = AuthErrorResponseSchema.parse(await unknownEmail.json());

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongBody).toEqual(unknownBody);
  });

  it('rejects suspended and archived users', async () => {
    await createUser('suspended@auth.test', { status: UserStatus.SUSPENDED });
    await createUser('archived@auth.test', { status: UserStatus.ARCHIVED });

    expect((await login(baseUrl, 'suspended@auth.test')).status).toBe(401);
    expect((await login(baseUrl, 'archived@auth.test')).status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const userId = await createUser('refresh@auth.test');
    const firstLogin = await login(baseUrl, 'refresh@auth.test');
    const firstCookie = refreshCookie(firstLogin);

    const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });
    const secondCookie = refreshCookie(refreshResponse);

    expect(refreshResponse.status).toBe(201);
    expect(secondCookie).not.toBe(firstCookie);

    const reuseResponse = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });

    expect(reuseResponse.status).toBe(401);
    const remainingActive = await prisma.refreshSession.count({
      where: { userId, revokedAt: null },
    });
    expect(remainingActive).toBe(0);
  });

  it('revokes current and all sessions on logout', async () => {
    await createUser('logout@auth.test');
    const firstLogin = await login(baseUrl, 'logout@auth.test');
    const firstAuth = AuthResponseSchema.parse(await firstLogin.json());
    const firstCookie = refreshCookie(firstLogin);
    const secondLogin = await login(baseUrl, 'logout@auth.test');
    const secondAuth = AuthResponseSchema.parse(await secondLogin.json());
    const secondCookie = refreshCookie(secondLogin);

    const currentLogout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firstAuth.accessToken}`,
        Cookie: firstCookie,
      },
    });
    expect(currentLogout.status).toBe(201);
    expect(
      (
        await fetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: firstCookie },
        })
      ).status,
    ).toBe(401);

    const allLogout = await fetch(`${baseUrl}/auth/logout-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secondAuth.accessToken}` },
    });
    expect(allLogout.status).toBe(201);
    expect(
      (
        await fetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: secondCookie },
        })
      ).status,
    ).toBe(401);
  });

  it('allows and denies permission-guarded requests through effective permissions', async () => {
    await createUser('allowed@auth.test', { withPermission: true });
    await createUser('denied@auth.test');
    const allowedLogin = await login(baseUrl, 'allowed@auth.test');
    const deniedLogin = await login(baseUrl, 'denied@auth.test');
    const allowed = AuthResponseSchema.parse(await allowedLogin.json());
    const denied = AuthResponseSchema.parse(await deniedLogin.json());

    expect(
      (
        await fetch(`${baseUrl}/auth/demo/permission-check`, {
          headers: { Authorization: `Bearer ${allowed.accessToken}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${baseUrl}/auth/demo/permission-check`, {
          headers: { Authorization: `Bearer ${denied.accessToken}` },
        })
      ).status,
    ).toBe(403);
  });

  it('stores only safe authentication audit metadata', async () => {
    await createUser('audit@auth.test');
    await login(baseUrl, 'audit@auth.test');
    await login(baseUrl, 'audit@auth.test', 'Wrong-password-123!');

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'Authentication' },
    });
    const serialized = JSON.stringify(auditLogs);

    expect(serialized).toContain('auth.login.succeeded');
    expect(serialized).toContain('auth.login.failed');
    expect(serialized).not.toContain(testPassword);
    expect(serialized).not.toContain('hire_me_refresh');
  });

  it('keeps development administrator bootstrap explicit, safe, and idempotent', async () => {
    await ensurePermissionRole('records:view', RoleName.SUPER_ADMIN);
    const env = {
      ...process.env,
      AUTH_BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@auth.test',
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: testPassword,
      NODE_ENV: 'test',
    };

    execFileSync('pnpm', ['--filter', '@hire-me/api', 'auth:bootstrap-admin'], {
      cwd: repoRoot,
      env,
      stdio: 'pipe',
    });
    execFileSync('pnpm', ['--filter', '@hire-me/api', 'auth:bootstrap-admin'], {
      cwd: repoRoot,
      env,
      stdio: 'pipe',
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'bootstrap@auth.test' },
      include: { passwordCredential: true, roles: true },
    });

    expect(user.passwordCredential?.passwordHash).toContain('$argon2id$');
    expect(user.roles).toHaveLength(1);
  });
});
