import './setup-env.js';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import {
  DocumentStatus,
  DocumentType,
  DocumentVersionSource,
  PrismaClient,
  SignatureValidationOverallResult,
  SigningKind,
  SigningRequestState,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();

async function createDocumentWithVersion(title: string): Promise<{
  documentId: string;
  versionId: string;
  checksum: string;
}> {
  const document = await prisma.document.create({
    data: { title, documentType: DocumentType.OTHER },
  });
  const checksum = createHash('sha256').update(randomUUID()).digest('hex');
  const version = await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      filename: 'test.pdf',
      originalFilename: 'test.pdf',
      storageKey: `test/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1n,
      checksumSha256: checksum,
      outputFamily: 'PDF',
      source: DocumentVersionSource.UPLOADED,
      status: DocumentStatus.ACTIVE,
    },
  });
  return { documentId: document.id, versionId: version.id, checksum };
}

describe('document signing Phase B DB evidence invariants', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects SIGNED DocumentVersion with self lineage', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('db-invariant-test');
    await expect(
      prisma.documentVersion.update({
        where: { id: versionId },
        data: {
          source: DocumentVersionSource.SIGNED,
          derivedFromVersionId: versionId,
        },
      }),
    ).rejects.toThrow();
    await prisma.documentVersion.delete({ where: { id: versionId } });
    await prisma.document.delete({ where: { id: documentId } });
  });

  it('rejects DocumentSignature acceptanceValidation from another signing request', async () => {
    const { documentId, versionId, checksum } =
      await createDocumentWithVersion('cross-request-test');
    const signedVersion = await prisma.documentVersion.create({
      data: {
        documentId,
        versionNumber: 2,
        filename: 'signed.pdf',
        originalFilename: 'signed.pdf',
        storageKey: `test/${randomUUID()}-signed.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1n,
        checksumSha256: createHash('sha256').update('signed').digest('hex'),
        outputFamily: 'PDF',
        source: DocumentVersionSource.UPLOADED,
        status: DocumentStatus.ACTIVE,
      },
    });
    const user = await prisma.user.findFirstOrThrow();
    const credential = await prisma.signingCredential.create({
      data: {
        ownerType: 'USER',
        ownerUserId: user.id,
        providerLabel: 'DB-TEST',
        certificateSerial: randomUUID(),
        certificateFingerprintSha256: createHash('sha256').update(randomUUID()).digest('hex'),
        certificateSubjectSummary: 'test',
        validFrom: new Date(Date.now() - 86_400_000),
        validTo: new Date(Date.now() + 86_400_000),
        status: 'ENABLED',
      },
    });

    const requestA = await prisma.signingRequest.create({
      data: {
        documentId,
        sourceVersionId: versionId,
        sourceSha256: checksum,
        kind: SigningKind.PERSON_SIGNATURE,
        state: SigningRequestState.COMPLETED,
        methodIdentifier: 'test',
        policyVersion: 'test',
        expiresAt: new Date(Date.now() + 86_400_000),
        bindingHash: 'e'.repeat(64),
        nonceHash: '1'.repeat(64),
        idempotencyKey: `db-test-a-${randomUUID()}`,
        signingCredentialId: credential.id,
        credentialFingerprintSha256: credential.certificateFingerprintSha256,
        intendedSignerUserId: user.id,
        requestedByUserId: user.id,
      },
    });
    const requestB = await prisma.signingRequest.create({
      data: {
        documentId,
        sourceVersionId: versionId,
        sourceSha256: checksum,
        kind: SigningKind.PERSON_SIGNATURE,
        state: SigningRequestState.COMPLETED,
        methodIdentifier: 'test',
        policyVersion: 'test',
        expiresAt: new Date(Date.now() + 86_400_000),
        bindingHash: 'f'.repeat(64),
        nonceHash: '2'.repeat(64),
        idempotencyKey: `db-test-b-${randomUUID()}`,
        signingCredentialId: credential.id,
        credentialFingerprintSha256: credential.certificateFingerprintSha256,
        intendedSignerUserId: user.id,
        requestedByUserId: user.id,
      },
    });

    const validationForA = await prisma.signatureValidation.create({
      data: {
        signingRequestId: requestA.id,
        inputSourceSha256: '1'.repeat(64),
        inputResultSha256: '2'.repeat(64),
        overallResult: SignatureValidationOverallResult.VALID,
        cmsCryptoResult: 'VALID',
        byteRangeResult: 'VALID',
        sourceBindingResult: 'VALID',
        certificateValidityResult: 'VALID',
        chainTrustResult: 'TRUSTED',
        validatorName: 'test',
        validatorVersion: '0',
        policyVersion: 'test',
        trustStoreVersion: 'test',
      },
    });

    await expect(
      prisma.documentSignature.create({
        data: {
          signingRequestId: requestB.id,
          documentId,
          sourceVersionId: versionId,
          signedVersionId: signedVersion.id,
          kind: SigningKind.PERSON_SIGNATURE,
          intendedSignerUserId: user.id,
          performingOperatorUserId: user.id,
          certificateFingerprintSha256: credential.certificateFingerprintSha256,
          certificateSubjectSummary: 'test',
          certificateIssuerSummary: 'test',
          acceptanceValidationId: validationForA.id,
        },
      }),
    ).rejects.toThrow();

    await prisma.signatureValidation.deleteMany({
      where: { signingRequestId: { in: [requestA.id, requestB.id] } },
    });
    await prisma.signingRequest.deleteMany({ where: { id: { in: [requestA.id, requestB.id] } } });
    await prisma.signingCredential.delete({ where: { id: credential.id } });
    await prisma.documentVersion.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } });
  });

  it('rejects SigningRequest acceptedSignedVersionId from another document', async () => {
    const docA = await createDocumentWithVersion('doc-a');
    const docB = await createDocumentWithVersion('doc-b');
    const user = await prisma.user.findFirstOrThrow();
    const credential = await prisma.signingCredential.create({
      data: {
        ownerType: 'USER',
        ownerUserId: user.id,
        providerLabel: 'DB-TEST',
        certificateSerial: randomUUID(),
        certificateFingerprintSha256: createHash('sha256').update(randomUUID()).digest('hex'),
        certificateSubjectSummary: 'test',
        validFrom: new Date(Date.now() - 86_400_000),
        validTo: new Date(Date.now() + 86_400_000),
        status: 'ENABLED',
      },
    });
    const request = await prisma.signingRequest.create({
      data: {
        documentId: docA.documentId,
        sourceVersionId: docA.versionId,
        sourceSha256: docA.checksum,
        kind: SigningKind.PERSON_SIGNATURE,
        state: SigningRequestState.COMPLETED,
        methodIdentifier: 'test',
        policyVersion: 'test',
        expiresAt: new Date(Date.now() + 86_400_000),
        bindingHash: 'a'.repeat(64),
        nonceHash: 'b'.repeat(64),
        idempotencyKey: `db-cross-doc-${randomUUID()}`,
        signingCredentialId: credential.id,
        credentialFingerprintSha256: credential.certificateFingerprintSha256,
        intendedSignerUserId: user.id,
        requestedByUserId: user.id,
      },
    });
    await expect(
      prisma.signingRequest.update({
        where: { id: request.id },
        data: { acceptedSignedVersionId: docB.versionId },
      }),
    ).rejects.toThrow();
    await prisma.signingRequest.delete({ where: { id: request.id } });
    await prisma.signingCredential.delete({ where: { id: credential.id } });
    await prisma.documentVersion.deleteMany({
      where: { documentId: { in: [docA.documentId, docB.documentId] } },
    });
    await prisma.document.deleteMany({ where: { id: { in: [docA.documentId, docB.documentId] } } });
  });

  it('rejects DocumentSignature when signed version belongs to another document', async () => {
    const docA = await createDocumentWithVersion('sig-doc-a');
    const docB = await createDocumentWithVersion('sig-doc-b');
    const user = await prisma.user.findFirstOrThrow();
    const credential = await prisma.signingCredential.create({
      data: {
        ownerType: 'USER',
        ownerUserId: user.id,
        providerLabel: 'DB-TEST',
        certificateSerial: randomUUID(),
        certificateFingerprintSha256: createHash('sha256').update(randomUUID()).digest('hex'),
        certificateSubjectSummary: 'test',
        validFrom: new Date(Date.now() - 86_400_000),
        validTo: new Date(Date.now() + 86_400_000),
        status: 'ENABLED',
      },
    });
    const request = await prisma.signingRequest.create({
      data: {
        documentId: docA.documentId,
        sourceVersionId: docA.versionId,
        sourceSha256: docA.checksum,
        kind: SigningKind.PERSON_SIGNATURE,
        state: SigningRequestState.COMPLETED,
        methodIdentifier: 'test',
        policyVersion: 'test',
        expiresAt: new Date(Date.now() + 86_400_000),
        bindingHash: 'c'.repeat(64),
        nonceHash: 'd'.repeat(64),
        idempotencyKey: `db-sig-cross-${randomUUID()}`,
        signingCredentialId: credential.id,
        credentialFingerprintSha256: credential.certificateFingerprintSha256,
        intendedSignerUserId: user.id,
        requestedByUserId: user.id,
      },
    });
    const validation = await prisma.signatureValidation.create({
      data: {
        signingRequestId: request.id,
        inputSourceSha256: '1'.repeat(64),
        inputResultSha256: '2'.repeat(64),
        overallResult: SignatureValidationOverallResult.VALID,
        cmsCryptoResult: 'VALID',
        byteRangeResult: 'VALID',
        sourceBindingResult: 'VALID',
        certificateValidityResult: 'VALID',
        chainTrustResult: 'TRUSTED',
        validatorName: 'test',
        validatorVersion: '0',
        policyVersion: 'test',
        trustStoreVersion: 'test',
      },
    });
    await expect(
      prisma.documentSignature.create({
        data: {
          signingRequestId: request.id,
          documentId: docA.documentId,
          sourceVersionId: docA.versionId,
          signedVersionId: docB.versionId,
          kind: SigningKind.PERSON_SIGNATURE,
          intendedSignerUserId: user.id,
          performingOperatorUserId: user.id,
          certificateFingerprintSha256: credential.certificateFingerprintSha256,
          certificateSubjectSummary: 'test',
          certificateIssuerSummary: 'test',
          acceptanceValidationId: validation.id,
        },
      }),
    ).rejects.toThrow();
    await prisma.signatureValidation.delete({ where: { id: validation.id } });
    await prisma.signingRequest.delete({ where: { id: request.id } });
    await prisma.signingCredential.delete({ where: { id: credential.id } });
    await prisma.documentVersion.deleteMany({
      where: { documentId: { in: [docA.documentId, docB.documentId] } },
    });
    await prisma.document.deleteMany({ where: { id: { in: [docA.documentId, docB.documentId] } } });
  });

  it('rejects SIGNED version derivedFromVersionId pointing at another document version', async () => {
    const docA = await createDocumentWithVersion('lineage-a');
    const docB = await createDocumentWithVersion('lineage-b');
    await expect(
      prisma.documentVersion.create({
        data: {
          documentId: docA.documentId,
          versionNumber: 2,
          filename: 'signed-cross.pdf',
          originalFilename: 'signed-cross.pdf',
          storageKey: `test/${randomUUID()}-signed.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1n,
          checksumSha256: createHash('sha256').update('x').digest('hex'),
          outputFamily: 'PDF',
          source: DocumentVersionSource.SIGNED,
          derivedFromVersionId: docB.versionId,
          status: DocumentStatus.ACTIVE,
        },
      }),
    ).rejects.toThrow();
    await prisma.documentVersion.deleteMany({
      where: { documentId: { in: [docA.documentId, docB.documentId] } },
    });
    await prisma.document.deleteMany({ where: { id: { in: [docA.documentId, docB.documentId] } } });
  });
});
