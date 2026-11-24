-- CreateEnum
CREATE TYPE "ClientPortalDemandStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ClientPortalTokenPurpose" AS ENUM ('INVITE', 'RESET');

-- CreateTable
CREATE TABLE "ClientPortalMember" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalSession" (
    "tokenHash" TEXT NOT NULL,
    "memberId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "ClientPortalToken" (
    "tokenHash" TEXT NOT NULL,
    "memberId" UUID NOT NULL,
    "purpose" "ClientPortalTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "ClientPortalDemand" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "numberOfPositions" INTEGER NOT NULL,
    "status" "ClientPortalDemandStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedSnapshot" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "missionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalDemandEvent" (
    "id" UUID NOT NULL,
    "demandId" UUID NOT NULL,
    "status" "ClientPortalDemandStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalDemandEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalPublication" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "demandId" UUID,
    "missionCandidateId" UUID,
    "candidateId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "summaryDocument" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ClientPortalPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalMember_contactId_key" ON "ClientPortalMember"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalMember_email_key" ON "ClientPortalMember"("email");

-- CreateIndex
CREATE INDEX "ClientPortalMember_clientId_idx" ON "ClientPortalMember"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalMember_contactId_clientId_key" ON "ClientPortalMember"("contactId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalMember_id_clientId_key" ON "ClientPortalMember"("id", "clientId");

-- CreateIndex
CREATE INDEX "ClientPortalSession_memberId_idx" ON "ClientPortalSession"("memberId");

-- CreateIndex
CREATE INDEX "ClientPortalToken_memberId_purpose_idx" ON "ClientPortalToken"("memberId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalDemand_missionId_key" ON "ClientPortalDemand"("missionId");

-- CreateIndex
CREATE INDEX "ClientPortalDemand_clientId_updatedAt_id_idx" ON "ClientPortalDemand"("clientId", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalDemand_id_clientId_key" ON "ClientPortalDemand"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalDemand_missionId_clientId_key" ON "ClientPortalDemand"("missionId", "clientId");

-- CreateIndex
CREATE INDEX "ClientPortalDemandEvent_demandId_createdAt_idx" ON "ClientPortalDemandEvent"("demandId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientPortalPublication_clientId_demandId_publishedAt_idx" ON "ClientPortalPublication"("clientId", "demandId", "publishedAt");

-- CreateIndex
CREATE INDEX "ClientPortalPublication_missionCandidateId_idx" ON "ClientPortalPublication"("missionCandidateId");

-- CreateIndex
CREATE INDEX "ClientPortalPublication_candidateId_idx" ON "ClientPortalPublication"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContact_id_clientId_key" ON "ClientContact"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentMission_id_clientId_key" ON "RecruitmentMission"("id", "clientId");

-- AddForeignKey
ALTER TABLE "ClientPortalMember" ADD CONSTRAINT "ClientPortalMember_contactId_clientId_fkey" FOREIGN KEY ("contactId", "clientId") REFERENCES "ClientContact"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalSession" ADD CONSTRAINT "ClientPortalSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ClientPortalMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalToken" ADD CONSTRAINT "ClientPortalToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ClientPortalMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalDemand" ADD CONSTRAINT "ClientPortalDemand_creatorId_clientId_fkey" FOREIGN KEY ("creatorId", "clientId") REFERENCES "ClientPortalMember"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalDemand" ADD CONSTRAINT "ClientPortalDemand_missionId_clientId_fkey" FOREIGN KEY ("missionId", "clientId") REFERENCES "RecruitmentMission"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalDemandEvent" ADD CONSTRAINT "ClientPortalDemandEvent_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "ClientPortalDemand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalPublication" ADD CONSTRAINT "ClientPortalPublication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalPublication" ADD CONSTRAINT "ClientPortalPublication_demandId_clientId_fkey" FOREIGN KEY ("demandId", "clientId") REFERENCES "ClientPortalDemand"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalPublication" ADD CONSTRAINT "ClientPortalPublication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalPublication" ADD CONSTRAINT "ClientPortalPublication_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientPortalDemand" ADD CONSTRAINT "ClientPortalDemand_valid_state"
  CHECK ("numberOfPositions" BETWEEN 1 AND 100 AND "revision" > 0
    AND (("status" = 'DRAFT') = ("submittedSnapshot" IS NULL))
    AND (("status" = 'CONVERTED') = ("missionId" IS NOT NULL)));

ALTER TABLE "ClientPortalDemandEvent" ADD CONSTRAINT "ClientPortalDemandEvent_valid_reason"
  CHECK (CASE
    WHEN "status" = 'CHANGES_REQUESTED' THEN "reason" IS NOT NULL AND "reason" = 'MORE_DETAILS'
    WHEN "status" = 'REJECTED' THEN "reason" IS NOT NULL AND "reason" IN ('OUTSIDE_SCOPE', 'CAPACITY')
    ELSE "reason" IS NULL END);

ALTER TABLE "ClientPortalPublication" ADD CONSTRAINT "ClientPortalPublication_shortlist_pair"
  CHECK (("demandId" IS NULL) = ("missionCandidateId" IS NULL));

-- Withdrawing or replacing consent permanently invalidates the old approval.
CREATE FUNCTION revoke_client_portal_publications_on_candidate_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH revoked AS (
    UPDATE "ClientPortalPublication"
    SET "revokedAt" = CURRENT_TIMESTAMP
    WHERE "candidateId" = NEW."id" AND "revokedAt" IS NULL
    RETURNING id
  )
  INSERT INTO "AuditLog" (id, action, "entityType", "entityId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), 'client_portal.publication.consent_invalidated', 'ClientPortal', id,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM revoked;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClientPortalPublication_revoke_on_candidate_change"
  AFTER UPDATE OF "consentStatus", "consentRecordedAt", "archivedAt", "status" ON "Candidate"
  FOR EACH ROW
  WHEN (OLD."consentStatus" = 'granted' AND (
    NEW."consentStatus" IS DISTINCT FROM OLD."consentStatus"
    OR NEW."consentRecordedAt" IS DISTINCT FROM OLD."consentRecordedAt"
    OR NEW."archivedAt" IS NOT NULL
    OR NEW."status" NOT IN ('active', 'talent_pool')
  ))
  EXECUTE FUNCTION revoke_client_portal_publications_on_candidate_change();
