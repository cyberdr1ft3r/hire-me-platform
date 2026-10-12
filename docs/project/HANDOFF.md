# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **D-068 / D-070:** production-readiness runbook is `RUNBOOK_READY`; no production inspection/migration has run. D-070 recovery explicitly handles possible partial Prisma v6 PostgreSQL migration application; do not assume a canceled migration rolled back both ALTER statements.

- **Messaging V1 preflight:** PR #165, **D-087 Proposed**. Architecture reviewed: internal-only membership scope; FINANCE_MANAGER included; CLIENT_USER grants must be removed; 15-minute auditable edits; 50-member groups; moderation deferred; exclusive late-join history boundary; no purge engine in V1, with retention policy required before broad production rollout.

- **R-036 Task reminder scheduler:** PR #166 preflight rebased onto current main; **D-088 Proposed**. Architecture review accepted the one-shot DB-coordinated worker direction with maintainer decisions: lost recipient access → CANCELED; retry 5 attempts with 1/5/15/60-minute backoff; manual global processor requires `tasks:reminders:manage` + `tasks:view_all`; clearing `dueAt` behavior unchanged. No production code/schema/migration in the preflight.

- **Issue #163** (R-050/R-051): **draft PR #164** — bounded Finance visibility preflight; **D-086 Proposed**; exact-head CI evidence on the PR (not duplicated here).
- **Issue #132 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.
- **Missions #110 epic:** closed on `main` after **#159** / PR **#160**.

## Next concrete action

- **D-068 operator inspection:** execute only the runbook's read-only topology/config checks and synthetic honeypot probe matrix under an approved production session; record sanitized evidence.
- **D-070 production migration:** only after a named release/window, verified backup, exact pending migration list, and prechecks. Migrate DB before deploying a D-070 build; on any failure/cancel, inspect for partial schema before `migrate resolve` or retry.

- Implement messaging PR A only after PR #165 merges: fail-closed/lossless migration of dormant conversation tables, contracts/access layer, exclusive history boundary, CLIENT_USER grant removal, FINANCE_MANAGER grant addition, and DB constraint/concurrency evidence. No routes in PR A.

- Implement R-036 PR A only after PR #166 merges: per-reminder delivery transactions, UTC clock, bounded retry, recipient eligibility cancellation, overdue starvation fix, and manual endpoint auth tightening. PR B adds the runner; PR C adds deployment/audit evidence.

1. Review and merge **Issue #163** preflight PR when exact-head CI is green and ChatGPT architecture review passes.
2. Open/implement follow-up issue for **D-086** (permission + predicates + bounded option endpoints + regression matrix) — **do not** grant `missions:view` to Finance.
3. Maintainer C2 Barid outreach (#147) remains parallel.

## Preserved unrelated follow-ups

- **R-050 / R-051:** shared boundary; preflight artifact `docs/design/issue-163-finance-mission-context-preflight.md`.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
