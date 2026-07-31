-- Issue #27: public opportunities and unauthenticated candidate application submissions.

CREATE TYPE "PublicOpportunityStatus" AS ENUM ('draft', 'open', 'paused', 'closed', 'archived');
CREATE TYPE "PublicApplicationStatus" AS ENUM ('submitted', 'archived');
CREATE TYPE "PublicApplicationFileCategory" AS ENUM ('cv', 'certification', 'diploma', 'additional');

CREATE TABLE "PublicOpportunity" (
  "id" UUID NOT NULL,
  "missionId" UUID NOT NULL,
  "status" "PublicOpportunityStatus" NOT NULL DEFAULT 'draft',
  "applicationLinkEnabled" BOOLEAN NOT NULL DEFAULT false,
  "listedOnWebsite" BOOLEAN NOT NULL DEFAULT false,
  "publicSlug" TEXT NOT NULL,
  "publicationStartsAt" TIMESTAMP(3),
  "applicationDeadline" TIMESTAMP(3),
  "publicTitle" TEXT NOT NULL,
  "publicSummary" TEXT,
  "publicDescription" TEXT,
  "publicLocation" TEXT,
  "publicWorkArrangement" TEXT,
  "publicEngagementType" TEXT,
  "publicExperienceLevel" TEXT,
  "publicSkills" TEXT,
  "showClientName" BOOLEAN NOT NULL DEFAULT false,
  "showSalary" BOOLEAN NOT NULL DEFAULT false,
  "cvRequired" BOOLEAN NOT NULL DEFAULT true,
  "certificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "certificationsRequired" BOOLEAN NOT NULL DEFAULT false,
  "diplomasEnabled" BOOLEAN NOT NULL DEFAULT true,
  "diplomasRequired" BOOLEAN NOT NULL DEFAULT false,
  "additionalAttachmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "consentTextVersion" TEXT NOT NULL DEFAULT 'public-application-consent-v1',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicCandidateApplication" (
  "id" UUID NOT NULL,
  "publicOpportunityId" UUID NOT NULL,
  "missionId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "missionCandidateId" UUID NOT NULL,
  "status" "PublicApplicationStatus" NOT NULL DEFAULT 'submitted',
  "submittedFullName" TEXT NOT NULL,
  "submittedEmail" TEXT NOT NULL,
  "submittedNormalizedEmail" TEXT NOT NULL,
  "submittedPhone" TEXT,
  "submittedNormalizedPhone" TEXT,
  "submittedCity" TEXT,
  "submittedCountry" TEXT,
  "submittedCurrentPosition" TEXT,
  "submittedExperienceYears" INTEGER,
  "submittedSkills" TEXT,
  "submittedLanguages" TEXT,
  "submittedAvailability" TEXT,
  "submittedSalaryExpectationCents" INTEGER,
  "submittedSalaryExpectationCurrency" TEXT,
  "submittedProfessionalLinks" TEXT,
  "submittedMotivation" TEXT,
  "consentGranted" BOOLEAN NOT NULL,
  "consentTextVersion" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceIpHash" TEXT,
  "userAgentHash" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicCandidateApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicCandidateApplicationFile" (
  "id" UUID NOT NULL,
  "publicCandidateApplicationId" UUID NOT NULL,
  "publicOpportunityId" UUID NOT NULL,
  "missionId" UUID NOT NULL,
  "missionCandidateId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "candidateDocumentVersionId" UUID NOT NULL,
  "category" "PublicApplicationFileCategory" NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "sanitizedFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicCandidateApplicationFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicOpportunity_missionId_key" ON "PublicOpportunity"("missionId");
CREATE UNIQUE INDEX "PublicOpportunity_publicSlug_key" ON "PublicOpportunity"("publicSlug");
CREATE INDEX "PublicOpportunity_status_idx" ON "PublicOpportunity"("status");
CREATE INDEX "PublicOpportunity_applicationLinkEnabled_idx" ON "PublicOpportunity"("applicationLinkEnabled");
CREATE INDEX "PublicOpportunity_listedOnWebsite_idx" ON "PublicOpportunity"("listedOnWebsite");
CREATE INDEX "PublicOpportunity_publicationStartsAt_idx" ON "PublicOpportunity"("publicationStartsAt");
CREATE INDEX "PublicOpportunity_applicationDeadline_idx" ON "PublicOpportunity"("applicationDeadline");
CREATE INDEX "PublicOpportunity_archivedAt_idx" ON "PublicOpportunity"("archivedAt");

CREATE UNIQUE INDEX "PublicCandidateApplication_missionCandidateId_key" ON "PublicCandidateApplication"("missionCandidateId");
CREATE UNIQUE INDEX "PublicCandidateApplication_publicOpportunityId_submittedNormalizedEmail_key"
  ON "PublicCandidateApplication"("publicOpportunityId", "submittedNormalizedEmail");
CREATE INDEX "PublicCandidateApplication_missionId_idx" ON "PublicCandidateApplication"("missionId");
CREATE INDEX "PublicCandidateApplication_candidateId_idx" ON "PublicCandidateApplication"("candidateId");
CREATE INDEX "PublicCandidateApplication_status_idx" ON "PublicCandidateApplication"("status");
CREATE INDEX "PublicCandidateApplication_submittedAt_idx" ON "PublicCandidateApplication"("submittedAt");

CREATE UNIQUE INDEX "PublicCandidateApplicationFile_candidateDocumentVersionId_key"
  ON "PublicCandidateApplicationFile"("candidateDocumentVersionId");
CREATE INDEX "PublicCandidateApplicationFile_publicCandidateApplicationId_idx"
  ON "PublicCandidateApplicationFile"("publicCandidateApplicationId");
CREATE INDEX "PublicCandidateApplicationFile_publicOpportunityId_idx"
  ON "PublicCandidateApplicationFile"("publicOpportunityId");
CREATE INDEX "PublicCandidateApplicationFile_missionId_idx" ON "PublicCandidateApplicationFile"("missionId");
CREATE INDEX "PublicCandidateApplicationFile_missionCandidateId_idx"
  ON "PublicCandidateApplicationFile"("missionCandidateId");
CREATE INDEX "PublicCandidateApplicationFile_candidateId_idx" ON "PublicCandidateApplicationFile"("candidateId");
CREATE INDEX "PublicCandidateApplicationFile_category_idx" ON "PublicCandidateApplicationFile"("category");
CREATE INDEX "PublicCandidateApplicationFile_createdAt_idx" ON "PublicCandidateApplicationFile"("createdAt");

ALTER TABLE "PublicOpportunity"
  ADD CONSTRAINT "PublicOpportunity_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublicCandidateApplication"
  ADD CONSTRAINT "PublicCandidateApplication_publicOpportunityId_fkey"
  FOREIGN KEY ("publicOpportunityId") REFERENCES "PublicOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplication_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplication_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplication_missionCandidateId_fkey"
  FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublicCandidateApplicationFile"
  ADD CONSTRAINT "PublicCandidateApplicationFile_publicCandidateApplicationId_fkey"
  FOREIGN KEY ("publicCandidateApplicationId") REFERENCES "PublicCandidateApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplicationFile_publicOpportunityId_fkey"
  FOREIGN KEY ("publicOpportunityId") REFERENCES "PublicOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplicationFile_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplicationFile_missionCandidateId_fkey"
  FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplicationFile_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicCandidateApplicationFile_candidateDocumentVersionId_fkey"
  FOREIGN KEY ("candidateDocumentVersionId") REFERENCES "CandidateDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
