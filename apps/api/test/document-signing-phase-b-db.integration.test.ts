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

describe('document signing Phase B DB evidence invariants', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects SIGNED DocumentVersion with self lineage', async () => {
    const document = await prisma.document.create({
      data: { title: 'db-invariant-test', documentType: DocumentType.OTHER },
    });
    const version = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        filename: 'test.pdf',
        originalFilename: 'test.pdf',
        storageKey: `test/${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1n,
        checksumSha256: 'a'.repeat(64),
        outputFamily: 'PDF',
        source: DocumentVersionSource.UPLOADED,
        status: DocumentStatus.ACTIVE,
      },
    });
    await expect(
      prisma.documentVersion.update({
        where: { id: version.id },
        data: {
          source: DocumentVersionSource.SIGNED,
          derivedFromVersionId: version.id,
        },
      }),
    ).rejects.toThrow();
    await prisma.documentVersion.delete({ where: { id: version.id } });
    await prisma.document.delete({ where: { id: document.id } });
  });

  it('rejects DocumentSignature acceptanceValidation from another signing request', async () => {
    const document = await prisma.document.create({
      data: { title: 'cross-request-test', documentType: DocumentType.OTHER },
    });
    const sourceVersion = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        filename: 'src.pdf',
        originalFilename: 'src.pdf',
        storageKey: `test/${randomUUID()}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1n,
        checksumSha256: 'b'.repeat(64),
        outputFamily: 'PDF',
        source: DocumentVersionSource.UPLOADED,
        status: DocumentStatus.ACTIVE,
      },
    });
    const signedVersion = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 2,
        filename: 'signed.pdf',
        originalFilename: 'signed.pdf',
        storageKey: `test/${randomUUID()}-signed.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1n,
        checksumSha256: 'c'.repeat(64),
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
        documentId: document.id,
        sourceVersionId: sourceVersion.id,
        sourceSha256: sourceVersion.checksumSha256 ?? 'b'.repeat(64),
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
        documentId: document.id,
        sourceVersionId: sourceVersion.id,
        sourceSha256: sourceVersion.checksumSha256 ?? 'b'.repeat(64),
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
          documentId: document.id,
          sourceVersionId: sourceVersion.id,
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
    await prisma.documentVersion.deleteMany({ where: { documentId: document.id } });
    await prisma.document.delete({ where: { id: document.id } });
  });
});
