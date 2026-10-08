# Current Agent Handoff

Last updated: 2026-10-08

## Current situation

- **Issue #145 (Phase C):** Barid eSign **feasibility / evidence** on branch `cursor/issue-145-barid-feasibility-909e` — maintainer found additional current first-party Barid PC/DPC/CGU/PIN/revocation/trust-chain publications that must be incorporated; **D-085 Proposed**; provider implementation remains blocked.
- **Issue #143 / D-084:** merged on **`main`** (`0b8da9aa71055249a85831309229e5ef36d53e11` at #145 creation).
- **Issue #141 / D-083:** merged on `main`.
- **Issue #132:** remains **open** (parent epic).

## Next concrete action

1. Complete the **current Barid first-party documentation pass** on PR #146: qualified-signature/seal PC, DPC, CGUs, qualified PIN lifecycle guides, revocation material, CRL/trust-chain publications.
2. Reclassify findings and remove questionnaire items already answered by official docs; keep only genuine provider gaps.
3. After maintainer acceptance, request the remaining items — especially **test token/signing sandbox** and **sanitized person/seal signed PDF fixtures** — then run Phase B compatibility proof. Do not implement a provider adapter/native bridge before those entry gates.

**Ready for provider implementation: NO** (see feasibility doc executive summary).

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- Issue **#109** flaky mission-candidate race test (non-blocking).
- Issue **#110** Missions follow-ups.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
