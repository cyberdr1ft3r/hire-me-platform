# Current Agent Handoff

Last updated: 2026-10-08

## Current situation

- **Issue #147 (C2):** Provider engagement package on branch `cursor/issue-147-barid-c2-fixtures-909e` — [C2 runbook](../design/issue-147-barid-c2-provider-engagement.md). **State:** `READY_TO_CONTACT_PROVIDER`. **Questionnaire sent:** NO. **Fixtures / Route A proof:** BLOCKED.
- **Issue #145 / D-085:** Accepted on `main` (sequencing: manual desktop proof before adapter).
- **Issue #143 / D-084**, **#141 / D-083:** merged on `main`.
- **Issue #132:** **open**.

## Next concrete action

1. **Human:** Send French cover + technical questionnaire to **ServiceClient@poste.ma** (subject: intégration logicielle tierce); use phone **080 200 60 60** for routing to integration/commercial if needed.
2. Update C2 state to `WAITING_ON_PROVIDER` and tracking table when sent/responses arrive.
3. On sanitized PDFs and/or test token: run [compatibility test plan](../design/issue-147-barid-c2-provider-engagement.md#8-compatibility-test-plan-execute-when-fixturestoken-exist); classify Route A PASS/FAIL/BLOCKED.

**Ready for provider implementation: NO**

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- Issue **#109:** PR #149 deterministic mission/candidate archival vs MissionCandidate create race test is maintainer-accepted; merge if still open. No production behavior change.
- Issue **#110:** next unblocked Missions V1+ follow-up after #109 merge.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
