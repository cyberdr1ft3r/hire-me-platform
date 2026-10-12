# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **D-068 / D-070:** production-readiness runbook is `RUNBOOK_READY`; no production inspection/migration has run. D-070 recovery explicitly handles possible partial Prisma v6 PostgreSQL migration application; do not assume a canceled migration rolled back both ALTER statements.

- **Messaging V1 preflight:** PR #165, **D-087 Proposed**. Architecture reviewed: internal-only membership scope; FINANCE_MANAGER included; CLIENT_USER grants must be removed; 15-minute auditable edits; 50-member groups; moderation deferred; exclusive late-join history boundary; no purge engine in V1, with retention policy required before broad production rollout.

- **R-036 Task reminder scheduler:** **D-088 Accepted.** PR A merged (#173). **Issue #176 PR B (draft):** `pnpm --filter @hire-me/api reminders:run-due` standalone runner; no systemd/runbook/AuditLog yet. R-036 stays open until PR C.

- **Issue #163** (R-050/R-051): preflight merged via PR #164 (**D-086**).
- **Issue #168** (D-086 backend): **draft PR open, not merged** — `recruitment_financial_context:view` for `FINANCE_MANAGER`, shared financial mission scope across Commercial/Accounting/Documents/Generation/signing rechecks, bounded `financial-context` option routes, PostgreSQL security suite `apps/api/test/finance-recruitment-context.integration.test.ts`. No migration.
- **Issue #132 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.
- **Missions #110 epic:** closed on `main` after **#159** / PR **#160**.

## Next concrete action

- **Issue #182 (R-049):** draft PR implements external Training participant management, EXTERNAL enrollment UI, and Training program/session deep links; review exact-head CI and ChatGPT architecture/security review when green.

- **D-068 operator inspection:** execute only the runbook's read-only topology/config checks and synthetic honeypot probe matrix under an approved production session; record sanitized evidence.
- **D-070 production migration:** only after a named release/window, verified backup, exact pending migration list, and prechecks. Migrate DB before deploying a D-070 build; on any failure/cancel, inspect for partial schema before `migrate resolve` or retry.

- Implement messaging PR A only after PR #165 merges: fail-closed/lossless migration of dormant conversation tables, contracts/access layer, exclusive history boundary, CLIENT_USER grant removal, FINANCE_MANAGER grant addition, and DB constraint/concurrency evidence. No routes in PR A.

- **R-036 PR B (Issue #176):** review draft PR when exact-head CI passes. **PR C:** scheduler runbook, per-tick AuditLog with null actor, lag/backlog fields, deployed staging evidence; only then close R-036.

1. Security/architecture review of the **Issue #168** draft PR on its exact-head CI; on reviewed merge mark **D-086 Accepted** and R-050 mitigated.
2. After backend acceptance, open the separate web issue: Commercial/Accounting pickers use the `financial-context` routes when the actor holds `recruitment_financial_context:view` and lacks `missions:view`; keep `/v1/missions` for recruitment roles.
3. R-051 Training remainder (training expense contexts / profitability for Finance) needs its own decision; not in #168.
4. Maintainer C2 Barid outreach (#147) remains parallel.

## Preserved unrelated follow-ups

- **R-050 / R-051:** backend mitigation on the Issue #168 draft PR; R-051 Training remainder open. Preflight artifact `docs/design/issue-163-finance-mission-context-preflight.md`.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
