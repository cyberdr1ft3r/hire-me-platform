# Windows toolchain recovery and UI audit

Audit date: 2026-11-17. Baseline: `main` at `5919c8a`; branch: `codex/hireme-toolchain`.

## Environment and method

- Windows 11, Node 24.16.0, Corepack 0.35.0, pnpm 11.9.0, PowerShell 5.1.
- Visual Studio Build Tools 2022 has `Microsoft.VisualStudio.Workload.VCTools`, MSVC 14.44.35207, and Windows 11 SDK 10.0.26100.0. `pnpm.cmd install --frozen-lockfile` compiled `pkcs11js` with node-gyp 12.4.0 and finished successfully. The lockfile was not changed.
- Sandbox DNS and localhost socket restrictions required ordinary local commands to use the existing `COREPACK_HOME` cache and network/localhost commands to run outside the sandbox. No Windows security policy was changed.
- PostgreSQL 16.4 ran in a uniquely named Docker container with tmpfs storage and a Docker-assigned loopback port. A git-ignored `.env` pointed only to that container. All 27 migrations, the idempotent role seed, and a synthetic administrator bootstrap succeeded. The browser dataset added two synthetic clients, two candidates, one mission, one task, and a restricted employee. No staging or production database was used.
- The API health endpoint returned 200. The Vite frontend and NestJS API served the authenticated application.

## Browser automation recovery

Both registered MCPs navigated to the actual development-only `task.html` page. Playwright MCP exposed the task board accessibility tree and captured `task-playwright-desktop.png`. Chrome DevTools MCP exposed rendered elements, console messages, and network requests. Its initial network capture identified a missing `/favicon.ico` (404). A shared SVG favicon was added to every web HTML entry; a new isolated DevTools visit had no console errors, and a new Playwright visit reported zero errors and warnings.

Native Playwright then used the same local Chrome installation to exercise the authenticated app. Its machine-readable results are in `browser-results.json` and `interaction-results.json`. The initial unauthenticated `/auth/refresh` 401 is an expected session probe. The early full-reload sweep also hit the refresh rate limit; final route evidence uses in-app navigation and handles the documented workspace tab limit.

## Route and role coverage

`S` means authenticated synthetic super administrator. `E` means restricted synthetic employee. Desktop viewport was 1440 × 900; mobile viewport was 390 × 844. A check mark means the route rendered and a screenshot was captured. `—` means this pass did not capture that combination.

| Module / route | S desktop | S mobile | E direct-route check | Evidence |
| --- | --- | --- | --- | --- |
| Overview `/` | ✓ | ✓ | ✓ login/navigation | `overview-*.png` |
| Candidates `/candidates` | ✓ | ✓ | denied | `candidates-*.png`, `candidate-create-desktop.png` |
| Missions `/missions` | ✓ | ✓ | — | `missions-*.png` |
| Clients `/clients` | ✓ | ✓ | — | `clients-*.png` |
| Tasks `/tasks` | ✓ | ✓ | available in navigation | `tasks-*.png`, `task-create-desktop.png` |
| Messages `/messages` | ✓ | — | available in navigation | `messages-desktop.png` |
| Commercial `/commercial` | ✓ | — | — | `commercial-desktop.png` |
| Agenda `/agenda` | ✓ | — | — | `agenda-desktop.png` |
| Reporting `/reporting` | ✓ | ✓ | — | `reporting-*.png`, `reporting-empty-mobile.png` |
| Accounting `/accounting` | ✓ | ✓ | — | `accounting-*.png` |
| Training `/training` | ✓ | — | — | `training-desktop.png` |
| Documents `/documents` | ✓ | ✓ | — | `documents-*.png` |
| Administration `/admin` | ✓ | ✓ | denied | `admin-*.png`, `admin-employee-denied.png` |
| Public opportunities `/opportunities` | ✓ | ✓ | unauthenticated | `opportunities-*.png` |

The 13 authenticated desktop routes reached their intended URLs and rendered module headings. The public opportunities page rendered its empty state without a session. No page-wide horizontal overflow was measured on the captured authenticated desktop/mobile routes. Candidate creation opened a drawer; task creation opened an inline form. Populated candidate, mission, client, and task views were captured. The development reporting preview rendered its empty-result messages on mobile. The employee had only Home, Tasks, and Messages in the main navigation, and direct Administration/Candidates visits rendered a protected-workspace denial. The audit did not submit every form or exercise every record mutation.

## UI defect inventory

| ID | Severity | Status | Reproduction and impact | Next action |
| --- | --- | --- | --- | --- |
| UI-01 | P3 | Fixed here | Open `/` or `task.html` in a fresh browser. The browser requested `/favicon.ico`, receiving 404 and adding a console error. | Shared SVG favicon added to all seven HTML entries; fresh Playwright and DevTools visits had no console errors. |
| UI-02 | P3 | Open | Sign in as the restricted employee, then enter `/admin` directly. The main region correctly says “Permission denied,” but the workspace tabs still show Overview as selected while the URL is `/admin` (`admin-employee-denied.png`). This weakens location feedback, while authorization remains enforced. | Recheck on Administration PR #264 before changing navigation code; its active work covers section navigation and guard behavior. |
| UI-03 | P2 | Existing PR review | On `main`, open `/admin` at 390 px. Billing, user management, and the entire permission catalog form one very long page (`admin-mobile.png`, about 8,248 px high). Locating a section requires extensive scrolling. | Review PR #264's Billing / Users / Roles and permissions section navigation; do not duplicate that implementation on this branch. |

The invoice screens on this `main` baseline do not establish PR #265 acceptance. Review invoice-specific UI, PDFs, and accounting decisions on PR #265's own head. No invoice implementation was duplicated here.

## Prioritized stabilization work

1. Review PR #264 at desktop and mobile widths, particularly direct denied routes, section navigation, and long Administration forms. Re-test UI-02 and UI-03 on its exact head.
2. Review PR #265's invoice paths and approved business wording on its exact head; keep issuance disabled until its stated accounting/legal decisions are resolved.
3. Expand behavioral browser coverage across search/filter submissions, record edit and validation flows, document registration, finance and reporting exports, and intermediate role profiles. This audit's screenshots are a baseline, not a full acceptance test for every mutation.
4. Re-run Windows timing-sensitive tests without concurrent builds and use exact-head Linux CI as the full-suite release gate.

## Verification log

- Passed: frozen install, Prisma client generation/validation, architecture and style-token/contrast checks, formatting, TypeScript typecheck, ESLint (one pre-existing warning), production build, API health, migrations, seed, synthetic bootstrap, Playwright/DevTools navigation, route and role browser checks.
- PostgreSQL integration: 593/594 passed in the full run; the single candidate lifecycle case exceeded its fixed five-second timeout while the browser audit was active. It passed in isolation in 882 ms. The post-suite authorization-catalog check passed 5/5 with no seeded role, permission, grant, or metadata drift.
- The initial concurrent sandboxed root-unit run hit a PDF five-second timeout and loopback `EACCES` in the health test. An outside-sandbox root rerun resolved the health case but still hit the PDF timeout while API and web suites ran concurrently. The complete API unit suite passed with one Vitest worker: 220 passed, 19 intentionally skipped; the PDF case completed in 2.32 seconds. The contracts suite passed 81 tests in 14 files.
- The first standalone web run exposed a Windows CRLF-only CSS fixture assertion in `src/ui/foundation.test.tsx`. The test now normalizes line endings before checking the exact selector and declaration; the stylesheet and assertions are unchanged.
- A subsequent parallel web run showed three lazy-loaded `App.test.tsx` routes still at “Loading workspace…” when Testing Library's default one-second heading wait expired. Those waits now allow three seconds while keeping the same rendered heading and permission assertions. The complete one-worker web run passed 86 files and 1,124 tests.
- No merge, deployment, infrastructure change, live-data operation, or production invoice issuance was performed.
