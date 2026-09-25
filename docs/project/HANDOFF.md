# Current Agent Handoff

Last updated: 2026-09-24

## Current situation

- Authoritative `main` is `91a6050b864abb1c4ea4474e08f987602c832c86`, including merged PR #83 / Issue #82 (A-75-01 corrected, D-067 implemented).
- Issue #84 / draft PR (in progress) owns **A-75-03**: align **5 MB** raw aggregate allowance with JSON/base64 transport (`8mb` default parser limit), stable **413** handling, and EN/FR **`payloadTooLarge`** browser feedback. **Do not mark A-75-03 corrected until that PR merges.**
- Still outstanding in Issue #75 after A-75-03: **A-75-05**, **A-75-06/07**, and **A-75-08**, plus fresh EN/FR responsive browser evidence. R-039 is unchanged.

## Next concrete action

1. Finish exact-head CI and ChatGPT review for the Issue #84 draft PR; do not merge automatically.
2. After merge, mark A-75-03 and R-044 corrected on `main` and close Issue #84 as appropriate.
3. Implement the three remaining scoped Issue #75 findings on dedicated branches.
4. Capture remaining public EN/FR responsive visual evidence, then continue the Issue #66 AppShell/i18n audit.

## Issue #84 completion conditions

- Shared contracts, API enforcement, browser preflight, and default JSON transport limit agree on raw per-file and aggregate caps.
- Boundary PostgreSQL tests cover below/at/above aggregate, multi-file base64 expansion, metadata overhead, **413** vs application-level rejection, and no persistence on rejection.
- EN/FR localized oversize feedback for **413**; applicable quality gates and exact-head GitHub Actions pass.
- PR stays open, draft, and unmerged; no deployment.
