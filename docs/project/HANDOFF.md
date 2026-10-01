# Current Agent Handoff

Last updated: 2026-10-01

## Current situation

- The latest `main` is `2193c19` (PR #128 / Issue #125 `FINANCE_MANAGER` role, D-078), after PR #126 / Issue #115 polish and PR #122 / Issue #114.
- Issue #127 (Commercial V1 workspace): the raw-ID audit found no authorization-compatible source for invoice placements or for human labels on commercial list/detail rows. The bounded prerequisite (D-079) is on draft PR branch `cursor/issue-127-commercial-source-labels-eafa`: read-only `display` labels on Commercial summaries and `GET /v1/commercial/placement-options`; no migration, no new permission. The UI rollout is stacked on it on `cursor/issue-127-commercial-workspace-eafa`.
- Issue #115 (audited core UI accessibility and low-risk polish, D-077) is merged through PR #126; Commercial V1 consumes its shared primitives.
- Issues #117 (UI-DNA v1.1) and #118 (Missions restructuring) remain deferred and were not touched; Notifications placement stays an open product decision.
- Issue #109 (MissionCandidate race test flake) and Issue #110 (Missions R-047 follow-ups) remain open and non-blocking.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #127:** review the D-079 prerequisite PR first (labels + placement options, PostgreSQL coverage in `commercial-presentation.integration.test.ts`), then the stacked Commercial UI PR; retarget the UI PR to `main` after the prerequisite merges. Decide R-050 (finance access to mission-linked commercial records) separately; do not grant `missions:view` to `FINANCE_MANAGER` as a workaround.
2. After Commercial, continue the deferred-module rollout with Accounting and Admin, each in its own bounded issue.
3. **Documents follow-ups:** schedule R-048 limits as their own issue if wanted.
4. **Issue #110 / Issue #109:** schedule separately; do not fold them into other rollouts.
5. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
6. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.
- Provision the disposable server with `C.UTF-8` collation (as CI's Alpine image sorts); a glibc `en_US` cluster reorders hyphenated names and fails the Task selector sort assertion.
