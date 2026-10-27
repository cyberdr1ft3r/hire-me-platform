-- Standalone invoices may keep their billed-client snapshot without creating a CRM client.
ALTER TABLE "Invoice" ALTER COLUMN "clientId" DROP NOT NULL;

-- A standalone invoice must always carry the manual client's name. Existing
-- client-linked historical rows remain valid, including pre-snapshot drafts.
ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_client_or_buyer_name_check"
CHECK (
  "clientId" IS NOT NULL
  OR NULLIF(BTRIM("buyerLegalName"), '') IS NOT NULL
);
