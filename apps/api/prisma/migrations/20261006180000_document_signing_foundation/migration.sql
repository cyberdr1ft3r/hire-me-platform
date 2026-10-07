-- Issue #141: provider-neutral electronic signing domain foundation (Phase A).

CREATE TYPE "SigningOrganizationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "SigningCredentialOwnerType" AS ENUM ('USER', 'ORGANIZATION');
CREATE TYPE "SigningCredentialStatus" AS ENUM ('ENABLED', 'DISABLED', 'ARCHIVED');
CREATE TYPE "SigningGrantAction" AS ENUM ('USE_PERSON_SIGNATURE', 'USE_ORGANIZATION_SEAL');
CREATE TYPE "SigningKind" AS ENUM ('PERSON_SIGNATURE', 'ORGANIZATION_SEAL');
CREATE TYPE "SigningRequestState" AS ENUM (
  'PREPARED',
  'APPROVED',
  'AWAITING_RESULT',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'STALE'
);

CREATE TABLE "SigningOrganization" (
  "id" UUID NOT NULL,
  "legalName" TEXT NOT NULL,
  "registrationNumber" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'MA',
  "status" "SigningOrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SigningOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SigningCredential" (
  "id" UUID NOT NULL,
  "ownerType" "SigningCredentialOwnerType" NOT NULL,
  "ownerUserId" UUID,
  "signingOrganizationId" UUID,
  "providerLabel" TEXT NOT NULL,
  "serviceTypeOid" TEXT,
  "certificateSerial" TEXT NOT NULL,
  "certificateFingerprintSha256" TEXT NOT NULL,
  "certificateSubjectSummary" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3) NOT NULL,
  "status" "SigningCredentialStatus" NOT NULL DEFAULT 'ENABLED',
  "verifiedAt" TIMESTAMP(3),
  "verifiedByUserId" UUID,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SigningCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SigningCredentialGrant" (
  "id" UUID NOT NULL,
  "credentialId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "allowedAction" "SigningGrantAction" NOT NULL,
  "authorityReference" TEXT NOT NULL,
  "authorizedByUserId" UUID NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SigningCredentialGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SigningRequest" (
  "id" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "sourceVersionId" UUID NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceSnapshotSha256" TEXT,
  "kind" "SigningKind" NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "intendedSignerUserId" UUID,
  "signingOrganizationId" UUID,
  "signingCredentialId" UUID NOT NULL,
  "credentialFingerprintSha256" TEXT NOT NULL,
  "methodIdentifier" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "bindingHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "state" "SigningRequestState" NOT NULL DEFAULT 'PREPARED',
  "terminalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SigningRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentSigningApproval" (
  "id" UUID NOT NULL,
  "signingRequestId" UUID NOT NULL,
  "approverUserId" UUID NOT NULL,
  "bindingHash" TEXT NOT NULL,
  "confirmationSummary" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSigningApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SigningEvent" (
  "id" UUID NOT NULL,
  "signingRequestId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" UUID,
  "reasonCode" TEXT,
  "metadataSummary" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SigningEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SigningCredential_certificateFingerprintSha256_key" ON "SigningCredential"("certificateFingerprintSha256");
CREATE INDEX "SigningOrganization_status_idx" ON "SigningOrganization"("status");
CREATE INDEX "SigningCredential_ownerType_idx" ON "SigningCredential"("ownerType");
CREATE INDEX "SigningCredential_ownerUserId_idx" ON "SigningCredential"("ownerUserId");
CREATE INDEX "SigningCredential_signingOrganizationId_idx" ON "SigningCredential"("signingOrganizationId");
CREATE INDEX "SigningCredential_status_idx" ON "SigningCredential"("status");
CREATE INDEX "SigningCredentialGrant_credentialId_idx" ON "SigningCredentialGrant"("credentialId");
CREATE INDEX "SigningCredentialGrant_userId_idx" ON "SigningCredentialGrant"("userId");
CREATE INDEX "SigningCredentialGrant_revokedAt_idx" ON "SigningCredentialGrant"("revokedAt");
CREATE UNIQUE INDEX "SigningRequest_requestedByUserId_idempotencyKey_key" ON "SigningRequest"("requestedByUserId", "idempotencyKey");
CREATE INDEX "SigningRequest_documentId_idx" ON "SigningRequest"("documentId");
CREATE INDEX "SigningRequest_sourceVersionId_idx" ON "SigningRequest"("sourceVersionId");
CREATE INDEX "SigningRequest_state_idx" ON "SigningRequest"("state");
CREATE INDEX "SigningRequest_expiresAt_idx" ON "SigningRequest"("expiresAt");
CREATE INDEX "SigningRequest_signingCredentialId_idx" ON "SigningRequest"("signingCredentialId");
CREATE UNIQUE INDEX "DocumentSigningApproval_signingRequestId_key" ON "DocumentSigningApproval"("signingRequestId");
CREATE INDEX "DocumentSigningApproval_approverUserId_idx" ON "DocumentSigningApproval"("approverUserId");
CREATE UNIQUE INDEX "SigningEvent_signingRequestId_sequence_key" ON "SigningEvent"("signingRequestId", "sequence");
CREATE INDEX "SigningEvent_signingRequestId_idx" ON "SigningEvent"("signingRequestId");
CREATE INDEX "SigningEvent_actorUserId_idx" ON "SigningEvent"("actorUserId");
CREATE INDEX "SigningEvent_occurredAt_idx" ON "SigningEvent"("occurredAt");

CREATE UNIQUE INDEX "SigningRequest_one_active_per_source_version"
  ON "SigningRequest"("sourceVersionId")
  WHERE "state" IN ('PREPARED', 'APPROVED', 'AWAITING_RESULT');

ALTER TABLE "SigningCredential"
  ADD CONSTRAINT "SigningCredential_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningCredential"
  ADD CONSTRAINT "SigningCredential_signingOrganizationId_fkey"
  FOREIGN KEY ("signingOrganizationId") REFERENCES "SigningOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningCredential"
  ADD CONSTRAINT "SigningCredential_verifiedByUserId_fkey"
  FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SigningCredentialGrant"
  ADD CONSTRAINT "SigningCredentialGrant_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "SigningCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningCredentialGrant"
  ADD CONSTRAINT "SigningCredentialGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningCredentialGrant"
  ADD CONSTRAINT "SigningCredentialGrant_authorizedByUserId_fkey"
  FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_sourceVersionId_fkey"
  FOREIGN KEY ("sourceVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_intendedSignerUserId_fkey"
  FOREIGN KEY ("intendedSignerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_signingOrganizationId_fkey"
  FOREIGN KEY ("signingOrganizationId") REFERENCES "SigningOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_signingCredentialId_fkey"
  FOREIGN KEY ("signingCredentialId") REFERENCES "SigningCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentSigningApproval"
  ADD CONSTRAINT "DocumentSigningApproval_signingRequestId_fkey"
  FOREIGN KEY ("signingRequestId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentSigningApproval"
  ADD CONSTRAINT "DocumentSigningApproval_approverUserId_fkey"
  FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SigningEvent"
  ADD CONSTRAINT "SigningEvent_signingRequestId_fkey"
  FOREIGN KEY ("signingRequestId") REFERENCES "SigningRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SigningEvent"
  ADD CONSTRAINT "SigningEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SigningCredential"
  ADD CONSTRAINT "SigningCredential_owner_xor"
  CHECK (
    ("ownerType" = 'USER' AND "ownerUserId" IS NOT NULL AND "signingOrganizationId" IS NULL)
    OR ("ownerType" = 'ORGANIZATION' AND "signingOrganizationId" IS NOT NULL AND "ownerUserId" IS NULL)
  );

ALTER TABLE "SigningCredential"
  ADD CONSTRAINT "SigningCredential_fingerprint_sha256_format"
  CHECK ("certificateFingerprintSha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_source_sha256_format"
  CHECK ("sourceSha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_source_snapshot_sha256_format"
  CHECK ("sourceSnapshotSha256" IS NULL OR "sourceSnapshotSha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_credential_fingerprint_sha256_format"
  CHECK ("credentialFingerprintSha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_nonce_hash_format"
  CHECK ("nonceHash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_binding_hash_format"
  CHECK ("bindingHash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "SigningRequest"
  ADD CONSTRAINT "SigningRequest_kind_target_consistent"
  CHECK (
    ("kind" = 'PERSON_SIGNATURE' AND "intendedSignerUserId" IS NOT NULL AND "signingOrganizationId" IS NULL)
    OR ("kind" = 'ORGANIZATION_SEAL' AND "signingOrganizationId" IS NOT NULL AND "intendedSignerUserId" IS NULL)
  );

ALTER TABLE "DocumentSigningApproval"
  ADD CONSTRAINT "DocumentSigningApproval_binding_hash_format"
  CHECK ("bindingHash" ~ '^[a-f0-9]{64}$');
