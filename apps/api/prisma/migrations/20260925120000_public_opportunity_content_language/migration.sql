-- Issue #88 / D-070: staff-declared language of recruiter-authored public opportunity copy.
--
-- Additive only. The column is nullable with no default and no backfill: existing rows
-- stay NULL ("not declared") and no copy is modified. The CHECK keeps any direct database
-- write to the same allow-list the contract enforces; NULL passes under standard SQL
-- CHECK semantics.

-- AlterTable
ALTER TABLE "PublicOpportunity" ADD COLUMN "contentLanguage" TEXT;

-- AddCheckConstraint
ALTER TABLE "PublicOpportunity" ADD CONSTRAINT "PublicOpportunity_contentLanguage_chk"
  CHECK ("contentLanguage" IS NULL OR "contentLanguage" IN ('en', 'fr'));
