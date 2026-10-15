# Issue #198 — Frontend lazy routes (Phase B1 foundation)

Date: 2026-10-15. Base `main` `bdfbf5f` (PR #207 merged). Prepares Console Workspace by
splitting workspace modules into route-level async chunks without changing product behavior.

## Change summary

- `React.lazy` for every authenticated workspace panel and public opportunity routes.
- `RouteModuleBoundary`: `Suspense` fallback inside the shell + `RouteChunkErrorBoundary` with retry.
- `AdminPanel` extracted from `App.tsx` into `admin/AdminPanel.tsx` (same behavior).
- Eager: login, `AppShell`, navigation, overview (`InternalHome`), auth/API bootstrap, i18n provider.

No Console tabs, no request-core (B0), no locale dictionary splitting in this PR.

## Bundle comparison (production `vite build`)

| Metric | Before (monolith) | After (lazy routes) | Delta |
| --- | --- | --- | --- |
| Entry JS gzip | 411.56 KB | 235.62 KB | **−43 %** |
| Entry JS raw | 1,930.97 KB | 877.75 KB | −54 % |
| CSS gzip | 20.89 KB | 19.04 KB (split chunks) | ~−9 % |
| Async route chunks | 0 | 14 module groups | — |

Raw JSON: [`baseline-before.json`](./issue-198-frontend-lazy-routes/baseline-before.json),
[`baseline-after.json`](./issue-198-frontend-lazy-routes/baseline-after.json).

Largest lazy panels (gzip): Training/Commercial-scale modules ~22–32 KB each; Clients ~12.5 KB;
Admin ~2.9 KB. Entry chunk still includes React, i18n dictionaries, and `api.ts` (Console preflight
finding — address in follow-up locale/API splits).

## Runtime behavior

- First navigation to a workspace downloads one chunk; subsequent visits use HTTP cache (no duplicate
  module mount beyond normal route unmount).
- Shell, notification center, and navigation stay interactive while a chunk loads (`Loading workspace…`).
- Failed dynamic import shows localized error + **Try again** (remount boundary without full page reload).
- Routing, permissions, record deep links, leave guards, and EN/FR shell strings unchanged.

## Validation

- `pnpm check:architecture`, `pnpm format:check`
- `pnpm exec turbo run lint typecheck test build --filter=@hire-me/web` — **1012** tests (includes
  `RouteModuleBoundary.test.tsx`)
- `App.test.tsx` suite passes with lazy panels (Vitest resolves dynamic imports in dev/test bundle)

## Browser smoke (2026-10-15, PR #208 final integration)

Stack: local PostgreSQL, `pnpm dev` (API `127.0.0.1:3000`, Vite `127.0.0.1:5173`), synthetic admin
`admin@example.test`. Harness:
[`tools/smoke-lazy-routes.mjs`](./issue-198-frontend-lazy-routes/tools/smoke-lazy-routes.mjs).
Raw results: [`smoke-results-2026-10-15.json`](./issue-198-frontend-lazy-routes/smoke-results-2026-10-15.json).

| Check | Result |
| --- | --- |
| Icon-rail navigation → Candidates / Missions / Clients directories | Pass |
| Direct deep links + full reload on candidate / mission / client records | Pass |
| FR locale (`hireme.locale`) on Candidates workspace | Pass |
| Unauthenticated `/candidates` → login gate | Pass |
| 5 s idle on client record (no surprise `/v1` GET polling) | Pass (0 GETs) |
| Simulated chunk import failure → localized retry UI | Pass |
| Retry remount after failed dynamic import | UI remounts; `React.lazy` keeps rejected import until navigation/reload (documented) |

Screenshots (Playwright): `candidates-en.png`, `candidates-fr.png`, `mission-record-refresh.png` in agent
artifacts for this run.

Regression rerun (2026-10-15): **13/13** — [`smoke-results-2026-10-15-rerun.json`](./issue-198-frontend-lazy-routes/smoke-results-2026-10-15-rerun.json).

## Maintainer browser verification (2026-10-15, PR #208 review comment)

Stack: `pnpm dev`, Chrome headless (Playwright). Harness:
[`tools/maintainer-browser-verification.mjs`](./issue-198-frontend-lazy-routes/tools/maintainer-browser-verification.mjs).
Setup: `scripts/issue-114-evidence-setup.ts` + `scripts/issue-198-public-browser-setup.ts` (local synthetic
public slug). Raw: [`maintainer-verification-2026-10-15.json`](./issue-198-frontend-lazy-routes/maintainer-verification-2026-10-15.json).

| Scenario | Result | Notes |
| --- | --- | --- |
| Admin direct `/admin` + reload | Pass | `section[aria-label="User administration"]` |
| Admin lazy entry (1200 ms held chunk) | Pass | `Loading workspace…` fallback seen, then module ready |
| Public `/opportunities` cold load | Pass | Lazy public list module |
| Public detail direct URL + reload | Pass | Slug `issue114-existing-a533b410` |
| Permission: guest → `/candidates` | Pass | “Protected workspace” / no directory leak |
| Permission: logged-out → `/admin` | Pass | Login form |
| Sign-out during delayed Candidates chunk | Pass | Login after sign-out; no protected leak (`loadingSeen=true`) |
| Cold-load timings (observed, no thresholds) | Recorded | See timing table below |

**Timings (ms, dev server, single run):**

| Label | ms |
| --- | ---: |
| `admin_direct_url_to_ready` | 274 |
| `admin_rail_nav_with_1200ms_chunk_delay` | 1631 |
| `public_list_cold_load` | 593 |
| `public_detail_direct_url` | 964 |
| `cold_login_shell_dom` | 285 |
| `cold_login_submit_to_signed_in` | 114 |
| `cold_first_candidates_click_to_directory` | 844 |

## Risks / follow-ups

- Entry gzip **235 KB** still above Console preflight B1 target (~190 KB) until i18n/API slimming.
- No Playwright switch-latency harness re-run on this VM; compare using
  `docs/audit/console-workspace-v1-baseline/tools/measure.mjs` when a full synthetic DB is available.
- B0 request core and Console provider remain prerequisites for Phase B2.
