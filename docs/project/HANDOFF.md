# Current Agent Handoff

Last updated: 2026-10-01

## Current situation

- The latest `main` is `fcf459c` (PR #122 / Issue #114 Missions first-public-opportunity empty state merged), after PR #123 / Issue #111 Training (D-076) and PR #119 / Issue #113 Documents.
- Issue #115 (audited core UI accessibility and low-risk polish) is **in review on a draft PR** from `fix/issue-115-ui-a11y-polish`: web, CSS, i18n copy, contrast gate, and design docs only (no API, schema, migration, or permission change). It proposes D-077 (system font stack, darker muted token, native-select presentation with a customizable opened list, reading measure). Evidence: `docs/audit/issue-115-ui-polish-evidence.md`.
- Issues #117 (UI-DNA v1.1) and #118 (Missions restructuring) remain deferred and were not touched; Notifications placement stays an open product decision.
- Issue #109 (MissionCandidate race test flake) and Issue #110 (Missions R-047 follow-ups) remain open and non-blocking.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #115:** maintainer or ChatGPT review of the draft PR after exact-head CI; accept or amend D-077; do not merge automatically. Follow-ups noted there (Documents/Training `Search {field}` wording, other modules' current-state actions) need their own issues.
2. Continue deferred-module rollout with **Commercial**, then Accounting and Admin, each in its own bounded issue.
3. **Documents follow-ups:** schedule R-048 limits as their own issue if wanted.
4. **Issue #110 / Issue #109:** schedule separately; do not fold them into other rollouts.
5. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
6. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.
- Provision the disposable server with `C.UTF-8` collation (as CI's Alpine image sorts); a glibc `en_US` cluster reorders hyphenated names and fails the Task selector sort assertion.
