# Current Agent Handoff

Last updated: 2026-10-05

## Current situation

- Latest `main` is `d75b329` (Issue #117 UI-DNA v1.1 interaction grammar merged through PR #137; D-082 `BoundedCombobox` reference + docs).
- Issue #116 stacked master-detail reveal/focus in review on PR #138; browser evidence **PASS** at 800/430/390 EN/FR (see `docs/audit/issue-116-stacked-master-detail-evidence.md`).
- Issue #109 / #110 non-blocking; D-068 / D-070 operational items still open.

## Next concrete action

1. **Issue #116:** complete PR #138 review after latest-main integration; exact-head CI green on integrated head.
2. Continue bounded module migrations per #117 adoption matrix (picker unify, Clients read/edit, #118 Missions IA).
3. Preserve Issue #93 / #105 catalog guarantees in all integration fixtures.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
