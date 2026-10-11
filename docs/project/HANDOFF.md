# Current Agent Handoff

Last updated: 2026-10-11

## Current situation

- **Issue #150:** **complete** — merged via PR **#151** on `main`.
- **Issue #152** (child of **#110**): bounded placement confirmation form + **`placement_commercial_eligibility:update`** — draft PR **#153**; server enforces confirm-only `false` vs update-authorized `true`; **ADMIN** seeded with update; **HR_MANAGER** remains confirm-only for eligibility.
- **Issue #110:** **open** parent for remaining Missions V1+ items.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Review and merge **Issue #152** draft PR **#153** when exact-head CI is green and ChatGPT final review passes.
2. Continue **#110** with next scoped children (deadline filters, closure reason, read-only persona) after #152.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
