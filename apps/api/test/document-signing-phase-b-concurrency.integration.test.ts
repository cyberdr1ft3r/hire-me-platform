import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { loadEnvironment } from '../src/config/environment.js';
import { DocumentGenerationService } from '../src/document-generation/document-generation.service.js';
import {
  DocumentVersionSource,
  PrismaClient,
  QuotationStatus,
  RoleName,
  SigningCredentialStatus,
} from '../src/persistence/prisma/generated-client.js';

import {
  TEST_BOOTSTRAP_ADMIN_EMAIL,
  TEST_BOOTSTRAP_ADMIN_PASSWORD,
} from './support/catalog-snapshot.js';
import {
  createSyntheticSigningP12,
  signPreparedPdfWithP12,
} from './support/signing-synthetic-pdf.js';
import {
  setSigningAcceptanceBarrierForTests,
  setSigningPostAuthorityBarrierForTests,
} from '../src/document-signing/signing-acceptance-barrier.js';

const prisma = new PrismaClient();
const testPassword = 'Synthetic-passphrase-143-conc!';

async function archiveRolePermission(roleName: RoleName, permissionCode: string): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id, permissionId: permission.id },
    data: { archivedAt: new Date() },
  });
}

describe(
  'document signing Phase B acceptance fence concurrency (Issue #143)',
  { timeout: 240_000 },
  () => {
    let app: NestExpressApplication;
    let baseUrl: string;
    let generationService: DocumentGenerationService;
    let operatorToken: string;
    let operatorUserId: string;
    let clientId: string;

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

    async function createApprovedRequest(): Promise<{
      requestId: string;
      documentId: string;
      quotationId: string;
      versionId: string;
      bundle: ReturnType<typeof createSyntheticSigningP12> & { credentialId: string };
    }> {
      const material = createSyntheticSigningP12(`Conc-${randomUUID().slice(0, 6)}`);
      appendTrustAnchor(material.trustAnchorPem);
      const credential = await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'USER',
          ownerUserId: operatorUserId,
          providerLabel: 'SYNTHETIC-CONC',
          certificateSerial: `SN-${randomUUID().slice(0, 8)}`,
          certificateFingerprintSha256: material.certificateFingerprintSha256,
          certificateSubjectSummary: 'CN=Concurrency Test',
          validFrom: new Date(Date.now() - 86_400_000).toISOString(),
          validTo: new Date(Date.now() + 86_400_000 * 365).toISOString(),
        },
      });
      expect(credential.status).toBe(201);
      const credentialId = (credential.body as { credentialId: string }).credentialId;
      const quotation = await prisma.commercialQuotation.create({
        data: {
          reference: `CONC-${randomUUID().slice(0, 8)}`,
          clientId,
          currency: 'MAD',
          status: QuotationStatus.ISSUED,
          issueDate: new Date(),
        },
      });
      const generated = await generationService.generateQuotation(
        quotation.id,
        { outputFamily: 'PDF', language: 'en', idempotencyKey: `conc-${randomUUID()}` },
        operatorUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
      const { documentId, versionId } = {
        documentId: generated.generated.documentId,
        versionId: generated.generated.versionId,
      };
      const created = await api(
        operatorToken,
        `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
        {
          method: 'POST',
          body: {
            kind: 'PERSON_SIGNATURE',
            signingCredentialId: credentialId,
            idempotencyKey: `conc-req-${randomUUID()}`,
            intendedSignerUserId: operatorUserId,
          },
        },
      );
      const requestId = (created.body as { request: { id: string } }).request.id;
      await api(operatorToken, `/v1/signing/requests/${requestId}/approve`, {
        method: 'POST',
        body: { confirmationSummary: 'Concurrency approve.' },
      });
      return {
        requestId,
        documentId,
        quotationId: quotation.id,
        versionId,
        bundle: { ...material, credentialId },
      };
    }

    async function listDocumentFiles(documentId: string): Promise<string[]> {
      const root = loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT;
      try {
        return await readdir(join(root, 'documents', documentId));
      } catch {
        return [];
      }
    }

    beforeAll(async () => {
      process.env.SIGNING_TRUST_ANCHOR_PEMS = '';
      const bootstrapAdmin = await prisma.user.findUniqueOrThrow({
        where: { normalizedEmail: TEST_BOOTSTRAP_ADMIN_EMAIL.toLowerCase() },
      });
      operatorUserId = bootstrapAdmin.id;
      clientId = (
        await prisma.client.create({
          data: { name: 'Concurrency Client', normalizedName: 'concurrency client' },
        })
      ).id;
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication<NestExpressApplication>();
      await app.listen(0, '127.0.0.1');
      baseUrl = await app.getUrl();
      generationService = app.get(DocumentGenerationService);
      operatorToken = await login(TEST_BOOTSTRAP_ADMIN_EMAIL, TEST_BOOTSTRAP_ADMIN_PASSWORD);
    }, 240_000);

    afterEach(async () => {
      setSigningAcceptanceBarrierForTests(null);
      setSigningPostAuthorityBarrierForTests(null);
      delete process.env.SIGNING_TEST_PUBLICATION_SERIALIZATION;
      const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } });
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: 'financial_documents:sign' },
      });
      await prisma.rolePermission.updateMany({
        where: { roleId: role.id, permissionId: permission.id },
        data: { archivedAt: null },
      });
    });

    afterAll(async () => {
      try {
        await app?.close();
      } finally {
        await prisma.$disconnect();
      }
    }, 180_000);

    it('blocks publication when sign permission is revoked after authority read (post-authority fence)', async () => {
      const { requestId, documentId, bundle } = await createApprovedRequest();
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      const prepared = await fetch(`${baseUrl}/v1/signing/requests/${requestId}`, {
        headers: { Authorization: `Bearer ${operatorToken}` },
      });
      expect(prepared.status).toBe(200);
      const storage = (await import('../src/storage/protected-storage.service.js'))
        .ProtectedStorageService;
      const storageService = app.get(storage);
      const preparedPdf = await storageService.get(row.preparedSigningStorageKey!);
      const signed = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      setSigningPostAuthorityBarrierForTests(async () => {
        await archiveRolePermission(RoleName.SUPER_ADMIN, 'financial_documents:sign');
      });
      const submitted = await api(operatorToken, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: {
          pdfBase64: signed.toString('base64'),
          resultSha256: createHash('sha256').update(signed).digest('hex'),
          idempotencyKey: `conc-${randomUUID()}`,
        },
      });
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      expect(
        await prisma.documentVersion.count({
          where: { documentId, source: DocumentVersionSource.SIGNED },
        }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { entityId: requestId, action: 'signing.signature.accepted' },
        }),
      ).toBe(0);
    });

    it('compensates staged storage when publication hits serialization conflict hook', async () => {
      const { requestId, documentId, bundle } = await createApprovedRequest();
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      const storage = (await import('../src/storage/protected-storage.service.js'))
        .ProtectedStorageService;
      const storageService = app.get(storage);
      const preparedPdf = await storageService.get(row.preparedSigningStorageKey!);
      const signed = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const filesBefore = await listDocumentFiles(documentId);
      const evidenceBefore = await readdir(
        join(loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT, 'signing-evidence'),
      ).catch(() => [] as string[]);
      process.env.SIGNING_TEST_PUBLICATION_SERIALIZATION = '1';
      const submitted = await api(operatorToken, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: {
          pdfBase64: signed.toString('base64'),
          resultSha256: createHash('sha256').update(signed).digest('hex'),
          idempotencyKey: `conc-ser-${randomUUID()}`,
        },
      });
      expect(submitted.status).toBe(409);
      expect(await listDocumentFiles(documentId)).toEqual(filesBefore);
      const evidenceAfter = await readdir(
        join(loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT, 'signing-evidence'),
      ).catch(() => [] as string[]);
      expect(evidenceAfter.length).toBe(evidenceBefore.length);
      expect(
        await prisma.auditLog.count({
          where: { entityId: requestId, action: 'signing.signature.accepted' },
        }),
      ).toBe(0);
    });

    it('blocks publication when current version advances after authority read', async () => {
      const { requestId, documentId, quotationId, bundle } = await createApprovedRequest();
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      const storage = (await import('../src/storage/protected-storage.service.js'))
        .ProtectedStorageService;
      const storageService = app.get(storage);
      const preparedPdf = await storageService.get(row.preparedSigningStorageKey!);
      const signed = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      setSigningPostAuthorityBarrierForTests(async () => {
        await generationService.generateQuotation(
          quotationId,
          { outputFamily: 'PDF', language: 'en', idempotencyKey: `conc-adv-${randomUUID()}` },
          operatorUserId,
          { ipAddress: '127.0.0.1', userAgent: 'vitest' },
        );
      });
      const submitted = await api(operatorToken, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: {
          pdfBase64: signed.toString('base64'),
          resultSha256: createHash('sha256').update(signed).digest('hex'),
          idempotencyKey: `conc-ver-${randomUUID()}`,
        },
      });
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      expect(
        await prisma.documentVersion.count({
          where: { documentId, source: DocumentVersionSource.SIGNED },
        }),
      ).toBe(0);
    });

    it('blocks publication when authoritative business source changes after authority read', async () => {
      const { requestId, documentId, quotationId, bundle } = await createApprovedRequest();
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      const storage = (await import('../src/storage/protected-storage.service.js'))
        .ProtectedStorageService;
      const storageService = app.get(storage);
      const preparedPdf = await storageService.get(row.preparedSigningStorageKey!);
      const signed = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      setSigningPostAuthorityBarrierForTests(async () => {
        await prisma.commercialQuotation.update({
          where: { id: quotationId },
          data: { reference: `CONC-MUT-${randomUUID().slice(0, 8)}` },
        });
      });
      const submitted = await api(operatorToken, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: {
          pdfBase64: signed.toString('base64'),
          resultSha256: createHash('sha256').update(signed).digest('hex'),
          idempotencyKey: `conc-src-${randomUUID()}`,
        },
      });
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      expect(
        await prisma.documentVersion.count({
          where: { documentId, source: DocumentVersionSource.SIGNED },
        }),
      ).toBe(0);
    });

    it('blocks organization seal publication when seal grant is revoked after authority read', async () => {
      const org = await api(operatorToken, '/v1/signing/organizations', {
        method: 'POST',
        body: { legalName: `Conc Seal Org ${randomUUID().slice(0, 6)}` },
      });
      expect(org.status).toBe(201);
      const organizationId = (org.body as { organization: { id: string } }).organization.id;
      const orgMaterial = createSyntheticSigningP12('Conc Org Seal');
      appendTrustAnchor(orgMaterial.trustAnchorPem);
      const orgCredential = await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ownerType: 'ORGANIZATION',
          signingOrganizationId: organizationId,
          providerLabel: 'CONC-ORG',
          certificateSerial: `ORG-${randomUUID().slice(0, 8)}`,
          certificateFingerprintSha256: orgMaterial.certificateFingerprintSha256,
          certificateSubjectSummary: 'CN=Conc Org Seal',
          validFrom: new Date(Date.now() - 86_400_000).toISOString(),
          validTo: new Date(Date.now() + 86_400_000 * 365).toISOString(),
        },
      });
      expect(orgCredential.status).toBe(201);
      const credentialId = (orgCredential.body as { credentialId: string }).credentialId;
      const grant = await api(operatorToken, `/v1/signing/credentials/${credentialId}/grants`, {
        method: 'POST',
        body: {
          userId: operatorUserId,
          allowedAction: 'USE_ORGANIZATION_SEAL',
          authorityReference: 'CONC-MANDATE',
        },
      });
      expect(grant.status).toBe(201);
      const quotation = await prisma.commercialQuotation.create({
        data: {
          reference: `CONC-SEAL-${randomUUID().slice(0, 8)}`,
          clientId,
          currency: 'MAD',
          status: QuotationStatus.ISSUED,
          issueDate: new Date(),
        },
      });
      const generated = await generationService.generateQuotation(
        quotation.id,
        { outputFamily: 'PDF', language: 'en', idempotencyKey: `conc-seal-${randomUUID()}` },
        operatorUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
      const { documentId, versionId } = {
        documentId: generated.generated.documentId,
        versionId: generated.generated.versionId,
      };
      const created = await api(
        operatorToken,
        `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
        {
          method: 'POST',
          body: {
            kind: 'ORGANIZATION_SEAL',
            signingCredentialId: credentialId,
            signingOrganizationId: organizationId,
            idempotencyKey: `conc-seal-req-${randomUUID()}`,
          },
        },
      );
      expect(created.status).toBe(201);
      const requestId = (created.body as { request: { id: string } }).request.id;
      await api(operatorToken, `/v1/signing/requests/${requestId}/approve`, {
        method: 'POST',
        body: { confirmationSummary: 'Seal concurrency approve.' },
      });
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      const storage = (await import('../src/storage/protected-storage.service.js'))
        .ProtectedStorageService;
      const storageService = app.get(storage);
      const preparedPdf = await storageService.get(row.preparedSigningStorageKey!);
      const signed = await signPreparedPdfWithP12(
        preparedPdf,
        orgMaterial.p12,
        orgMaterial.passphrase,
      );
      setSigningPostAuthorityBarrierForTests(async () => {
        await prisma.signingCredentialGrant.deleteMany({ where: { credentialId } });
      });
      const submitted = await api(operatorToken, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: {
          pdfBase64: signed.toString('base64'),
          resultSha256: createHash('sha256').update(signed).digest('hex'),
          idempotencyKey: `conc-grant-${randomUUID()}`,
        },
      });
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      expect(
        await prisma.documentVersion.count({
          where: { documentId, source: DocumentVersionSource.SIGNED },
        }),
      ).toBe(0);
    });

    it('blocks publication when credential is disabled after authority read', async () => {
      const { requestId, documentId, bundle } = await createApprovedRequest();
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      const storage = (await import('../src/storage/protected-storage.service.js'))
        .ProtectedStorageService;
      const storageService = app.get(storage);
      const preparedPdf = await storageService.get(row.preparedSigningStorageKey!);
      const signed = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      setSigningPostAuthorityBarrierForTests(async () => {
        await prisma.signingCredential.update({
          where: { id: bundle.credentialId },
          data: { status: SigningCredentialStatus.DISABLED },
        });
      });
      const submitted = await api(operatorToken, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: {
          pdfBase64: signed.toString('base64'),
          resultSha256: createHash('sha256').update(signed).digest('hex'),
          idempotencyKey: `conc-cred-${randomUUID()}`,
        },
      });
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      expect(
        await prisma.documentVersion.count({
          where: { documentId, source: DocumentVersionSource.SIGNED },
        }),
      ).toBe(0);
    });
  },
);
