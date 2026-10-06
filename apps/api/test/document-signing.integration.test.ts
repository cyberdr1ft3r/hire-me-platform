import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { DocumentGenerationService } from '../src/document-generation/document-generation.service.js';
import {
  PermissionScopeType,
  PrismaClient,
  QuotationStatus,
  RoleName,
  SigningCredentialOwnerType,
  SigningCredentialStatus,
  SigningRequestState,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

import {
  TEST_BOOTSTRAP_ADMIN_EMAIL,
  TEST_BOOTSTRAP_ADMIN_PASSWORD,
} from './support/catalog-snapshot.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-141!';

type RolePermissionSnapshot = {
  permissions: { permissionId: string; grantedAt: Date; archivedAt: Date | null }[];
};

async function snapshotRolePermissions(roleName: RoleName): Promise<RolePermissionSnapshot> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: roleName },
    include: { permissions: true },
  });
  return {
    permissions: role.permissions.map((rp) => ({
      permissionId: rp.permissionId,
      grantedAt: rp.grantedAt,
      archivedAt: rp.archivedAt,
    })),
  };
}

async function restoreRolePermissions(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot,
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: { notIn: snapshot.permissions.map((rp) => rp.permissionId) },
    },
  });
  for (const rp of snapshot.permissions) {
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: role.id, permissionId: rp.permissionId } },
      data: { grantedAt: rp.grantedAt, archivedAt: rp.archivedAt },
    });
  }
}

async function ensureRoleWithPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  for (const code of permissionCodes) {
    const permission = await ensurePermissionForTest(prisma, code, {
      description: `Synthetic ${code} permission for signing tests.`,
      scopeType: PermissionScopeType.EXPLICIT,
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function ensureRoleWithOnlyPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  await ensureRoleWithPermissions(roleName, permissionCodes);
}

function fingerprint(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName: email,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: { userId: user.id, passwordHash: await passwords.hashPassword(testPassword) },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

async function cleanSigningRecords(): Promise<void> {
  await prisma.signingEvent.deleteMany({});
  await prisma.documentSigningApproval.deleteMany({});
  await prisma.signingRequest.deleteMany({});
  await prisma.signingCredentialGrant.deleteMany({});
  await prisma.signingCredential.deleteMany({});
  await prisma.signingOrganization.deleteMany({});
}

async function cleanSigning141TestUsers(): Promise<void> {
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@signing141.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@signing141.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@signing141.test' } } },
  });
  await prisma.user.deleteMany({ where: { normalizedEmail: { endsWith: '@signing141.test' } } });
}

describe('document signing foundation (Issue #141)', { timeout: 120_000 }, () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let generationService: DocumentGenerationService;
  let operatorToken: string;
  let operatorUserId: string;
  let financeToken: string;
  let outsiderToken: string;
  let clientId: string;
  let guestRoleSnapshot: RolePermissionSnapshot | undefined;

  async function login(email: string, password = testPassword): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return AuthResponseSchema.parse(await response.json()).accessToken;
  }

  async function api(
    token: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as never) : {} };
  }

  async function generateQuotationDocument(): Promise<{
    documentId: string;
    versionId: string;
    quotationId: string;
  }> {
    const quotation = await prisma.commercialQuotation.create({
      data: {
        reference: `SIG141-${randomUUID().slice(0, 8)}`,
        clientId,
        currency: 'MAD',
        status: QuotationStatus.ISSUED,
        issueDate: new Date(),
      },
    });
    const generated = await generationService.generateQuotation(
      quotation.id,
      {
        outputFamily: 'PDF',
        language: 'en',
        idempotencyKey: `sig141-${randomUUID()}`,
      },
      operatorUserId,
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    return {
      documentId: generated.generated.documentId,
      versionId: generated.generated.versionId,
      quotationId: quotation.id,
    };
  }

  beforeAll(async () => {
    await cleanSigningRecords();
    await cleanSigning141TestUsers();
    const bootstrapAdmin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: TEST_BOOTSTRAP_ADMIN_EMAIL.toLowerCase() },
    });
    operatorUserId = bootstrapAdmin.id;
    await createUser('finance@signing141.test', RoleName.FINANCE_MANAGER);
    guestRoleSnapshot = await snapshotRolePermissions(RoleName.GUEST);
    await ensureRoleWithOnlyPermissions(RoleName.GUEST, [
      'documents:view',
      'clients:view',
      'financial_documents:view_signature_audit',
    ]);
    await createUser('outsider@signing141.test', RoleName.GUEST);

    clientId = (
      await prisma.client.create({
        data: { name: 'Signing141 Client', normalizedName: 'signing141 client' },
      })
    ).id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    generationService = app.get(DocumentGenerationService);

    operatorToken = await login(TEST_BOOTSTRAP_ADMIN_EMAIL, TEST_BOOTSTRAP_ADMIN_PASSWORD);
    financeToken = await login('finance@signing141.test');
    outsiderToken = await login('outsider@signing141.test');
  }, 180_000);

  afterAll(async () => {
    try {
      await app?.close();
      await cleanSigningRecords();
      await cleanSigning141TestUsers();
      if (guestRoleSnapshot) {
        await restoreRolePermissions(RoleName.GUEST, guestRoleSnapshot);
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 180_000);

  it('rejects secret key material in credential registration', async () => {
    const response = await api(operatorToken, '/v1/signing/credentials', {
      method: 'POST',
      body: {
        ownerType: 'USER',
        ownerUserId: operatorUserId,
        providerLabel: 'TEST',
        certificateSerial: 'SN1',
        certificateFingerprintSha256: fingerprint('cred1'),
        certificateSubjectSummary: 'CN=Test',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 86_400_000).toISOString(),
        privateKeyPem: '-----BEGIN PRIVATE KEY-----',
      },
    });
    expect(response.status).toBe(400);
  });

  it('creates a person-signature request bound to exact version checksum', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    const credential = await api(operatorToken, '/v1/signing/credentials', {
      method: 'POST',
      body: {
        ownerType: 'USER',
        ownerUserId: operatorUserId,
        providerLabel: 'TEST',
        certificateSerial: 'SN-PERSON',
        certificateFingerprintSha256: fingerprint('person-cred'),
        certificateSubjectSummary: 'CN=Operator',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(credential.status).toBe(201);
    const credentialId = (credential.body as { credentialId: string }).credentialId;

    const create = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `idem-${randomUUID()}`,
          intendedSignerUserId: operatorUserId,
        },
      },
    );
    expect(create.status).toBe(201);
    const request = (create.body as { request: { sourceSha256: string; state: string } }).request;
    expect(request.sourceSha256).toBe(version.checksumSha256);
    expect(request.state).toBe('PREPARED');
  });

  it('returns idempotent result for identical binding and conflicts on binding mismatch', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-IDEM',
          certificateFingerprintSha256: fingerprint(`idem-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;

    const idempotencyKey = `key-${randomUUID()}`;
    const body = {
      kind: 'PERSON_SIGNATURE',
      signingCredentialId: credentialId,
      idempotencyKey,
      intendedSignerUserId: operatorUserId,
    };
    const first = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      { method: 'POST', body },
    );
    const second = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      { method: 'POST', body },
    );
    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    expect(second.status).toBeGreaterThanOrEqual(200);
    expect(second.status).toBeLessThan(300);
    expect((first.body as { request: { id: string } }).request.id).toBe(
      (second.body as { request: { id: string } }).request.id,
    );

    const otherVersionDoc = await generateQuotationDocument();
    const conflict = await api(
      operatorToken,
      `/v1/documents/${otherVersionDoc.documentId}/versions/${otherVersionDoc.versionId}/signing-requests`,
      { method: 'POST', body },
    );
    expect(conflict.status).toBe(409);
  });

  it('requires organization seal mandate grant beyond RBAC', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const org = await api(operatorToken, '/v1/signing/organizations', {
      method: 'POST',
      body: { legalName: 'Issuer Org 141' },
    });
    const organizationId = (org.body as { organization: { id: string } }).organization.id;
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'ORGANIZATION',
          signingOrganizationId: organizationId,
          providerLabel: 'TEST',
          certificateSerial: 'SEAL-1',
          certificateFingerprintSha256: fingerprint(`seal-${randomUUID()}`),
          certificateSubjectSummary: 'O=Issuer Org',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;

    const denied = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'ORGANIZATION_SEAL',
          signingCredentialId: credentialId,
          signingOrganizationId: organizationId,
          idempotencyKey: `seal-${randomUUID()}`,
        },
      },
    );
    expect(denied.status).toBe(403);

    await api(operatorToken, `/v1/signing/credentials/${credentialId}/grants`, {
      method: 'POST',
      body: {
        userId: operatorUserId,
        allowedAction: 'USE_ORGANIZATION_SEAL',
        authorityReference: 'MANDATE-141',
      },
    });

    const allowed = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'ORGANIZATION_SEAL',
          signingCredentialId: credentialId,
          signingOrganizationId: organizationId,
          idempotencyKey: `seal-${randomUUID()}`,
        },
      },
    );
    expect(allowed.status).toBe(201);
  });

  it('denies finance credential administration while allowing signing use permissions', async () => {
    const response = await api(financeToken, '/v1/signing/organizations', {
      method: 'POST',
      body: { legalName: 'Finance should not manage' },
    });
    expect(response.status).toBe(403);
  });

  it('does not invalidate a request when a non-bound document viewer reads it', async () => {
    const financeSnapshot = await snapshotRolePermissions(RoleName.FINANCE_MANAGER);
    await ensureRoleWithOnlyPermissions(RoleName.FINANCE_MANAGER, [
      'records:view',
      'clients:view',
      'commercial_data:access',
      'quotations:view',
      'documents:view',
    ]);
    try {
      const { documentId, versionId } = await generateQuotationDocument();
      const credentialId = (
        await api(operatorToken, '/v1/signing/credentials', {
          method: 'POST',
          body: {
            ownerType: 'USER',
            ownerUserId: operatorUserId,
            providerLabel: 'TEST',
            certificateSerial: 'SN-VIEWER',
            certificateFingerprintSha256: fingerprint(`viewer-${randomUUID()}`),
            certificateSubjectSummary: 'CN=Operator',
            validFrom: new Date().toISOString(),
            validTo: new Date(Date.now() + 86_400_000).toISOString(),
          },
        })
      ).body.credentialId as string;
      const created = await api(
        operatorToken,
        `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
        {
          method: 'POST',
          body: {
            kind: 'PERSON_SIGNATURE',
            signingCredentialId: credentialId,
            idempotencyKey: `viewer-${randomUUID()}`,
            intendedSignerUserId: operatorUserId,
          },
        },
      );
      expect(created.status).toBe(201);
      const requestId = (created.body as { request: { id: string } }).request.id;
      const beforeEvents = await prisma.signingEvent.count({
        where: { signingRequestId: requestId },
      });

      const viewed = await api(financeToken, `/v1/signing/requests/${requestId}`);
      expect(viewed.status).toBe(200);
      expect((viewed.body as { request: { state: string } }).request.state).toBe('PREPARED');

      const viewedAgain = await api(financeToken, `/v1/signing/requests/${requestId}`);
      expect((viewedAgain.body as { request: { state: string } }).request.state).toBe('PREPARED');
      const afterEvents = await prisma.signingEvent.count({
        where: { signingRequestId: requestId },
      });
      expect(afterEvents).toBe(beforeEvents);
    } finally {
      await restoreRolePermissions(RoleName.FINANCE_MANAGER, financeSnapshot);
    }
  });

  it('marks requests stale when authoritative quotation data changes without regeneration', async () => {
    const { documentId, versionId, quotationId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-SNAP',
          certificateFingerprintSha256: fingerprint(`snap-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;
    const created = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `snap-${randomUUID()}`,
          intendedSignerUserId: operatorUserId,
        },
      },
    );
    const requestId = (created.body as { request: { id: string } }).request.id;

    await prisma.commercialQuotation.update({
      where: { id: quotationId },
      data: { subtotalCents: { increment: 100 } },
    });

    const refreshed = await api(operatorToken, `/v1/signing/requests/${requestId}`);
    expect(
      (refreshed.body as { request: { state: string; terminalReason: string } }).request.state,
    ).toBe('STALE');
    expect((refreshed.body as { request: { terminalReason: string } }).request.terminalReason).toBe(
      'SOURCE_BUSINESS_DATA_CHANGED',
    );

    const staleEvents = await prisma.signingEvent.count({
      where: { signingRequestId: requestId, action: 'request.stale' },
    });
    expect(staleEvents).toBe(1);
    await api(operatorToken, `/v1/signing/requests/${requestId}`);
    expect(
      await prisma.signingEvent.count({
        where: { signingRequestId: requestId, action: 'request.stale' },
      }),
    ).toBe(1);
  });

  it('rejects mismatched document and source version at the database layer', async () => {
    const first = await generateQuotationDocument();
    const second = await generateQuotationDocument();
    const credential = await prisma.signingCredential.create({
      data: {
        ownerType: SigningCredentialOwnerType.USER,
        ownerUserId: operatorUserId,
        providerLabel: 'TEST',
        certificateSerial: 'DB-MISMATCH',
        certificateFingerprintSha256: fingerprint(`db-${randomUUID()}`),
        certificateSubjectSummary: 'CN=Test',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 86_400_000),
        status: SigningCredentialStatus.ENABLED,
      },
    });
    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: second.versionId },
    });
    await expect(
      prisma.signingRequest.create({
        data: {
          documentId: first.documentId,
          sourceVersionId: second.versionId,
          sourceSha256: version.checksumSha256!,
          sourceSnapshotSha256: version.sourceSnapshotSha256,
          kind: 'PERSON_SIGNATURE',
          requestedByUserId: operatorUserId,
          intendedSignerUserId: operatorUserId,
          signingCredentialId: credential.id,
          credentialFingerprintSha256: credential.certificateFingerprintSha256,
          methodIdentifier: 'NEUTRAL',
          policyVersion: '1',
          nonceHash: fingerprint(`nonce-${randomUUID()}`),
          bindingHash: fingerprint(`bind-${randomUUID()}`),
          idempotencyKey: `db-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow();
  });

  it('does not grant signing audit access to documents the actor cannot read', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-AUDIT',
          certificateFingerprintSha256: fingerprint(`audit-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;
    const created = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `audit-${randomUUID()}`,
          intendedSignerUserId: operatorUserId,
        },
      },
    );
    const requestId = (created.body as { request: { id: string } }).request.id;
    const outsiderAudit = await api(outsiderToken, `/v1/signing/requests/${requestId}/audit`);
    expect(outsiderAudit.status).toBe(404);
  });

  it('marks requests stale when a new current version is published', async () => {
    const { documentId, versionId, quotationId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-STALE',
          certificateFingerprintSha256: fingerprint(`stale-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;
    const created = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `stale-${randomUUID()}`,
          intendedSignerUserId: operatorUserId,
        },
      },
    );
    const requestId = (created.body as { request: { id: string } }).request.id;

    await generationService.generateQuotation(
      quotationId,
      {
        outputFamily: 'PDF',
        language: 'en',
        idempotencyKey: `sig141-regen-${randomUUID()}`,
      },
      operatorUserId,
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    const refreshed = await api(operatorToken, `/v1/signing/requests/${requestId}`);
    expect((refreshed.body as { request: { state: string } }).request.state).toBe('STALE');
  });

  it('approves exact binding and reaches AWAITING_RESULT without completed signature', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-APPROVE',
          certificateFingerprintSha256: fingerprint(`approve-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;
    const created = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `approve-${randomUUID()}`,
          intendedSignerUserId: operatorUserId,
        },
      },
    );
    const requestId = (created.body as { request: { id: string } }).request.id;
    const approved = await api(operatorToken, `/v1/signing/requests/${requestId}/approve`, {
      method: 'POST',
      body: { confirmationSummary: 'Approve exact version binding.' },
    });
    expect(approved.status).toBe(200);
    expect((approved.body as { request: { state: string } }).request.state).toBe('AWAITING_RESULT');
    const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.state).toBe(SigningRequestState.AWAITING_RESULT);
    const events = await prisma.signingEvent.findMany({
      where: { signingRequestId: requestId },
      orderBy: { sequence: 'asc' },
    });
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(['request.prepared', 'request.approved', 'request.awaiting_result']),
    );
    expect(
      await prisma.documentSigningApproval.count({ where: { signingRequestId: requestId } }),
    ).toBe(1);
  });

  it('fails active seal requests when grant is revoked', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const orgResponse = await api(operatorToken, '/v1/signing/organizations', {
      method: 'POST',
      body: { legalName: 'Revoke Org' },
    });
    const organizationId = (orgResponse.body as { organization: { id: string } }).organization.id;
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'ORGANIZATION',
          signingOrganizationId: organizationId,
          providerLabel: 'TEST',
          certificateSerial: 'SEAL-REV',
          certificateFingerprintSha256: fingerprint(`revoke-${randomUUID()}`),
          certificateSubjectSummary: 'O=Revoke',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;
    const grant = await api(operatorToken, `/v1/signing/credentials/${credentialId}/grants`, {
      method: 'POST',
      body: {
        userId: operatorUserId,
        allowedAction: 'USE_ORGANIZATION_SEAL',
        authorityReference: 'MANDATE-REV',
      },
    });
    expect(grant.status).toBe(201);
    const created = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'ORGANIZATION_SEAL',
          signingCredentialId: credentialId,
          signingOrganizationId: organizationId,
          idempotencyKey: `revoke-${randomUUID()}`,
        },
      },
    );
    const requestId = (created.body as { request: { id: string } }).request.id;
    await prisma.signingCredentialGrant.updateMany({
      where: { credentialId, userId: operatorUserId },
      data: { revokedAt: new Date() },
    });
    const refreshed = await api(operatorToken, `/v1/signing/requests/${requestId}`);
    expect((refreshed.body as { request: { state: string } }).request.state).toBe('FAILED');
  });

  it('prevents concurrent active requests for the same source version', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-RACE',
          certificateFingerprintSha256: fingerprint(`race-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        api(operatorToken, `/v1/documents/${documentId}/versions/${versionId}/signing-requests`, {
          method: 'POST',
          body: {
            kind: 'PERSON_SIGNATURE',
            signingCredentialId: credentialId,
            idempotencyKey: `race-${index}-${randomUUID()}`,
            intendedSignerUserId: operatorUserId,
          },
        }),
      ),
    );
    const successes = results.filter((result) => result.status === 201);
    const conflicts = results.filter((result) => result.status === 409);
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(3);
  });

  it('stores signing audit metadata without secret fields', async () => {
    const { documentId, versionId } = await generateQuotationDocument();
    const credentialId = (
      await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'TEST',
          certificateSerial: 'SN-META',
          certificateFingerprintSha256: fingerprint(`meta-${randomUUID()}`),
          certificateSubjectSummary: 'CN=Operator',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    ).body.credentialId as string;
    const created = await api(
      operatorToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `meta-${randomUUID()}`,
          intendedSignerUserId: operatorUserId,
        },
      },
    );
    const requestId = (created.body as { request: { id: string } }).request.id;
    const audit = await api(operatorToken, `/v1/signing/requests/${requestId}/audit`);
    expect(audit.status).toBe(200);
    const events = (audit.body as { events: { metadataSummary: string }[] }).events;
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.metadataSummary.toLowerCase()).not.toContain('private');
      expect(event.metadataSummary.toLowerCase()).not.toContain('pin');
    }
    const stored = await prisma.signingCredential.findFirst({
      where: { id: credentialId },
    });
    expect(stored?.certificateFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.status).toBe(SigningCredentialStatus.ENABLED);
    expect(stored?.ownerType).toBe(SigningCredentialOwnerType.USER);
  });
});
