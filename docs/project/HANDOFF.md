# Current Agent Handoff

Last updated: 2026-10-08

## Current situation

- **Issue #145 (Phase C):** Final **first-party Barid evidence pass** completed on branch `cursor/issue-145-barid-feasibility-909e` (PR #146) — PC/DPC v6.0, CGUs, PKI disclosure, PIN/Go>Sign guides, trust chain, CRL/OCSP URLs, TSA docs incorporated; **D-085 Proposed**; **Ready for provider implementation: NO**.
- **Issue #143 / D-084:** merged on **`main`** (`0b8da9aa71055249a85831309229e5ef36d53e11` at #145 creation).
- **Issue #141 / D-083:** merged on `main`.
- **Issue #132:** remains **open** (parent epic).

## Next concrete action

1. **Maintainer / ChatGPT review** of PR #146 after fresh exact-head CI on the new commit.
2. If accepted, **send §18 minimal Barid questionnaire** (integration + fixtures + test token only).
3. Obtain **sanitized person/seal signed PDFs** and optional **integrator test token**; run **Phase B prepared-artifact compatibility** proof before any Route A pilot or adapter work.

**Ready for provider implementation: NO** (see [feasibility doc](../design/issue-145-barid-esign-feasibility.md) executive summary).

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- Issue **#109** flaky mission-candidate race test (non-blocking).
- Issue **#110** Missions follow-ups.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
