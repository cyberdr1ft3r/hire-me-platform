-- Issue #21: mission-specific candidate recruitment process foundation.

-- Replace the provisional candidate pipeline enum with the approved Issue #21 standard pipeline.
CREATE TYPE "MissionCandidateState_new" AS ENUM (
  'new',
  'cv_to_review',
  'hr_preselection',
  'hr_interview_scheduled',
  'hr_interview_completed',
  'technical_test',
  'internal_validation',
  'presented_to_client',
  'client_interview_1',
  'client_interview_2',
  'client_offer',
  'accepted',
  'integrated',
  'probation_completed',
  'process_completed',
  'waiting',
  'postponed',
  'candidate_rejected',
  'client_rejected',
  'withdrawn',
  'talent_pool'
);

ALTER TABLE "MissionCandidate" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "MissionCandidate"
  ALTER COLUMN "state" TYPE "MissionCandidateState_new"
  USING (
    CASE "state"::text
      WHEN 'cv_review' THEN 'cv_to_review'
      WHEN 'probation_monitoring' THEN 'integrated'
      WHEN 'end_of_probation' THEN 'probation_completed'
      WHEN 'closed' THEN 'process_completed'
      WHEN 'on_hold' THEN 'waiting'
      WHEN 'candidate_declined' THEN 'candidate_rejected'
      WHEN 'archived' THEN 'talent_pool'
      ELSE "state"::text
    END
  )::"MissionCandidateState_new";
DROP TYPE "MissionCandidateState";
ALTER TYPE "MissionCandidateState_new" RENAME TO "MissionCandidateState";
ALTER TABLE "MissionCandidate" ALTER COLUMN "state" SET DEFAULT 'new';

CREATE TYPE "MissionCandidateEventAction" AS ENUM (
  'created',
  'transitioned',
  'optional_stage_skipped',
  'responsible_recruiter_assigned',
  'responsible_recruiter_transferred',
  'presented_to_client',
  'integration_confirmed',
  'outcome_recorded'
);

ALTER TABLE "MissionCandidate"
  ADD COLUMN "responsibleRecruiterUserId" UUID,
  ADD COLUMN "sourceContext" TEXT,
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "clientVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "presentedByUserId" UUID,
  ADD COLUMN "placementConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "placementConfirmedByUserId" UUID;

ALTER TABLE "MissionCandidate" RENAME COLUMN "rejectionReason" TO "outcomeReason";
ALTER TABLE "MissionCandidate" DROP COLUMN "closureReason";

UPDATE "MissionCandidate" mc
SET "responsibleRecruiterUserId" = (
  SELECT mr."userId"
  FROM "MissionRecruiter" mr
  WHERE mr."missionId" = mc."missionId"
    AND mr."status" = 'active'
    AND mr."archivedAt" IS NULL
    AND mr."role" IN ('lead_recruiter', 'recruiter', 'sourcer')
  ORDER BY mr."isLead" DESC, mr."assignedAt" ASC, mr."id" ASC
  LIMIT 1
)
WHERE mc."responsibleRecruiterUserId" IS NULL;

ALTER TABLE "MissionCandidate" ALTER COLUMN "responsibleRecruiterUserId" SET NOT NULL;

CREATE TABLE "MissionCandidateEvent" (
  "id" UUID NOT NULL,
  "missionCandidateId" UUID NOT NULL,
  "actorUserId" UUID,
  "action" "MissionCandidateEventAction" NOT NULL,
  "previousState" "MissionCandidateState",
  "nextState" "MissionCandidateState",
  "previousRecruiterId" UUID,
  "nextRecruiterId" UUID,
  "reason" TEXT,
  "safeComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionCandidateEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MissionCandidate_responsibleRecruiterUserId_idx" ON "MissionCandidate"("responsibleRecruiterUserId");
CREATE INDEX "MissionCandidate_clientVisible_idx" ON "MissionCandidate"("clientVisible");
CREATE INDEX "MissionCandidate_presentedAt_idx" ON "MissionCandidate"("presentedAt");
CREATE INDEX "MissionCandidateEvent_missionCandidateId_idx" ON "MissionCandidateEvent"("missionCandidateId");
CREATE INDEX "MissionCandidateEvent_actorUserId_idx" ON "MissionCandidateEvent"("actorUserId");
CREATE INDEX "MissionCandidateEvent_action_idx" ON "MissionCandidateEvent"("action");
CREATE INDEX "MissionCandidateEvent_createdAt_idx" ON "MissionCandidateEvent"("createdAt");

ALTER TABLE "MissionCandidate" ADD CONSTRAINT "MissionCandidate_responsibleRecruiterUserId_fkey" FOREIGN KEY ("responsibleRecruiterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionCandidate" ADD CONSTRAINT "MissionCandidate_presentedByUserId_fkey" FOREIGN KEY ("presentedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionCandidate" ADD CONSTRAINT "MissionCandidate_placementConfirmedByUserId_fkey" FOREIGN KEY ("placementConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionCandidateEvent" ADD CONSTRAINT "MissionCandidateEvent_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionCandidateEvent" ADD CONSTRAINT "MissionCandidateEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
