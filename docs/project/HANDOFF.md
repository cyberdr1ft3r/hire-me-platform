# Current Agent Handoff

Last updated: 2026-09-26

## Current situation

- Authoritative `main` is `f4ef6ebdbe95ba47cb29afa21d42c9d8ad9bd595`, including merged PR #87 / Issue #86 (closed). **A-75-05 and R-043 are corrected** under D-069. A-75-03 remains corrected at the application level only; production environment overrides and upstream proxy/CDN body limits are **not yet verified**.
- Issue #88 / draft PR owns **A-75-06/07** under accepted **D-070**: one staff-declared `contentLanguage` (`en`/`fr`/`null`) for the authored copy set, a nullable CHECK-constrained column (additive migration, no backfill), `lang` on each authored public element, and `lang=""` when not declared. **A-75-06/07 are not corrected on `main` until that PR merges.**
- Still outstanding in Issue #75: **A-75-08** and fresh EN/FR responsive browser evidence. R-039 is unchanged.

## Next concrete action

1. Final review of the Issue #88 PR at its latest exact head with green Actions; do not merge automatically.
2. After merge, mark D-070 merged, A-75-06/07 and R-046 corrected, and update Issue #75. Run the migration in production only with deployment approval.
3. Correct A-75-08 on a dedicated branch; capture the EN/FR responsive evidence; verify D-068 production limits operationally.

## Issue #88 completion conditions

- Migration, CHECK, contract enum, API mapping, manage-only PATCH, staff editor, and list/detail rendering implement D-070; invalid values are rejected at the contract and the database.
- Interface chrome and the form stay in the interface language; authored elements state `en`, `fr`, or `""`; switching language changes neither.
- Contract, web, and disposable PostgreSQL tests and exact-head GitHub Actions pass; D-066–D-069 unchanged.
- PR stays open, draft, and unmerged until maintainer merge; no deployment.
