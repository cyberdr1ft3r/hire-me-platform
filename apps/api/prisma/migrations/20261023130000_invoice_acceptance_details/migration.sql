-- Optional acceptance details observed in the owner-provided invoice prototype.
-- They remain nullable so no bank, tax, contact, or reference value is invented.
ALTER TABLE "Invoice"
  ADD COLUMN "sellerLegalForm" TEXT,
  ADD COLUMN "sellerCapital" TEXT,
  ADD COLUMN "sellerEmail" TEXT,
  ADD COLUMN "sellerWebsite" TEXT,
  ADD COLUMN "buyerTaxId" TEXT,
  ADD COLUMN "buyerBillingContact" TEXT,
  ADD COLUMN "customerReference" TEXT,
  ADD COLUMN "paymentMethod" TEXT;
