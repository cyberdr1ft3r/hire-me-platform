-- Issue #143 Phase B: signed version lineage, validation evidence, request completion states.
-- Enum extensions live in 20261007102900_document_signing_phase_b_enums.

ALTER TABLE "DocumentVersion" ADD COLUMN "derivedFromVersionId" UUID;

ALTER TABLE "SigningRequest"
ADD COLUMN "acceptedSignedVersionId" UUID,
ADD COLUMN "acceptedResultSha256" TEXT;

CREATE TABLE "SignatureValidation" (
    "id" UUID NOT NULL,
    "signingRequestId" UUID NOT NULL,
    "inputSourceSha256" TEXT NOT NULL,
    "inputResultSha256" TEXT NOT NULL,
    "overallResult" "SignatureValidationOverallResult" NOT NULL,
    "cmsCryptoResult" TEXT NOT NULL,
    "byteRangeResult" TEXT NOT NULL,
    "sourceBindingResult" TEXT NOT NULL,
    "certificateValidityResult" TEXT NOT NULL,
    "chainTrustResult" TEXT NOT NULL,
    "timestampResult" TEXT,
    "validatorName" TEXT NOT NULL,
    "validatorVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "trustStoreVersion" TEXT NOT NULL,
    "reasonCode" TEXT,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignatureValidation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SigningEvidence" (
    "id" UUID NOT NULL,
    "signatureValidationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SigningEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentSignature" (
    "id" UUID NOT NULL,
    "signingRequestId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sourceVersionId" UUID NOT NULL,
    "signedVersionId" UUID NOT NULL,
    "kind" "SigningKind" NOT NULL,
    "intendedSignerUserId" UUID,
    "signingOrganizationId" UUID,
    "performingOperatorUserId" UUID,
    "certificateFingerprintSha256" TEXT NOT NULL,
    "certificateSubjectSummary" TEXT NOT NULL,
    "certificateIssuerSummary" TEXT NOT NULL,
    "acceptanceValidationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentSignature_signingRequestId_key" ON "DocumentSignature"("signingRequestId");
CREATE UNIQUE INDEX "DocumentSignature_signedVersionId_key" ON "DocumentSignature"("signedVersionId");
CREATE UNIQUE INDEX "DocumentSignature_acceptanceValidationId_key" ON "DocumentSignature"("acceptanceValidationId");
CREATE UNIQUE INDEX "SigningEvidence_signatureValidationId_key" ON "SigningEvidence"("signatureValidationId");
CREATE UNIQUE INDEX "SigningEvidence_storageKey_key" ON "SigningEvidence"("storageKey");
CREATE UNIQUE INDEX "SigningRequest_acceptedSignedVersionId_key" ON "SigningRequest"("acceptedSignedVersionId");
CREATE UNIQUE INDEX "SigningRequest_acceptedSignedVersionId_documentId_key" ON "SigningRequest"("acceptedSignedVersionId", "documentId");
CREATE UNIQUE INDEX "DocumentSignature_signedVersionId_documentId_key" ON "DocumentSignature"("signedVersionId", "documentId");

CREATE INDEX "SignatureValidation_signingRequestId_idx" ON "SignatureValidation"("signingRequestId");
CREATE INDEX "SignatureValidation_overallResult_idx" ON "SignatureValidation"("overallResult");
CREATE INDEX "SignatureValidation_validatedAt_idx" ON "SignatureValidation"("validatedAt");
CREATE INDEX "DocumentSignature_documentId_idx" ON "DocumentSignature"("documentId");
CREATE INDEX "DocumentSignature_sourceVersionId_idx" ON "DocumentSignature"("sourceVersionId");
CREATE INDEX "DocumentSignature_certificateFingerprintSha256_idx" ON "DocumentSignature"("certificateFingerprintSha256");
CREATE INDEX "DocumentVersion_derivedFromVersionId_idx" ON "DocumentVersion"("derivedFromVersionId");

ALTER TABLE "DocumentVersion"
ADD CONSTRAINT "DocumentVersion_derivedFromVersionId_documentId_fkey"
FOREIGN KEY ("derivedFromVersionId", "documentId") REFERENCES "DocumentVersion"("id", "documentId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SigningRequest"
ADD CONSTRAINT "SigningRequest_acceptedSignedVersionId_documentId_fkey"
FOREIGN KEY ("acceptedSignedVersionId", "documentId") REFERENCES "DocumentVersion"("id", "documentId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureValidation"
ADD CONSTRAINT "SignatureValidation_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SigningEvidence"
ADD CONSTRAINT "SigningEvidence_signatureValidationId_fkey"
FOREIGN KEY ("signatureValidationId") REFERENCES "SignatureValidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentSignature"
ADD CONSTRAINT "DocumentSignature_signingRequestId_fkey"
FOREIGN KEY ("signingRequestId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_sourceVersionId_documentId_fkey"
FOREIGN KEY ("sourceVersionId", "documentId") REFERENCES "DocumentVersion"("id", "documentId") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_signedVersionId_documentId_fkey"
FOREIGN KEY ("signedVersionId", "documentId") REFERENCES "DocumentVersion"("id", "documentId") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_intendedSignerUserId_fkey"
FOREIGN KEY ("intendedSignerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_signingOrganizationId_fkey"
FOREIGN KEY ("signingOrganizationId") REFERENCES "SigningOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_performingOperatorUserId_fkey"
FOREIGN KEY ("performingOperatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "DocumentSignature_acceptanceValidationId_fkey"
FOREIGN KEY ("acceptanceValidationId") REFERENCES "SignatureValidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentVersion" DROP CONSTRAINT IF EXISTS "DocumentVersion_generation_provenance_consistent";

ALTER TABLE "DocumentVersion"
ADD CONSTRAINT "DocumentVersion_generation_provenance_consistent" CHECK (
  CASE
    WHEN "source" = 'generated' THEN
      "templateId" IS NOT NULL
      AND "templateVersion" IS NOT NULL
      AND "generationLanguage" IS NOT NULL
      AND "outputFamily" IS NOT NULL
      AND "checksumSha256" IS NOT NULL
      AND "generationIdempotencyKey" IS NOT NULL
      AND "sourceSnapshotSha256" IS NOT NULL
      AND "derivedFromVersionId" IS NULL
    WHEN "source" = 'signed' THEN
      "derivedFromVersionId" IS NOT NULL
      AND "checksumSha256" IS NOT NULL
      AND "mimeType" = 'application/pdf'
      AND "outputFamily" = 'pdf'
      AND "templateId" IS NULL
      AND "templateVersion" IS NULL
      AND "generationLanguage" IS NULL
      AND "generationIdempotencyKey" IS NULL
      AND "sourceSnapshotSha256" IS NULL
    ELSE
      "templateId" IS NULL
      AND "templateVersion" IS NULL
      AND "generationLanguage" IS NULL
      AND "generationIdempotencyKey" IS NULL
      AND "sourceSnapshotSha256" IS NULL
      AND "derivedFromVersionId" IS NULL
  END
);

ALTER TABLE "DocumentSignature"
ADD CONSTRAINT "DocumentSignature_identity_xor" CHECK (
  ("kind" = 'PERSON_SIGNATURE' AND "intendedSignerUserId" IS NOT NULL AND "signingOrganizationId" IS NULL)
  OR ("kind" = 'ORGANIZATION_SEAL' AND "signingOrganizationId" IS NOT NULL AND "intendedSignerUserId" IS NULL)
);

ALTER TABLE "DocumentSignature"
ADD CONSTRAINT "DocumentSignature_fingerprint_sha256" CHECK (
  "certificateFingerprintSha256" ~ '^[a-f0-9]{64}$'
);

ALTER TABLE "SignatureValidation"
ADD CONSTRAINT "SignatureValidation_input_source_sha256" CHECK ("inputSourceSha256" ~ '^[a-f0-9]{64}$'),
ADD CONSTRAINT "SignatureValidation_input_result_sha256" CHECK ("inputResultSha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningEvidence"
ADD CONSTRAINT "SigningEvidence_size_positive" CHECK ("sizeBytes" > 0);

ALTER TABLE "SigningRequest"
ADD CONSTRAINT "SigningRequest_accepted_result_sha256" CHECK (
  "acceptedResultSha256" IS NULL OR "acceptedResultSha256" ~ '^[a-f0-9]{64}$'
);
