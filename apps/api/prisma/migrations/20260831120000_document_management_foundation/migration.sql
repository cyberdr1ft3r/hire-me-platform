ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'contrat_recrutement';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'contrat_formation';

ALTER TABLE "DocumentVersion"
  ADD COLUMN "originalFilename" TEXT,
  ADD COLUMN "checksumSha256" TEXT;
