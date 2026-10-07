-- Issue #141 review: composite document/version FK and credential/grant validity checks.

CREATE UNIQUE INDEX "DocumentVersion_id_documentId_key" ON "DocumentVersion"("id", "documentId");

ALTER TABLE "SigningRequest" DROP CONSTRAINT "SigningRequest_sourceVersionId_fkey";

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_sourceVersion_document_fkey"
  FOREIGN KEY ("sourceVersionId", "documentId")
  REFERENCES "DocumentVersion"("id", "documentId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SigningCredential"
  ADD CONSTRAINT "SigningCredential_validity_range"
  CHECK ("validTo" > "validFrom");

ALTER TABLE "SigningCredentialGrant"
  ADD CONSTRAINT "SigningCredentialGrant_expires_after_start"
  CHECK ("expiresAt" IS NULL OR "expiresAt" > "startsAt");
