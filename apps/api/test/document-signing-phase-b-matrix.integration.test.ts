import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { createHash, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { loadEnvironment } from '../src/config/environment.js';
import { DocumentGenerationService } from '../src/document-generation/document-generation.service.js';
import { ProtectedStorageService } from '../src/storage/protected-storage.service.js';
import {
  DocumentVersionSource,
  PermissionScopeType,
  PrismaClient,
  QuotationStatus,
  RoleName,
  SigningCredentialStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

import {
  TEST_BOOTSTRAP_ADMIN_EMAIL,
  TEST_BOOTSTRAP_ADMIN_PASSWORD,
} from './support/catalog-snapshot.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';
import { rewriteSignedPdfCmsCertificateBag } from './support/signing-cms-bag-fixture.js';
import {
  createSyntheticSigningP12,
  signPreparedPdfWithP12,
} from './support/signing-synthetic-pdf.js';
import { setSigningAcceptanceBarrierForTests } from '../src/document-signing/signing-acceptance-barrier.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-143-matrix!';

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

async function archiveRolePermission(roleName: RoleName, permissionCode: string): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id, permissionId: permission.id },
    data: { archivedAt: new Date() },
  });
}

describe('document signing Phase B maintainer matrix (Issue #143)', { timeout: 240_000 }, () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let generationService: DocumentGenerationService;
  let storage: ProtectedStorageService;
  let operatorToken: string;
  let signerToken: string;
  let auditViewerToken: string;
  let operatorUserId: string;
  let signerUserId: string;
  let clientId: string;
  let financeManagerSnapshot: RolePermissionSnapshot;
  let guestSnapshot: RolePermissionSnapshot;

  function appendTrustAnchor(pem: string): void {
    const existing = process.env.SIGNING_TRUST_ANCHOR_PEMS?.trim();
    process.env.SIGNING_TRUST_ANCHOR_PEMS = existing ? `${existing}|||${pem}` : pem;
  }

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

  async function freshCredential(ownerUserId: string) {
    const material = createSyntheticSigningP12(`Matrix-${randomUUID().slice(0, 6)}`);
    appendTrustAnchor(material.trustAnchorPem);
    const response = await api(operatorToken, '/v1/signing/credentials', {
      method: 'POST',
      body: {
        ownerType: 'USER',
        ownerUserId,
        providerLabel: 'SYNTHETIC-MATRIX',
        certificateSerial: `SN-${randomUUID().slice(0, 8)}`,
        certificateFingerprintSha256: material.certificateFingerprintSha256,
        certificateSubjectSummary: 'CN=Matrix Signer',
        validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        validTo: new Date(Date.now() + 86_400_000 * 365).toISOString(),
      },
    });
    expect(response.status).toBe(201);
    return { ...material, credentialId: (response.body as { credentialId: string }).credentialId };
  }

  async function generateDoc() {
    const quotation = await prisma.commercialQuotation.create({
      data: {
        reference: `MX143-${randomUUID().slice(0, 8)}`,
        clientId,
        currency: 'MAD',
        status: QuotationStatus.ISSUED,
        issueDate: new Date(),
      },
    });
    const generated = await generationService.generateQuotation(
      quotation.id,
      { outputFamily: 'PDF', language: 'en', idempotencyKey: `mx-${randomUUID()}` },
      operatorUserId,
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    return {
      documentId: generated.generated.documentId,
      versionId: generated.generated.versionId,
      quotationId: quotation.id,
    };
  }

  async function approvePersonRequest(documentId: string, versionId: string, credentialId: string) {
    const created = await api(
      signerToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'PERSON_SIGNATURE',
          signingCredentialId: credentialId,
          idempotencyKey: `mx-req-${randomUUID()}`,
          intendedSignerUserId: signerUserId,
        },
      },
    );
    expect(created.status).toBe(201);
    const requestId = (created.body as { request: { id: string } }).request.id;
    const approved = await api(signerToken, `/v1/signing/requests/${requestId}/approve`, {
      method: 'POST',
      body: { confirmationSummary: 'Matrix approve.' },
    });
    expect(approved.status).toBe(200);
    return requestId;
  }

  async function preparedPdfForRequest(requestId: string): Promise<Buffer> {
    const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
    return storage.get(row.preparedSigningStorageKey!);
  }

  async function submitSigned(token: string, requestId: string, signedPdf: Buffer) {
    const resultSha256 = createHash('sha256').update(signedPdf).digest('hex');
    return api(token, `/v1/signing/requests/${requestId}/results`, {
      method: 'POST',
      body: {
        pdfBase64: signedPdf.toString('base64'),
        resultSha256,
        idempotencyKey: `mx-${randomUUID()}`,
      },
    });
  }

  async function listStorage(prefix: string): Promise<string[]> {
    const root = loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT;
    try {
      return await readdir(join(root, prefix));
    } catch {
      return [];
    }
  }

  async function listDocumentStorageFiles(documentId: string): Promise<string[]> {
    const root = loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT;
    try {
      return await readdir(join(root, 'documents', documentId));
    } catch {
      return [];
    }
  }

  async function expectBlockedAcceptance(input: {
    requestId: string;
    documentId: string;
    signedPdf: Buffer;
    mutator: () => Promise<void>;
  }): Promise<void> {
    const docBefore = await prisma.document.findUniqueOrThrow({ where: { id: input.documentId } });
    setSigningAcceptanceBarrierForTests(input.mutator);
    const submitted = await submitSigned(signerToken, input.requestId, input.signedPdf);
    setSigningAcceptanceBarrierForTests(null);
    expect(submitted.status).toBe(409);
    expect(
      await prisma.documentSignature.count({ where: { signingRequestId: input.requestId } }),
    ).toBe(0);
    expect(
      await prisma.documentVersion.count({
        where: { documentId: input.documentId, source: DocumentVersionSource.SIGNED },
      }),
    ).toBe(0);
    const docAfter = await prisma.document.findUniqueOrThrow({ where: { id: input.documentId } });
    expect(docAfter.currentVersionId).toBe(docBefore.currentVersionId);
    expect(
      await prisma.auditLog.count({
        where: { entityId: input.requestId, action: 'signing.signature.accepted' },
      }),
    ).toBe(0);
  }

  beforeAll(async () => {
    process.env.SIGNING_TRUST_ANCHOR_PEMS = '';
    financeManagerSnapshot = await snapshotRolePermissions(RoleName.FINANCE_MANAGER);
    guestSnapshot = await snapshotRolePermissions(RoleName.GUEST);
    const bootstrapAdmin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: TEST_BOOTSTRAP_ADMIN_EMAIL.toLowerCase() },
    });
    operatorUserId = bootstrapAdmin.id;
    const signerEmail = `signer143-matrix-${randomUUID().slice(0, 8)}@test.local`;
    const auditEmail = `audit143-matrix-${randomUUID().slice(0, 8)}@test.local`;
    signerUserId = await createUser(signerEmail, RoleName.FINANCE_MANAGER);
    await createUser(auditEmail, RoleName.GUEST);
    await ensurePermissionForTest(prisma, 'financial_documents:view_signature_audit', {
      description: 'Matrix audit permission',
      scopeType: PermissionScopeType.EXPLICIT,
    });
    const guestRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.GUEST } });
    const auditPerm = await prisma.permission.findUniqueOrThrow({
      where: { code: 'financial_documents:view_signature_audit' },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: guestRole.id, permissionId: auditPerm.id } },
      update: { archivedAt: null },
      create: { roleId: guestRole.id, permissionId: auditPerm.id },
    });
    clientId = (
      await prisma.client.create({
        data: { name: 'Matrix Client', normalizedName: 'matrix client' },
      })
    ).id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    generationService = app.get(DocumentGenerationService);
    storage = app.get(ProtectedStorageService);
    operatorToken = await login(TEST_BOOTSTRAP_ADMIN_EMAIL, TEST_BOOTSTRAP_ADMIN_PASSWORD);
    signerToken = await login(signerEmail);
    auditViewerToken = await login(auditEmail);
  }, 240_000);

  afterEach(async () => {
    await restoreRolePermissions(RoleName.FINANCE_MANAGER, financeManagerSnapshot);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await restoreRolePermissions(RoleName.FINANCE_MANAGER, financeManagerSnapshot);
      await restoreRolePermissions(RoleName.GUEST, guestSnapshot);
    } finally {
      await prisma.$disconnect();
    }
  }, 180_000);

  it('accepts CMS-signed PDF when unrelated certificate precedes signer in CMS bag', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    const decoy = createSyntheticSigningP12('Decoy');
    const decoyDer = Buffer.from(
      (await import('node-forge')).default.asn1
        .toDer(
          (await import('node-forge')).default.pki.certificateToAsn1(
            (await import('node-forge')).default.pki.certificateFromPem(decoy.trustAnchorPem),
          ),
        )
        .getBytes(),
      'binary',
    );
    const bagModified = rewriteSignedPdfCmsCertificateBag(signed, (bag) => [decoyDer, ...bag]);
    const submitted = await submitSigned(signerToken, requestId, bagModified);
    expect(submitted.status).toBe(200);
    expect((submitted.body as { request: { state: string } }).request.state).toBe('COMPLETED');
  });

  it('rejects visible-content incremental revision with prepared-artifact binding reason', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const sourceVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    const sourcePdf = await storage.get(sourceVersion.storageKey);
    const eofIndex = sourcePdf.lastIndexOf('%%EOF');
    const revised = Buffer.concat([
      sourcePdf.subarray(0, eofIndex),
      Buffer.from('\n% visible revision\n'),
      sourcePdf.subarray(eofIndex),
    ]);
    const wrongPrepared = plainAddPlaceholder({
      pdfBuffer: revised,
      reason: 'Hire Me signing placeholder',
      contactInfo: 'signing@hireme.local',
      name: 'Hire Me',
      location: 'Prepared artifact',
    });
    const signed = await signPreparedPdfWithP12(wrongPrepared, bundle.p12, bundle.passphrase);
    const submitted = await submitSigned(signerToken, requestId, signed);
    expect(submitted.status).toBe(200);
    expect((submitted.body as { request: { state: string } }).request.state).toBe(
      'VALIDATION_REJECTED',
    );
    const validation = await prisma.signatureValidation.findFirstOrThrow({
      where: { signingRequestId: requestId },
      orderBy: { createdAt: 'desc' },
    });
    expect(validation.reasonCode).toBe('PREPARED_ARTIFACT_BYTE_MISMATCH');
  });

  it('blocks acceptance when person sign permission is removed at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await archiveRolePermission(RoleName.FINANCE_MANAGER, 'financial_documents:sign');
      },
    });
  });

  it('blocks acceptance when document view permission is removed at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await archiveRolePermission(RoleName.FINANCE_MANAGER, 'documents:view');
      },
    });
  });

  it('blocks acceptance when credential is disabled at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await prisma.signingCredential.update({
          where: { id: bundle.credentialId },
          data: { status: SigningCredentialStatus.DISABLED },
        });
      },
    });
  });

  it('blocks acceptance when credential expires at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await prisma.signingCredential.update({
          where: { id: bundle.credentialId },
          data: { validTo: new Date(Date.now() - 60_000) },
        });
      },
    });
  });

  it('blocks acceptance when request expires at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await prisma.signingRequest.update({
          where: { id: requestId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
      },
    });
  });

  it('blocks acceptance when current document version advances at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId, quotationId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    setSigningAcceptanceBarrierForTests(async () => {
      await generationService.generateQuotation(
        quotationId,
        { outputFamily: 'PDF', language: 'en', idempotencyKey: `mx-adv-${randomUUID()}` },
        operatorUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
    });
    const submitted = await submitSigned(signerToken, requestId, signed);
    setSigningAcceptanceBarrierForTests(null);
    expect(submitted.status).toBe(409);
    expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
      0,
    );
    expect(
      await prisma.documentVersion.count({
        where: { documentId, source: DocumentVersionSource.SIGNED },
      }),
    ).toBe(0);
    const docAfter = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(docAfter.currentVersionId).not.toBe(versionId);
    expect(
      await prisma.auditLog.count({
        where: { entityId: requestId, action: 'signing.signature.accepted' },
      }),
    ).toBe(0);
  });

  it('blocks acceptance when authoritative business fingerprint changes at barrier', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId, quotationId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await prisma.commercialQuotation.update({
          where: { id: quotationId },
          data: { reference: `CHANGED-${randomUUID().slice(0, 8)}` },
        });
      },
    });
  });

  it('compensates staged signed PDF and evidence storage on late publication failure', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const sourceVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    const sourceBefore = await storage.get(sourceVersion.storageKey);
    const evidenceBefore = await listStorage('signing-evidence');
    const documentFilesBefore = await listDocumentStorageFiles(documentId);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, bundle.p12, bundle.passphrase);
    process.env.SIGNING_TEST_PUBLICATION_FAIL_AFTER = 'post_evidence';
    const submitted = await submitSigned(signerToken, requestId, signed);
    delete process.env.SIGNING_TEST_PUBLICATION_FAIL_AFTER;
    expect(submitted.status).toBe(409);
    expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
      0,
    );
    expect(
      await prisma.signatureValidation.count({
        where: { signingRequestId: requestId, overallResult: 'VALID' },
      }),
    ).toBe(0);
    const evidenceAfter = await listStorage('signing-evidence');
    const documentFilesAfter = await listDocumentStorageFiles(documentId);
    expect(evidenceAfter.length).toBe(evidenceBefore.length);
    expect(documentFilesAfter).toEqual(documentFilesBefore);
    expect(documentFilesAfter.some((name) => name.includes('-signed.pdf'))).toBe(false);
    const sourceAfter = await storage.get(sourceVersion.storageKey);
    expect(sourceAfter.equals(sourceBefore)).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { entityId: requestId, action: 'signing.signature.accepted' },
      }),
    ).toBe(0);
  });

  it('blocks organization seal acceptance when seal grant is revoked at barrier', async () => {
    const org = await api(operatorToken, '/v1/signing/organizations', {
      method: 'POST',
      body: { legalName: 'Matrix Seal Org' },
    });
    const organizationId = (org.body as { organization: { id: string } }).organization.id;
    const orgMaterial = createSyntheticSigningP12('Matrix Org Seal');
    appendTrustAnchor(orgMaterial.trustAnchorPem);
    const orgCredential = await api(operatorToken, '/v1/signing/credentials', {
      method: 'POST',
      body: {
        ownerType: 'ORGANIZATION',
        signingOrganizationId: organizationId,
        providerLabel: 'ORG-MATRIX',
        certificateSerial: `ORG-${randomUUID().slice(0, 6)}`,
        certificateFingerprintSha256: orgMaterial.certificateFingerprintSha256,
        certificateSubjectSummary: 'CN=Org Seal',
        validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        validTo: new Date(Date.now() + 86_400_000 * 365).toISOString(),
      },
    });
    expect(orgCredential.status).toBe(201);
    const credentialId = (orgCredential.body as { credentialId: string }).credentialId;
    const grant = await api(operatorToken, `/v1/signing/credentials/${credentialId}/grants`, {
      method: 'POST',
      body: {
        userId: signerUserId,
        allowedAction: 'USE_ORGANIZATION_SEAL',
        authorityReference: 'MANDATE-MX',
      },
    });
    expect(grant.status).toBe(201);
    const { documentId, versionId } = await generateDoc();
    const created = await api(
      signerToken,
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
    expect(created.status).toBe(201);
    const requestId = (created.body as { request: { id: string } }).request.id;
    const approved = await api(signerToken, `/v1/signing/requests/${requestId}/approve`, {
      method: 'POST',
      body: { confirmationSummary: 'Seal approve.' },
    });
    expect(approved.status).toBe(200);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, orgMaterial.p12, orgMaterial.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await prisma.signingCredentialGrant.deleteMany({ where: { credentialId } });
      },
    });
  });

  it('blocks organization seal acceptance when seal permission is removed at barrier', async () => {
    const org = await api(operatorToken, '/v1/signing/organizations', {
      method: 'POST',
      body: { legalName: 'Matrix Seal Org 2' },
    });
    const organizationId = (org.body as { organization: { id: string } }).organization.id;
    const orgMaterial = createSyntheticSigningP12('Matrix Org Seal 2');
    appendTrustAnchor(orgMaterial.trustAnchorPem);
    const orgCredential = await api(operatorToken, '/v1/signing/credentials', {
      method: 'POST',
      body: {
        ownerType: 'ORGANIZATION',
        signingOrganizationId: organizationId,
        providerLabel: 'ORG-MATRIX-2',
        certificateSerial: `ORG2-${randomUUID().slice(0, 6)}`,
        certificateFingerprintSha256: orgMaterial.certificateFingerprintSha256,
        certificateSubjectSummary: 'CN=Org Seal 2',
        validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        validTo: new Date(Date.now() + 86_400_000 * 365).toISOString(),
      },
    });
    expect(orgCredential.status).toBe(201);
    const credentialId = (orgCredential.body as { credentialId: string }).credentialId;
    await api(operatorToken, `/v1/signing/credentials/${credentialId}/grants`, {
      method: 'POST',
      body: {
        userId: signerUserId,
        allowedAction: 'USE_ORGANIZATION_SEAL',
        authorityReference: 'MANDATE-MX-2',
      },
    });
    const { documentId, versionId } = await generateDoc();
    const created = await api(
      signerToken,
      `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
      {
        method: 'POST',
        body: {
          kind: 'ORGANIZATION_SEAL',
          signingCredentialId: credentialId,
          signingOrganizationId: organizationId,
          idempotencyKey: `seal2-${randomUUID()}`,
        },
      },
    );
    expect(created.status).toBe(201);
    const requestId = (created.body as { request: { id: string } }).request.id;
    const approved = await api(signerToken, `/v1/signing/requests/${requestId}/approve`, {
      method: 'POST',
      body: { confirmationSummary: 'Seal approve 2.' },
    });
    expect(approved.status).toBe(200);
    const prepared = await preparedPdfForRequest(requestId);
    const signed = await signPreparedPdfWithP12(prepared, orgMaterial.p12, orgMaterial.passphrase);
    await expectBlockedAcceptance({
      requestId,
      documentId,
      signedPdf: signed,
      mutator: async () => {
        await archiveRolePermission(RoleName.FINANCE_MANAGER, 'financial_documents:seal');
      },
    });
  });

  it('does not grant signature audit visibility without document access (Phase B)', async () => {
    const bundle = await freshCredential(signerUserId);
    const { documentId, versionId } = await generateDoc();
    const requestId = await approvePersonRequest(documentId, versionId, bundle.credentialId);
    const audit = await api(auditViewerToken, `/v1/signing/requests/${requestId}/audit`);
    expect(audit.status).toBe(404);
    const detail = await api(auditViewerToken, `/v1/signing/requests/${requestId}`);
    expect(detail.status).toBe(404);
  });
});
