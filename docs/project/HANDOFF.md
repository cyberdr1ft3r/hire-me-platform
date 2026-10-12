# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **D-068 / D-070:** production-readiness runbook is `RUNBOOK_READY`; no production inspection/migration has run. D-070 recovery explicitly handles possible partial Prisma v6 PostgreSQL migration application; do not assume a canceled migration rolled back both ALTER statements.

- **Messaging V1:** preflight PR #165 merged (**D-087 Proposed**); PR A foundation implemented under Issue #171 (draft PR, pending review). Parent #170 open. Architecture reviewed: internal-only membership scope; FINANCE_MANAGER included; CLIENT_USER grants must be removed; 15-minute auditable edits; 50-member groups; moderation deferred; exclusive late-join history boundary; no purge engine in V1, with retention policy required before broad production rollout.

- **R-036 Task reminder scheduler:** **D-088 Accepted.** PR A merged (#173). **Issue #176 PR B (draft):** `pnpm --filter @hire-me/api reminders:run-due` standalone runner; no systemd/runbook/AuditLog yet. R-036 stays open until PR C.

- **Issue #163** (R-050/R-051): **draft PR #164** — bounded Finance visibility preflight; **D-086 Proposed**; exact-head CI evidence on the PR (not duplicated here).
- **Issue #132 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.
- **Missions #110 epic:** closed on `main` after **#159** / PR **#160**.

## Next concrete action

- **Issue #182 (R-049):** draft PR implements external Training participant management, EXTERNAL enrollment UI, and Training program/session deep links; review exact-head CI and ChatGPT architecture/security review when green.

- **D-068 operator inspection:** execute only the runbook's read-only topology/config checks and synthetic honeypot probe matrix under an approved production session; record sanitized evidence.
- **D-070 production migration:** only after a named release/window, verified backup, exact pending migration list, and prechecks. Migrate DB before deploying a D-070 build; on any failure/cancel, inspect for partial schema before `migrate resolve` or retry.

- **Messaging PR A (Issue #171):** draft PR open, not merged. Review migration `20261012170000_messaging_foundation` (fail-closed legacy gate, CHECKs, append-only `MessageRevision`, grant reconciliation), `MessagingAccessService`, and contracts. After merge: open PR B (routes `/v1/messages/*`, picker, send/read/edit/withdraw, audit, stated rate-limit scope) using the access helpers, and keep every write Conversation-lock-first. Before any production deploy, run `apps/api/diagnostics/messaging-legacy-rows.sql`; if any count is non-zero follow `docs/runbooks/messaging-legacy-rows.md`.

- **R-036 PR B (Issue #176):** review draft PR when exact-head CI passes. **PR C:** scheduler runbook, per-tick AuditLog with null actor, lag/backlog fields, deployed staging evidence; only then close R-036.

1. Review and merge **Issue #163** preflight PR when exact-head CI is green and ChatGPT architecture review passes.
2. Open/implement follow-up issue for **D-086** (permission + predicates + bounded option endpoints + regression matrix) — **do not** grant `missions:view` to Finance.
3. Maintainer C2 Barid outreach (#147) remains parallel.

## Preserved unrelated follow-ups

- **R-050 / R-051:** shared boundary; preflight artifact `docs/design/issue-163-finance-mission-context-preflight.md`.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
