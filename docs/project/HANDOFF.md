# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **R-036 Task reminder scheduler:** PR A (#173) and PR B (#177) merged on `main`. **Issue #178 PR C (draft):** operations runbook, AuditLog + lag observability, example systemd templates, UI diagnostic wording. **Staging evidence: BLOCKED / NOT EXECUTED** — see `docs/runbooks/task-reminder-scheduler-staging-evidence.md`. Do **not** close R-036 until staging checklist is satisfied on a real host.

- **D-068 / D-070:** runbook `RUNBOOK_READY`; no production execution.

- **Messaging V1:** **D-087 Proposed** (PR #165 preflight). **Issue #171 PR A merged (#174).** **Issue #179 PR B (draft):** `/v1/messages` API, picker, PRIVATE/GROUP lifecycle, send/read/edit/withdraw, metadata-only audit, in-process abuse limits; route-level suite `apps/api/test/messaging-api.integration.test.ts`. No migration, no UI.

- **Issue #163** (R-050/R-051): preflight merged via PR #164 (**D-086**).
- **Issue #168** (D-086 backend): **Accepted; implemented/reviewed in PR #175** — `recruitment_financial_context:view` for `FINANCE_MANAGER`, shared financial mission scope across Commercial/Accounting/Documents/Generation/signing rechecks, bounded `financial-context` option routes, PostgreSQL security suite `apps/api/test/finance-recruitment-context.integration.test.ts`. No migration. Web follow-up: Issue #180.
- **Issue #132 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.
- **Missions #110 epic:** closed on `main` after **#159** / PR **#160**.

## Next concrete action

1. Re-review **Issue #178** draft PR #181 (material `failureNotRecorded`, deployment-neutral systemd template/runbook, latest `main` merged) when exact-head CI is green.
2. On staging: deploy timer + worker, capture sanitized evidence per runbook staging gate, then mark R-036 mitigated/closed.
3. Optional future: dedicated PostgreSQL worker role after query footprint sign-off.

- **Issue #182 (R-049):** draft PR implements external Training participant management, EXTERNAL enrollment UI, and Training program/session deep links; review exact-head CI and ChatGPT architecture/security review when green.

- **Issue #179 (Messaging PR B):** architecture/security review of the draft PR when exact-head CI is green. Review points: sends are audited (Issue #179 lists "message sent"; preflight §9 said not); archived groups also refuse leave; the picker needs both messaging permissions. After merge: web PR C (Messages workspace, unread badge via `GET /v1/messages/unread-summary`). Before any production deploy, run `apps/api/diagnostics/messaging-legacy-rows.sql`; on any non-zero count follow `docs/runbooks/messaging-legacy-rows.md`. Broad rollout still needs an approved retention policy.

- **D-068 operator inspection:** execute only the runbook's read-only topology/config checks and synthetic honeypot probe matrix under an approved production session; record sanitized evidence.
- **D-070 production migration:** only after a named release/window, verified backup, exact pending migration list, and prechecks. Migrate DB before deploying a D-070 build; on any failure/cancel, inspect for partial schema before `migrate resolve` or retry.

## Completion conditions for R-036 close

- PR C merged and reviewed.
- Staging evidence checklist in `docs/runbooks/task-reminder-scheduler.md` completed with real (sanitized) proof.
- No fabricated `systemctl`/journal artifacts in Git.

## Issue #168 (D-086 backend) next actions

1. **D-086 backend is accepted** through Issue #168 / PR #175; preserve its financial-context-first union semantics and generic recruitment boundaries.
2. Continue **Issue #180**: Commercial/Accounting web pickers use the `financial-context` routes whenever the actor holds `recruitment_financial_context:view` (including hybrid actors who also hold `missions:view`); keep `/v1/missions` for recruitment-only roles.
3. R-051 Training remainder (training expense contexts / profitability for Finance) needs its own decision; not in #168.
4. Maintainer C2 Barid outreach (#147) remains parallel.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.
