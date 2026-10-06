# Current Agent Handoff

Last updated: 2026-10-06

## Current situation

- Latest `main` is **`29101c2`** (includes merged #132 preflight PR #134 and prior milestones).
- **Issue #141 (Phase A):** provider-neutral signing domain on branch `cursor/issue-141-signing-foundation-909e` (draft PR #142, head `95ed1f2`) — exact-head CI run `37496219044` green (quality + D-071 pass 1/2 + catalog + refusal). **No** provider/crypto/SIGNED UX.
- **Issue #132:** remains **open** (parent epic); Barid/provider confirmation still blocks provider-specific work (Phase C+).

## Next concrete action (Issue #141)

1. Review draft PR for Phase A: D-083, migration constraints, permission matrix, D-071 integration coverage.
2. If accepted, merge Phase A; open **Phase B** (validation + SIGNED publication) as a separate issue/PR.
3. Do **not** merge provider adapters or localhost bridge until Barid answers from #132 preflight §11.

## Preserved unrelated follow-ups

- R-050: FINANCE_MANAGER mission-scope limits unchanged; signing must not grant `missions:view` as a workaround.
- Issue #109 flaky mission-candidate race test (non-blocking).
- D-068 production env/proxy verification; D-070 migration not deployed.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
