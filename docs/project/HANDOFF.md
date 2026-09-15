# Current Agent Handoff

Last updated: 2026-09-15

## Current situation

- Authoritative `main` is `ee722fae04add567ac3ae0db31fb4928086976d6`, including PR #70 / Issue #69 and accepted Candidate drift D-CAND-01 through D-CAND-03.
- Issue #71 corrects Reporting drift D-REPORT-01 on `fix/reporting-drilldown-navigation-drift`. Keep its PR draft, open, unmerged, and undeployed.
- Authorized Mission and Candidate names in the existing Reporting drilldown are semantic links. Actors without `missions:view` or `candidates:view` see the same name as plain text. Client and recruiter names remain text.
- The complete query contract is `/missions?mission=<uuid>` and `/candidates?candidate=<uuid>`. Inputs are route-specific and UUID-validated. Unknown, misplaced, ambiguous, or malformed inputs are ignored.
- Candidate and Mission resolve the exact record through their existing scoped detail APIs. URL intent grants nothing. Safe generic hidden/not-found behavior, target/session request guards, manual-selection supersession, Strict Mode replay, direct load, refresh, Back/Forward, and sidebar clearing are covered.
- The bounded re-review correction stops a stale Mission chain after every awaited nested Mission read, before it can start a later assignment/process/public-opportunity/application request with an old token or permission principal. Deterministic tests cover manual target supersession, token replacement with Authorization evidence, permission replacement, and hidden/not-found behavior without nested reads; the existing Strict Mode success test remains.
- D-064 is reconciled as Accepted through merged PR #70. D-065 remains Proposed while Issue #71 is under review.
- Process focus is deferred because the current Missions workspace has no approved process-focused entry. Client is deferred because the legacy Client container lacks safe request/session selection and generic exact-detail failure handling. Recruiter is deferred because Admin is not an approved destination for ordinary recruiting users.
- No API, contract, Prisma schema, migration, permission, KPI, filter, pagination, CSV, Candidate business, Mission lifecycle/pipeline, or Public Opportunity salary behavior changed. R-035 is untouched.
- Local re-review gates pass with unchanged scope: 30 contract, 85 API unit, 442 web, and 314 PostgreSQL integration tests, plus install, Prisma, style, architecture, format, lint, typecheck, build, migration reset/deploy, and repeatable-seed checks. Exact-head GitHub Actions remains the final automated gate.

## Review target

Run `pnpm --filter @hire-me/web dev --host 127.0.0.1`, then review:

- `http://127.0.0.1:5173/reporting.html` for Mission and Candidate links;
- `http://127.0.0.1:5173/reporting.html?access=missions-only` for a plain-text Candidate cell;
- `/candidates?candidate=<authorized-uuid>` and `/missions?mission=<authorized-uuid>` in an authenticated local environment for destination reads.

Review EN/FR at desktop and 390 px. Confirm one h1, correct document language, no raw UUID text, no English Reporting boundary in French, and document `scrollWidth === clientWidth`; the dense table may scroll inside its existing container.

## Completion conditions

- Every Issue #71 repository gate and the new exact-head GitHub Actions run are green.
- The Issue #71 draft PR links the issue and records the implemented/deferred discovery matrix.
- Issue #66 records a new superseding `D-REPORT-01 — IMPLEMENTED / RE-REVIEW REQUESTED` comment only after exact-head CI passes.
- ChatGPT conformance review accepts the correction or requests a bounded fix on the same branch.

## Explicit hard stop

Do not begin:

- D-PUBLIC-01 / R-035 salary-unit work;
- Client, Mission, or recruiter-directory redesign;
- process-focused workspace work;
- Task related-record links;
- Reporting KPI/filter/export changes;
- schema, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issues #71, #36, #56, #66, and all project-memory files.
- Fetch `origin`, verify the branch base/head, draft PR state, and exact-head CI.
- Keep corrections within internal navigation, Reporting presentation/container/tests, Candidate/Mission destination selection safety, translations, and project documentation.
