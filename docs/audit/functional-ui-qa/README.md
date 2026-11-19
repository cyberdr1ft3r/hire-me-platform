# Functional UI acceptance — 2026-11-19

QA starts from PR #266 (`47c5218b321530fc0f3563f40b5af41b6503a0f6`). The application ran against a newly migrated PostgreSQL database with synthetic accounts and records. The browser uses the real Vite frontend and NestJS API. Only the candidate error and pending states deliberately delay or drop browser requests.

## Run it again

1. Follow the [disposable database runbook](../../runbooks/disposable-test-database.md) through provisioning. Use a fresh marked database for a clean repeat, `NODE_ENV=test`, and the URL from the run's `.url` file. Unset unrelated `DATABASE_URL` and `DIRECT_URL` values.
2. Build the contracts and generate Prisma (`pnpm --filter @hire-me/contracts build`, `pnpm prisma:generate`). Install Chromium with `pnpm exec playwright install chromium`, or set `HIREME_E2E_CHROMIUM_CHANNEL=chrome` to use local Chrome. On PowerShell, use `pnpm.cmd` and `$env:NODE_ENV='test'`.
3. Run `pnpm test:e2e`. The runner checks the database receipt and live marker, starts services on loopback ports 3118 and 5198, disables invoice issuance, and reports the evidence directory under `.tmp-runtime/functional-ui/`. Each run creates uniquely named synthetic records; role grants are not edited. CI uses a fresh database for browser acceptance after dropping the integration database. It publishes the generated PNGs as `functional-browser-evidence` and drops the browser database.
4. Drop the marked database and stop the disposable server using the runbook when finished.

## Functional coverage

| Area / routes | Browser and API evidence | Next gap |
| --- | --- | --- |
| `/`, `/candidates`, session endpoints | Anonymous response 401, login, delayed refresh and reload restore, logout and protected deep link, candidate validation, failed create with preserved values, create/edit/inactivate, reload and API verification | Refresh expiry and multi-tab behavior; exercise additional recruitment outcomes |
| `/clients`, `/missions`, `/tasks` | Real client and mission creation; recruiter assignment, candidate link, CV review, HR preselection and decline persisted on reload; linked task reload at 390 px and API read | Assignment changes, interviews, offers, task update/cancel, full list operations and error cases |
| `/reporting` | Recruitment summary 200, CSV export response and real browser download | Reporting filters, export reconciliation and dashboard drilldowns |
| `/agenda`, `/messages` | Signed-in navigation and rendered views | Create, update and persistence; notes; empty/error cases |
| `/accounting`, `/commercial`, `/documents` | Signed-in navigation and rendered views | Mutations, draft generation and rendering acceptance; branch-specific work tracked separately |
| `/admin` | Role-dependent navigation and forbidden state; server checks below | Administration writes, role scope and route-by-route acceptance |
| Cross-cutting | Required input, pending network state, second submission blocked while saving, unsaved drawer protection, network error, retry and reload | Long and duplicate data, filtering/pagination/sorting, broader unsaved-change, mobile and keyboard coverage |

## Role coverage

All nine roles signed in with separate synthetic browser contexts. Candidates checks cover navigation, list and create control, plus HTTP 403 on unauthorized writes. Administration checks cover nav visibility, user-list and billing-settings API responses, and denied-view behavior. The denied requests are acceptance checks of existing contracts.

| Role | Candidates list / create UI | Admin users API | Admin billing API |
| --- | --- | --- | --- |
| SUPER_ADMIN | Allowed | 200 | 200 |
| ADMIN | Allowed | 200 | 200 |
| HR_MANAGER | Allowed | 403 | 403 |
| FINANCE_MANAGER | Denied | 403 | 200 |
| MANAGER | Denied | 403 | 403 |
| TEAM_LEADER | Denied | 403 | 403 |
| EMPLOYEE | Denied | 403 | 403 |
| GUEST | Denied | 403 | 403 |
| CLIENT_USER | Denied | 403 | 403 |

This matrix covers the checked endpoints and controls. It does not establish record-level access across every module or approve a change to the permission catalog.

## Defects and priorities

| ID | Priority | Status | Reproduction and remediation |
| --- | --- | --- | --- |
| QA-01 | P2 | Fixed here | Sign in, reload and hold `POST /auth/refresh`. Previously the credential form appeared while a valid session was still being restored. The initial null session also represented a refresh in progress. The app now renders a localized status until the request settles. The browser regression confirms the form is absent during refresh and Overview returns after a successful response. See [before](evidence/session-restore-before.png) and [after](evidence/session-restore-after.png). |
| UI-02 | P2 | Reproduced on #264 | Sign in as EMPLOYEE and open `/admin` directly. The protected view appears, but Overview is selected in the workspace tab strip. See the [Administration review](PR-264-review.md). |
| UI-03 | P2 | Partially resolved on #264 | Section navigation isolates Billing and Access. Long French labels initially clip horizontally at mobile width, and Access remains very tall. See the [Administration review](PR-264-review.md). |

No P0 or P1 was verified in the exercised browser paths. Before production sign-off, extend recruitment through interviews and offers and verify mission scope by role, then document and invoice draft acceptance and administration writes. Keep invoice accounting and legal approval separate from UI sign-off. Extend coverage for list controls, unsaved changes, communication flows and adverse inputs after these checks. Separate [invoice review](PR-265-review.md).

## Browser evidence

The final local Chrome run passed 14/14 checks, including all nine role cases. Its database catalog gate passed 5/5.

- [Persisted candidate](evidence/candidate-persisted.png)
- [Persisted recruitment stage](evidence/recruitment-pipeline-persisted.png)
- [Linked task at 390 px](evidence/mobile-linked-task.png)
- [Recruitment report](evidence/recruitment-report.png)

## Local validation

- Production build, format, architecture and design tokens, lint, and typecheck passed. Vite reports a large-bundle warning.
- The clean, standalone PostgreSQL integration run passed 594/594 across 36 suites. An earlier shared run passed 590/594; the rerun used a fresh database without browser writers. The reminder CLI check now allows the observed Windows connection timeout without changing runtime behavior.
- The database guard refused unmarked and forged targets; the authorization catalog showed no grant or permission drift. The PKCS#11 lab stays on its existing Linux CI job.
- The full serial web unit run passed 1,124/1,124 after updating the session readiness assertions. Contracts passed 81/81; API unit tests passed 220 with 19 Windows skips for the PKCS#11 lab.
- The first CI browser run reused the database after the integration passes and observed HTTP 200 for the synthetic Guest on the candidate list. A fresh marked database returned the expected 403. CI now provisions a separate database before running browser checks; the assertions and role grants are unchanged.
