-- Recruitment mission operational fields and assignment invariants for Issue #19.
ALTER TABLE "RecruitmentMission"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "workArrangement" TEXT,
  ADD COLUMN "engagementType" TEXT,
  ADD COLUMN "targetStartDate" TIMESTAMP(3),
  ADD COLUMN "applicationDeadline" TIMESTAMP(3),
  ADD COLUMN "salaryMinCents" INTEGER,
  ADD COLUMN "salaryMaxCents" INTEGER,
  ADD COLUMN "salaryCurrency" TEXT;

ALTER TABLE "RecruitmentMission"
  ADD CONSTRAINT "RecruitmentMission_positions_positive_check"
  CHECK ("numberOfPositions" > 0),
  ADD CONSTRAINT "RecruitmentMission_filled_placement_bounds_check"
  CHECK ("filledPlacementCount" >= 0 AND "filledPlacementCount" <= "numberOfPositions"),
  ADD CONSTRAINT "RecruitmentMission_salary_bounds_check"
  CHECK (
    ("salaryMinCents" IS NULL OR "salaryMinCents" >= 0)
    AND ("salaryMaxCents" IS NULL OR "salaryMaxCents" >= 0)
    AND (
      "salaryMinCents" IS NULL
      OR "salaryMaxCents" IS NULL
      OR "salaryMinCents" <= "salaryMaxCents"
    )
  );

DROP INDEX IF EXISTS "MissionRecruiter_missionId_userId_role_key";

CREATE UNIQUE INDEX "MissionRecruiter_active_mission_user_role_key"
  ON "MissionRecruiter"("missionId", "userId", "role")
  WHERE "status" = 'active' AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "MissionRecruiter_active_lead_recruiter_key"
  ON "MissionRecruiter"("missionId")
  WHERE "status" = 'active' AND "archivedAt" IS NULL AND "isLead" = true;

CREATE INDEX "RecruitmentMission_priority_idx" ON "RecruitmentMission"("priority");
CREATE INDEX "RecruitmentMission_applicationDeadline_idx" ON "RecruitmentMission"("applicationDeadline");
CREATE INDEX "RecruitmentMission_client_state_idx" ON "RecruitmentMission"("clientId", "state");
