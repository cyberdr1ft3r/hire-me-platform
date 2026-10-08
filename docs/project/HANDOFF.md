# Current Agent Handoff

Last updated: 2026-10-08

## Current situation

- **Issue #145 (Phase C):** Barid eSign **feasibility / evidence** on branch `cursor/issue-145-barid-feasibility-909e` — docs-only deliverable + **D-085 Proposed**; draft PR for maintainer review.
- **Issue #143 / D-084:** merged on **`main`** (`0b8da9aa71055249a85831309229e5ef36d53e11` at #145 creation).
- **Issue #141 / D-083:** merged on `main`.
- **Issue #132:** remains **open** (parent epic).

## Next concrete action

1. **ChatGPT / maintainer review** of Issue #145 draft PR and [issue-145-barid-esign-feasibility.md](../design/issue-145-barid-esign-feasibility.md).
2. **Send Barid questionnaire** (feasibility doc §16); request **test USB token** and **sanitized signed PDF fixtures** (person + organization seal).
3. **Do not merge** provider adapter or native bridge until **prepared-artifact compatibility** is proven with Phase B validator on Barid fixtures.

**Ready for provider implementation: NO** (see feasibility doc executive summary).

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- Issue **#109** flaky mission-candidate race test (non-blocking).
- Issue **#110** Missions follow-ups.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
