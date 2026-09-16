-- Read-only legacy impact review for D-PUBLIC-01 / R-035.
--
-- Issue #73 corrects the public application form, which used to send the salary
-- figure a person typed unchanged into `salaryExpectationCents`. It deliberately
-- does NOT correct rows that are already stored, because nothing persisted proves
-- which unit an old request carried: the HTTP field has always been named
-- `salaryExpectationCents`, so a direct API caller could legitimately have sent
-- real minor units, and the browser form could have sent major units under the
-- same name. See `docs/runbooks/public-application-salary-unit-review.md`.
--
-- This statement therefore only groups affected rows for a human to review. It
-- is a single SELECT: it writes nothing, locks nothing, and creates nothing.
--
-- It returns no salary amount and no currency value, so its output can be read
-- and shared without disclosing candidate compensation. `classification` is
-- review evidence, never a unit proof and never an input to an automatic write.
SELECT
  application."id" AS "publicCandidateApplicationId",
  application."publicOpportunityId" AS "publicOpportunityId",
  application."missionId" AS "missionId",
  application."candidateId" AS "candidateId",
  application."submittedAt" AS "submittedAt",
  (application."submittedSalaryExpectationCurrency" IS NOT NULL) AS "applicationRecordedCurrency",
  (
    candidate."salaryExpectationCurrency"
    IS NOT DISTINCT FROM application."submittedSalaryExpectationCurrency"
  ) AS "currencyAgreesWithCandidate",
  -- The submission writes `public_application` plus the opportunity slug only on
  -- a Candidate it creates itself, and one email may apply to one opportunity
  -- once. That makes this strong review evidence of a new-candidate submission,
  -- and still not evidence of which unit the request carried.
  (
    candidate."source" = 'public_application'
    AND candidate."sourceDetail" = opportunity."publicSlug"
  ) AS "candidateLooksCreatedByThisApplication",
  (candidate."archivedAt" IS NOT NULL) AS "candidateArchived",
  CASE
    WHEN candidate."salaryExpectationCents" IS NULL THEN 'CANDIDATE_HAS_NO_RECORDED_EXPECTATION'
    WHEN candidate."source" = 'public_application'
      AND candidate."sourceDetail" = opportunity."publicSlug"
      THEN CASE
        WHEN candidate."salaryExpectationCents" = application."submittedSalaryExpectationCents"
          THEN 'NEW_CANDIDATE_STILL_MATCHES_SNAPSHOT'
        ELSE 'NEW_CANDIDATE_CHANGED_SINCE_SUBMISSION'
      END
    ELSE CASE
      WHEN candidate."salaryExpectationCents" = application."submittedSalaryExpectationCents"
        THEN 'EXISTING_CANDIDATE_EQUALS_SNAPSHOT'
      ELSE 'EXISTING_CANDIDATE_NOT_OVERWRITTEN'
    END
  END AS "classification"
FROM "PublicCandidateApplication" AS application
JOIN "Candidate" AS candidate ON candidate."id" = application."candidateId"
JOIN "PublicOpportunity" AS opportunity ON opportunity."id" = application."publicOpportunityId"
WHERE application."submittedSalaryExpectationCents" IS NOT NULL
ORDER BY application."submittedAt" ASC, application."id" ASC
