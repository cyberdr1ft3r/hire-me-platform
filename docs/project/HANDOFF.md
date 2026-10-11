# Current Agent Handoff

Last updated: 2026-10-11

## Current situation

- **Issue #150:** **complete** — merged via PR **#151** on `main`.
- **Issue #152:** **complete** — merged via PR **#153** on `main` as `13a1134`; bounded placement confirmation is implemented and **`placement_commercial_eligibility:update`** is server-enforced. **ADMIN** has update authority; **HR_MANAGER** remains confirm-only for eligibility.
- **Issue #154** (child of **#110**): inclusive Mission deadline range filters — active draft PR **#155**.
- **Issue #110:** **open** parent. Remaining after #154: closure-reason decision/UX and read-only Missions persona decision.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Complete final review of **Issue #154** draft PR **#155** after fresh exact-head CI; do not merge automatically.
2. Continue **#110** with separately scoped closure-reason decision/UX and read-only Missions persona work after #154.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
