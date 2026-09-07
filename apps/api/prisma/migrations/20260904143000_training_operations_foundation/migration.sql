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
ADD COLUMN     "lastRescheduleReason" TEXT,
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

-- Backfill the active-participant key for every pre-existing enrollment that is
-- still active (non-terminal status and not archived). Without this, legacy active
-- rows would keep a NULL key, and because PostgreSQL treats NULLs as distinct they
-- would silently coexist with a new active enrollment for the same participant.
--
-- The key format must match the application exactly: "<PARTICIPANT_TYPE>:<uuid>",
-- using the uppercase participant-type name rather than the mapped column value.
UPDATE "TrainingEnrollment"
SET "activeParticipantKey" =
  CASE "participantType"
    WHEN 'candidate' THEN 'CANDIDATE:' || "candidateId"::text
    WHEN 'user' THEN 'USER:' || "userId"::text
    WHEN 'client_contact' THEN 'CLIENT_CONTACT:' || "clientContactId"::text
    WHEN 'external' THEN 'EXTERNAL:' || "externalTrainingParticipantId"::text
  END
WHERE "activeParticipantKey" IS NULL
  AND "archivedAt" IS NULL
  AND "status" NOT IN ('closed', 'rejected', 'canceled');

-- Fail the migration loudly if any legacy active enrollment does not carry exactly
-- one participant identity matching its declared participant type. Such a row cannot
-- be assigned a correct key, and silently leaving it keyless would defeat the
-- uniqueness invariant.
DO $$
DECLARE
  malformed_count BIGINT;
BEGIN
  SELECT count(*) INTO malformed_count
  FROM "TrainingEnrollment"
  WHERE "archivedAt" IS NULL
    AND "status" NOT IN ('closed', 'rejected', 'canceled')
    AND (
      "activeParticipantKey" IS NULL
      OR (
        ("candidateId" IS NOT NULL)::int
        + ("userId" IS NOT NULL)::int
        + ("clientContactId" IS NOT NULL)::int
        + ("externalTrainingParticipantId" IS NOT NULL)::int
      ) <> 1
    );

  IF malformed_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce active training enrollment uniqueness: % active enrollment row(s) do not have exactly one participant identity matching their participant type. Repair this data before applying migration 20260904143000_training_operations_foundation.',
      malformed_count;
  END IF;
END
$$;

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

-- An active enrollment must always carry its active-participant key, so it can never
-- escape the uniqueness index by holding a NULL key. Terminal and archived history is
-- explicitly allowed to release the key.
ALTER TABLE "TrainingEnrollment"
ADD CONSTRAINT "TrainingEnrollment_active_participant_key_required"
CHECK (
  "archivedAt" IS NOT NULL
  OR "status" IN ('closed', 'rejected', 'canceled')
  OR "activeParticipantKey" IS NOT NULL
);

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
