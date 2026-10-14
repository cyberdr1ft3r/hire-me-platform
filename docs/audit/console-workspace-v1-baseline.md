# Console Workspace v1.0 — performance baseline (Issue #198)

Status: **Baseline measured on 2026-10-14** for the
[preflight](../design/console-workspace-v1-preflight.md). Synthetic data only.
Raw JSON and the scripts that produced it are in
[`console-workspace-v1-baseline/`](./console-workspace-v1-baseline/).

## What was measured

| Item | Value |
| --- | --- |
| Code | `fix/ui-refinement-demo-20261013` at `bd46f59` (AppShell v1.2 + Workspace Surface v1.0) |
| Build | `vite build` production bundle served by `vite preview` (no dev server, no StrictMode double effects) |
| API | NestJS API from the same commit (`tsx src/main.ts`, `NODE_ENV=development`) on a throwaway PostgreSQL 16.4 container (tmpfs), never the shared 5432 database |
| Dataset | 300 clients, 180 contacts, 2,000 candidates, 150 missions (lead recruiter assigned), 360 mission-pipeline rows, 400 tasks (a quarter overdue), 6 extra users, 10 conversations / 120 messages — all generated, created through the public API |
| Browser | Installed Chrome 155 via `playwright-core`, headless, 1440×900, `en-GB` |
| Device | AMD Ryzen 7 PRO 4750U, 16 threads, 31 GB RAM, Windows 11. "Mid-range" is approximated with CDP `Emulation.setCPUThrottlingRate` **4×**; 1× is reported as reference. Network is local (no throttling), so numbers isolate client CPU and API latency |
| User | Bootstrap super-admin (sees every module); no field redaction |

## Methodology (reproducible)

1. Worktree on the commit; `pnpm install --frozen-lockfile --ignore-scripts`,
   `pnpm prisma:generate`, `pnpm --filter @hire-me/contracts build`.
2. Throwaway DB: `docker run --rm -d --name <unique> -p 127.0.0.1::5432 --tmpfs
   /var/lib/postgresql/data postgres:16.4-alpine`; `prisma migrate deploy`,
   `prisma db seed`, `tsx src/auth/bootstrap-admin.ts` with synthetic
   `AUTH_BOOTSTRAP_ADMIN_*` values.
3. API on port 3610 with `API_CORS_ORIGIN=http://localhost:5610`; web built with
   `VITE_API_BASE_URL=http://localhost:3610` and served with
   `vite preview --port 5610`.
4. Seed: `node tools/seed.mjs 1` then `node tools/seed-messages.mjs 12` (paced to
   the messaging limits of 10 conversation creations/hour and 30 writes/minute).
   `RESUME=1` resumes after a partial run.
5. Measure: `CPU=4|1 node tools/measure.mjs switch|cold|deeplink|poll|expiry`.
   An init script wraps `window.fetch` (request log, in-flight count) and observes
   `longtask` and `largest-contentful-paint`. Navigation is driven exactly like the
   shell: `history.pushState` + `popstate`.
   - **paint** = two animation frames after the navigation (React render committed
     and painted); **settled** = last response of the activation, with a 200 ms
     quiet window to catch chained requests; **blocking** = Σ(long task − 50 ms).
   - Heap = `Runtime.getHeapUsage` after two forced `HeapProfiler.collectGarbage`;
     DOM nodes and listeners from `Memory.getDOMCounters`.
6. Bundle attribution: `vite build --sourcemap --outDir <tmp>`, then
   `node tools/bundle-attrib.mjs <chunk.js>` decodes the sourcemap and sums bytes
   per source group.

Caveats: the machine was shared with other agents' containers, so cold-load runs
show high variance (p95 values are reported, not hidden). `measure.mjs` keeps its
own request log in the page, which contributes a little heap per activation. The
`expiry` scenario needs the API restarted with `ACCESS_TOKEN_TTL_SECONDS=60`.
Repeated cold loads from one IP hit the auth refresh limiter (see findings).

## Results

### Shipped assets

| Asset | Raw | Gzip |
| --- | --- | --- |
| `index-*.js` (single chunk) | 1,227.6 KB | 302.8 KB |
| `index-*.css` | 140.5 KB | 18.2 KB |
| Transfer on cold load (JS+CSS) | 314 KB | — |

Attribution of the JS chunk ([full list](./console-workspace-v1-baseline/results/bundle-attribution.txt)):
i18n dictionaries 212.8 KB (17.8 %), react-dom 177.6 KB (14.9 %), Missions 9.1 %,
Training 7.0 %, contracts 6.6 %, Accounting 6.2 %, zod 5.6 %, Commercial 4.7 %,
Tasks 4.6 %, Candidates 4.2 %, Messages 3.4 %, `api.ts` 3.2 %, Documents 2.9 %,
Clients 2.2 %. No route is lazy-loaded.

### Cold load (7 runs each, cache cleared)

| Metric | 4× CPU median / p95 | 1× median / p95 |
| --- | --- | --- |
| First contentful paint (login form) | 1,548 / 3,232 ms | 256 / 1,148 ms |
| Script duration | 1,337 / 3,077 ms | 146 / 712 ms |
| Longest task (parse + evaluate + first render) | 1,305 / 3,044 ms | 141 / 643 ms |
| Total blocking time | 1,255 / 2,994 ms | 91 / 593 ms |
| Login submit → shell visible | 312 / 1,335 ms | 168 / 258 ms |
| Authenticated reload of `/candidates` → data settled | 2,624 / 3,637 ms (n = 6) | 404 / 822 ms (n = 6) |

Reload request chain: `GET /health`, `POST /auth/refresh`, `GET /v1/candidates`,
`GET /v1/messages/unread-summary`. In both series the 7th reload got
`POST /auth/refresh` → **429** and fell back to the login page (see findings).

### Workspace activation (one tab = one mounted module today)

First visit of 10 workspaces, then 50 cycles over Clients → Candidates → Missions →
Tasks → Messages (250 revisits). Paint/settled in ms.

| Workspace | Visit | GETs | Paint 4× med / p95 | Settled 4× med / p95 | Blocking 4× med | Settled 1× med / p95 | DOM nodes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clients | first | 1 | 627 | 627 | 489 | 155 | 307 |
| Candidates | first | 1 | 267 | 299 | 140 | 140 | 335 |
| Missions | first | 1 | 402 | 416 | 267 | 130 | 425 |
| Tasks | first | 7 | 612 | 612 | 469 | 408 | 527 |
| Messages | first | 1 | 154 | 232 | 33 | 61 | 198 |
| Commercial | first | 2 | 454 | 454 | 361 | 86 | 175 |
| Accounting | first | 2 | 372 | 372 | 235 | 75 | 170 |
| Training | first | 4 | 315 | 338 | 129 | 147 | 256 |
| Documents | first | 4 | 466 | 565 | 142 | 301 | 314 |
| Reporting | first | 5 | 255 | 513 | 123 | 416 | 720 |
| Clients | revisit ×50 | 1 | 174 / 404 | 174 / 426 | 84 | 90 / 248 | 307 |
| Candidates | revisit ×50 | 1 | 114 / 392 | 167 / 486 | 26 | 98 / 326 | 335 |
| Missions | revisit ×50 | 1 | 156 / 558 | 162 / 604 | 67 | 90 / 245 | 425 |
| Tasks | revisit ×50 | 7 | 397 / 935 | 411 / 1,394 | 295 | 241 / 536 | 527 |
| Messages | revisit ×50 | 1 | 98 / 338 | 132 / 406 | 13 | 78 / 184 | 198 |
| **All revisits** | 250 | 551 total | **167 / 552** | **194 / 603** | — | **106 / 436** | — |

Clients' first visit includes first-render costs of the shell after login. Every
revisit refetches: the top repeated requests are each workspace's page-1 list (50×
each) and Tasks' five status columns plus two notification reads (50× each).
Training requests `GET /v1/clients?page=1&pageSize=20` twice per activation.

### Memory (forced GC, 4×; 1× equivalent)

| Point | Heap | DOM nodes | Listeners |
| --- | --- | --- | --- |
| Shell after login | 15.50 MB | 213 | 187 |
| After 1 distinct workspace | 15.85 MB | 570 | 219 |
| After 5 distinct workspaces | 16.64 MB | 337 | 201 |
| After 10 distinct workspaces | 17.40 MB | 1,733 (Reporting) | 246 |
| Cycle 10 / 20 / 30 / 40 / 50 | 18.11 / 18.21 / 18.28 / 18.35 / 18.40 MB | 337 each | 201 each |

DOM nodes and listeners return to identical values on every cycle: no leaked
trees or listeners. Heap rises ~7 KB per cycle after cycle 10 (1× series: 18.15 →
18.39 MB), the same order as the harness's own request log; no unbounded growth
was observed. The console must not change this shape (budget in the preflight).

### Idle polling (visible document, 3 minutes per workspace)

| Active workspace | Requests | Per minute | Breakdown |
| --- | --- | --- | --- |
| Clients | 3 | 1.0 | `messages/unread-summary` ×3 |
| Messages (no conversation open) | 9 | 3.0 | `messages/conversations` ×6, `unread-summary` ×3 |

Opening a conversation adds one 15 s poll. #199 (not on the base) adds one 60 s
notification poll, giving 2/min with no module open.

### Deep link in a signed-in clean page load (5 runs, 4×)

| URL | Settled median / p95 | Requests |
| --- | --- | --- |
| `/candidates?candidate=<uuid>` | 2,194 / 5,523 ms | health, refresh, list, detail, unread summary (5) |
| `/missions?mission=<uuid>` | 3,927 / 5,956 ms | + assignments, candidates, public opportunity, applications (9) |

Both URLs were preserved after load. Mission detail sections load in a second
wave after the detail response (request waterfall), so deep links pay parse +
refresh + two sequential API rounds.

### Access-token expiry (API with 60 s TTL)

After 75 s idle on Clients, switching to Candidates issued
`GET /v1/candidates` → **401** and rendered "Candidates unavailable — Unable to
load candidates" with Try again. No refresh was attempted. With the default
300 s TTL the same happens five minutes after the last token refresh.

## Findings for the console design

1. Reactivation today is a remount plus refetch: median 162–174 ms settled for
   Clients/Candidates/Missions at 4×, p95 430–600 ms, and 7 requests for Tasks.
   The < 100 ms target is reachable only with a response cache and snapshot-
   driven first render — and must still show revalidation.
2. Heap, DOM and listeners are flat with one mounted module. Keeping inactive
   trees mounted would add roughly the per-workspace DOM (170–720 nodes) and every
   effect per tab; active-only rendering keeps today's flat curve.
3. Entry cost is one long parse/evaluate task (1.3 s median at 4×). Lazy route
   chunks and per-locale dictionaries (~66 % of the chunk is feature modules +
   i18n) are the main lever; console chrome must not add to it.
4. Module requests do not refresh expired tokens (reproduced). Long-lived tabs make
   this a blocker.
5. `POST /auth/refresh` is limited to 20 per minute per IP (in-memory). Combined
   with R-055 (no `trust proxy`, all users share the proxy IP), refreshes from many
   users or browser tabs can exhaust the budget and log users out. A console must
   refresh single-flight and the limiter keying must be resolved before rollout.
6. Polling is already bounded to mounted components and the visible document;
   the console must preserve that and fold #199's poll into one shell registry.
