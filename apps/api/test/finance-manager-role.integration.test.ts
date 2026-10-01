import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  FINANCE_MANAGER_PERMISSION_CODES,
  MeResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { ARGON2ID_PARAMETERS } from '../src/auth/auth.constants.js';
import { PasswordService } from '../src/auth/password.service.js';
import { PermissionsService } from '../src/auth/permissions.service.js';
import { PrismaClient, RoleName, UserStatus } from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-finance-pass-125!';
const emailDomain = '@issue125-finance.test';

let app: INestApplication;
let baseUrl: string;
let permissionsService: PermissionsService;

async function cleanFinanceTestUsers(): Promise<void> {
  const ownUser = { normalizedEmail: { endsWith: emailDomain } };
  await prisma.refreshSession.deleteMany({ where: { user: ownUser } });
  await prisma.passwordCredential.deleteMany({ where: { user: ownUser } });
  await prisma.userRole.deleteMany({ where: { user: ownUser } });
  await prisma.user.deleteMany({ where: ownUser });
}

async function createFinanceManagerUser(email: string): Promise<string> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.FINANCE_MANAGER } });
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail,
      displayName: 'Issue125 Finance Manager',
      status: UserStatus.ACTIVE,
      userType: 'INTERNAL',
      roles: { create: { roleId: role.id } },
    },
  });
  const passwordHash = await passwords.hashPassword(testPassword);
  await prisma.passwordCredential.create({
    data: {
      userId: user.id,
      passwordHash,
      algorithm: ARGON2ID_PARAMETERS.algorithm,
      parametersVersion: ARGON2ID_PARAMETERS.parametersVersion,
    },
  });
  return user.id;
}

async function loginAccessToken(email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  expect(response.status).toBe(201);
  const body = AuthResponseSchema.parse(await response.json());
  return body.accessToken;
}

describe('Issue #125 FINANCE_MANAGER role', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
    permissionsService = moduleRef.get(PermissionsService);
  });

  afterAll(async () => {
    await cleanFinanceTestUsers();
    await app.close();
    await prisma.$disconnect();
  });

  it('seeds the role with the contract permission matrix', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.FINANCE_MANAGER },
      include: {
        permissions: {
          where: { archivedAt: null },
          include: { permission: true },
        },
      },
    });
    const granted = role.permissions.map((grant) => grant.permission.code).sort();
    expect(granted).toEqual([...FINANCE_MANAGER_PERMISSION_CODES].sort());
  });

  it('resolves effective permissions without recruitment or admin capabilities', async () => {
    const email = `finance-${Date.now()}${emailDomain}`;
    const userId = await createFinanceManagerUser(email);
    const effective = await permissionsService.getEffectivePermissionCodes(userId);
    expect(effective).toEqual(expect.arrayContaining([...FINANCE_MANAGER_PERMISSION_CODES]));
    expect(effective).not.toEqual(
      expect.arrayContaining(['missions:view', 'candidates:view', 'users:view']),
    );
    await cleanFinanceTestUsers();
  });

  it('rejects missions list and allows commercial quotations list', async () => {
    const email = `finance-api-${Date.now()}${emailDomain}`;
    await createFinanceManagerUser(email);
    const token = await loginAccessToken(email);
    const headers = { Authorization: `Bearer ${token}` };

    const missions = await fetch(`${baseUrl}/v1/missions`, { headers });
    expect(missions.status).toBe(403);

    const quotations = await fetch(`${baseUrl}/v1/commercial/quotations?pageSize=1`, { headers });
    expect(quotations.status).toBe(200);

    const payments = await fetch(`${baseUrl}/v1/accounting/payments?pageSize=1`, { headers });
    expect(payments.status).toBe(200);

    const me = await fetch(`${baseUrl}/auth/me`, { headers });
    expect(me.status).toBe(200);
    const body = MeResponseSchema.parse(await me.json());
    expect(body.user.permissions).toEqual(expect.arrayContaining(['quotations:view']));
    expect(body.user.permissions).not.toEqual(expect.arrayContaining(['missions:view']));
    await cleanFinanceTestUsers();
  });

  it('keeps SUPER_ADMIN holding every seeded permission', async () => {
    const superRole = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.SUPER_ADMIN },
    });
    const allPermissions = await prisma.permission.findMany({ select: { code: true } });
    const superUser = await prisma.user.findFirst({
      where: { roles: { some: { roleId: superRole.id, archivedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(superUser).toBeTruthy();
    const effective = await permissionsService.getEffectivePermissionCodes(superUser!.id);
    expect(effective).toEqual(expect.arrayContaining(allPermissions.map((p) => p.code)));
  });
});
