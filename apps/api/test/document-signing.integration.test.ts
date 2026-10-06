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
  PrismaClient,
  QuotationStatus,
  RoleName,
  SigningCredentialOwnerType,
  SigningCredentialStatus,
  SigningRequestState,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-141!';

const operatorPermissions = [
  'documents:generate',
  'documents:view',
  'documents:download',
  'commercial_data:access',
  'quotations:view',
  'quotations:manage',
  'contracts:view',
  'contracts:manage',
  'purchase_orders:view',
  'purchase_orders:manage',
  'invoices:view',
  'invoices:manage',
  'clients:view',
  'financial_documents:approve_signing',
  'financial_documents:sign',
  'financial_documents:seal',
  'financial_documents:view_signature_audit',
  'signing_credentials:manage',
] as const;

const financeUseOnlyPermissions = operatorPermissions.filter(
  (code) => code !== 'signing_credentials:manage',
);

function fingerprint(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}

async function setRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const permissions = await Promise.all(
    codes.map((code) =>
      ensurePermissionForTest(prisma, code, {
        description: `Test permission ${code}`,
        scopeType: 'EXPLICIT',
      }),
    ),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    })),
  });
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

describe('document signing foundation (Issue #141)', { timeout: 120_000 }, () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let generationService: DocumentGenerationService;
  let operatorToken: string;
  let operatorUserId: string;
  let financeToken: string;
  let outsiderToken: string;
  let clientId: string;

  async function login(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword }),
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
    await setRolePermissions(RoleName.HR_MANAGER, operatorPermissions);
    await setRolePermissions(RoleName.FINANCE_MANAGER, financeUseOnlyPermissions);
    await setRolePermissions(RoleName.GUEST, ['documents:view', 'clients:view']);

    operatorUserId = await createUser('operator@signing141.test', RoleName.HR_MANAGER);
    await createUser('finance@signing141.test', RoleName.FINANCE_MANAGER);
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

    operatorToken = await login('operator@signing141.test');
    financeToken = await login('finance@signing141.test');
    outsiderToken = await login('outsider@signing141.test');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await cleanSigningRecords();
    await prisma.$disconnect();
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
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
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
    await setRolePermissions(RoleName.GUEST, [
      'documents:view',
      'clients:view',
      'financial_documents:view_signature_audit',
    ]);
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
