# Current Agent Handoff

Last updated: 2026-09-25

## Current situation

- Authoritative `main` is `e254dc46349f21360386b4efeb498bb461f62719`, including merged PR #85 / Issue #84 (closed). **A-75-03 is corrected at the application level** (D-068); production environment overrides and upstream proxy/CDN body limits are **not yet verified**.
- Issue #86 / draft PR owns **A-75-05**: one optional public salary currency rule for browser and API. **A-75-05 is not corrected on `main` until that PR merges.**
- Proposed policy awaiting explicit review acceptance: trim; empty means omitted; otherwise exactly three ASCII letters, normalized to uppercase by the shared contract function `normalizePublicSalaryExpectationCurrency`. No decision entry is recorded until accepted.
- Still outstanding in Issue #75: **A-75-06/07** and **A-75-08**, plus fresh EN/FR responsive browser evidence. R-039 is unchanged.

## Next concrete action

1. Review the Issue #86 draft PR, including the uppercase-normalization choice versus rejecting lowercase; do not merge automatically.
2. When the policy is accepted, add the decision to `docs/project/DECISIONS.md` on the same PR before merge.
3. After merge, mark A-75-05 and R-043 corrected and update Issue #75.
4. Verify production D-068 transport limits operationally; implement A-75-06/07 and A-75-08 on dedicated branches.

## Issue #86 completion conditions

- Shared contract, browser validation, request construction, new Candidate, and application snapshot apply the same rule; malformed direct input gets the generic 400 with no side effects and no echo.
- Existing Candidate compensation and currency stay untouched; D-066 cents and historical rows unchanged.
- EN/FR web tests, contract tests, disposable PostgreSQL integration tests, and exact-head GitHub Actions pass.
- PR stays open, draft, and unmerged; no deployment.
