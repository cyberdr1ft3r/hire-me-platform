# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **Issue #163** (R-050/R-051): **draft PR #164** — bounded Finance visibility preflight; **D-086 Proposed**; exact-head CI evidence on the PR (not duplicated here).
- **Issue #132 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.
- **Missions #110 epic:** closed on `main` after **#159** / PR **#160**.

## Next concrete action

1. Review and merge **Issue #163** preflight PR when exact-head CI is green and ChatGPT architecture review passes.
2. Open/implement follow-up issue for **D-086** (permission + predicates + bounded option endpoints + regression matrix) — **do not** grant `missions:view` to Finance.
3. Maintainer C2 Barid outreach (#147) remains parallel.

## Preserved unrelated follow-ups

- **R-050 / R-051:** shared boundary; preflight artifact `docs/design/issue-163-finance-mission-context-preflight.md`.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
