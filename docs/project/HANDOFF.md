# Current Agent Handoff

Last updated: 2026-09-15

## Current situation

- Authoritative `main` is `2c79b0732a429dccc32ebfaa2fbb2958639b4537`, including PR #68 (Issue #67, Candidate drift D-CAND-01 and D-CAND-02, accepted as corrected in Issue #66).
- Issue #69 corrects Candidate drift D-CAND-03 on `fix/candidate-sensitive-management-drift`, with a draft PR. Keep it draft, open, unmerged, and undeployed.
- **Permissions.** The restricted-information section offers **Edit compensation** only with `candidates:update`, `candidate_compensation:view`, and `candidate_compensation:update`, and **Manage consent** only with `candidates:update`, `candidate_consent:view`, and `candidate_consent:manage`, on a non-archived candidate. Update or manage without view shows nothing. The server rules are unchanged.
- **Compensation.** Typed in major units, parsed on the digit string to integer cents (point or comma, at most two decimals, zero allowed, at most 2147483647 cents); stored cents pre-fill exactly. Currency is the recorded three-character value. Partial update of changed fields, `null` when cleared, no request when unchanged.
- **Consent.** The four contract statuses with EN/FR labels; recorded date and time through the Task local date-time helpers. The status never changes the date. Same partial-update rules.
- **Audit.** `candidates.compensation.updated` and `candidates.consent.updated` (actor and candidate only) are recorded with the generic `candidates.candidate.updated` only when the stored group actually changed.
- **Contract.** `salaryExpectationCents` is bounded to the PostgreSQL `integer` maximum on create and update (an overflow was a 500, now a 400).
- **Write safety.** The single write lock and the candidate-context and session guards apply; a success commits the server response and re-reads the candidate.
- **Session boundary.** Final review on head `88fa91e` found the previous principal's selected candidate (with its restricted values) stayed rendered after a token or permission change. The container now resets the selection, record, feedback, list, and filters while rendering, advances every request and context guard, and remounts the presentation, so the new session starts empty and loads its own data. A write still in flight keeps the write lock until it settles; its result is dropped.
- D-064 records the decision; R-039 records the pre-existing gap that write responses are not audited as access. R-035 is untouched.

## Review target

Run `pnpm --filter @hire-me/web dev`, then open `http://127.0.0.1:5173/candidate.html`.

Review with the preview access profiles:

- **Full access:** Edit compensation and Manage consent, their forms, validation, and Cancel;
- **Restricted data, view only:** values without any action;
- **Recruiter without restricted data** and **Read-only viewer:** no restricted section at all;
- EN and FR at desktop and 390 px. The page's `scrollWidth` must equal its `clientWidth`.

## Completion conditions

- Every Issue #69 validation command and the exact-head GitHub Actions run are green, including the Candidate PostgreSQL tests for the dedicated audit events and denied writes and the session-boundary regressions.
- ChatGPT D-CAND-03 re-review accepts the session-boundary correction.
- Issue #66 records D-CAND-03 as implemented and awaiting review, and stays open.
- The ChatGPT conformance review accepts the implementation or requests a bounded correction on the same branch.

## Explicit hard stop

Do not begin any of the following:

- the Public Opportunity salary-unit bug (R-035) or any reinterpretation of stored public-application salaries;
- Candidate pagination, source, or structured-record changes;
- MissionCandidate/ATS, Tasks, Reporting, payroll, or accounting changes;
- a global UI-DNA refinement;
- any migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #69, Issue #17, Issue #66, the Issue #69 PR review history, and the project-memory files.
- Fetch `origin`, then verify the base, the branch head, the draft PR state, and exact-head CI.
- Keep corrections inside:
  - `apps/web/src/candidates`, `apps/web/src/candidate-preview`, and the Candidate translations;
  - `apps/api/src/candidates/candidates.service.ts` and `apps/api/test/candidates.integration.test.ts`;
  - the Candidate salary bound in `packages/contracts/src/candidates.ts`;
  - project documentation.
