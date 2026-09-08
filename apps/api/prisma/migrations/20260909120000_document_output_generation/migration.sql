-- Issue #49 template-driven document and business-output generation.
--
-- Additive only. No merged migration is edited, renamed, reordered, or squashed.
-- Statements produced by `prisma migrate diff` that belong to pre-existing drift from
-- other merged features (a stale RecruitmentMission index, several `id DROP DEFAULT`
-- alterations, Interview column defaults, and PublicCandidateApplication constraint
-- renames) are deliberately excluded so this migration touches only generation objects.

-- CreateEnum
CREATE TYPE "GeneratedDocumentSource" AS ENUM ('commercial_quotation', 'purchase_order', 'commercial_contract', 'invoice', 'training_enrollment');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'training_certificate';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "commercialContractId" UUID,
ADD COLUMN     "commercialQuotationId" UUID,
ADD COLUMN     "generatedDocumentKey" TEXT,
ADD COLUMN     "generatedLanguage" TEXT,
ADD COLUMN     "generatedSourceType" "GeneratedDocumentSource",
ADD COLUMN     "invoiceId" UUID,
ADD COLUMN     "purchaseOrderId" UUID;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "generationIdempotencyKey" TEXT,
ADD COLUMN     "generationLanguage" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Document_generatedDocumentKey_key" ON "Document"("generatedDocumentKey");

-- CreateIndex
CREATE INDEX "Document_trainingEnrollmentId_idx" ON "Document"("trainingEnrollmentId");

-- CreateIndex
CREATE INDEX "Document_commercialQuotationId_idx" ON "Document"("commercialQuotationId");

-- CreateIndex
CREATE INDEX "Document_commercialContractId_idx" ON "Document"("commercialContractId");

-- CreateIndex
CREATE INDEX "Document_purchaseOrderId_idx" ON "Document"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Document_invoiceId_idx" ON "Document"("invoiceId");

-- CreateIndex
CREATE INDEX "Document_generatedSourceType_idx" ON "Document"("generatedSourceType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_generationIdempotencyKey_key" ON "DocumentVersion"("generationIdempotencyKey");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_commercialQuotationId_fkey" FOREIGN KEY ("commercialQuotationId") REFERENCES "CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_commercialContractId_fkey" FOREIGN KEY ("commercialContractId") REFERENCES "CommercialContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateConstraint
-- A generated document names exactly one authoritative source relation and leaves every
-- other source relation null, so provenance can never become ambiguous. Written with
-- CASE and IS NULL / IS NOT NULL because PostgreSQL accepts a NULL check result.
ALTER TABLE "Document"
ADD CONSTRAINT "Document_generated_source_consistent" CHECK (
  CASE "generatedSourceType"
    WHEN 'commercial_quotation' THEN
      "commercialQuotationId" IS NOT NULL
      AND "commercialContractId" IS NULL
      AND "purchaseOrderId" IS NULL
      AND "invoiceId" IS NULL
      AND "trainingEnrollmentId" IS NULL
    WHEN 'purchase_order' THEN
      "purchaseOrderId" IS NOT NULL
      AND "commercialQuotationId" IS NULL
      AND "commercialContractId" IS NULL
      AND "invoiceId" IS NULL
      AND "trainingEnrollmentId" IS NULL
    WHEN 'commercial_contract' THEN
      "commercialContractId" IS NOT NULL
      AND "commercialQuotationId" IS NULL
      AND "purchaseOrderId" IS NULL
      AND "invoiceId" IS NULL
      AND "trainingEnrollmentId" IS NULL
    WHEN 'invoice' THEN
      "invoiceId" IS NOT NULL
      AND "commercialQuotationId" IS NULL
      AND "commercialContractId" IS NULL
      AND "purchaseOrderId" IS NULL
      AND "trainingEnrollmentId" IS NULL
    WHEN 'training_enrollment' THEN
      "trainingEnrollmentId" IS NOT NULL
      AND "commercialQuotationId" IS NULL
      AND "commercialContractId" IS NULL
      AND "purchaseOrderId" IS NULL
      AND "invoiceId" IS NULL
    ELSE
      "commercialQuotationId" IS NULL
      AND "commercialContractId" IS NULL
      AND "purchaseOrderId" IS NULL
      AND "invoiceId" IS NULL
  END
);

-- CreateConstraint
-- The generated taxonomy must match its source family, so a quotation can never be
-- published under the invoice taxonomy and the two contract types never collapse.
-- Compared through the text representation: PostgreSQL refuses to use an enum value
-- added by `ALTER TYPE ... ADD VALUE` inside the same transaction, and this migration
-- adds `training_certificate` above.
ALTER TABLE "Document"
ADD CONSTRAINT "Document_generated_taxonomy_consistent" CHECK (
  CASE "generatedSourceType"
    WHEN 'commercial_quotation' THEN "documentType"::text = 'quotation'
    WHEN 'purchase_order' THEN "documentType"::text = 'purchase_order'
    WHEN 'commercial_contract' THEN "documentType"::text IN ('contrat_recrutement', 'contrat_formation')
    WHEN 'invoice' THEN "documentType"::text = 'invoice'
    WHEN 'training_enrollment' THEN "documentType"::text = 'training_certificate'
    ELSE TRUE
  END
);

-- CreateConstraint
-- Generated logical identity is complete or entirely absent. The unique
-- `generatedDocumentKey` is what makes concurrent first generations converge on one
-- logical document instead of racing into duplicates.
ALTER TABLE "Document"
ADD CONSTRAINT "Document_generated_identity_consistent" CHECK (
  CASE
    WHEN "generatedSourceType" IS NOT NULL THEN
      "generated" = TRUE
      AND "generatedDocumentKey" IS NOT NULL
      AND "generatedLanguage" IS NOT NULL
      AND "outputFamily" IS NOT NULL
    ELSE
      "generatedDocumentKey" IS NULL
      AND "generatedLanguage" IS NULL
  END
);

-- CreateConstraint
-- A generated version always carries bounded provenance and an integrity checksum; an
-- uploaded or imported version never carries generation provenance.
ALTER TABLE "DocumentVersion"
ADD CONSTRAINT "DocumentVersion_generation_provenance_consistent" CHECK (
  CASE
    WHEN "source" = 'generated' THEN
      "templateId" IS NOT NULL
      AND "templateVersion" IS NOT NULL
      AND "generationLanguage" IS NOT NULL
      AND "outputFamily" IS NOT NULL
      AND "checksumSha256" IS NOT NULL
    ELSE
      "templateId" IS NULL
      AND "templateVersion" IS NULL
      AND "generationLanguage" IS NULL
      AND "generationIdempotencyKey" IS NULL
  END
);
