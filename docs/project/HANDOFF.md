# Current Agent Handoff

Last updated: 2026-09-25

## Current situation

- Authoritative `main` is `fa2e594b4da68379ae2c1310a8c879ccc94f0639`, including merged PR #89 / Issue #88 (closed). **A-75-06/07 and R-046 are corrected** in the repository under D-070. Its additive migration `20260925120000_public_opportunity_content_language` has **not** run in production; production needs deployment approval, and the API must deploy with or before the web client.
- Issue #90 / draft PR owns **A-75-08** under accepted **D-071**: `pnpm test:db` runs only against a database this checkout provisioned and marked, verified on the writing connection; the foundational suite has its own migrated schema; CI runs the full suite twice on one database with a catalog gate after each pass and proves refusal of unmarked and development databases. **A-75-08 and R-045 are not corrected on `main` until that PR merges.**
- Still outstanding in Issue #75: fresh EN/FR responsive browser evidence. D-068 production env/proxy limits remain unverified. R-039 is unchanged.

## Next concrete action

1. Final review of the Issue #90 PR at its latest exact head with green Actions; do not merge automatically.
2. After merge, mark D-071 merged and A-75-08 / R-045 corrected, and update Issue #75.
3. Decide on the follow-up for suites that narrow and restore shared seeded roles (reported by `test:db:check-catalog`).
4. Capture the #75 EN/FR responsive evidence; verify D-068 production limits operationally; continue the Issue #66 AppShell/i18n audit.

## Issue #90 completion conditions

- Every database command refuses before writing unless the guard passes; no fallback to `DATABASE_URL` or `.env`.
- Two consecutive full passes on the same provisioned database, the catalog gate after each, the foundational suite alone, and the refusal proof all pass locally and in exact-head CI.
- Test-infrastructure only: no application behaviour, contract, or production-schema change.
- PR stays open, draft, and unmerged until maintainer merge; no deployment.
