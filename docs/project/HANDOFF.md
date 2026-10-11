# Current Agent Handoff

Last updated: 2026-10-11

## Current situation

- **Issue #150 / #152 / #154:** **complete** on `main` (PRs **#151**, **#153**, **#155**).
- **Issue #156** (child of **#110**): lifecycle-valid mission closure UX — **draft PR open**; structured closure reasons unchanged; derived mapping only.
- **Issue #110:** **open** parent; after **#156**, only the read-only Missions persona decision remains.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Review and merge **Issue #156** draft PR when exact-head CI is green and ChatGPT final review passes.
2. Decide/read-only Missions persona scope as the final **#110** child after #156.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
