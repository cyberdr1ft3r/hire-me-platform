-- Issue #244: additive company billing configuration and immutable invoice metadata.
CREATE TYPE "InvoiceBuyerType" AS ENUM ('company', 'individual');

ALTER TABLE "Invoice"
  ADD COLUMN "sellerPatente" TEXT,
  ADD COLUMN "sellerPhone" TEXT,
  ADD COLUMN "buyerType" "InvoiceBuyerType",
  ADD COLUMN "totalAmountInWordsFr" TEXT,
  ADD COLUMN "businessSnapshotVersion" INTEGER;

CREATE TABLE "CompanyBillingSettings" (
  "id" TEXT NOT NULL,
  "sellerLegalName" TEXT,
  "sellerLegalForm" TEXT,
  "sellerCapital" TEXT,
  "sellerAddress" TEXT,
  "sellerIce" TEXT,
  "sellerTaxId" TEXT,
  "sellerRegistrationNumber" TEXT,
  "sellerPatente" TEXT,
  "sellerPhone" TEXT,
  "sellerEmail" TEXT,
  "sellerWebsite" TEXT,
  "paymentTerms" TEXT,
  "paymentMethod" TEXT,
  "bankDetails" TEXT,
  "invoicePrefix" TEXT,
  "invoiceDigits" INTEGER,
  "invoiceNumberingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyBillingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceNumberSequence" (
  "id" UUID NOT NULL,
  "prefix" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "digits" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  "externalHighestNumber" INTEGER NOT NULL,
  "confirmedByUserId" UUID,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceNumberSequence_prefix_year_key"
  ON "InvoiceNumberSequence"("prefix", "year");
CREATE INDEX "InvoiceNumberSequence_year_idx" ON "InvoiceNumberSequence"("year");

ALTER TABLE "CompanyBillingSettings"
  ADD CONSTRAINT "CompanyBillingSettings_singleton_chk" CHECK ("id" = 'primary'),
  ADD CONSTRAINT "CompanyBillingSettings_numbering_chk" CHECK (
    NOT "invoiceNumberingEnabled"
    OR (
      "invoicePrefix" ~ '^[A-Z][A-Z0-9]{1,9}$'
      AND "invoiceDigits" BETWEEN 3 AND 8
    )
  );

ALTER TABLE "InvoiceNumberSequence"
  ADD CONSTRAINT "InvoiceNumberSequence_shape_chk" CHECK (
    "prefix" ~ '^[A-Z][A-Z0-9]{1,9}$'
    AND "year" BETWEEN 2000 AND 2200
    AND "digits" BETWEEN 3 AND 8
    AND "lastNumber" >= "externalHighestNumber"
    AND "externalHighestNumber" >= 0
    AND "lastNumber" < power(10, "digits")
  );

-- Materialize the empty singleton so settings updates, baseline confirmation,
-- and invoice issuance can always serialize on the same row. All business
-- values remain NULL and must still be entered and verified by an authorized user.
INSERT INTO "CompanyBillingSettings" ("id", "updatedAt")
VALUES ('primary', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Production does not rely on a seed run. Add the permission catalog entries and
-- grant them only to existing administrative/finance roles; absent roles are a no-op.
INSERT INTO "Permission" ("id", "code", "description", "scopeType", "updatedAt")
VALUES
  (gen_random_uuid(), 'billing_settings:view', 'View reusable company billing and invoice numbering settings.', 'global', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'billing_settings:manage', 'Manage audited company billing settings and invoice numbering baselines.', 'global', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "updatedAt")
SELECT gen_random_uuid(), role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "Role" AS role_row
CROSS JOIN "Permission" AS permission_row
WHERE role_row."name" IN ('super_admin', 'admin', 'finance_manager')
  AND permission_row."code" IN ('billing_settings:view', 'billing_settings:manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
