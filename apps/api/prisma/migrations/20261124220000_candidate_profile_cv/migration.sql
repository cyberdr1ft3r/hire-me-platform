-- AlterTable
ALTER TABLE "PublicCandidateApplication" ADD COLUMN     "selectedPortalCvVersionId" UUID;

-- AlterTable
ALTER TABLE "CandidateIdentity" ADD COLUMN     "intakeCandidateId" UUID;

-- CreateTable
CREATE TABLE "CandidatePortalProfile" (
    "identityId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidatePortalProfile_pkey" PRIMARY KEY ("identityId")
);

-- CreateTable
CREATE TABLE "CandidatePortalCv" (
    "id" UUID NOT NULL,
    "identityId" UUID NOT NULL,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidatePortalCv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidatePortalCvVersion" (
    "id" UUID NOT NULL,
    "cvId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidatePortalCvVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidatePortalCv_identityId_removedAt_createdAt_idx" ON "CandidatePortalCv"("identityId", "removedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidatePortalCvVersion_storageKey_key" ON "CandidatePortalCvVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "CandidatePortalCvVersion_cvId_version_key" ON "CandidatePortalCvVersion"("cvId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentity_intakeCandidateId_key" ON "CandidateIdentity"("intakeCandidateId");

-- AddForeignKey
ALTER TABLE "PublicCandidateApplication" ADD CONSTRAINT "PublicCandidateApplication_selectedPortalCvVersionId_fkey" FOREIGN KEY ("selectedPortalCvVersionId") REFERENCES "CandidatePortalCvVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateIdentity" ADD CONSTRAINT "CandidateIdentity_intakeCandidateId_fkey" FOREIGN KEY ("intakeCandidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePortalProfile" ADD CONSTRAINT "CandidatePortalProfile_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CandidateIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePortalCv" ADD CONSTRAINT "CandidatePortalCv_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CandidateIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePortalCvVersion" ADD CONSTRAINT "CandidatePortalCvVersion_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "CandidatePortalCv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CandidatePortalCv_one_preferred_per_identity"
  ON "CandidatePortalCv"("identityId") WHERE "preferred" AND "removedAt" IS NULL;

ALTER TABLE "CandidatePortalCvVersion" ADD CONSTRAINT "CandidatePortalCvVersion_positive_file"
  CHECK ("version" > 0 AND "sizeBytes" > 0);

ALTER TABLE "PublicCandidateApplication" ADD CONSTRAINT "PublicCandidateApplication_owned_portal_cv"
  CHECK ("selectedPortalCvVersionId" IS NULL OR "ownerIdentityId" IS NOT NULL);
