# Functional UI acceptance — 2026-11-19

QA starts from PR #266 (`47c5218b321530fc0f3563f40b5af41b6503a0f6`). The application ran against a newly migrated PostgreSQL database with synthetic accounts and records. The browser uses the real Vite frontend and NestJS API. Only the candidate error and pending states deliberately delay or drop browser requests.

## Run it again

1. Follow the [disposable database runbook](../../runbooks/disposable-test-database.md) through provisioning. Use a fresh marked database for a clean repeat, `NODE_ENV=test`, and the URL from the run's `.url` file. Unset unrelated `DATABASE_URL` and `DIRECT_URL` values.
2. Build the contracts and generate Prisma (`pnpm --filter @hire-me/contracts build`, `pnpm prisma:generate`). Install Chromium with `pnpm exec playwright install chromium`, or set `HIREME_E2E_CHROMIUM_CHANNEL=chrome` to use local Chrome. On PowerShell, use `pnpm.cmd` and `$env:NODE_ENV='test'`.
3. Run `pnpm test:e2e`. The runner checks the database receipt and live marker, starts services on loopback ports 3118 and 5198, disables invoice issuance, and reports the evidence directory under `.tmp-runtime/functional-ui/`. Each run creates uniquely named synthetic records; role grants are not edited. CI publishes the generated PNGs as `functional-browser-evidence` and then drops the job's database.
4. Drop the marked database and stop the disposable server using the runbook when finished.

## Functional coverage

| Area / routes | Browser and API evidence | Next gap |
| --- | --- | --- |
| `/`, `/candidates`, session endpoints | Anonymous response 401, login, delayed refresh and reload restore, logout and protected deep link, candidate validation, failed create with preserved values, create/edit/inactivate, reload and API verification | Refresh expiry and multi-tab behavior; candidate qualification and rejection through a mission |
| `/clients`, `/missions`, `/tasks` | Real client and linked mission creation; real mission task creation; task reload at 390 px and API read | Assignment, transitions, update/cancel, full list operations and error cases |
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

No P0 or P1 was verified in the exercised browser paths. Before production sign-off, finish recruitment transitions and mission scope by role, then document and invoice draft acceptance and administration writes. Keep invoice accounting and legal approval separate from UI sign-off. Extend coverage for list controls, unsaved changes, communication flows and adverse inputs after these checks. Separate [invoice review](PR-265-review.md).

## Browser evidence

The final local Chrome run passed 14/14 checks, including all nine role cases. Its database catalog gate passed 5/5.

- [Persisted candidate](evidence/candidate-persisted.png)
- [Linked task at 390 px](evidence/mobile-linked-task.png)
- [Recruitment report](evidence/recruitment-report.png)
