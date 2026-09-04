-- Issue #37: training operations foundation.
-- Additive only. Extends the existing training placeholder tables with the
-- operational fields, integrity constraints, and actor history required by the
-- training programs, sessions, enrollment, and attendance module.

-- CreateEnum
CREATE TYPE "TrainingDeliveryMode" AS ENUM ('onsite', 'remote', 'hybrid');

-- AlterTable: TrainingProgram operational identity, client context, planned window.
ALTER TABLE "TrainingProgram" ADD COLUMN     "reference" TEXT,
ADD COLUMN     "normalizedReference" TEXT,
ADD COLUMN     "clientId" UUID,
ADD COLUMN     "plannedStartDate" TIMESTAMP(3),
ADD COLUMN     "plannedEndDate" TIMESTAMP(3);

-- Backfill deterministic references for any pre-existing placeholder program rows.
UPDATE "TrainingProgram"
SET "reference" = 'TRN-' || upper(left(replace("id"::text, '-', ''), 10))
WHERE "reference" IS NULL;

UPDATE "TrainingProgram"
SET "normalizedReference" = lower("reference")
WHERE "normalizedReference" IS NULL;

ALTER TABLE "TrainingProgram" ALTER COLUMN "reference" SET NOT NULL;
ALTER TABLE "TrainingProgram" ALTER COLUMN "normalizedReference" SET NOT NULL;

-- AlterTable: TrainingSession title, ordering, end time, delivery mode, reschedule and cancellation metadata.
ALTER TABLE "TrainingSession" ADD COLUMN     "title" TEXT,
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "scheduledEndAt" TIMESTAMP(3),
ADD COLUMN     "deliveryMode" "TrainingDeliveryMode" NOT NULL DEFAULT 'onsite',
ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "previousScheduledAt" TIMESTAMP(3),
ADD COLUMN     "lastRescheduledAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "cancellationReason" TEXT;

-- Backfill required session scheduling fields for any pre-existing placeholder session rows.
UPDATE "TrainingSession"
SET "title" = 'Training session'
WHERE "title" IS NULL;

UPDATE "TrainingSession"
SET "scheduledEndAt" = "scheduledAt" + INTERVAL '1 hour'
WHERE "scheduledEndAt" IS NULL;

ALTER TABLE "TrainingSession" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "TrainingSession" ALTER COLUMN "scheduledEndAt" SET NOT NULL;

-- AlterTable: TrainingEnrollment actor history, lifecycle timestamps, active-duplicate guard key.
ALTER TABLE "TrainingEnrollment" ADD COLUMN     "activeParticipantKey" TEXT,
ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "enrolledAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawalReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable: TrainingSessionParticipation attendance actor history and explicit correction metadata.
ALTER TABLE "TrainingSessionParticipation" ADD COLUMN     "recordedByUserId" UUID,
ADD COLUMN     "attendanceRecordedAt" TIMESTAMP(3),
ADD COLUMN     "correctionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCorrectedAt" TIMESTAMP(3),
ADD COLUMN     "lastCorrectionReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgram_normalizedReference_key" ON "TrainingProgram"("normalizedReference");

-- CreateIndex
CREATE INDEX "TrainingProgram_clientId_idx" ON "TrainingProgram"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_trainingProgramId_sequence_key" ON "TrainingSession"("trainingProgramId", "sequence");

-- CreateIndex
-- Active enrollment uniqueness. "activeParticipantKey" is only populated while an
-- enrollment is active, and PostgreSQL treats NULLs as distinct, so withdrawn or
-- otherwise terminal enrollment history is preserved without blocking re-enrollment.
CREATE UNIQUE INDEX "TrainingEnrollment_trainingProgramId_activeParticipantKey_key" ON "TrainingEnrollment"("trainingProgramId", "activeParticipantKey");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_createdByUserId_idx" ON "TrainingEnrollment"("createdByUserId");

-- CreateIndex
CREATE INDEX "TrainingSessionParticipation_recordedByUserId_idx" ON "TrainingSessionParticipation"("recordedByUserId");

-- AddForeignKey
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSessionParticipation" ADD CONSTRAINT "TrainingSessionParticipation_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
