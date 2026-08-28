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
- Issue #31 is implemented in draft PR #32 on branch `feat/task-management`. Latest follow-up review fixes are in progress and require final pushed-head CI/review.
- The branch implements authenticated internal task management only: task ownership, multiple assignees, lifecycle, comments, explicit mentions, durable in-app reminders, task-generated notifications, searchable/filterable task lists, own-notification read/read-all/archive controls, permission-aware UI, safe audit, and domain history.
- The implementation must not add candidate accounts, public task access, private messages/groups, email, WhatsApp, calendar, browser/mobile push, recurring templates, AI, accounting, payroll, training, document generation, or a global UI redesign.
- The approved direction remains an authenticated internal Hire Me platform plus bounded unauthenticated public opportunity/application links. Candidates do not have accounts or dashboards.

## Next Action

Push the latest Issue #31 follow-up review fixes to PR #32, update the draft PR description with the new head SHA and final CI run, confirm GitHub Actions on the exact pushed head, and keep the draft PR unmerged until approved.

For Issue #31, preserve these boundaries:

- `tasks:view` must not expose all internal tasks. Internal task visibility requires base `tasks:view` or explicit `tasks:view_all` plus owner, creator, active assignee, or implemented linked-record scope.
- `tasks:view_all` is the explicit broad oversight permission.
- Mentions and reminders must not silently grant access; recipients and mentioned users must already have task-view permission and record-level task visibility.
- Task comments, audit metadata, notification summaries, and event summaries must not include confidential candidate, HR, salary, client, commercial, internal-note, or comment-body payloads.
- Linked task context must be authorized before task creation/update; rejected actions must not leave partial task rows, events, reminders, notifications, or audit logs.
- Owner changes use the dedicated owner-change action/event/notification path.
- Moving a task to `IN_PROGRESS` requires at least one active `TaskAssignment`.
- Durable reminder workers must use a consistent task-then-reminder lock order, composite task/recipient reminder idempotency, event-scoped notification idempotency, and explicit reminder state transitions.
- Sent reminders must not become pending or canceled through stale update/cancel requests.
- Notification read-all is unread-only by contract.
- Completing, canceling, or archiving a task cancels irrelevant pending/failed reminders.
- `Task.assigneeUserId` is a legacy compatibility field; normalized multi-assignee state lives in `TaskAssignment`.
- Do not reopen or modify Issue #29 / PR #30 placement behavior.
- Do not count placements without offer-backed `MissionPlacement` confirmation.
- Do not add candidate accounts, public offer acceptance, payroll, invoice/accounting implementation, or unrelated business modules.
- Keep task management scoped to ownership, assignees, priority, due dates, status, context links, reminders, comments, mentions, notifications, and audit history as approved by the issue.
- Keep the authenticated internal platform and bounded unauthenticated public opportunity/application surface intact.

## Verification Notes

Issue #29 final validation passed before merge: PostgreSQL Docker Compose health on `127.0.0.1:55432`, `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice after reset, focused affected PostgreSQL tests with 13 tests passing, full `pnpm.cmd test:db` with 77 PostgreSQL integration tests passing, `pnpm.cmd check:architecture`, Mermaid CLI rendering for all 13 documentation diagrams, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, and `git diff --check`. GitHub Actions run `31719561145` passed all jobs on the final PR #30 head.

PR #32 head `18437526ea00bec67072de0ec4535d8eb5628bf0` had green CI run `33211577299`, but a follow-up review identified additional authorization, notification idempotency, and reminder concurrency blockers. Latest local non-DB checks passed: `pnpm.cmd prisma:validate`, `pnpm.cmd check:architecture`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, and `pnpm.cmd format:check`. Local PostgreSQL integration validation is blocked because Docker Desktop service is stopped and this session cannot start it. The new pushed head must pass GitHub Actions database migration/seed/integration tests and quality checks.

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
