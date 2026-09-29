# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- The latest product/test baseline includes PR #107 / Issue #105 merged as `94aba8808fabad4d57ba61789d3d53d4967621e8` and its docs reconciliation (PR #121 / Issue #120), after PR #106 / Issue #99 bilingual Missions workspace as `2c7bffa973d6974c95aa93c435b39211a1788a37`, PR #108 / Issue #103, PR #104 / Issue #93, and PR #101 / Issue #100.
- Issue #113 (Documents as a contextual Document Center) is **in review** through draft PR #119 on `cursor/issue-113-document-center-effe`; it is not merged. It replaces the raw-ID Documents panel with `apps/web/src/documents/`, full EN/FR, removes only `documents` from `deferredEnglishRoutes`, and adds the D-075 bounded presentation/options capability. No migration and no new permission.
- PR #119 also corrects a pre-existing list defect on `main`: actors with the mission-transfer override (including the seeded super admin) could open generated commercial documents by detail but never saw them in `GET /v1/documents`, because a bare empty Prisma to-one relation filter matches nothing. The list predicate now uses `is`; a regression test covers all five generated source types.
- Issue #111 (bilingual Training workspace) is the current functional module rollout; no Training UI work has merged. Issue #99 is complete; its follow-ups are Issue #110. Issue #109 (MissionCandidate race test flake) is non-blocking.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #113 review:** review PR #119 against Issue #113; merge only on maintainer approval after exact-head CI. Remaining Documents limits are in R-048.
2. **Training rollout (Issue #111):** branch from current `main`; keep `/training` in `deferredEnglishRoutes` until the complete bilingual rollout is verified. If PR #119 merges first, reuse no Documents components for Training.
3. **Issue #110 / Issue #109:** schedule separately; do not fold them into other rollouts.
4. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
5. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.
