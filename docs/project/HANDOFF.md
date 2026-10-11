# Current Agent Handoff

Last updated: 2026-10-11

## Current situation

- **Issue #150–#156:** **complete** on `main` (PRs **#151**, **#153**, **#155**, **#157**).
- **Issue #159** (final **#110** child): Missions read-only persona decision — **draft PR open**; no new seeded production role; canonical synthetic permission bundle documented and tested.
- **Issue #110:** **open** until maintainer final review/merge of **#159**; **no remaining scoped V1+ child work** after #159.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Review and merge **Issue #159** draft PR when exact-head CI is green and ChatGPT final review passes.
2. Maintainer closes **#110** as completed after **#159** merge and verification (agent does not close).

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
