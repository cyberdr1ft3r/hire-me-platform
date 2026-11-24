-- CreateEnum
CREATE TYPE "CandidatePortalEmailPurpose" AS ENUM ('VERIFY', 'RESET');

-- AlterTable
ALTER TABLE "PublicCandidateApplication" ADD COLUMN     "ownerIdentityId" UUID;

-- CreateTable
CREATE TABLE "CandidateIdentity" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "googleSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CandidateIdentity_one_sign_in_method" CHECK ("googleSubject" IS NULL OR "passwordHash" IS NULL)
);

-- CreateTable
CREATE TABLE "CandidatePortalSession" (
    "tokenHash" TEXT NOT NULL,
    "identityId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidatePortalSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "CandidatePortalEmailToken" (
    "tokenHash" TEXT NOT NULL,
    "identityId" UUID NOT NULL,
    "purpose" "CandidatePortalEmailPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidatePortalEmailToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "CandidatePortalGoogleChallenge" (
    "bindingHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidatePortalGoogleChallenge_pkey" PRIMARY KEY ("bindingHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentity_email_key" ON "CandidateIdentity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateIdentity_googleSubject_key" ON "CandidateIdentity"("googleSubject");

-- CreateIndex
CREATE INDEX "CandidatePortalSession_identityId_idx" ON "CandidatePortalSession"("identityId");

-- CreateIndex
CREATE INDEX "CandidatePortalSession_expiresAt_idx" ON "CandidatePortalSession"("expiresAt");

-- CreateIndex
CREATE INDEX "CandidatePortalEmailToken_identityId_purpose_idx" ON "CandidatePortalEmailToken"("identityId", "purpose");

-- CreateIndex
CREATE INDEX "CandidatePortalEmailToken_expiresAt_idx" ON "CandidatePortalEmailToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CandidatePortalGoogleChallenge_expiresAt_idx" ON "CandidatePortalGoogleChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "PublicCandidateApplication_ownerIdentityId_submittedAt_id_idx" ON "PublicCandidateApplication"("ownerIdentityId", "submittedAt", "id");

-- AddForeignKey
ALTER TABLE "PublicCandidateApplication" ADD CONSTRAINT "PublicCandidateApplication_ownerIdentityId_fkey" FOREIGN KEY ("ownerIdentityId") REFERENCES "CandidateIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePortalSession" ADD CONSTRAINT "CandidatePortalSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CandidateIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePortalEmailToken" ADD CONSTRAINT "CandidatePortalEmailToken_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CandidateIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
