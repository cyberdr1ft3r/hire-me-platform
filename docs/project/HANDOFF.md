# Current Agent Handoff

Last updated: 2026-09-30

## Current situation

- The latest `main` is `2e7859e26b4e1d8aa83d3024b2cb9bd7524aa265` (PR #119 / Issue #113 Documents contextual Document Center merged under D-075), after PR #107 / Issue #105, PR #106 / Issue #99 Missions, PR #108 / Issue #103, PR #104 / Issue #93, and PR #101 / Issue #100.
- Issue #111 (bilingual Training workspace) is **delivered for review by draft PR #123** under proposed D-076. It replaces the raw-ID Training panel in `App.tsx` with `apps/web/src/training/`, full EN/FR, removes only `training` from `deferredEnglishRoutes`, uses only the D-073 option sources for internal users and enrollments, and adds read-only `ownerDisplayName`, `clientDisplayName`, and `trainerDisplayName` to program and session summaries. No migration and no new permission. Limits are recorded in R-049.
- Issue #109 (MissionCandidate race test flake) is still open and reproduced once during the Issue #111 reverse D-071 pass; a rerun on the same database passed.
- Issue #110 (Missions follow-ups) and the R-048 Documents follow-ups remain separate.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Review PR #123 (Issue #111):** confirm D-076, the presentation-field gating (`clientDisplayName` only with `clients:view`), and the R-049 limits; accept or amend D-076, then merge only after exact-head CI and review.
2. After merge, continue the rollout with Commercial, then Accounting and Admin, each in its own bounded issue; keep EXTERNAL participant management and Training deep links as separate issues if wanted.
3. **Issue #110 / Issue #109:** schedule separately; do not fold them into other rollouts.
4. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
5. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.
- Provision the disposable server with `C.UTF-8` collation (as CI's Alpine image sorts); a glibc `en_US` cluster reorders hyphenated names and fails the Task selector sort assertion.
