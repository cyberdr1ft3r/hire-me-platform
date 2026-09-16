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
-- and shared without disclosing candidate compensation.
--
-- It also makes NO claim about whether an application created the Candidate it
-- is linked to or reused one that already existed. Nothing persisted proves
-- that: the submission writes the same `MissionCandidate`, the same
-- `MissionCandidateEvent`, and the same `PublicCandidateApplication` shape in
-- both cases, records no candidate-creation audit entry, and `Candidate` has no
-- creation-origin column. Every column below is either an immutable fact of the
-- application snapshot or an explicitly named CURRENT value that ordinary later
-- edits can change.
SELECT
  application."id" AS "publicCandidateApplicationId",
  application."publicOpportunityId" AS "publicOpportunityId",
  application."missionId" AS "missionId",
  application."candidateId" AS "candidateId",
  application."submittedAt" AS "submittedAt",
  -- Immutable: the application snapshot is insert-only.
  (application."submittedSalaryExpectationCurrency" IS NOT NULL) AS "applicationRecordedCurrency",
  -- Current state, not history: a Candidate's currency can be maintained at any
  -- time through normal compensation management.
  (
    candidate."salaryExpectationCurrency"
    IS NOT DISTINCT FROM application."submittedSalaryExpectationCurrency"
  ) AS "currentCandidateCurrencyMatchesSnapshot",
  -- Current metadata on BOTH sides, and a triage hint only. `Candidate.source`
  -- and `Candidate.sourceDetail` are editable through the Candidate update
  -- contract, and `PublicOpportunity.publicSlug` is editable through the
  -- internal opportunity update, so a Candidate this application really did
  -- create can stop matching after an ordinary later edit, and a Candidate it
  -- merely reused can be edited into matching. Never read this as provenance.
  (
    candidate."source" = 'public_application'
    AND candidate."sourceDetail" = opportunity."publicSlug"
  ) AS "currentCandidateSourceMatchesApplicationOrigin",
  (candidate."archivedAt" IS NOT NULL) AS "currentCandidateArchived",
  -- Compares the Candidate's CURRENT expectation with the recorded snapshot.
  -- It states nothing about the unit either value was written in, and nothing
  -- about whether this application created or reused the Candidate.
  CASE
    WHEN candidate."salaryExpectationCents" IS NULL
      THEN 'CANDIDATE_HAS_NO_RECORDED_EXPECTATION'
    WHEN candidate."salaryExpectationCents" = application."submittedSalaryExpectationCents"
      THEN 'CANDIDATE_EXPECTATION_MATCHES_SNAPSHOT'
    ELSE 'CANDIDATE_EXPECTATION_DIFFERS_FROM_SNAPSHOT'
  END AS "classification"
FROM "PublicCandidateApplication" AS application
JOIN "Candidate" AS candidate ON candidate."id" = application."candidateId"
JOIN "PublicOpportunity" AS opportunity ON opportunity."id" = application."publicOpportunityId"
WHERE application."submittedSalaryExpectationCents" IS NOT NULL
ORDER BY application."submittedAt" ASC, application."id" ASC
