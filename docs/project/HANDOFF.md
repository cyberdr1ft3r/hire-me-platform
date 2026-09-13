# Current Agent Handoff

Last updated: 2026-09-13

## Current situation

- Authoritative `main` is `077024b96346229368cf88dd264c6d4d91931564`, including merged Public Opportunity PR #63. The Issue #52 representative milestone is complete.
- Issue #64 redesigns Tasks on `design/task-pipeline-v1`, draft PR #65. Keep it draft, open, unmerged, and undeployed. Do not start Clients or Missions.
- Drift audit Issue #66 is high priority. Technical review `5187700373` blockers and the Task drift items D-UX-01 to D-UX-04 are corrected on the PR and recorded in Issue #66; the next gate is the ChatGPT drift and technical re-review, then visual review.
- The default Task view is a lightweight board: one column per stored status (To do/`OPEN`, In progress, Waiting, Blocked, Completed). Canceled and archived work is in the compact list view. There is no drag and drop; a task moves through its detail drawer using server-allowed transitions and the server's reason rules.
- No operator types an ID. Owner, assignee, mention, and reminder-recipient choices use the new `GET /v1/tasks/user-options` (approved by the maintainer as the one API/contract change in this PR). Linked records use existing permission-gated lists. See D-062, R-037, and `docs/permissions.md`.
- Restored Issue #31 views with existing filters. Deferred: created-by-me (no API filter) and related-task links from Clients/Missions/Candidate workspaces (those modules are not started).
- Manual reminder delivery is a collapsed diagnostic for managers holding `tasks:reminders:manage` and `tasks:view_all`. No scheduler exists (R-036); a scheduler needs its own issue.
- `TasksPanel` owns every read, write, and guard: per-column board reads with a board generation, list and detail request numbers, a selection generation, session checks, an operation-owned global write lock, and a latest-filter ref for notifications. Presentation lives in `TaskWorkspace`, `TaskBoard`, `TaskListView`, `TaskFilters`, `TaskCreateForm`, `TaskDetail` (drawer), `TaskPickers`, and `TaskNotifications`.
- Development-only `apps/web/task.html` renders the real workspace with synthetic data; `?task=<id>` opens a task and `?view=list` starts in the list.

## Review target

Run `pnpm --filter @hire-me/web dev`, then open `http://127.0.0.1:5173/task.html`.

Review the board columns and cards, the column switcher on phones, the detail drawer (workflow move, edit, people selectors, comments with mentions, reminders, archive), the list view with pagination and closed statuses, filters (show, due, priority, sort, more filters), notifications, and the diagnostic. Check EN/FR at 1440, 1024, 900, 800, 430, and 390 px; whole-page `scrollWidth` must equal `clientWidth`.

## Completion conditions

- Every Issue #64 validation command and exact-head GitHub Actions run is green, including the PostgreSQL integration test for the people lookup.
- Existing Task and notification endpoints, permissions, lifecycle, scope, assignment, due-date, comment, reminder, audit, and archive semantics are unchanged.
- The production build contains only `index.html`.
- Issue #66 records KEEP, CORRECT, or DEFER for D-UX-01 to D-UX-04 and stays open.
- Technical and visual reviewers accept the implementation or request a bounded correction.

## Explicit hard stop

Do not begin Clients, Missions, UI-DNA v1.1, global visual-identity refinement, a reminder scheduler, further backend Task expansion, migration, deployment, or merge work. Do not smuggle unrelated drift fixes into this PR.

## Resume checklist

- Read `AGENTS.md`, Issue #64, Issue #66, PR #65 review history, and the project-memory files.
- Fetch `origin`; verify base, branch head, draft PR state, and exact-head CI.
- Keep corrections inside `apps/web/src/tasks`, `apps/web/src/task-preview`, `apps/web/task.html`, the Task API client methods, the people lookup (`apps/api/src/tasks`, `packages/contracts/src/tasks.ts`, `apps/api/test/tasks.integration.test.ts`), Task translations and tests, and project documentation.
