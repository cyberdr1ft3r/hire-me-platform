# Current Agent Handoff

Last updated: 2026-09-12

## Current situation

- Authoritative `main` is `077024b96346229368cf88dd264c6d4d91931564`, including merged Public Opportunity PR #63. The Issue #52 representative milestone is complete.
- Issue #64 redesigns Tasks on `design/task-pipeline-v1`, created from that exact `main`. Keep its PR draft, open, unmerged, and undeployed. Do not start Clients or Missions.
- This is presentation/localization work. No contract, Prisma schema, lifecycle, visibility, assignment, reminder, comment, due-date, audit, or archive rule changed.
- Task code moved from the legacy block in `App.tsx` into `apps/web/src/tasks/`. `TasksPanel` owns API work, permission-derived access, filters, selection, concurrency, and mutations; `TaskWorkspace` is the real presentation component.
- The web client adds calls for the already-existing task detail, update, and archive endpoints. Existing task, comment, reminder, assignment, transition, and notification bodies remain contract-parsed and language-neutral.
- One synchronous global write lock prevents overlapping mutation requests. List, detail, and notification reads use monotonic request guards. Task-scoped results are committed only for the captured selection/session; post-write list refreshes use the latest applied filters.
- Tasks is bilingual under `task.*`, `domain.taskStatus`, and `domain.taskPriority`. It has left `deferredEnglishRoutes`; same-mount locale switching does not refetch or clear an open create form.
- Development-only `apps/web/task.html` renders the real Task presentation, `I18nProvider`, and `AppShell` with synthetic data. It is not linked from navigation and is excluded from the normal production build.

## Review target

Run `pnpm --filter @hire-me/web dev`, then open `http://127.0.0.1:5173/task.html`.

Review the queue/detail hierarchy, supported filters, status/priority labels, assignees, due/overdue text, comments, reminders, edit/create forms, notification controls, loading/empty/error/success states, and permission-hidden actions. Check EN/FR at 1440×900, 1024×768, 900×900, 800×900, 430×844, and 390×844; at 390 also check the closed and open AppShell drawer. Whole-page `scrollWidth` must equal `clientWidth` at each width.

## Completion conditions

- Every Issue #64 validation command and exact-head GitHub Actions run is green.
- Task and notification contracts, permissions, lifecycle, scope, assignment, due-date, comment, reminder, audit, and archive semantics remain unchanged.
- The production build contains only `index.html`, not `task.html`.
- The Task PR remains draft, open, unmerged, and undeployed.
- Technical and visual reviewers accept the implementation or request a bounded correction.

## Explicit hard stop

Do not begin Clients, Missions, UI-DNA v1.1, a global visual-identity refinement, backend task expansion, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #64, its PR review history, and the project-memory files.
- Fetch `origin`; verify exact base, branch head, draft PR state, and exact-head CI.
- Keep corrections inside `apps/web/src/tasks`, `apps/web/src/task-preview`, `apps/web/task.html`, bounded Task API client methods, Task translations/tests, and project documentation unless a separately reported backend/product defect requires a new issue.
