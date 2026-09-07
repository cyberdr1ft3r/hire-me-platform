CREATE TYPE "QuotationStatus" AS ENUM ('draft', 'issued', 'accepted', 'rejected', 'expired', 'canceled', 'archived');
CREATE TYPE "CommercialContractBusinessType" AS ENUM ('recruitment', 'training');
CREATE TYPE "CommercialContractStatus" AS ENUM ('draft', 'active', 'completed', 'canceled', 'archived');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'received', 'canceled', 'archived');
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'canceled', 'archived');

CREATE TABLE "CommercialQuotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "recruitmentMissionId" UUID,
    "currency" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'draft',
    "issueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialQuotation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommercialQuotation_amounts_check" CHECK ("subtotalCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0)
);

CREATE TABLE "CommercialQuotationLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotationId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL,
    "lineSubtotalCents" INTEGER NOT NULL,
    "lineTaxCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialQuotationLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommercialQuotationLine_amounts_check" CHECK ("quantity" > 0 AND "unitPriceCents" >= 0 AND "taxRateBps" >= 0 AND "lineSubtotalCents" >= 0 AND "lineTaxCents" >= 0 AND "lineTotalCents" >= 0)
);

CREATE TABLE "CommercialQuotationEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "previousStatus" "QuotationStatus",
    "nextStatus" "QuotationStatus",
    "reason" TEXT,
    "safeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialQuotationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialContract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "businessType" "CommercialContractBusinessType" NOT NULL,
    "clientId" UUID NOT NULL,
    "recruitmentMissionId" UUID,
    "sourceQuotationId" UUID,
    "currency" TEXT NOT NULL,
    "contractValueCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "termsSummary" TEXT,
    "status" "CommercialContractStatus" NOT NULL DEFAULT 'draft',
    "effectiveDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialContract_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommercialContract_amounts_check" CHECK ("contractValueCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0)
);

CREATE TABLE "CommercialContractEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "previousStatus" "CommercialContractStatus",
    "nextStatus" "CommercialContractStatus",
    "reason" TEXT,
    "safeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialContractEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "recruitmentMissionId" UUID,
    "quotationId" UUID,
    "contractId" UUID,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "issueDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrder_amounts_check" CHECK ("amountCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0)
);

CREATE TABLE "PurchaseOrderEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseOrderId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "previousStatus" "PurchaseOrderStatus",
    "nextStatus" "PurchaseOrderStatus",
    "reason" TEXT,
    "safeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "recruitmentMissionId" UUID,
    "missionPlacementId" UUID,
    "quotationId" UUID,
    "contractId" UUID,
    "purchaseOrderId" UUID,
    "currency" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "canceledByUserId" UUID,
    "cancellationReason" TEXT,
    "correctionOfInvoiceId" UUID,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invoice_amounts_check" CHECK ("subtotalCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0)
);

CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL,
    "lineSubtotalCents" INTEGER NOT NULL,
    "lineTaxCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceLine_amounts_check" CHECK ("quantity" > 0 AND "unitPriceCents" >= 0 AND "taxRateBps" >= 0 AND "lineSubtotalCents" >= 0 AND "lineTaxCents" >= 0 AND "lineTotalCents" >= 0)
);

CREATE TABLE "InvoiceEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "previousStatus" "InvoiceStatus",
    "nextStatus" "InvoiceStatus",
    "reason" TEXT,
    "safeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialQuotation_reference_key" ON "CommercialQuotation"("reference");
CREATE INDEX "CommercialQuotation_clientId_idx" ON "CommercialQuotation"("clientId");
CREATE INDEX "CommercialQuotation_recruitmentMissionId_idx" ON "CommercialQuotation"("recruitmentMissionId");
CREATE INDEX "CommercialQuotation_status_idx" ON "CommercialQuotation"("status");
CREATE INDEX "CommercialQuotation_issueDate_idx" ON "CommercialQuotation"("issueDate");
CREATE INDEX "CommercialQuotation_validUntil_idx" ON "CommercialQuotation"("validUntil");
CREATE INDEX "CommercialQuotation_archivedAt_idx" ON "CommercialQuotation"("archivedAt");
CREATE UNIQUE INDEX "CommercialQuotationLine_quotationId_sortOrder_key" ON "CommercialQuotationLine"("quotationId", "sortOrder");
CREATE INDEX "CommercialQuotationLine_quotationId_idx" ON "CommercialQuotationLine"("quotationId");
CREATE INDEX "CommercialQuotationEvent_quotationId_idx" ON "CommercialQuotationEvent"("quotationId");
CREATE INDEX "CommercialQuotationEvent_actorUserId_idx" ON "CommercialQuotationEvent"("actorUserId");
CREATE INDEX "CommercialQuotationEvent_action_idx" ON "CommercialQuotationEvent"("action");
CREATE INDEX "CommercialQuotationEvent_createdAt_idx" ON "CommercialQuotationEvent"("createdAt");

CREATE UNIQUE INDEX "CommercialContract_reference_key" ON "CommercialContract"("reference");
CREATE INDEX "CommercialContract_clientId_idx" ON "CommercialContract"("clientId");
CREATE INDEX "CommercialContract_recruitmentMissionId_idx" ON "CommercialContract"("recruitmentMissionId");
CREATE INDEX "CommercialContract_sourceQuotationId_idx" ON "CommercialContract"("sourceQuotationId");
CREATE INDEX "CommercialContract_businessType_idx" ON "CommercialContract"("businessType");
CREATE INDEX "CommercialContract_status_idx" ON "CommercialContract"("status");
CREATE INDEX "CommercialContract_archivedAt_idx" ON "CommercialContract"("archivedAt");
CREATE INDEX "CommercialContractEvent_contractId_idx" ON "CommercialContractEvent"("contractId");
CREATE INDEX "CommercialContractEvent_actorUserId_idx" ON "CommercialContractEvent"("actorUserId");
CREATE INDEX "CommercialContractEvent_action_idx" ON "CommercialContractEvent"("action");
CREATE INDEX "CommercialContractEvent_createdAt_idx" ON "CommercialContractEvent"("createdAt");

CREATE UNIQUE INDEX "PurchaseOrder_reference_key" ON "PurchaseOrder"("reference");
CREATE INDEX "PurchaseOrder_clientId_idx" ON "PurchaseOrder"("clientId");
CREATE INDEX "PurchaseOrder_recruitmentMissionId_idx" ON "PurchaseOrder"("recruitmentMissionId");
CREATE INDEX "PurchaseOrder_quotationId_idx" ON "PurchaseOrder"("quotationId");
CREATE INDEX "PurchaseOrder_contractId_idx" ON "PurchaseOrder"("contractId");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrder_archivedAt_idx" ON "PurchaseOrder"("archivedAt");
CREATE INDEX "PurchaseOrderEvent_purchaseOrderId_idx" ON "PurchaseOrderEvent"("purchaseOrderId");
CREATE INDEX "PurchaseOrderEvent_actorUserId_idx" ON "PurchaseOrderEvent"("actorUserId");
CREATE INDEX "PurchaseOrderEvent_action_idx" ON "PurchaseOrderEvent"("action");
CREATE INDEX "PurchaseOrderEvent_createdAt_idx" ON "PurchaseOrderEvent"("createdAt");

CREATE UNIQUE INDEX "Invoice_reference_key" ON "Invoice"("reference");
CREATE UNIQUE INDEX "Invoice_missionPlacementId_key" ON "Invoice"("missionPlacementId");
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX "Invoice_recruitmentMissionId_idx" ON "Invoice"("recruitmentMissionId");
CREATE INDEX "Invoice_quotationId_idx" ON "Invoice"("quotationId");
CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId");
CREATE INDEX "Invoice_purchaseOrderId_idx" ON "Invoice"("purchaseOrderId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");
CREATE INDEX "Invoice_archivedAt_idx" ON "Invoice"("archivedAt");
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_sortOrder_key" ON "InvoiceLine"("invoiceId", "sortOrder");
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX "InvoiceEvent_invoiceId_idx" ON "InvoiceEvent"("invoiceId");
CREATE INDEX "InvoiceEvent_actorUserId_idx" ON "InvoiceEvent"("actorUserId");
CREATE INDEX "InvoiceEvent_action_idx" ON "InvoiceEvent"("action");
CREATE INDEX "InvoiceEvent_createdAt_idx" ON "InvoiceEvent"("createdAt");

ALTER TABLE "CommercialQuotation" ADD CONSTRAINT "CommercialQuotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialQuotation" ADD CONSTRAINT "CommercialQuotation_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialQuotation" ADD CONSTRAINT "CommercialQuotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialQuotation" ADD CONSTRAINT "CommercialQuotation_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialQuotationLine" ADD CONSTRAINT "CommercialQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialQuotationEvent" ADD CONSTRAINT "CommercialQuotationEvent_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialQuotationEvent" ADD CONSTRAINT "CommercialQuotationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_sourceQuotationId_fkey" FOREIGN KEY ("sourceQuotationId") REFERENCES "CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialContractEvent" ADD CONSTRAINT "CommercialContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CommercialContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialContractEvent" ADD CONSTRAINT "CommercialContractEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CommercialContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_missionPlacementId_fkey" FOREIGN KEY ("missionPlacementId") REFERENCES "MissionPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CommercialContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctionOfInvoiceId_fkey" FOREIGN KEY ("correctionOfInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
