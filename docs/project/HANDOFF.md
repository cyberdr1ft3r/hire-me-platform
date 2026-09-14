# Current Agent Handoff

Last updated: 2026-09-14

## Current situation

- Authoritative `main` is `252ac99219cfd7d35bb8ff44c4ad3f1e73c4c49f`, including the Task Pipeline merged through PR #65 (Issue #64 closed).
- Issue #67 corrects Candidate drift D-CAND-01 and D-CAND-02 from audit Issue #66 on `fix/candidate-list-profile-drift`, with a draft PR. Keep it draft, open, unmerged, and undeployed.
- No API, contract, Prisma schema, migration, permission, lifecycle, archival, or audit rule changed. The web client gained only the existing structured-record update and archive methods.
- **List (D-CAND-01).** The Candidate list reads one server page of 20 in the server's deterministic order, with previous and next and the page and range stated in text.
  - Filters reset to page 1. An emptied page moves to the last page with matches.
  - Stale page or filter responses are discarded, and switching language never refetches.
  - Search, status, and source combine on the server.
- **Source filter.** It offers the platform's own `public_application` value, labelled "Public application" / "Candidature en ligne", and an exact recorded source (free text, matched ignoring case). No category is invented (D-063, R-038).
- **Structured records (D-CAND-02).** Each active skill, language, work experience, and education row offers Edit and Archive to `candidate_profile:manage` holders on a non-archived candidate.
  - Edit is pre-filled and sends a partial update of only the changed fields its form owns.
  - Archive is confirmed and keeps the row as history. There is no deletion and no restore.
  - All record writes go through the container's single write lock and its candidate-context and session guards. `CandidatesPanel` owns every read, write, and guard; presentation stays in `CandidateWorkspace` and its sections.
- D-CAND-03 (compensation and consent editing) is untouched and needs its own decision.

## Review target

Run `pnpm --filter @hire-me/web dev`, then open `http://127.0.0.1:5173/candidate.html` (`?dataset=many` for three pages).

Review:

- the list toolbar (search, status, source, recorded source);
- pagination at the boundaries;
- Edit and Archive on skills, languages, work experience, and education, including archived rows (no actions);
- the read-only viewer profile (no actions);
- EN and FR at desktop and mobile widths. The page's `scrollWidth` must equal its `clientWidth`.

## Completion conditions

- Every Issue #67 validation command and the exact-head GitHub Actions run are green, including the PostgreSQL Candidate integration tests for paging and in-place record maintenance.
- Issue #66 records D-CAND-01 and D-CAND-02 as corrected (or any part deferred with a reason) and stays open.
- Technical and visual reviewers accept the implementation or request a bounded correction.

## Explicit hard stop

Do not begin any of the following:

- D-CAND-03 compensation or consent editing;
- MissionCandidate/ATS changes, Reporting drilldowns, or the Public Opportunity salary-unit bug (R-035);
- Clients or Missions;
- a global UI-DNA refinement;
- any migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #67, Issue #66, the Issue #67 PR review history, and the project-memory files.
- Fetch `origin`, then verify the base, the branch head, the draft PR state, and exact-head CI.
- Keep corrections inside:
  - `apps/web/src/candidates`, `apps/web/src/candidate-preview`, and `apps/web/candidate.html`;
  - the Candidate API client methods and Candidate translations;
  - `apps/api/test/candidates.integration.test.ts` (tests only);
  - project documentation.
