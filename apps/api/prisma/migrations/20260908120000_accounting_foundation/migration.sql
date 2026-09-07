-- Issue #39 accounting foundation.
--
-- Additive only. Adds payment records, payment-to-invoice allocations, and
-- operational expenses on top of the merged Issue #38 commercial records. No merged
-- migration is edited, renamed, reordered, or squashed, and no table owned by another
-- feature is altered here.
--
-- Invoice settlement is deliberately NOT stored. It is derived from the immutable
-- issued invoice total plus active allocations, so a payment can never mark an
-- invoice paid merely by existing.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'check', 'cash', 'card', 'direct_debit', 'other');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('recorded', 'corrected', 'archived');

-- CreateEnum
CREATE TYPE "PaymentAllocationStatus" AS ENUM ('active', 'reversed');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('recruitment_sourcing', 'training_delivery', 'travel', 'subcontracting', 'software', 'marketing', 'office', 'other');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('recorded', 'corrected', 'archived');

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "externalReference" TEXT,
    "note" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'recorded',
    "correctedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "recordedByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentAllocationStatus" NOT NULL DEFAULT 'active',
    "activeAllocationKey" UUID,
    "idempotencyKey" TEXT,
    "allocatedByUserId" UUID,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" UUID,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "safeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "clientId" UUID,
    "recruitmentMissionId" UUID,
    "missionPlacementId" UUID,
    "trainingProgramId" UUID,
    "vendorLabel" TEXT,
    "description" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'recorded',
    "correctedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEvent" (
    "id" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "safeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_receivedDate_idx" ON "Payment"("receivedDate");

-- CreateIndex
CREATE INDEX "Payment_currency_idx" ON "Payment"("currency");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_status_idx" ON "PaymentAllocation"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_status_idx" ON "PaymentAllocation"("paymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_activeAllocationKey_key" ON "PaymentAllocation"("paymentId", "activeAllocationKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_idempotencyKey_key" ON "PaymentAllocation"("paymentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_actorUserId_idx" ON "PaymentEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "PaymentEvent_createdAt_idx" ON "PaymentEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- CreateIndex
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");

-- CreateIndex
CREATE INDEX "Expense_recruitmentMissionId_idx" ON "Expense"("recruitmentMissionId");

-- CreateIndex
CREATE INDEX "Expense_missionPlacementId_idx" ON "Expense"("missionPlacementId");

-- CreateIndex
CREATE INDEX "Expense_trainingProgramId_idx" ON "Expense"("trainingProgramId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_currency_idx" ON "Expense"("currency");

-- CreateIndex
CREATE INDEX "ExpenseEvent_expenseId_idx" ON "ExpenseEvent"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseEvent_actorUserId_idx" ON "ExpenseEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "ExpenseEvent_createdAt_idx" ON "ExpenseEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_allocatedByUserId_fkey" FOREIGN KEY ("allocatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_missionPlacementId_fkey" FOREIGN KEY ("missionPlacementId") REFERENCES "MissionPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEvent" ADD CONSTRAINT "ExpenseEvent_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEvent" ADD CONSTRAINT "ExpenseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial invariants enforced by the database rather than only by application code.

-- A recorded payment always carries a positive amount.
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountCents" > 0);

-- An allocation always moves a positive amount.
ALTER TABLE "PaymentAllocation"
ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amountCents" > 0);

-- An ACTIVE allocation must carry its invoice id as the active key, so it cannot
-- escape the unique (paymentId, activeAllocationKey) index by holding NULL. A
-- REVERSED allocation must release the key so a corrected re-allocation is possible
-- while the reversed row is preserved as history.
-- Written with CASE and IS NOT NULL so the expression is always TRUE or FALSE.
-- A plain `key = invoiceId` comparison evaluates to NULL when the key is NULL, and
-- PostgreSQL accepts a NULL check result, which would let an ACTIVE row keep a NULL
-- key and escape the unique index entirely.
ALTER TABLE "PaymentAllocation"
ADD CONSTRAINT "PaymentAllocation_active_key_consistent" CHECK (
  CASE
    WHEN "status" = 'active'
      THEN "activeAllocationKey" IS NOT NULL AND "activeAllocationKey" = "invoiceId"
    ELSE "activeAllocationKey" IS NULL
  END
);

-- A recorded expense always carries a positive amount.
ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_amount_positive" CHECK ("amountCents" > 0);
