# Current Agent Handoff

Last updated: 2026-09-25

## Current situation

- Authoritative `main` is `e254dc46349f21360386b4efeb498bb461f62719`, including merged PR #85 / Issue #84 (closed). **A-75-03 is corrected at the application level** (D-068); production environment overrides and upstream proxy/CDN body limits are **not yet verified**.
- Issue #86 / draft PR #87 owns **A-75-05**. The currency policy is **accepted as D-069**: optional; trimmed; empty omitted; exactly three ASCII letters when supplied; lowercase/mixed case accepted and stored in canonical uppercase; no ISO catalogue, FX, or amount/currency co-requirement; existing Candidate compensation unchanged.
- **A-75-05 is not corrected on `main` until PR #87 merges.**
- Still outstanding in Issue #75: **A-75-06/07** and **A-75-08**, plus fresh EN/FR responsive browser evidence. R-039 is unchanged.

## Next concrete action

1. Final review of PR #87 at its latest exact head with green Actions; do not merge automatically.
2. After merge, mark D-069 merged, A-75-05 and R-043 corrected, and update Issue #75.
3. Verify production D-068 transport limits operationally; implement A-75-06/07 and A-75-08 on dedicated branches.

## Issue #86 completion conditions

- Shared contract, browser validation, request construction, new Candidate, and application snapshot apply D-069; malformed direct input gets the generic 400 with no side effects and no echo.
- Existing Candidate compensation and currency stay untouched; D-066 cents and historical rows unchanged.
- EN/FR web tests, contract tests, disposable PostgreSQL integration tests, and exact-head GitHub Actions pass.
- PR stays open, draft, and unmerged until maintainer merge; no deployment.
