# Current Agent Handoff

Last updated: 2026-08-15

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, #19, #21, #23, #25, #27, and #29 are complete and merged on `main`.
- Issue #31 is active on branch `feat/task-management`.
- The branch implements authenticated internal task management only: task ownership, multiple assignees, lifecycle, comments, explicit mentions, durable in-app reminders, task-generated notifications, permission-aware UI, safe audit, and domain history.
- The implementation must not add candidate accounts, public task access, private messages/groups, email, WhatsApp, calendar, browser/mobile push, recurring templates, AI, accounting, payroll, training, document generation, or a global UI redesign.
- The approved direction remains an authenticated internal Hire Me platform plus bounded unauthenticated public opportunity/application links. Candidates do not have accounts or dashboards.

## Next Action

Push `feat/task-management`, open a draft PR against `main` with `Closes #31`, confirm GitHub Actions, and keep the draft PR unmerged.

Check especially:

- `tasks:view` must not expose all internal tasks. It is scoped to owner, creator, active assignee, or implemented linked-record scope.
- `tasks:view_all` is the explicit broad oversight permission.
- Mentions and reminders must not silently grant access; recipients and mentioned users must already be able to view the task.
- Task comments, audit metadata, notification summaries, and event summaries must not include confidential candidate, HR, salary, client, commercial, internal-note, or comment-body payloads.
- Durable reminder workers must use PostgreSQL row claiming and idempotent notification keys.
- Completing, canceling, or archiving a task cancels irrelevant pending/failed reminders.
- `Task.assigneeUserId` is a legacy compatibility field; normalized multi-assignee state lives in `TaskAssignment`.

## Verification Notes

Completed locally for Issue #31:

- PostgreSQL Docker Compose health confirmed on `127.0.0.1:55432` because local port `5432` was already allocated.
- `pnpm.cmd prisma:validate`
- `pnpm.cmd prisma:generate`
- `pnpm.cmd prisma:migrate:deploy`
- `pnpm.cmd prisma:migrate:reset --force`
- `pnpm.cmd prisma:seed` twice after reset
- `pnpm.cmd test:db` with 82 PostgreSQL integration tests passing
- `pnpm.cmd --filter @hire-me/web test` with 20 web tests passing
- `pnpm.cmd check:architecture`
- Mermaid CLI rendering for all 14 documentation diagrams
- `pnpm.cmd format:check`
- `pnpm.cmd lint`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `pnpm.cmd build`
- `git diff --check`

Known local validation note:

- Root `pnpm.cmd build` initially hit the known Windows sandbox/esbuild access issue and passed when rerun outside the sandbox.
- Web tests still emit existing React `act(...)` warnings around asynchronous mission workspace state updates.

Still required before handoff completion:

- Review final diff for unrelated changes.
- Commit and push.
- Open draft PR for Issue #31.
- Update this file and `docs/project/STATUS.md` with the PR number, final head SHA, full local validation, and GitHub Actions status.

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
