-- Issue #23: interviews, participants, history, and structured evaluations.

CREATE TYPE "InterviewType_new" AS ENUM (
  'hr',
  'technical',
  'internal_validation',
  'client_interview_1',
  'client_interview_2'
);

ALTER TABLE "Interview" ALTER COLUMN "type" TYPE "InterviewType_new"
  USING (
    CASE "type"::text
      WHEN 'client' THEN 'client_interview_1'
      WHEN 'other' THEN 'internal_validation'
      ELSE "type"::text
    END
  )::"InterviewType_new";
DROP TYPE "InterviewType";
ALTER TYPE "InterviewType_new" RENAME TO "InterviewType";

CREATE TYPE "InterviewFormat" AS ENUM ('onsite', 'phone', 'video', 'other');
CREATE TYPE "InterviewParticipantKind" AS ENUM ('internal_user', 'client_contact', 'external');
CREATE TYPE "InterviewParticipantStatus" AS ENUM ('active', 'archived');
CREATE TYPE "InterviewEventAction" AS ENUM (
  'scheduled',
  'rescheduled',
  'postponed',
  'completed',
  'canceled',
  'archived',
  'participant_added',
  'participant_removed'
);
CREATE TYPE "EvaluationType" AS ENUM ('internal_hr', 'internal_technical', 'client');

ALTER TABLE "Interview" RENAME COLUMN "scheduledAt" TO "scheduledStartAt";
ALTER TABLE "Interview"
  ADD COLUMN "scheduledEndAt" TIMESTAMP(3),
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "format" "InterviewFormat" NOT NULL DEFAULT 'video',
  ADD COLUMN "organizerUserId" UUID,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "postponedAt" TIMESTAMP(3);

UPDATE "Interview" i
SET "organizerUserId" = mc."responsibleRecruiterUserId"
FROM "MissionCandidate" mc
WHERE i."missionCandidateId" = mc."id"
  AND i."organizerUserId" IS NULL;

ALTER TABLE "Interview" ALTER COLUMN "organizerUserId" SET NOT NULL;

CREATE TABLE "InterviewParticipant" (
  "id" UUID NOT NULL,
  "interviewId" UUID NOT NULL,
  "kind" "InterviewParticipantKind" NOT NULL,
  "userId" UUID,
  "clientContactId" UUID,
  "externalName" TEXT,
  "externalRole" TEXT,
  "status" "InterviewParticipantStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterviewParticipant_exactly_one_subject_chk" CHECK (
    (
      "kind" = 'internal_user'
      AND "userId" IS NOT NULL
      AND "clientContactId" IS NULL
      AND "externalName" IS NULL
    )
    OR (
      "kind" = 'client_contact'
      AND "userId" IS NULL
      AND "clientContactId" IS NOT NULL
      AND "externalName" IS NULL
    )
    OR (
      "kind" = 'external'
      AND "userId" IS NULL
      AND "clientContactId" IS NULL
      AND "externalName" IS NOT NULL
    )
  )
);

CREATE TABLE "InterviewEvent" (
  "id" UUID NOT NULL,
  "interviewId" UUID NOT NULL,
  "actorUserId" UUID,
  "action" "InterviewEventAction" NOT NULL,
  "previousStatus" "InterviewStatus",
  "nextStatus" "InterviewStatus",
  "previousStartAt" TIMESTAMP(3),
  "nextStartAt" TIMESTAMP(3),
  "previousEndAt" TIMESTAMP(3),
  "nextEndAt" TIMESTAMP(3),
  "previousTimezone" TEXT,
  "nextTimezone" TEXT,
  "participantId" UUID,
  "reason" TEXT,
  "safeComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CandidateEvaluation" DROP CONSTRAINT IF EXISTS "CandidateEvaluation_interviewId_fkey";
ALTER TABLE "CandidateEvaluation" DROP CONSTRAINT IF EXISTS "CandidateEvaluation_authorUserId_fkey";
ALTER TABLE "CandidateEvaluation" RENAME COLUMN "score" TO "overallScore";
ALTER TABLE "CandidateEvaluation" RENAME COLUMN "feedback" TO "comment";
ALTER TABLE "CandidateEvaluation"
  ADD COLUMN "recommended" BOOLEAN,
  ADD COLUMN "communicationScore" INTEGER,
  ADD COLUMN "technicalScore" INTEGER,
  ADD COLUMN "roleFitScore" INTEGER,
  ADD COLUMN "cultureFitScore" INTEGER,
  ADD COLUMN "motivationScore" INTEGER,
  ADD COLUMN "salaryAlignmentScore" INTEGER,
  ADD COLUMN "strengths" TEXT,
  ADD COLUMN "weaknesses" TEXT,
  ADD COLUMN "risks" TEXT,
  ADD COLUMN "finalOpinion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "internalOnly" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "clientVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "submittedAt" TIMESTAMP(3);

ALTER TABLE "CandidateEvaluation" ALTER COLUMN "evaluationType" TYPE "EvaluationType"
  USING (
    CASE lower("evaluationType")
      WHEN 'client' THEN 'client'
      WHEN 'technical' THEN 'internal_technical'
      WHEN 'internal_technical' THEN 'internal_technical'
      WHEN 'hr' THEN 'internal_hr'
      WHEN 'internal_hr' THEN 'internal_hr'
      ELSE 'internal_hr'
    END
  )::"EvaluationType";

ALTER TABLE "CandidateEvaluation" ALTER COLUMN "interviewId" SET NOT NULL;
ALTER TABLE "CandidateEvaluation" ALTER COLUMN "authorUserId" SET NOT NULL;

DROP INDEX IF EXISTS "Interview_scheduledAt_idx";
CREATE INDEX "Interview_organizerUserId_idx" ON "Interview"("organizerUserId");
CREATE INDEX "Interview_scheduledStartAt_idx" ON "Interview"("scheduledStartAt");
CREATE INDEX "Interview_type_idx" ON "Interview"("type");
CREATE INDEX "InterviewParticipant_interviewId_idx" ON "InterviewParticipant"("interviewId");
CREATE INDEX "InterviewParticipant_userId_idx" ON "InterviewParticipant"("userId");
CREATE INDEX "InterviewParticipant_clientContactId_idx" ON "InterviewParticipant"("clientContactId");
CREATE INDEX "InterviewParticipant_status_idx" ON "InterviewParticipant"("status");
CREATE INDEX "InterviewEvent_interviewId_idx" ON "InterviewEvent"("interviewId");
CREATE INDEX "InterviewEvent_actorUserId_idx" ON "InterviewEvent"("actorUserId");
CREATE INDEX "InterviewEvent_action_idx" ON "InterviewEvent"("action");
CREATE INDEX "InterviewEvent_createdAt_idx" ON "InterviewEvent"("createdAt");
CREATE INDEX "CandidateEvaluation_evaluationType_idx" ON "CandidateEvaluation"("evaluationType");

CREATE UNIQUE INDEX "InterviewParticipant_active_user_unique"
  ON "InterviewParticipant"("interviewId", "userId")
  WHERE "status" = 'active' AND "archivedAt" IS NULL AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "InterviewParticipant_active_client_contact_unique"
  ON "InterviewParticipant"("interviewId", "clientContactId")
  WHERE "status" = 'active' AND "archivedAt" IS NULL AND "clientContactId" IS NOT NULL;

CREATE UNIQUE INDEX "InterviewParticipant_active_external_unique"
  ON "InterviewParticipant"("interviewId", "externalName")
  WHERE "status" = 'active' AND "archivedAt" IS NULL AND "externalName" IS NOT NULL;

CREATE UNIQUE INDEX "CandidateEvaluation_active_author_type_unique"
  ON "CandidateEvaluation"("interviewId", "authorUserId", "evaluationType")
  WHERE "status" <> 'archived' AND "archivedAt" IS NULL;

ALTER TABLE "Interview" ADD CONSTRAINT "Interview_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewEvent" ADD CONSTRAINT "InterviewEvent_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewEvent" ADD CONSTRAINT "InterviewEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_scores_bounded_chk" CHECK (
  ("overallScore" IS NULL OR ("overallScore" BETWEEN 1 AND 5))
  AND ("communicationScore" IS NULL OR ("communicationScore" BETWEEN 1 AND 5))
  AND ("technicalScore" IS NULL OR ("technicalScore" BETWEEN 1 AND 5))
  AND ("roleFitScore" IS NULL OR ("roleFitScore" BETWEEN 1 AND 5))
  AND ("cultureFitScore" IS NULL OR ("cultureFitScore" BETWEEN 1 AND 5))
  AND ("motivationScore" IS NULL OR ("motivationScore" BETWEEN 1 AND 5))
  AND ("salaryAlignmentScore" IS NULL OR ("salaryAlignmentScore" BETWEEN 1 AND 5))
);
