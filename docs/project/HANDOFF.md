# Current Agent Handoff

Last updated: 2026-10-07

## Current situation

- **Issue #143 (Phase B):** draft **PR #144** on `cursor/issue-143-validation-publication-909e` — final security corrections (PKI.js trust path, SERIALIZABLE acceptance, transaction-scoped permissions) complete; **D-084 Proposed**; exact-head CI green on latest head (do not merge automatically).
- **Issue #132:** remains **open** (parent epic); Barid/provider/token/UX remain Phase C+.
- **Issue #141 / D-083:** merged on `main` via PR #142.
- **D-084:** **Proposed** (not Accepted by agents).

## Next concrete action

**ChatGPT maintainer final review / merge decision for PR #144** (Phase B). **#132** remains open; Phase C separate; **D-084** stays Proposed until maintainer acceptance; no production deployment.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- Issue **#109** flaky mission-candidate race test (non-blocking).
- Issue **#110** Missions follow-ups.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
