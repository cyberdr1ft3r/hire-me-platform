# Current Agent Handoff

Last updated: 2026-10-05

## Current situation

- Latest `main` is `1ea34d5` (Issue #124 My Agenda + meetings foundation merged through PR #136).
- Issue #117 (UI-DNA v1.1 interaction grammar) in review on PR #137; `BoundedCombobox` reference + docs; legacy search+select pickers not migrated in this PR.
- Issue #109 / #110 non-blocking; D-068 / D-070 operational items still open.

## Next concrete action

1. **Issue #117:** merge draft PR after review; then bounded module PRs per adoption matrix (picker unify, Clients read/edit, #116 reveal/focus, #118 Missions IA).
2. Preserve Issue #93 / #105 catalog guarantees in all integration fixtures.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
