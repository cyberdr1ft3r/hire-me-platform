# Issue #219 — Agenda and Tasks page-system migration

Date: 2026-10-19  
Base: `main` `65791e7ef314091634b1e5b67a690a97fe9f4b51` (merged PRs #218 and #210)  
Scope: frontend presentation and composition only

## Preflight and architecture audit

Latest-main Actions run `39242964484` passed all four required jobs before implementation:
Quality checks, PostgreSQL Docker Compose health, PKCS#11 SoftHSM signing lab, and database
migration/seed/integration tests.

| Workspace | Existing implementation retained | Page-system migration | Scroll ownership retained |
| --- | --- | --- | --- |
| Agenda | `AgendaPanel` request cancellation/session isolation, API `view` query, client-side source filter, dated grouping, deep links, refresh, EN/FR | `DirectoryPage`, `FilterToolbar`, and `PageState` replace the local header/toolbar/feedback composition | AppShell/main remains the only vertical page scroller; no nested overflow or wheel handler |
| Tasks | `TasksPanel` reads and writes, board/list state, filters, pagination, task lifecycle, notifications, reminders, URL task intent, drawer focus/escape behavior | `DirectoryPage` owns the single page header; `ContextualActions` composes the existing create action; `FilterToolbar` composes the existing query form | Main keeps page scrolling; board alone keeps intentional horizontal overflow; task detail alone keeps independent vertical drawer overflow and `overscroll-behavior: contain` while modal; no scroll owner changed |

The existing route and permission registry was not modified. Agenda remains available to authenticated
users; Tasks remains gated by `tasks:view`. No API call, payload, schema, permission, deep link, form,
pagination rule, or task/calendar business rule changed. The changes are small and coupled by the one
approved Issue #219 migration checkpoint, so a single focused PR is lower risk than two nearly
identical composition PRs.

## Regression coverage

- Focused Vitest: Agenda rules/panel, Tasks workspace/container/polish, and Page System — 79/79 pass.
- Added assertions for one `h1`, the `data-page-kind="directory"` contract, shared Agenda toolbar and
  empty state, and shared Tasks filter toolbar.
- Existing tests continue to cover task permissions, transitions, create focus return, drawer
  behavior, filters, pagination, notifications, reminders, URL selection, stale requests, EN/FR,
  and raw-ID non-disclosure.
- Existing React test-suite `act(...)` warnings remain; no test failure or new warning class was
  introduced by this migration.

## Installed Google Chrome evidence

Harness: [`scripts/issue-219-agenda-tasks-evidence.mjs`](../../scripts/issue-219-agenda-tasks-evidence.mjs)  
Machine report: [`report.json`](issue-219-agenda-tasks/report.json)

The production build ran in installed Google Chrome from
`C:/Program Files/Google/Chrome/Application/chrome.exe` with contract-shaped synthetic API
responses. Six EN/FR scenarios passed at 1440×900, 768×1024, and 390×844.

Each scenario verifies:

- one page `h1`, one shared directory frame, and one shared filter toolbar per workspace;
- no document-level horizontal overflow;
- Agenda mouse wheel, fine-delta trackpad-like wheel input, `PageDown`, and mobile touch scroll;
- Agenda item deep link to `/tasks?task=<uuid>` plus browser back/forward restoration;
- Tasks board and list controls, task-card selection, task-detail Escape close and focus return;
- mobile touch opening and closing the task detail;
- no uncaught browser errors.

Screenshots:

- Agenda: `desktop|tablet|mobile` × `en|fr` (`*-agenda.png`)
- Tasks: `desktop|tablet|mobile` × `en|fr` (`*-tasks.png`)
- Task detail: `desktop|tablet|mobile` × `en|fr` (`*-task-detail.png`)

The first mobile run identified a module-local two-column override that squeezed the French Tasks
filters. The final CSS stacks the shared filter toolbar below 62rem; the final evidence report is
green and the 390px French labels render without clipping.

## Remaining verification limits

- Browser evidence uses sanitized contract-shaped fixtures, not a live PostgreSQL-backed API.
  Existing container and contract tests cover API behavior; exact-head Linux CI remains required.
- Automated touch uses Chrome DevTools touch start/move/end input and a touch tap. A physical-device
  and screen-reader pass remains useful human acceptance evidence, but is not a known blocker.
- No merge or deployment is authorized by this evidence.
