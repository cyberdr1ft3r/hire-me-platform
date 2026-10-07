import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { DocumentGenerationService } from '../src/document-generation/document-generation.service.js';
import { loadEnvironment } from '../src/config/environment.js';
import { ProtectedStorageService } from '../src/storage/protected-storage.service.js';
import {
  DocumentVersionSource,
  PrismaClient,
  QuotationStatus,
  RoleName,
  SigningRequestState,
  SigningCredentialStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

import {
  TEST_BOOTSTRAP_ADMIN_EMAIL,
  TEST_BOOTSTRAP_ADMIN_PASSWORD,
} from './support/catalog-snapshot.js';
import {
  createSyntheticIntermediateChainP12,
  createSyntheticSigningP12,
  signPreparedPdfWithP12,
} from './support/signing-synthetic-pdf.js';
import { setSigningAcceptanceBarrierForTests } from '../src/document-signing/signing-acceptance-barrier.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-143!';

async function cleanPhaseBRecords(): Promise<void> {
  await prisma.signingEvidence.deleteMany({});
  await prisma.documentSignature.deleteMany({});
  await prisma.signatureValidation.deleteMany({});
  await prisma.signingEvent.deleteMany({});
  await prisma.documentSigningApproval.deleteMany({});
  await prisma.signingRequest.deleteMany({});
  await prisma.signingCredentialGrant.deleteMany({});
  await prisma.signingCredential.deleteMany({});
  await prisma.signingOrganization.deleteMany({});
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

describe(
  'document signing Phase B validation and publication (Issue #143)',
  { timeout: 180_000 },
  () => {
    let app: NestExpressApplication;
    let baseUrl: string;
    let generationService: DocumentGenerationService;
    let storage: ProtectedStorageService;
    let operatorToken: string;
    let operatorUserId: string;
    let outsiderToken: string;
    let clientId: string;
    type SyntheticBundle = ReturnType<typeof createSyntheticSigningP12> & {
      credentialId: string;
    };

    function appendTrustAnchor(pem: string): void {
      const existing = process.env.SIGNING_TRUST_ANCHOR_PEMS?.trim();
      process.env.SIGNING_TRUST_ANCHOR_PEMS = existing ? `${existing}|||${pem}` : pem;
    }

    async function freshSyntheticCredential(
      owner:
        | { ownerType: 'USER'; ownerUserId: string }
        | {
            ownerType: 'ORGANIZATION';
            signingOrganizationId: string;
          },
      fingerprintOverride?: string,
    ): Promise<SyntheticBundle> {
      const material = createSyntheticSigningP12(`CN-${randomUUID().slice(0, 8)}`);
      appendTrustAnchor(material.trustAnchorPem);
      const fingerprint = fingerprintOverride ?? material.certificateFingerprintSha256;
      const response = await api(operatorToken, '/v1/signing/credentials', {
        method: 'POST',
        body: {
          ...owner,
          providerLabel: 'SYNTHETIC-143',
          certificateSerial: `SN-${randomUUID().slice(0, 8)}`,
          certificateFingerprintSha256: fingerprint,
          certificateSubjectSummary: 'CN=Issue143 Test Signer',
          validFrom: new Date(Date.now() - 86_400_000).toISOString(),
          validTo: new Date(Date.now() + 86_400_000 * 365).toISOString(),
        },
      });
      expect(response.status).toBe(201);
      return {
        ...material,
        credentialId: (response.body as { credentialId: string }).credentialId,
      };
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

    async function generateQuotationDocument(): Promise<{ documentId: string; versionId: string }> {
      const quotation = await prisma.commercialQuotation.create({
        data: {
          reference: `SIG143-${randomUUID().slice(0, 8)}`,
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
          idempotencyKey: `sig143-${randomUUID()}`,
        },
        operatorUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
      return {
        documentId: generated.generated.documentId,
        versionId: generated.generated.versionId,
      };
    }

    async function createApprovedPersonRequest(bundle?: SyntheticBundle): Promise<{
      requestId: string;
      documentId: string;
      versionId: string;
      bundle: SyntheticBundle;
    }> {
      const signingMaterial =
        bundle ??
        (await freshSyntheticCredential({ ownerType: 'USER', ownerUserId: operatorUserId }));
      const { documentId, versionId } = await generateQuotationDocument();
      const credentialId = signingMaterial.credentialId;
      const created = await api(
        operatorToken,
        `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
        {
          method: 'POST',
          body: {
            kind: 'PERSON_SIGNATURE',
            signingCredentialId: credentialId,
            idempotencyKey: `req-${randomUUID()}`,
            intendedSignerUserId: operatorUserId,
          },
        },
      );
      expect(created.status).toBe(201);
      const requestId = (created.body as { request: { id: string } }).request.id;
      const approved = await api(operatorToken, `/v1/signing/requests/${requestId}/approve`, {
        method: 'POST',
        body: { confirmationSummary: 'Approve for Phase B test.' },
      });
      expect(approved.status).toBe(200);
      expect((approved.body as { request: { state: string } }).request.state).toBe(
        'AWAITING_RESULT',
      );
      return { requestId, documentId, versionId, bundle: signingMaterial };
    }

    async function preparedPdfForRequest(requestId: string): Promise<Buffer> {
      const row = await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (!row.preparedSigningStorageKey) {
        throw new Error('Prepared signing artifact missing on request.');
      }
      return storage.get(row.preparedSigningStorageKey);
    }

    async function submitSignedResult(
      token: string,
      requestId: string,
      signedPdf: Buffer,
      idempotencyKey = `result-${randomUUID()}`,
    ) {
      const resultSha256 = createHash('sha256').update(signedPdf).digest('hex');
      return api(token, `/v1/signing/requests/${requestId}/results`, {
        method: 'POST',
        body: { pdfBase64: signedPdf.toString('base64'), resultSha256, idempotencyKey },
      });
    }

    beforeAll(async () => {
      process.env.SIGNING_TRUST_ANCHOR_PEMS = '';

      await cleanPhaseBRecords();
      const bootstrapAdmin = await prisma.user.findUniqueOrThrow({
        where: { normalizedEmail: TEST_BOOTSTRAP_ADMIN_EMAIL.toLowerCase() },
      });
      operatorUserId = bootstrapAdmin.id;
      await createUser('outsider143@signing143.test', RoleName.GUEST);

      clientId = (
        await prisma.client.create({
          data: { name: 'Signing143 Client', normalizedName: 'signing143 client' },
        })
      ).id;

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication<NestExpressApplication>();
      await app.listen(0, '127.0.0.1');
      baseUrl = await app.getUrl();
      generationService = app.get(DocumentGenerationService);
      storage = app.get(ProtectedStorageService);

      operatorToken = await login(TEST_BOOTSTRAP_ADMIN_EMAIL, TEST_BOOTSTRAP_ADMIN_PASSWORD);
      outsiderToken = await login('outsider143@signing143.test');
    }, 240_000);

    afterAll(async () => {
      try {
        await app?.close();
        await cleanPhaseBRecords();
        await prisma.user.deleteMany({ where: { normalizedEmail: 'outsider143@signing143.test' } });
      } finally {
        await prisma.$disconnect();
      }
    }, 180_000);

    it('accepts a valid synthetic person signature and publishes one SIGNED version', async () => {
      const { requestId, documentId, versionId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);

      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      const validationRow = await prisma.signatureValidation.findFirst({
        where: { signingRequestId: requestId },
        orderBy: { createdAt: 'desc' },
      });
      expect(validationRow?.reasonCode).toBe(null);
      expect((submitted.body as { request: { state: string } }).request.state).toBe('COMPLETED');

      const requestRow = await prisma.signingRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      expect(requestRow.state).toBe(SigningRequestState.COMPLETED);
      expect(requestRow.acceptedSignedVersionId).toBeTruthy();

      const signatures = await prisma.documentSignature.count({
        where: { signingRequestId: requestId },
      });
      expect(signatures).toBe(1);
      const validations = await prisma.signatureValidation.count({
        where: { signingRequestId: requestId, overallResult: 'VALID' },
      });
      expect(validations).toBe(1);

      const signedVersion = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: requestRow.acceptedSignedVersionId! },
      });
      expect(signedVersion.source).toBe(DocumentVersionSource.SIGNED);
      expect(signedVersion.derivedFromVersionId).toBe(versionId);
      expect(signedVersion.documentId).toBe(documentId);

      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.currentVersionId).toBe(signedVersion.id);
    });

    it('accepts a valid synthetic organization seal', async () => {
      const { documentId, versionId } = await generateQuotationDocument();
      const org = await api(operatorToken, '/v1/signing/organizations', {
        method: 'POST',
        body: { legalName: 'Seal Org 143' },
      });
      const organizationId = (org.body as { organization: { id: string } }).organization.id;
      const bundle = await freshSyntheticCredential({
        ownerType: 'ORGANIZATION',
        signingOrganizationId: organizationId,
      });
      const credentialId = bundle.credentialId;
      await api(operatorToken, `/v1/signing/credentials/${credentialId}/grants`, {
        method: 'POST',
        body: {
          userId: operatorUserId,
          allowedAction: 'USE_ORGANIZATION_SEAL',
          authorityReference: 'MANDATE-143',
        },
      });
      const created = await api(
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
      expect(created.status).toBe(201);
      const requestId = (created.body as { request: { id: string } }).request.id;
      await api(operatorToken, `/v1/signing/requests/${requestId}/approve`, {
        method: 'POST',
        body: { confirmationSummary: 'Seal approval.' },
      });
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe('COMPLETED');
    });

    it('rejects credential fingerprint mismatch without publishing SIGNED version', async () => {
      const wrongFingerprint = createHash('sha256').update('wrong-cert').digest('hex');
      const signingMaterial = await freshSyntheticCredential(
        { ownerType: 'USER', ownerUserId: operatorUserId },
        wrongFingerprint,
      );
      const { requestId, versionId } = await createApprovedPersonRequest(signingMaterial);
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(
        preparedPdf,
        signingMaterial.p12,
        signingMaterial.passphrase,
      );
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      expect(
        await prisma.documentVersion.count({
          where: { derivedFromVersionId: versionId, source: DocumentVersionSource.SIGNED },
        }),
      ).toBe(0);
    });

    it('rejects CMS tampering and PDF content tampering', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const tamperedCms = Buffer.from(signedPdf);
      const tamperIndex = tamperedCms.length - 40;
      if (tamperIndex >= 0) {
        tamperedCms[tamperIndex] = (tamperedCms[tamperIndex] ?? 0) ^ 0xff;
      }
      const cmsRejected = await submitSignedResult(operatorToken, requestId, tamperedCms);
      expect(cmsRejected.status).toBe(200);
      expect((cmsRejected.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );

      const { requestId: requestId2, bundle: bundle2 } = await createApprovedPersonRequest();
      const other = await createApprovedPersonRequest();
      const foreignPrepared = await preparedPdfForRequest(other.requestId);
      const wrongSourceSigned = await signPreparedPdfWithP12(
        foreignPrepared,
        bundle2.p12,
        bundle2.passphrase,
      );
      const bindingRejected = await submitSignedResult(
        operatorToken,
        requestId2,
        wrongSourceSigned,
      );
      expect(bindingRejected.status).toBe(200);
      expect((bindingRejected.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );
    });

    it('rejects unsigned trailing bytes after the signed ByteRange', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const trailing = Buffer.concat([signedPdf, Buffer.from('TRAILER')]);
      const submitted = await submitSignedResult(operatorToken, requestId, trailing);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );
    });

    it('rejects stale source when current version advances before acceptance', async () => {
      const quotation = await prisma.commercialQuotation.create({
        data: {
          reference: `SIG143-STALE-${randomUUID().slice(0, 6)}`,
          clientId,
          currency: 'MAD',
          status: QuotationStatus.ISSUED,
          issueDate: new Date(),
        },
      });
      const generated = await generationService.generateQuotation(
        quotation.id,
        { outputFamily: 'PDF', language: 'en', idempotencyKey: `stale-${randomUUID()}` },
        operatorUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
      const { documentId, versionId } = {
        documentId: generated.generated.documentId,
        versionId: generated.generated.versionId,
      };
      const staleBundle = await freshSyntheticCredential({
        ownerType: 'USER',
        ownerUserId: operatorUserId,
      });
      const credentialId = staleBundle.credentialId;
      const created = await api(
        operatorToken,
        `/v1/documents/${documentId}/versions/${versionId}/signing-requests`,
        {
          method: 'POST',
          body: {
            kind: 'PERSON_SIGNATURE',
            signingCredentialId: credentialId,
            idempotencyKey: `stale-req-${randomUUID()}`,
            intendedSignerUserId: operatorUserId,
          },
        },
      );
      const requestId = (created.body as { request: { id: string } }).request.id;
      await api(operatorToken, `/v1/signing/requests/${requestId}/approve`, {
        method: 'POST',
        body: { confirmationSummary: 'Approve stale test.' },
      });
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(
        preparedPdf,
        staleBundle.p12,
        staleBundle.passphrase,
      );
      await generationService.generateQuotation(
        quotation.id,
        { outputFamily: 'PDF', language: 'en', idempotencyKey: `stale-regen-${randomUUID()}` },
        operatorUserId,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      );
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
    });

    it('supports identical result idempotency and rejects a different second result', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const first = await submitSignedResult(operatorToken, requestId, signedPdf, 'idem-143-a');
      expect(first.status).toBe(200);
      const second = await submitSignedResult(operatorToken, requestId, signedPdf, 'idem-143-b');
      expect(second.status).toBe(200);
      expect((second.body as { request: { state: string } }).request.state).toBe('COMPLETED');
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        1,
      );

      const { requestId: requestId2, bundle: bundle2 } = await createApprovedPersonRequest();
      const preparedPdf2 = await preparedPdfForRequest(requestId2);
      const signedPdf2 = await signPreparedPdfWithP12(
        preparedPdf2,
        bundle2.p12,
        bundle2.passphrase,
      );
      await submitSignedResult(operatorToken, requestId2, signedPdf2);
      const other = await createApprovedPersonRequest();
      const otherPrepared = await preparedPdfForRequest(other.requestId);
      const differentSigned = await signPreparedPdfWithP12(
        otherPrepared,
        bundle2.p12,
        bundle2.passphrase,
      );
      const conflict = await submitSignedResult(operatorToken, requestId2, differentSigned);
      expect(conflict.status).toBe(409);
    });

    it('denies cross-scope result submission (IDOR)', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const denied = await submitSignedResult(outsiderToken, requestId, signedPdf);
      expect([403, 404]).toContain(denied.status);
    });

    it('rejects corrupted signed storage on download', async () => {
      const { requestId, documentId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      await submitSignedResult(operatorToken, requestId, signedPdf);
      const requestRow = await prisma.signingRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      const signedVersion = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: requestRow.acceptedSignedVersionId! },
      });
      const storageRoot = normalize(loadEnvironment().PRIVATE_UPLOAD_STORAGE_ROOT);
      await writeFile(join(storageRoot, signedVersion.storageKey), Buffer.from('%PDF-corrupt'));
      const download = await api(
        operatorToken,
        `/v1/documents/${documentId}/versions/${signedVersion.id}/download`,
      );
      expect(download.status).toBe(409);
    });

    it('keeps ordinary document upload provenance as UPLOADED (not SIGNED)', async () => {
      const { documentId } = await generateQuotationDocument();
      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
        include: { versions: true },
      });
      for (const version of document.versions) {
        expect(version.source).toBe(DocumentVersionSource.GENERATED);
      }
    });

    it('accepts leaf signed by intermediate when configured root anchor matches', async () => {
      const chain = createSyntheticIntermediateChainP12();
      process.env.SIGNING_TRUST_ANCHOR_PEMS = chain.rootTrustAnchorPem;
      const bundle = await freshSyntheticCredential(
        { ownerType: 'USER', ownerUserId: operatorUserId },
        chain.leafFingerprintSha256,
      );
      const { requestId } = await createApprovedPersonRequest({
        ...bundle,
        p12: chain.p12,
        passphrase: chain.passphrase,
        certificateFingerprintSha256: chain.leafFingerprintSha256,
        trustAnchorPem: chain.rootTrustAnchorPem,
      });
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, chain.p12, chain.passphrase);
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe('COMPLETED');
    });

    it('rejects unrelated self-signed signer against unrelated configured root', async () => {
      const chain = createSyntheticIntermediateChainP12();
      const unrelated = createSyntheticSigningP12('Unrelated Self Signed');
      process.env.SIGNING_TRUST_ANCHOR_PEMS = chain.rootTrustAnchorPem;
      const bundle = await freshSyntheticCredential(
        { ownerType: 'USER', ownerUserId: operatorUserId },
        unrelated.certificateFingerprintSha256,
      );
      const { requestId } = await createApprovedPersonRequest(bundle);
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(
        preparedPdf,
        unrelated.p12,
        unrelated.passphrase,
      );
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );
    });

    it('rejects prepared-artifact byte mutation outside signature contents', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const mutatedPrepared = Buffer.from(preparedPdf);
      mutatedPrepared[400] = (mutatedPrepared[400] ?? 0) ^ 0x01;
      const signedPdf = await signPreparedPdfWithP12(
        mutatedPrepared,
        bundle.p12,
        bundle.passphrase,
      );
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );
    });

    it('rolls back staged publication without signature.accepted audit on forced failure', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      process.env.SIGNING_TEST_FORCE_PUBLICATION_ROLLBACK = requestId;
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      delete process.env.SIGNING_TEST_FORCE_PUBLICATION_ROLLBACK;
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
      const auditCount = await prisma.auditLog.count({
        where: { entityId: requestId, action: 'signing.signature.accepted' },
      });
      expect(auditCount).toBe(0);
    });

    it('rejects signing a PDF prepared from an incrementally revised source (not the bound artifact)', async () => {
      const { requestId, versionId, bundle } = await createApprovedPersonRequest();
      const sourceVersion = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      const sourcePdf = await storage.get(sourceVersion.storageKey);
      const eofMarker = '%%EOF';
      const eofIndex = sourcePdf.lastIndexOf(eofMarker);
      expect(eofIndex).toBeGreaterThan(0);
      const revisedSource = Buffer.concat([
        sourcePdf.subarray(0, eofIndex),
        Buffer.from('\n% visible-content revision object\n'),
        sourcePdf.subarray(eofIndex),
      ]);
      const wrongPrepared = plainAddPlaceholder({
        pdfBuffer: revisedSource,
        reason: 'Hire Me signing placeholder',
        contactInfo: 'signing@hireme.local',
        name: 'Hire Me',
        location: 'Prepared artifact',
      });
      const signedPdf = await signPreparedPdfWithP12(wrongPrepared, bundle.p12, bundle.passphrase);
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      expect(submitted.status).toBe(200);
      expect((submitted.body as { request: { state: string } }).request.state).toBe(
        'VALIDATION_REJECTED',
      );
    });

    it('rejects when trust anchor store is empty at validation time', async () => {
      const saved = process.env.SIGNING_TRUST_ANCHOR_PEMS;
      try {
        const { requestId, bundle } = await createApprovedPersonRequest();
        process.env.SIGNING_TRUST_ANCHOR_PEMS = '';
        const preparedPdf = await preparedPdfForRequest(requestId);
        const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
        const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
        expect(submitted.status).toBe(200);
        expect((submitted.body as { request: { state: string } }).request.state).toBe(
          'VALIDATION_REJECTED',
        );
      } finally {
        process.env.SIGNING_TRUST_ANCHOR_PEMS = saved;
      }
    });

    it('blocks publication when credential is disabled after validation (acceptance fence)', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      setSigningAcceptanceBarrierForTests(async () => {
        await prisma.signingCredential.update({
          where: { id: bundle.credentialId },
          data: { status: SigningCredentialStatus.DISABLED },
        });
      });
      const submitted = await submitSignedResult(operatorToken, requestId, signedPdf);
      setSigningAcceptanceBarrierForTests(null);
      expect(submitted.status).toBe(409);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        0,
      );
    });

    it('concurrent duplicate acceptance publishes exactly one signature', async () => {
      const { requestId, bundle } = await createApprovedPersonRequest();
      const preparedPdf = await preparedPdfForRequest(requestId);
      const signedPdf = await signPreparedPdfWithP12(preparedPdf, bundle.p12, bundle.passphrase);
      const results = await Promise.all([
        submitSignedResult(operatorToken, requestId, signedPdf, `conc-${randomUUID()}`),
        submitSignedResult(operatorToken, requestId, signedPdf, `conc-${randomUUID()}`),
      ]);
      const successes = results.filter((result) => result.status === 200);
      expect(successes.length).toBe(2);
      expect(await prisma.documentSignature.count({ where: { signingRequestId: requestId } })).toBe(
        1,
      );
      expect(
        await prisma.documentVersion.count({
          where: {
            documentId: (
              await prisma.signingRequest.findUniqueOrThrow({ where: { id: requestId } })
            ).documentId,
            source: DocumentVersionSource.SIGNED,
          },
        }),
      ).toBe(1);
    });
  },
);
