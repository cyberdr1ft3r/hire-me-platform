-- Invoice business fields are nullable for compatibility with historical issued
-- invoices. The API requires and snapshots them atomically for every new issue.
ALTER TABLE "Invoice"
  ADD COLUMN "sellerLegalName" TEXT,
  ADD COLUMN "sellerAddress" TEXT,
  ADD COLUMN "sellerIce" TEXT,
  ADD COLUMN "sellerTaxId" TEXT,
  ADD COLUMN "sellerRegistrationNumber" TEXT,
  ADD COLUMN "buyerLegalName" TEXT,
  ADD COLUMN "buyerAddress" TEXT,
  ADD COLUMN "buyerIce" TEXT,
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "bankDetails" TEXT,
  ADD COLUMN "taxTreatment" TEXT;
