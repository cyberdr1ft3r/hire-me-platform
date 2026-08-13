-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'sent', 'negotiating', 'accepted', 'rejected', 'expired', 'withdrawn', 'archived');

-- CreateEnum
CREATE TYPE "OfferEventAction" AS ENUM ('created', 'revised', 'marked_sent', 'response_recorded', 'withdrawn', 'expired', 'archived');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('confirmed', 'corrected');

-- CreateEnum
CREATE TYPE "PlacementEventAction" AS ENUM ('confirmed', 'corrected', 'commercial_eligibility_created', 'commercial_eligibility_removed');

-- CreateEnum
CREATE TYPE "PlacementCorrectionReason" AS ENUM ('probation_failed', 'administrative_error', 'canceled_integration', 'other');

-- CreateTable
CREATE TABLE "RecruitmentOffer" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "missionCandidateId" UUID NOT NULL,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentOfferVersion" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "missionCandidateId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "offeredSalaryAmountCents" INTEGER,
    "offeredSalaryCurrency" TEXT,
    "contractType" TEXT,
    "proposedStartDate" TIMESTAMP(3),
    "probationPeriod" TEXT,
    "bonuses" TEXT,
    "benefits" TEXT,
    "allowances" TEXT,
    "compensationNotes" TEXT,
    "clientFacingRemarks" TEXT,
    "internalRecruiterRemarks" TEXT,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "sentByUserId" UUID,
    "sentAt" TIMESTAMP(3),
    "responseRecordedByUserId" UUID,
    "responseRecordedAt" TIMESTAMP(3),
    "responseReason" TEXT,
    "withdrawnByUserId" UUID,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentOfferVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "offerVersionId" UUID,
    "actorUserId" UUID,
    "action" "OfferEventAction" NOT NULL,
    "previousStatus" "OfferStatus",
    "nextStatus" "OfferStatus",
    "previousVersionId" UUID,
    "nextVersionId" UUID,
    "reason" TEXT,
    "safeComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionPlacement" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "missionCandidateId" UUID NOT NULL,
    "offerVersionId" UUID NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'confirmed',
    "integrationStartDate" TIMESTAMP(3) NOT NULL,
    "confirmedByUserId" UUID,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationalNote" TEXT,
    "eligibleForInvoicing" BOOLEAN NOT NULL DEFAULT false,
    "invoicingEligibleAt" TIMESTAMP(3),
    "commercialEligibilityByUserId" UUID,
    "correctedAt" TIMESTAMP(3),
    "correctedByUserId" UUID,
    "correctionReason" "PlacementCorrectionReason",
    "correctionComment" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacementEvent" (
    "id" UUID NOT NULL,
    "placementId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "PlacementEventAction" NOT NULL,
    "previousStatus" "PlacementStatus",
    "nextStatus" "PlacementStatus",
    "reason" TEXT,
    "safeComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentOffer_missionId_idx" ON "RecruitmentOffer"("missionId");

-- CreateIndex
CREATE INDEX "RecruitmentOffer_createdByUserId_idx" ON "RecruitmentOffer"("createdByUserId");

-- CreateIndex
CREATE INDEX "RecruitmentOffer_updatedByUserId_idx" ON "RecruitmentOffer"("updatedByUserId");

-- CreateIndex
CREATE INDEX "RecruitmentOffer_archivedAt_idx" ON "RecruitmentOffer"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentOffer_missionCandidateId_key" ON "RecruitmentOffer"("missionCandidateId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_offerId_idx" ON "RecruitmentOfferVersion"("offerId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_missionId_idx" ON "RecruitmentOfferVersion"("missionId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_missionCandidateId_idx" ON "RecruitmentOfferVersion"("missionCandidateId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_status_idx" ON "RecruitmentOfferVersion"("status");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_isCurrent_idx" ON "RecruitmentOfferVersion"("isCurrent");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_createdByUserId_idx" ON "RecruitmentOfferVersion"("createdByUserId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_sentByUserId_idx" ON "RecruitmentOfferVersion"("sentByUserId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_responseRecordedByUserId_idx" ON "RecruitmentOfferVersion"("responseRecordedByUserId");

-- CreateIndex
CREATE INDEX "RecruitmentOfferVersion_archivedAt_idx" ON "RecruitmentOfferVersion"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentOfferVersion_offerId_versionNumber_key" ON "RecruitmentOfferVersion"("offerId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentOfferVersion_one_current_active_key" ON "RecruitmentOfferVersion"("offerId") WHERE "isCurrent" = true AND "archivedAt" IS NULL AND "status" IN ('draft', 'sent', 'negotiating', 'accepted');

-- CreateIndex
CREATE INDEX "OfferEvent_offerId_idx" ON "OfferEvent"("offerId");

-- CreateIndex
CREATE INDEX "OfferEvent_offerVersionId_idx" ON "OfferEvent"("offerVersionId");

-- CreateIndex
CREATE INDEX "OfferEvent_actorUserId_idx" ON "OfferEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "OfferEvent_action_idx" ON "OfferEvent"("action");

-- CreateIndex
CREATE INDEX "OfferEvent_createdAt_idx" ON "OfferEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissionPlacement_missionCandidateId_key" ON "MissionPlacement"("missionCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionPlacement_offerVersionId_key" ON "MissionPlacement"("offerVersionId");

-- CreateIndex
CREATE INDEX "MissionPlacement_missionId_idx" ON "MissionPlacement"("missionId");

-- CreateIndex
CREATE INDEX "MissionPlacement_status_idx" ON "MissionPlacement"("status");

-- CreateIndex
CREATE INDEX "MissionPlacement_confirmedByUserId_idx" ON "MissionPlacement"("confirmedByUserId");

-- CreateIndex
CREATE INDEX "MissionPlacement_correctedByUserId_idx" ON "MissionPlacement"("correctedByUserId");

-- CreateIndex
CREATE INDEX "MissionPlacement_eligibleForInvoicing_idx" ON "MissionPlacement"("eligibleForInvoicing");

-- CreateIndex
CREATE INDEX "MissionPlacement_archivedAt_idx" ON "MissionPlacement"("archivedAt");

-- CreateIndex
CREATE INDEX "PlacementEvent_placementId_idx" ON "PlacementEvent"("placementId");

-- CreateIndex
CREATE INDEX "PlacementEvent_actorUserId_idx" ON "PlacementEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "PlacementEvent_action_idx" ON "PlacementEvent"("action");

-- CreateIndex
CREATE INDEX "PlacementEvent_createdAt_idx" ON "PlacementEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RecruitmentOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_responseRecordedByUserId_fkey" FOREIGN KEY ("responseRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentOfferVersion" ADD CONSTRAINT "RecruitmentOfferVersion_withdrawnByUserId_fkey" FOREIGN KEY ("withdrawnByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RecruitmentOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_offerVersionId_fkey" FOREIGN KEY ("offerVersionId") REFERENCES "RecruitmentOfferVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionPlacement" ADD CONSTRAINT "MissionPlacement_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionPlacement" ADD CONSTRAINT "MissionPlacement_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionPlacement" ADD CONSTRAINT "MissionPlacement_offerVersionId_fkey" FOREIGN KEY ("offerVersionId") REFERENCES "RecruitmentOfferVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionPlacement" ADD CONSTRAINT "MissionPlacement_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionPlacement" ADD CONSTRAINT "MissionPlacement_correctedByUserId_fkey" FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementEvent" ADD CONSTRAINT "PlacementEvent_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "MissionPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementEvent" ADD CONSTRAINT "PlacementEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
