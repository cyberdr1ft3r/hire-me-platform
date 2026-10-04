# Current Agent Handoff

Last updated: 2026-10-04

## Current situation

- Issue #124 (My Agenda + meetings prerequisite) is implemented on `cursor/issue-124-meetings-prerequisite-eafa`: meetings foundation (`Meeting` schema, `GET/POST/PATCH /v1/meetings`), read-only `GET /v1/agenda` aggregation, and bilingual `apps/web/src/agenda/`.
- The latest `main` is `696a539` (Issue #127 Commercial V1, PR #129 and PR #130), after PR #128 / Issue #125 `FINANCE_MANAGER` (D-078).
- Issue #131 (Accounting V1 workspace): the raw-ID audit is `docs/audit/issue-131-accounting-source-audit.md`. The bounded prerequisite (D-081: read-only Accounting `display` labels and `GET /v1/accounting/placement-options`; no migration, no new permission) is on `cursor/issue-131-accounting-source-labels-eafa`, and the bilingual workspace is stacked on it.
- Issue #115 (audited core UI accessibility and low-risk polish, D-077) is merged through PR #126; Commercial V1 consumes its shared primitives.
- Issues #117 (UI-DNA v1.1) and #118 (Missions restructuring) remain deferred and were not touched; Notifications placement stays an open product decision.
- Issue #109 (MissionCandidate race test flake) and Issue #110 (Missions R-047 follow-ups) remain open and non-blocking.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #124:** open draft PR(s) from `cursor/issue-124-meetings-prerequisite-eafa` (meetings prerequisite + agenda/web). Run exact-head CI after push; PostgreSQL integration tests require `TEST_DATABASE_ADMIN_URL` locally.
2. **Issue #131:** review the D-081 prerequisite PR first, then the Accounting UI PR stacked on it. After the prerequisite merges, retarget the UI PR to `main`, merge latest `main`, rerun the full validation suite, and wait for exact-head CI. Decide R-050/R-051 (finance access to mission-linked records) separately; do not grant `missions:view` to `FINANCE_MANAGER` as a workaround.
2. After Accounting, continue the deferred-module rollout with Admin in its own bounded issue.
3. **Documents follow-ups:** schedule R-048 limits as their own issue if wanted.
4. **Issue #110 / Issue #109:** schedule separately; do not fold them into other rollouts.
5. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
6. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.
- Provision the disposable server with `C.UTF-8` collation (as CI's Alpine image sorts); a glibc `en_US` cluster reorders hyphenated names and fails the Task selector sort assertion.
