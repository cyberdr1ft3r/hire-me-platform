# Current Agent Handoff

Last updated: 2026-08-28

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, #19, #21, #23, #25, #27, and #29 are complete and merged on `main`.
- Issue #29 / PR #30 implemented the internal offer-to-placement lifecycle. PR #30 merged as commit `249bca8a0fa1a7619dc5f7bbcff44034b5457cc0`.
- Final blocking-fix commit `440ea9cb3dec204f0e2308eeb7c02cf4dcae4822` retired the legacy integration-counting path. Final-head GitHub Actions run `31719561145` passed all jobs.
- Offer-backed `MissionPlacement` is the authoritative counted-placement record. Offer acceptance alone does not count placement.
- Generic `MissionCandidate` transition into `INTEGRATED` is blocked and requires the dedicated offer-backed placement action.
- The legacy `confirm-integration` route is compatibility-only and returns `PLACEMENT_OFFER_CONFIRMATION_REQUIRED`; it must not increment `filledPlacementCount`, create `MissionPlacement`, or infer an offer version.
- Historical `MissionCandidate.placementConfirmedAt` metadata must not be silently converted into fabricated offer-backed placements. Any future reconciliation must be explicit and audited.
- Issue #33 / PR #34 reconciled project memory after the Issue #29 / PR #30 merge.
- Issue #31 is implemented in draft PR #32 on branch `feat/task-management`. Blocking-review fixes are locally validated and await final pushed-head CI/review.
- The branch implements authenticated internal task management only: task ownership, multiple assignees, lifecycle, comments, explicit mentions, durable in-app reminders, task-generated notifications, searchable/filterable task lists, own-notification read/read-all/archive controls, permission-aware UI, safe audit, and domain history.
- The implementation must not add candidate accounts, public task access, private messages/groups, email, WhatsApp, calendar, browser/mobile push, recurring templates, AI, accounting, payroll, training, document generation, or a global UI redesign.
- The approved direction remains an authenticated internal Hire Me platform plus bounded unauthenticated public opportunity/application links. Candidates do not have accounts or dashboards.

## Next Action

Push the Issue #31 blocking-review fixes to PR #32, update the draft PR description with the final head SHA and final CI run, confirm GitHub Actions on the exact pushed head, and keep the draft PR unmerged until approved.

For Issue #31, preserve these boundaries:

- `tasks:view` must not expose all internal tasks. It is scoped to owner, creator, active assignee, or implemented linked-record scope.
- `tasks:view_all` is the explicit broad oversight permission.
- Mentions and reminders must not silently grant access; recipients and mentioned users must already be able to view the task.
- Task comments, audit metadata, notification summaries, and event summaries must not include confidential candidate, HR, salary, client, commercial, internal-note, or comment-body payloads.
- Linked task context must be authorized before task creation/update; rejected actions must not leave partial task rows, events, reminders, notifications, or audit logs.
- Owner changes use the dedicated owner-change action/event/notification path.
- Moving a task to `IN_PROGRESS` requires at least one active `TaskAssignment`.
- Durable reminder workers must use PostgreSQL row claiming, composite task/recipient reminder idempotency, and idempotent notification keys.
- Completing, canceling, or archiving a task cancels irrelevant pending/failed reminders.
- `Task.assigneeUserId` is a legacy compatibility field; normalized multi-assignee state lives in `TaskAssignment`.
- Do not reopen or modify Issue #29 / PR #30 placement behavior.
- Do not count placements without offer-backed `MissionPlacement` confirmation.
- Do not add candidate accounts, public offer acceptance, payroll, invoice/accounting implementation, or unrelated business modules.
- Keep task management scoped to ownership, assignees, priority, due dates, status, context links, reminders, comments, mentions, notifications, and audit history as approved by the issue.
- Keep the authenticated internal platform and bounded unauthenticated public opportunity/application surface intact.

## Verification Notes

Issue #29 final validation passed before merge: PostgreSQL Docker Compose health on `127.0.0.1:55432`, `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice after reset, focused affected PostgreSQL tests with 13 tests passing, full `pnpm.cmd test:db` with 77 PostgreSQL integration tests passing, `pnpm.cmd check:architecture`, Mermaid CLI rendering for all 13 documentation diagrams, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, and `git diff --check`. GitHub Actions run `31719561145` passed all jobs on the final PR #30 head.

PR #32 previous head `894bef7d0aa172fc59639a5f63a1d4209c97f5f1` had green CI run `31858677312`, but the review identified unresolved blockers. The blocking-review fixes have now passed local validation: `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd check:architecture`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, `pnpm.cmd format:check`, `git diff --check`, focused `tasks.integration.test.ts` with 11 tests passing, `pnpm.cmd --filter @hire-me/web test` with 20 tests passing, and clean-reset full `pnpm.cmd test:db` with 88 PostgreSQL integration tests passing. Final GitHub Actions must still pass on the pushed head.

## Mandatory Rehydration Checklist For Every New Agent

Before working:

- Read `AGENTS.md`.
- Read `PROJECT_MEMORY.md`.
- Read `docs/project/STATUS.md`.
- Read `docs/project/DECISIONS.md`.
- Read this handoff.
- Read the full assigned issue and all comments.
- Inspect relevant merged documentation and active pull requests.
- Load all materially applicable project skills, including `project-memory`.
- State the active skills and current source-of-truth understanding.

Before finishing:

- Update `STATUS.md`.
- Replace this handoff with the next concrete action.
- Update the decision and risk logs when applicable.
- Link the issue or pull request that supports changes.
- Report checks performed and remaining blockers.
