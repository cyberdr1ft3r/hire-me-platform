-- Issue #143 maintainer hardening: prepared artifact binding, evidence FKs, lineage checks.

ALTER TABLE "SigningRequest"
ADD COLUMN "preparedSigningArtifactSha256" TEXT,
ADD COLUMN "preparedSigningStorageKey" TEXT;

CREATE UNIQUE INDEX "SigningRequest_preparedSigningStorageKey_key"
ON "SigningRequest"("preparedSigningStorageKey");

ALTER TABLE "DocumentVersion"
ADD CONSTRAINT "DocumentVersion_signed_no_self_lineage"
CHECK ("derivedFromVersionId" IS NULL OR "derivedFromVersionId" <> "id");

ALTER TABLE "DocumentSignature" DROP CONSTRAINT IF EXISTS "DocumentSignature_performingOperatorUserId_fkey";
ALTER TABLE "DocumentSignature"
ADD CONSTRAINT "DocumentSignature_performingOperatorUserId_fkey"
FOREIGN KEY ("performingOperatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SignatureValidation_id_signingRequestId_key"
ON "SignatureValidation"("id", "signingRequestId");

ALTER TABLE "DocumentSignature" DROP CONSTRAINT IF EXISTS "DocumentSignature_acceptanceValidationId_fkey";
ALTER TABLE "DocumentSignature"
ADD CONSTRAINT "DocumentSignature_acceptanceValidationId_signingRequestId_fkey"
FOREIGN KEY ("acceptanceValidationId", "signingRequestId")
REFERENCES "SignatureValidation"("id", "signingRequestId") ON DELETE RESTRICT ON UPDATE CASCADE;
