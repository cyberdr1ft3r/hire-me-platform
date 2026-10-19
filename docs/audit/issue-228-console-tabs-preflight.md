# Issue #228 — Console Workspace tabs: baseline on `main` and test plan

Status: **Measured 2026-10-19 on `main` `cfe6be6`** for the
[#228 preflight](../design/console-workspace-tabs-preflight-228.md). Synthetic data only. Raw JSON
and the harness are in [`issue-228-console-tabs-preflight/`](./issue-228-console-tabs-preflight/).
This is the reference every Phase B/C/D pull request is compared against. The
[#198 baseline](./console-workspace-v1-baseline.md) (`bd46f59`, before lazy routes) is kept for
history.

## Setup (reproducible)

| Item | Value |
| --- | --- |
| Code | `main` `cfe6be6` in a detached worktree; `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm prisma:generate`, contracts build |
| Build | `vite build` with `NODE_ENV` unset and `VITE_API_BASE_URL=http://localhost:3710`, served by `vite preview --port 5710` |
| API | `tsx src/main.ts`, `NODE_ENV=development`, port 3710, `ACCESS_TOKEN_TTL_SECONDS=300`, throwaway `postgres:16.4-alpine` container on tmpfs with a Docker-assigned port (never 5432) |
| Data | `console-workspace-v1-baseline/tools/seed.mjs 1` + `seed-messages.mjs 12`: 300 clients, 180 contacts, 2,000 candidates, 150 missions, 360 pipeline rows, 400 tasks, 6 users, 10 conversations with messages. Conversation creation stops at the API limit of 10 per hour, as in the #198 run |
| Browser | Installed Chrome via `playwright-core` 1.64.1, headless, 1440×900, `en-GB`; CDP CPU throttling **4×** approximates a mid-range device |
| Machine | Same Windows 11 / Ryzen 7 PRO 4750U as #198, shared with other containers |
| Harness | [`tools/measure.mjs`](./issue-228-console-tabs-preflight/tools/measure.mjs), derived from the #198 harness (changes listed in its header) |

Harness change that matters for comparison: with lazy routes, a first visit downloads the route
chunk before the module's first request. The #198 `SWITCH` could finish its quiet window before
that request started, so the #228 copy waits until `.route-module-fallback` is gone. First-visit
numbers are therefore **not** directly comparable with #198; revisits are (chunks are cached).
Messages' first visit still records no request (its list load started after the window); its
revisit numbers are valid.

## Results

### Shipped assets (`results/build-sizes.txt`, `results/bundle-attribution.txt`)

| Asset | #198 (`bd46f59`) | #228 (`cfe6be6`) |
| --- | --- | --- |
| Entry JS | 1,227.6 KB / **302.8 KB gzip** (single chunk) | 668.5 KB / **179.2 KB gzip** |
| Async JS chunks | 0 | 26 (largest 112.7 KB / 26.2 KB gzip) |
| Main CSS | 140.5 KB / 18.2 KB gzip | 153.9 KB / 19.5 KB gzip |
| Cold transfer (login page, JS+CSS) | 314 KB | 195 KB |

Entry attribution: i18n dictionaries 220.7 KB (34 %), react-dom 27 %, contracts 12 %, zod 10 %,
`api.ts` 6 %, UI 3 %, messages 1 %, navigation 1 %, auth 1 %.

### Cold load (7 runs, cache cleared, 4× CPU)

| Metric | #198 median / p95 | #228 median / p95 |
| --- | --- | --- |
| First contentful paint (login) | 1,548 / 3,232 ms | **928 / 1,496 ms** |
| Script duration | 1,337 / 3,077 ms | 725 / 1,275 ms |
| Longest task | 1,305 / 3,044 ms | 698 / 1,249 ms |
| Total blocking time | 1,255 / 2,994 ms | 648 / 1,199 ms |
| Login submit → shell | 312 / 1,335 ms | 230 / 402 ms |
| Authenticated reload of `/candidates` → settled | 2,624 / 3,637 ms (n = 6) | 1,255 / 1,783 ms (n = 6) |

Reload chain: `GET /health`, `POST /auth/refresh`, `GET /v1/notifications`,
`GET /v1/messages/unread-summary`, `GET /v1/candidates`. **The 7th reload again got
`POST /auth/refresh` → 429 and fell back to the login page** (20 refreshes/min/IP; R-055 / #202
Scope B still open). A first run taken while another scenario ran in parallel gave FCP 2,044 ms
median and was discarded; cold numbers on this machine are noisy, so PRs must compare interleaved
runs.

### Workspace activation (one mounted module; 10 first visits, then 50 cycles over 5 workspaces)

| Workspace | Visit | GETs | Paint 4× med / p95 | Settled 4× med / p95 | Blocking med | DOM nodes |
| --- | --- | --- | --- | --- | --- | --- |
| Clients | first | 1 | 144 | 817 | 183 | 375 |
| Candidates | first | 1 | 77 | 440 | 0 | 383 |
| Missions | first | 1 | 57 | 417 | 0 | 484 |
| Tasks | first | 7 | 64 | 633 | 169 | 552 |
| Commercial | first | 2 | 58 | 425 | 16 | 199 |
| Accounting | first | 2 | 35 | 411 | 0 | 195 |
| Training | first | 4 | 42 | 497 | 9 | 282 |
| Documents | first | 4 | 37 | 569 | 32 | 341 |
| Reporting | first | 5 | 54 | 508 | 40 | 748 |
| Clients | revisit ×50 | 1 | 54 / 118 | 81 / 151 | 0 | 390 |
| Candidates | revisit ×50 | 1 | 51 / 173 | 85 / 193 | 0 | 395 |
| Missions | revisit ×50 | 1 | 54 / 123 | 91 / 147 | 0 | 493 |
| Tasks | revisit ×50 | 7 | 193 / 384 | 195 / 384 | 104 | 559 |
| Messages | revisit ×50 | 1 | 52 / 145 | 73 / 158 | 0 | 230 |
| **All revisits** (#198) | 250 | 551 | 167 / 552 | 194 / 603 | — | — |
| **All revisits** (#228) | 250 | 552 | **60 / 233** | **91 / 247** | — | — |

First-visit paint is now the route skeleton (lazy chunk), and settled includes the chunk download.
Every revisit still refetches page 1 of its list; Tasks issues five status-column reads plus two
notification reads per activation and is the slowest workspace.

### Browser history traversal (new; 10 cycles of 5 pushes, Back ×4, Forward ×4, 4×)

| Step | Paint med / p95 | Settled med / p95 | Requests per step med / max |
| --- | --- | --- | --- |
| Back | 60 / 180 ms | 109 / 212 ms | 1 / 7 |
| Forward | 74 / 236 ms | 112 / 255 ms | 1 / 7 |

Final URL after each cycle was correct (`/messages`); no traversal was lost or duplicated.

### Memory (forced GC, 4×)

| Point | Heap | DOM nodes | Listeners |
| --- | --- | --- | --- |
| Shell after login | 16.05 MB | 218 | 190 |
| After 1 / 5 / 10 distinct workspaces | 16.52 / 17.64 / 18.41 MB | 639 / 365 / 1,761 | 217 / 210 / 251 |
| Cycle 10 / 20 / 30 / 40 / 50 | 19.18 / 19.27 / 19.40 / 19.44 / 19.49 MB | 369 each | 206 each |

DOM nodes and listeners return to identical values every cycle (no leaked trees or listeners).
Heap grows ~8 KB per cycle after cycle 10, the same order as the harness's own request log (#198:
~7 KB). A second `document` appears after the 10 first visits in both baselines; it is pre-existing
and stable.

### Idle polling (visible page, 3 minutes each)

| Active workspace | Requests | Per minute | Breakdown |
| --- | --- | --- | --- |
| Clients | 6 | 2.0 | `notifications` ×3, `messages/unread-summary` ×3 |
| Messages (no conversation open) | 15 | 5.0 | `messages/conversations` ×6, `notifications` ×4, `unread-summary` ×4, `auth/refresh` ×1 (TTL renewal) |

The second shell poll (Notification Center, #199) is now on `main`: 2 requests/min with no module
open, versus 1/min in #198.

### Deep link in a clean signed-in page load (5 runs each, 4×)

| URL | Settled median / p95 (#198) | Settled median / p95 (#228) | Requests |
| --- | --- | --- | --- |
| `/candidates?candidate=<uuid>` | 2,194 / 5,523 ms | 1,164 / 1,399 ms | 6: health, refresh, notifications, unread summary, list, detail |
| `/missions?mission=<uuid>` | 3,927 / 5,956 ms | 1,347 / 1,506 ms | 10: + detail, assignments, candidates, public opportunity, applications |
| `/clients?client=<uuid>` | — (no URL then) | 1,205 / 1,391 ms | 8: + list, detail, contacts, **detail again** |

All URLs were preserved. Every focused-record deep link also loads page 1 of the directory behind
it. Clients reads the record twice when it is not on that page (`ClientsPanel.tsx` quietly reloads
the selected detail after a list load); a record tab could skip the list. Both are pre-existing
and recorded for C1, not fixed here.

### Layout space for a tab strip (`results/layout.json`, `/candidates`, EN and FR identical)

| Viewport | Navigation | Utility bar | `main` width | Page header height | Horizontal overflow |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | Rail + context panel | 56px | 1,200px | 77px | 0 |
| 1024×768 | Rail + context panel | 56px | 784px | 77px | 0 |
| 1280×400 | Rail + context panel | 56px | 1,040px | 77px | 0 |
| 768×1024 | Mobile modal (< 56.25rem) | 56px | 768px | 137px | 0 |
| 390×844 | Mobile modal | 56px | 390px | 137px | 0 |

At short heights and on mobile `main` is not a fixed scroll box (`overflow: visible`); the document
scrolls. A strip inside the scrolled content would scroll away or need a new sticky layer, which is
why the preflight proposes the utility-bar breadcrumb slot (A5).

## Performance budget for Phase B–D

| Metric | Baseline (`cfe6be6`) | Budget |
| --- | --- | --- |
| Entry JS gzip | 179.2 KB | ≤ 187 KB (console chrome ≤ 8 KB gzip in entry; tab dialog and menus may be lazy) |
| Cold FCP / longest task (4×, interleaved A/B) | 928 / 698 ms median | no regression beyond run-to-run noise (≤ +10 % median over 2 × 7 interleaved runs) |
| Revisit / tab activation paint (4×) | 60 ms median, 233 ms p95 | < 100 ms median, ≤ 250 ms p95 |
| Revisit settled (4×) | 91 ms median, 247 ms p95 | ≤ 110 ms median, ≤ 275 ms p95 (revalidation visible, no fake instant state) |
| Requests per activation | 1 (Tasks 7) | not more than baseline per workspace; no identical GET twice in one activation |
| Back/Forward step settled | 109–112 ms median | ≤ 130 ms median |
| Heap with 10 open tabs after 50 cycles | 19.49 MB (10 visited) | ≤ baseline + 2 MB; slope ≤ 0.02 MB/cycle after cycle 10 |
| DOM nodes / listeners after cycling | 369 / 206, flat | flat (equal every cycle) |
| Idle request rate, 10 open tabs, Messages inactive | 2.0/min | 2.0/min (unchanged by tab count) |
| Clean-session deep link settled (4×) | 1.16–1.35 s median | ≤ baseline + 10 % |

## Regression strategy

Unit and component tests (Vitest/jsdom, run in CI with the web package):

- **U1 reducer**: open/focus idempotence; one tab per canonical id; flat siblings; fallback order;
  soft/hard limits; replace-LRU never picks a tab with unsaved input; Overview not closable.
- **U2 URL codec**: every matrix URL round-trips; `in=` only for permitted cross-module routes;
  malformed/duplicate/unknown values never create a tab (extends `record-deep-links.test.ts`).
- **U3 guard integration**: activate/close/sidebar/Back on a tab with unsaved input asks through
  `navigation-guard.ts`; cancel keeps the tab and URL; confirm proceeds once; no second `popstate`
  listener is registered (extends `navigation-guard.test.ts`).
- **U4 principal and session**: user id or session change remounts the console empty; a
  permission-only change prunes denied tabs and keeps the rest; sign-out from another browser tab
  (D-090 event) empties it.
- **U5 snapshots** (B3): schema version, size cap, unknown fields dropped, no free text or names.
- **B0′ module tests**: for each newly guarded module, input → shell link/Back/reload asks; save or
  reset clears; search forms never block.
- **A11y component tests**: tablist roles and names, roving focus, close buttons, live-region
  announcements, mobile dialog focus trap and Escape (EN and FR strings present).
- Existing suites that must stay green unchanged: `App.test.tsx`, `AppShell*.test.tsx`,
  `navigation-guard.test.ts`, `record-deep-links.test.ts`, `RouteModuleBoundary.test.tsx`,
  `authenticated-request.test.ts`, `auth-cross-tab.test.ts`, Clients/Candidates/Missions workspace tests.

Browser checks (installed Chrome + this harness against a production build and synthetic data;
evidence attached to each B/C/D draft PR, not a CI job yet because CI has no seeded API):

- **T1 bundle**: entry gzip and console-chrome size from `vite build` (`build-sizes.txt` method).
- **T2 activation**: `switch` at 4×, 50 cycles; median/p95 paint and settled against budget.
- **T3 first activation and deep link**: `deeplink` (now including `?client=`), visible loading state.
- **T4 memory**: heap/DOM/listeners at 1, 5, 10 open tabs and every 10 cycles to 50.
- **T5 polling**: 10 open tabs, Messages inactive, 3 idle minutes = single-tab rate; Messages
  active = exactly one list and one conversation poller.
- **T6 duplicates**: no identical GET twice within one activation.
- **T7 token expiry**: API with 60 s TTL; switching tabs after expiry refreshes once, no error.
- **T8 revocation**: remove a permission, refresh the account; denied tabs pruned; API refuses.
- **T9 history**: `history` scenario plus scripted open → switch → close → Back/Forward sequences.
- **T10 responsive/a11y**: `layout` widths, 200 % zoom, EN/FR, keyboard-only matrix flows, axe on
  the strip, menu and dialog.

Known limits of this baseline: local network only; one machine shared with other containers; the
harness's request log adds a few KB of heap per activation; Messages first-visit requests are not
captured; refresh-limiter 429 interrupts long reload series (space runs or restart the API).

## Reproduce

1. Worktree on the commit; install, `pnpm prisma:generate`, `pnpm --filter @hire-me/contracts build`.
2. Throwaway DB on a Docker-assigned port; `prisma migrate deploy`, `prisma db seed`,
   `tsx src/auth/bootstrap-admin.ts` with synthetic `AUTH_BOOTSTRAP_ADMIN_*` values.
3. API on 3710 (`API_CORS_ORIGIN=http://localhost:5710`); web built with
   `VITE_API_BASE_URL=http://localhost:3710` and `NODE_ENV` unset; `vite preview --port 5710`.
4. Seed with the #198 tools (`seed.mjs 1`, `seed-messages.mjs 12`).
5. `playwright-core` must be resolvable next to `measure.mjs` (it is not a repository dependency):
   copy the script into a scratch folder with `playwright-core` installed and run
   `CPU=4 node measure.mjs switch|cold|deeplink|poll|history|layout > result.json`
   (`CPU=1` for `poll` and `layout`; `RUNS=7` for `cold`).
