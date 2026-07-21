import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  ClientContactDetailResponseSchema,
  ClientContactListResponseSchema,
  ClientDetailResponseSchema,
  ClientListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  ClientContactStatus,
  ClientStatus,
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const normalClientPermissions = [
  'clients:view',
  'clients:create',
  'clients:update',
  'clients:status:manage',
  'clients:archive',
  'client_contacts:view',
  'client_contacts:create',
  'client_contacts:update',
  'client_contacts:status:manage',
  'client_contacts:archive',
] as const;

async function cleanClientTestRecords(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@clients.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@clients.test' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['Client', 'ClientContact'] } },
        { targetUser: { normalizedEmail: { endsWith: '@clients.test' } } },
      ],
    },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@clients.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@clients.test' } },
  });
  await prisma.clientContact.deleteMany({
    where: { client: { normalizedName: { contains: 'issue15' } } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue15' } },
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
      description: `Synthetic ${roleName} role for client CRM tests.`,
      status: 'ACTIVE',
    },
  });

  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for client CRM tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for client CRM tests.`,
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

async function prepareClientCatalog(): Promise<void> {
  await ensureRoleWithPermissions(RoleName.SUPER_ADMIN, [
    ...normalClientPermissions,
    'commercial_data:access',
  ]);
  await ensureRoleWithPermissions(RoleName.HR_MANAGER, normalClientPermissions);
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: RoleName.HR_MANAGER },
      permission: { code: 'commercial_data:access' },
    },
    data: { archivedAt: new Date() },
  });
  await prisma.role.upsert({
    where: { name: RoleName.MANAGER },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: RoleName.MANAGER,
      description: 'Synthetic manager role without unresolved row-scope client permissions.',
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.updateMany({
    where: {
      role: { name: RoleName.MANAGER },
      permission: { code: { in: [...normalClientPermissions] } },
    },
    data: { archivedAt: new Date() },
  });
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: {
      userId: user.id,
      passwordHash: await passwords.hashPassword(testPassword),
    },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });

  return user.id;
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  const body = AuthResponseSchema.parse(await response.json());
  return body.accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function raceAfterClientLock<T>(
  clientId: string,
  startRequests: () => Promise<T>,
): Promise<T> {
  let releaseLock: (() => void) | undefined;
  let locked: (() => void) | undefined;
  const releasePromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const lockedPromise = new Promise<void>((resolve) => {
    locked = resolve;
  });

  const lockPromise = prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId}::uuid FOR UPDATE`;
      locked?.();
      await releasePromise;
    },
    { timeout: 10000 },
  );

  await lockedPromise;
  const resultPromise = startRequests();
  releaseLock?.();
  await lockPromise;
  return resultPromise;
}

async function createClientRecord(
  baseUrl: string,
  accessToken: string,
  name: string,
  commercialSummary?: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      name,
      industry: 'Synthetic services',
      country: 'France',
      city: 'Paris',
      ...(commercialSummary ? { commercialSummary } : {}),
    }),
  });
  const body = ClientDetailResponseSchema.parse(await response.json());
  expect(response.status).toBe(201);
  return body.client.id;
}

describe('client organization and contact CRM', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    await cleanClientTestRecords();
    await prepareClientCatalog();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await cleanClientTestRecords();
    await app.close();
    await prisma.$disconnect();
  });

  it('allows authorized client listing and denies unresolved manager scope safely', async () => {
    await createUser('viewer@clients.test', RoleName.HR_MANAGER);
    await createUser('manager@clients.test', RoleName.MANAGER);
    const allowedToken = await loginAccessToken(baseUrl, 'viewer@clients.test');
    const deniedToken = await loginAccessToken(baseUrl, 'manager@clients.test');
    await createClientRecord(baseUrl, allowedToken, 'Issue15 Viewer Client');

    const allowed = await fetch(`${baseUrl}/v1/clients?search=Issue15&page=1&pageSize=5`, {
      headers: authHeaders(allowedToken),
    });
    const denied = await fetch(`${baseUrl}/v1/clients`, {
      headers: authHeaders(deniedToken),
    });
    const body = ClientListResponseSchema.parse(await allowed.json());

    expect(allowed.status).toBe(200);
    expect(body.clients.some((client) => client.name === 'Issue15 Viewer Client')).toBe(true);
    expect(denied.status).toBe(403);
  });

  it('hides commercial fields unless commercial_data:access is effective', async () => {
    await createUser('commercial-super@clients.test', RoleName.SUPER_ADMIN);
    await createUser('commercial-hr@clients.test', RoleName.HR_MANAGER);
    const commercialToken = await loginAccessToken(baseUrl, 'commercial-super@clients.test');
    const ordinaryToken = await loginAccessToken(baseUrl, 'commercial-hr@clients.test');
    const clientId = await createClientRecord(
      baseUrl,
      commercialToken,
      'Issue15 Commercial Client',
      'Synthetic commercial summary',
    );

    const ordinary = await fetch(`${baseUrl}/v1/clients/${clientId}`, {
      headers: authHeaders(ordinaryToken),
    });
    const commercial = await fetch(`${baseUrl}/v1/clients/${clientId}`, {
      headers: authHeaders(commercialToken),
    });
    const rejectedWrite = await fetch(`${baseUrl}/v1/clients/${clientId}`, {
      method: 'PATCH',
      headers: authHeaders(ordinaryToken),
      body: JSON.stringify({ commercialSummary: 'Should not be accepted' }),
    });
    const ordinaryBody = ClientDetailResponseSchema.parse(await ordinary.json());
    const commercialBody = ClientDetailResponseSchema.parse(await commercial.json());
    const auditLogs = await prisma.auditLog.findMany({
      where: { action: 'clients.commercial_fields.viewed' },
    });

    expect(ordinaryBody.client.commercial).toBeNull();
    expect(commercialBody.client.commercial?.commercialSummary).toBe(
      'Synthetic commercial summary',
    );
    expect(rejectedWrite.status).toBe(403);
    expect(JSON.stringify(auditLogs)).not.toContain('Synthetic commercial summary');
  });

  it('enforces contact normalized-email uniqueness per client and allows the same email elsewhere', async () => {
    await createUser('contacts@clients.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'contacts@clients.test');
    const firstClientId = await createClientRecord(baseUrl, token, 'Issue15 Contact Client A');
    const secondClientId = await createClientRecord(baseUrl, token, 'Issue15 Contact Client B');
    const payload = {
      displayName: 'Synthetic Contact',
      email: 'Contact.Owner@CLIENTS.test',
      phone: '+33000000000',
      roleTitle: 'Hiring contact',
    };

    const created = await fetch(`${baseUrl}/v1/clients/${firstClientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    const duplicate = await fetch(`${baseUrl}/v1/clients/${firstClientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ ...payload, displayName: 'Duplicate Contact' }),
    });
    const sameEmailOtherClient = await fetch(`${baseUrl}/v1/clients/${secondClientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    const body = ClientContactDetailResponseSchema.parse(await created.json());

    expect(created.status).toBe(201);
    expect(body.contact.normalizedEmail).toBe('contact.owner@clients.test');
    expect(duplicate.status).toBe(409);
    expect(sameEmailOtherClient.status).toBe(201);
  });

  it('verifies nested contact ownership to prevent IDOR access', async () => {
    await createUser('idor@clients.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'idor@clients.test');
    const firstClientId = await createClientRecord(baseUrl, token, 'Issue15 IDOR Client A');
    const secondClientId = await createClientRecord(baseUrl, token, 'Issue15 IDOR Client B');
    const contactResponse = await fetch(`${baseUrl}/v1/clients/${firstClientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'IDOR Contact',
        email: 'idor.contact@clients.test',
      }),
    });
    const contact = ClientContactDetailResponseSchema.parse(await contactResponse.json()).contact;

    const wrongParent = await fetch(
      `${baseUrl}/v1/clients/${secondClientId}/contacts/${contact.id}`,
      { headers: authHeaders(token) },
    );
    const rightParent = await fetch(
      `${baseUrl}/v1/clients/${firstClientId}/contacts/${contact.id}`,
      { headers: authHeaders(token) },
    );

    expect(rightParent.status).toBe(200);
    expect(wrongParent.status).toBe(404);
  });

  it('archives clients and contacts without physical deletion or writes under archived clients', async () => {
    await createUser('lifecycle@clients.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'lifecycle@clients.test');
    const clientId = await createClientRecord(baseUrl, token, 'Issue15 Lifecycle Client');
    const contactResponse = await fetch(`${baseUrl}/v1/clients/${clientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'Lifecycle Contact',
        email: 'lifecycle.contact@clients.test',
      }),
    });
    const contact = ClientContactDetailResponseSchema.parse(await contactResponse.json()).contact;

    const active = await fetch(`${baseUrl}/v1/clients/${clientId}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status: ClientStatus.ACTIVE }),
    });
    const inactive = await fetch(`${baseUrl}/v1/clients/${clientId}/status`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ status: ClientStatus.INACTIVE }),
    });
    const archived = await fetch(`${baseUrl}/v1/clients/${clientId}/archive`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    const updateArchived = await fetch(`${baseUrl}/v1/clients/${clientId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Blocked Client Update' }),
    });
    const createUnderArchived = await fetch(`${baseUrl}/v1/clients/${clientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'Blocked Contact',
        email: 'blocked.contact@clients.test',
      }),
    });
    const persistedContact = await prisma.clientContact.findUniqueOrThrow({
      where: { id: contact.id },
    });

    expect(active.status).toBe(200);
    expect(inactive.status).toBe(200);
    expect(archived.status).toBe(201);
    expect(updateArchived.status).toBe(409);
    expect(createUnderArchived.status).toBe(409);
    expect(persistedContact.status).toBe(ClientContactStatus.ARCHIVED);
    expect(persistedContact.archivedAt).toBeInstanceOf(Date);
  });

  it('serializes client archival against concurrent contact creation', async () => {
    await createUser('race-create@clients.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'race-create@clients.test');
    const clientId = await createClientRecord(baseUrl, token, 'Issue15 Race Create Client');

    const [archive, create] = await raceAfterClientLock(clientId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/clients/${clientId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      await sleep(75);
      const createPromise = fetch(`${baseUrl}/v1/clients/${clientId}/contacts`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          displayName: 'Race Created Contact',
          email: 'race-created.contact@clients.test',
        }),
      });

      return Promise.all([archivePromise, createPromise]);
    });
    const activeContacts = await prisma.clientContact.count({
      where: { clientId, status: ClientContactStatus.ACTIVE },
    });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

    expect(archive.status).toBe(201);
    expect(create.status).toBe(409);
    expect(await readErrorCode(create)).toBe('CLIENT_ARCHIVED');
    expect(client.status).toBe(ClientStatus.ARCHIVED);
    expect(activeContacts).toBe(0);
  });

  it('serializes client archival against concurrent ordinary contact updates', async () => {
    await createUser('race-update@clients.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'race-update@clients.test');
    const clientId = await createClientRecord(baseUrl, token, 'Issue15 Race Update Client');
    const created = await fetch(`${baseUrl}/v1/clients/${clientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'Original Race Contact',
        email: 'race-update.contact@clients.test',
      }),
    });
    const contact = ClientContactDetailResponseSchema.parse(await created.json()).contact;

    const [archive, update] = await raceAfterClientLock(clientId, async () => {
      const archivePromise = fetch(`${baseUrl}/v1/clients/${clientId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      await sleep(75);
      const updatePromise = fetch(`${baseUrl}/v1/clients/${clientId}/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ displayName: 'Post Archive Mutation' }),
      });

      return Promise.all([archivePromise, updatePromise]);
    });
    const persistedContact = await prisma.clientContact.findUniqueOrThrow({
      where: { id: contact.id },
    });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

    expect(archive.status).toBe(201);
    expect(update.status).toBe(409);
    expect(await readErrorCode(update)).toBe('CLIENT_ARCHIVED');
    expect(client.status).toBe(ClientStatus.ARCHIVED);
    expect(persistedContact.displayName).toBe('Original Race Contact');
    expect(persistedContact.status).toBe(ClientContactStatus.ARCHIVED);
  });

  it('manages contact lifecycle and stores only safe audit metadata', async () => {
    await createUser('contact-status@clients.test', RoleName.HR_MANAGER);
    const token = await loginAccessToken(baseUrl, 'contact-status@clients.test');
    const clientId = await createClientRecord(baseUrl, token, 'Issue15 Contact Status Client');
    const created = await fetch(`${baseUrl}/v1/clients/${clientId}/contacts`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'Contact Status Target',
        email: 'status.contact@clients.test',
        phone: '+33123456789',
      }),
    });
    const contact = ClientContactDetailResponseSchema.parse(await created.json()).contact;
    const inactive = await fetch(
      `${baseUrl}/v1/clients/${clientId}/contacts/${contact.id}/status`,
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ status: ClientContactStatus.INACTIVE }),
      },
    );
    const archived = await fetch(
      `${baseUrl}/v1/clients/${clientId}/contacts/${contact.id}/archive`,
      {
        method: 'POST',
        headers: authHeaders(token),
      },
    );
    const reactivateArchived = await fetch(
      `${baseUrl}/v1/clients/${clientId}/contacts/${contact.id}/status`,
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ status: ClientContactStatus.ACTIVE }),
      },
    );
    const list = await fetch(`${baseUrl}/v1/clients/${clientId}/contacts?page=1&pageSize=10`, {
      headers: authHeaders(token),
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: { in: ['Client', 'ClientContact'] } },
    });
    const serializedAudit = JSON.stringify(auditLogs);

    expect(inactive.status).toBe(200);
    expect(archived.status).toBe(201);
    expect(reactivateArchived.status).toBe(409);
    expect(ClientContactListResponseSchema.parse(await list.json()).contacts).toHaveLength(1);
    expect(serializedAudit).not.toContain('status.contact@clients.test');
    expect(serializedAudit).not.toContain('+33123456789');
  });
});
