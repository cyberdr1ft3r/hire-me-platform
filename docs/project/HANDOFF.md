# Current Agent Handoff

Last updated: 2026-09-24

## Current situation

- Authoritative `main` is `c4b7fe8964cf396136237aa9d1c772ec020fc6d4`, including merged project-memory PR #77, A-75-04 through PR #79, and A-75-02 through PR #81.
- Issue #82 / draft PR #83 owns A-75-01. The maintainer accepted D-067: certification and diploma are required only while enabled; staff saves clear contradictory required flags; legacy stored contradictions use effective disabled/not-required public and submit semantics and are repaired on a later authorized save without a bulk migration.
- The API/shared-contract implementation is accepted. The completion pass adds browser-facing EN/FR Public Opportunity regressions, a Missions staff-payload regression, and project-memory reconciliation. A-75-01 remains **pending merge**, not corrected on `main`.
- Still outstanding in Issue #75 after A-75-01: **A-75-03**, **A-75-05**, **A-75-06/07**, and **A-75-08**, plus fresh EN/FR responsive browser evidence. R-039 is unchanged.
- D-040, D-043, D-066, CV requirements, file validation/storage/version history, candidate accounts, and client-portal boundaries are unchanged.

## Next concrete action

1. Review the exact new PR #83 head and its GitHub Actions run; do not merge until the maintainer/ChatGPT accepts the browser regressions, PostgreSQL verification, and D-067 memory update.
2. After merge, update A-75-01 and R-041 from pending to corrected/mitigated on `main` and close Issue #82 as appropriate.
3. Obtain maintainer decisions and implement only the four other scoped Issue #75 findings.
4. Capture the remaining public EN/FR responsive visual evidence, then continue the Issue #66 AppShell/i18n audit.

## PR #83 completion conditions

- Public form tests prove disabled legacy-required certification and diploma controls cannot become impossible requirements in EN or FR.
- Enabled-and-required certification and diploma controls remain visible, native-required, and locally validated in EN and FR.
- The Missions staff form cannot submit `enabled=false` with `required=true` for either category.
- Formatting, architecture/style checks, lint, typecheck, contracts, full web tests, build, clean disposable-PostgreSQL migration/seed/integration tests, and exact-head CI pass.
- PR #83 stays open, draft, and unmerged; no deployment.
