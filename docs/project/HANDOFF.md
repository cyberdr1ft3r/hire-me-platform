# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **Issue #150–#156:** **complete** on `main` (PRs **#151**, **#153**, **#155**, **#157**).
- **Issue #159** (final **#110** child): Missions read-only persona decision — **draft PR #160**; implementation and authorization correction accepted by maintainer review; no seeded production Missions viewer role; permission-derived `readOnly`; canonical `MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS`; complete `MISSIONS_WRITE_PERMISSIONS` (33 mutations, web classification only). The [PR #160 body](https://github.com/cyberdr1ft3r/hire-me-platform/pull/160) is authoritative for exact-head commit SHA, GitHub Actions run ID, and CI result (not duplicated here to avoid stale pins).
- **Issue #110:** **open** until maintainer merge of **#159** / PR **#160** and verification; **no remaining scoped V1+ child work** after #159.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Merge **Issue #159** / PR **#160** when exact-head CI on the PR head is green and final review is complete (maintainer action; agent does not merge).
2. Maintainer closes **#110** as completed after **#159** merge and verification (agent does not close).

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
