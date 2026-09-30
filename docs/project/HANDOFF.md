# Current Agent Handoff

Last updated: 2026-10-01

## Current situation

- The latest `main` is `008b3b4ac50449cc64aa72c01bd6bb1647aeaedf` (PR #123 / Issue #111 bilingual Training workspace merged under D-076), after PR #119 / Issue #113 Documents, PR #107 / Issue #105, PR #106 / Issue #99 Missions, and related rollout merges.
- Issue #111 (Training) is **merged**: bilingual `apps/web/src/training/`, full EN/FR, `training` removed from `deferredEnglishRoutes`; bounded D-076 presentation fields only. Limits remain in R-049.
- Issue #114 (Missions first-public-opportunity empty state) is **ready for review on PR #122** (`cursor/missions-public-opportunity-empty-eafa`), rebased onto current `main`: web-only GET 404 → localized missing state, first PATCH create for authorized actors; evidence in `docs/audit/issue-114-missions-browser-evidence.md`.
- Issue #109 (MissionCandidate race test flake) and Issue #110 (Missions R-047 follow-ups) remain open and non-blocking.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #114 / PR #122:** maintainer or ChatGPT review and merge when satisfied after exact-head CI on the rebased head; do not expand into Issue #110 or re-touch Training #111 behavior.
2. Continue deferred-module rollout with **Commercial**, then Accounting and Admin, each in its own bounded issue.
3. **Documents follow-ups:** schedule R-048 limits as their own issue if wanted.
4. **Issue #110 / Issue #109:** schedule separately; do not fold them into other rollouts.
5. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
6. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.
- Provision the disposable server with `C.UTF-8` collation (as CI's Alpine image sorts); a glibc `en_US` cluster reorders hyphenated names and fails the Task selector sort assertion.
