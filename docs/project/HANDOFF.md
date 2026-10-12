# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **Issue #150–#159:** **complete** on `main` (PRs **#151**, **#153**, **#155**, **#157**, **#160**).
- **Issue #159** (final **#110** child): complete via **PR #160**. Maintainer decision preserved: no seeded production Missions viewer role; permission-derived `readOnly`; canonical `MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS`; complete `MISSIONS_WRITE_PERMISSIONS` (33 mutations, web classification only).
- **Issue #110:** **complete / closed**. All scoped R-047 Missions V1+ follow-ups are finished; no remaining child work.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. No further action remains under **#110**.
2. Continue the existing **#147 Barid C2 provider-engagement** track; do not start provider-specific implementation until the documented evidence blockers are cleared.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
