# HireMe Console Workspace v1.0 — Phase 0/A preflight (Issue #198)

Status: **Proposed — documentation only. Human sign-off gate before Phase B.**
No application code, contract, schema, permission or dependency changes.

| Document | Purpose |
| --- | --- |
| This file | Architecture assessment, risks, phased plan, regression tests |
| [ADR proposal (D-089)](./console-workspace-v1-adr-proposed.md) | Tab manager architecture and operation contracts |
| [Interaction matrix](./console-workspace-v1-interaction-matrix.md) | Behavior per trigger, history effect, accessibility, responsive |
| [Performance baseline](../audit/console-workspace-v1-baseline.md) | Measured numbers, methodology, raw JSON and scripts |

## Integration state checked (2026-10-14)

- **Base:** `fix/ui-refinement-demo-20261013` at `bd46f59`. AppShell v1.2 (#195)
  and Workspace Surface v1.0 (#197) are **merged into this integration branch, not
  into `main`**. #194 (integration → `main`, draft) is open.
- **#196 / PR #199** Notification Center: open draft against the same integration
  branch; adds a 60 s shell notification poll and `/messages?conversation=<uuid>`.
  This preflight neither depends on nor modifies it; overlaps are listed below.
- `main` is `283c18a`. The console must be built on the integration branch (it
  needs AppShell v1.2 and the Workspace Surface), so its PRs should target that
  branch while #194 is undecided.
- Figma file `lntkJMsl2twVkeZ9Dt9dvV`: three static desktop frames (Client
  directory; client + related mission subtab; mission primary workspace). Viewed
  read-only; it has no prototype connections we could exercise. Observations: the
  frames reserve a second, otherwise empty subtab row (~40px of height on every
  page); the third tab label is clipped at the frame width; the context panel shows
  an "Interviews" destination and a global search field that do not exist in the
  current registry (AppShell v1.2 already treats global search as illustrative).
  **Clickable interaction evidence is still outstanding** (see Phase A remaining).

## Architecture assessment (current state)

### Routing and identity

- No router library. `App.tsx` keeps `{ route, search }`, pushes on navigation,
  listens to `popstate`, and uses `replaceState` when Candidates, Missions and
  Training change selection. `pathToRoute` is exact-match; unknown paths fall back
  to Overview.
- Record identity is query-based and validated (UUID, single value) before any read
  (`navigation/record-deep-links.ts`):

| Module | Record URL today | Selection written to URL | Split view |
| --- | --- | --- | --- |
| Candidates | `?candidate=` | Yes (`replaceState`) | Workspace Surface, side by side ≥ 60rem container |
| Missions | `?mission=`, `?process=`, `?interview=` | Yes (mission) | Stacked master–detail ≥ 64rem |
| Training | `?program=`, `?session=` | Yes | ≥ 60rem |
| Tasks | `?task=` (initial only) | No | Board + detail |
| Meetings | `?meeting=` (deep-link only route) | No | — |
| Messages | none on base; `?conversation=` in #199 | No | Workspace Surface, ≥ 48rem |
| Clients | **none** | No | ≥ 60rem |
| Commercial, Accounting, Documents | **none** | No | ≥ 60rem |
| Reporting, Agenda, Admin, Overview | none | — | — |

Implication: Clients needs a `?client=` intent before "open client in tab" or a
pasted client URL can work (Phase C prerequisite, additive).

### React lifecycle and state

- One panel is mounted (`switch (route)`). Leaving a module destroys all of its
  local state: applied filters, page, selection, open sections, scroll, drafts.
  AppShell resets `main.scrollTop` and focuses `main` on each route change.
- Module state is entirely local `useState` (e.g. Missions 29 hooks, Training 20,
  Clients 19); there is no shared store. Panels already accept *initial* intent
  props (`initialCandidateId`, `initialMissionId`, …) and emit `onSelectionChange` —
  the seam the proposed snapshot contract extends.
- `main.tsx` uses `StrictMode`; development double-invokes effects (a dev-only
  double refresh can trigger refresh-token reuse detection). Production does not.

### API, caching and authorization

- Twelve per-module request helpers in `api.ts` (4,342 lines) call `fetch`, parse
  with zod, and throw on non-2xx. No cache, no request deduplication, no
  `AbortController`; stale responses are dropped with alive refs/request counters.
- Measured duplication: every revisit refetches (551 GETs for 250 revisits of 5
  workspaces); Training issues `GET /v1/clients?page=1&pageSize=20` **twice per
  activation**; Commercial and Accounting each fetch the same client page.
- The access token lives in `AppRoutes` state, is a prop of every panel and appears
  in effect dependency arrays (`[accessToken, …]`), so a token change re-runs list
  loads. Module helpers do **not** refresh on `401`; only the `/auth/me` helpers
  do. TTL defaults to 300 s (max 900 s). Measured consequences are in the baseline.
- Authorization: client route gate `canAccessInternalRoute` (permission any-of);
  every API operation is enforced server-side. Permissions are refreshed only on
  login, reload or the account-menu refresh.

### Session restoration and storage

- Reload → `POST /auth/refresh` (httpOnly cookie) → user + token → route from the
  URL. The deep link is preserved through login because location is read at mount.
- `localStorage` holds only the locale and `hireme.navigation.expanded`. No
  `sessionStorage`, IndexedDB or draft persistence exists. Introducing tab
  persistence would be the first storage of navigation history and must avoid
  names/PII (see ADR §4).

### Unsaved forms

- 80 `<form>` elements across 12 modules; **no dirty tracking, navigation guard or
  `beforeunload` handler anywhere**. Confirmations exist only for destructive
  actions. Today a sidebar click or Back silently discards an edit; a console with
  closable tabs would multiply that risk.

### Polling and background work

| Poller | Interval | Owner | Runs when |
| --- | --- | --- | --- |
| Messages unread summary | 60 s | `AppRoutes` (always) | signed in + `messages:view`, document visible |
| Conversation list | 30 s | `MessagesPanel` | Messages mounted, visible |
| Open conversation | 15 s | `ConversationPane` | conversation open, visible |
| Notification unread (#199) | 60 s | AppShell (proposed) | signed in + notifications permission |

`useVisibleInterval` suspends on `visibilitychange` and resumes with an immediate
poll — the right primitive to reuse. Pollers stop on unmount today, so active-only
rendering preserves the "no polling from inactive tabs" property automatically;
keeping hidden React trees mounted without `<Activity>` would break it.

### Bundling

One 1,227,557-byte chunk (302.8 KB gzip) plus 140 KB CSS. Attribution from the
sourcemap: i18n dictionaries 17.8 % (all modules, both locales), react-dom 14.9 %,
Missions 9.1 %, Training 7.0 %, contracts 6.6 %, Accounting 6.2 %, zod 5.6 %,
Commercial 4.7 %, Tasks 4.6 %, Candidates 4.2 %. Feature modules together are ~48 %
of the shipped JS and none is lazy-loaded.

## Findings that change the plan

1. **Token lifetime vs long-lived tabs.** Module requests fail after access-token
   expiry instead of refreshing. A console invites hours-long sessions; a shared
   request core with single-flight refresh is a prerequisite (Phase B0).
2. **Silent draft loss already exists.** The draft registry/guard is needed even
   before tabs; Phase B must ship it with the first closable tab.
3. **No cache = no fast reactivation.** Reactivating a workspace costs a full
   remount plus refetch; a bounded response cache is required to approach the
   < 100 ms target honestly.
4. **Clients lacks a record URL.** Needed for record tabs and pasted links.
5. **Initial load is dominated by one long parse/evaluate task.** Lazy route chunks
   and per-locale dictionaries are the cheapest initial-load win and must precede
   adding console code to the entry bundle.
6. **Two shell pollers once #199 lands.** Consolidate into one shell poll registry
   so console chrome adds no extra timers.
7. **Refresh is rate-limited per IP.** `POST /auth/refresh` allows 20 per minute
   per IP (in-memory). Repeated reloads during measurement hit `429` and landed on
   the login page. With R-055 (no `trust proxy`) every user behind a reverse proxy
   shares one budget. Single-flight refresh is mandatory, and the limiter keying
   (R-055) should be resolved before a console rollout.

## Performance budget (proposed, against the measured baseline)

| Metric | Baseline (summary) | Budget for Phase B/C |
| --- | --- | --- |
| Entry JS (gzip) | 302.8 KB single chunk | ≤ baseline at B; ≤ 190 KB after lazy routes + locale split (B1) |
| Console code in entry | n/a | ≤ 8 KB gzip (tab manager, strip, switcher) |
| Long tasks on entry (4× CPU) | longest task median 1.3 s (p95 3.0 s), FCP median 1.5 s | no regression at B; −30 % after B1 |
| Reactivation of an open lightweight tab (4× CPU) | settled median 162–174 ms (Clients/Candidates/Missions), p95 ≈ 430–600 ms, always refetch | paint median < 100 ms with cached data; p95 < 250 ms; revalidation visible |
| First activation of a tab | 130–630 ms by module (4×) | ≤ baseline + 10 % with visible loading |
| Requests per reactivation within TTL | 1–7 (Tasks 7) | 0 blocking (background revalidation ≤ 1 per resource) |
| Heap after 10 tabs / 50 cycles (forced GC) | 17.4 MB / 18.4 MB, plateau | ≤ baseline + 5 MB at 10 open tabs; no growth slope after cycle 10 |
| DOM nodes / listeners after cycling | stable (no growth) | stable |
| Idle request rate (no Messages open) | see baseline | unchanged by number of open tabs |

## Risks and mitigations

| ID | Risk | Mitigation | Gate |
| --- | --- | --- | --- |
| CW-1 | Memory and duplicate effects grow with open tabs | Active-only rendering; ≤ 2 Activity-hidden dirty tabs; hard limit 10 | Heap/DOM/listener curve test (T4) |
| CW-2 | Inactive tabs keep polling | Pollers only in mounted components or one shell registry; Activity hides effects | Poll-count test with 10 tabs (T5) |
| CW-3 | Stale permissions in reused tabs | Re-check route on activation; principal-keyed cache; `reset` on principal change; API remains authority | Revocation test (T8) |
| CW-4 | Silent loss of unsaved drafts | Draft registry; dialog on close/switch/back; `beforeunload` only while dirty | Interaction tests D4–D7 |
| CW-5 | Confusing Back/Forward | URL fully describes the active tab; push only on tab switch; closed tabs reopen from URL | History tests H1–H2 |
| CW-6 | Token expiry and refresh races in long sessions | Shared request core, single-flight refresh, one retry, token getter instead of effect dependency | Expiry test (T7) |
| CW-7 | Cache serves another user's or a revoked principal's data | Cache key includes principal; in-memory only; cleared on sign-out/refresh failure | Unit + T8 |
| CW-8 | Tab persistence leaks names/PII on shared machines | No persistence in Phase B; later only IDs in `sessionStorage`, user-bound, cleared on sign-out | Security review before enabling |
| CW-9 | Entry bundle grows with console code | Lazy route chunks first (B1); console chrome budget ≤ 8 KB gzip | Bundle-size CI check (T1) |
| CW-10 | `api.ts`/`App.tsx`/AppShell are high-conflict files touched by #199 and module migrations | Land B0/B1 as small separate PRs; rebase on the integration branch; never absorb #199 changes | Merge-order note in each PR |
| CW-11 | Desktop strip squeezed at 1024px / 200 % zoom / FR labels | One row, truncation + overflow menu; mobile switcher < 900px | Responsive matrix (R1–R4) |
| CW-12 | Refresh limiter (20/min/IP) plus shared proxy IP (R-055) logs users out when many sessions refresh | Single-flight refresh per page; no refresh on activation; fix proxy/IP keying before rollout | Load check of refresh rate with N simulated users |
| CW-13 | Scope creep into a window manager | Explicit non-goals: drag-reorder, pinning, split panes, cross-browser-tab sync | Review checklist |

## Phased implementation plan

Each step is a separate draft PR against the integration branch, with exact-head CI
plus browser performance evidence produced by the baseline harness.

**A. Preflight (this PR) — remaining before sign-off**
- Clickable interaction prototype for browse/preview, open in tab, related record,
  reuse, close dirty, Back/Forward, overflow and mobile (Figma prototype links or an
  equivalent static HTML prototype kept outside application code).
- Maintainer answers to the ADR open questions.

**B0. Request core (prerequisite, no UI change)**
- Shared authorized request function: single-flight refresh, one `401` retry,
  token getter; migrate helpers module by module. Tests for concurrent refresh.

**B1. Lazy loading (no UI change)**
- `React.lazy` per module route; per-locale, per-module dictionaries; Suspense
  fallback inside the workspace surface. Bundle budget check in CI.

**B2. Console foundation**
- `ConsoleProvider`, tab descriptors, `openWorkspace`/`activate`/`close`, URL
  semantics, desktop strip + overflow, mobile switcher, draft registry and guard,
  `reset` on principal change, response cache for workspace lists. Workspace tabs
  only (no record tabs yet). Snapshot adoption for Clients, Candidates, Missions.

**C. Contextual records**
- `?client=` intent; "Open in tab" and related-record subtabs for Clients,
  Missions, Candidates; canonical focus; unavailable state; Activity-hidden dirty
  tabs if B2 evidence supports it.

**D. Cross-module integration**
- Notification Center/Messages deep links through `openRecord`/`openWorkspace`
  (after #199 merges); shell poll registry; Agenda/Notes stay utilities.

Deferred unless usability evidence justifies: drag-reorder, pinning, restoration
of all tabs after reload, customizable layouts, cross-browser-tab synchronization.

## Suggested performance and regression tests

Automated in CI (Vitest/jsdom):

- **U1** Tab reducer: open/focus idempotence, canonical record IDs, no nesting,
  fallback order on close, hard limit never evicts a dirty tab.
- **U2** URL codec: round-trips every interaction-matrix URL; rejects malformed,
  duplicate and unknown parameters without reads (extends
  `record-deep-links.test.ts`).
- **U3** Draft guard: close/switch/popstate on a dirty tab opens the dialog;
  Escape keeps editing; discard removes the draft.
- **U4** Principal change and sign-out clear tabs, snapshots and cache.
- **U5** Request core: N concurrent `401`s cause exactly one refresh; retry once;
  refresh failure signs out.
- **U6** Cache: in-flight dedupe, TTL expiry, invalidation by record, principal
  isolation.
- **T1** Bundle budget: build and fail if the entry chunk gzip exceeds the agreed
  budget or console chrome exceeds 8 KB gzip (script over `vite build` output).

Browser (Playwright against a production build + synthetic data; nightly or
pre-merge for console PRs; the baseline scripts are the starting point):

- **T2** Reactivation latency: 50 cycles over 5 open tabs at 4× CPU; report median
  and p95 paint and settled; fail above budget.
- **T3** First activation and deep link (clean session) with visible loading state.
- **T4** Memory: forced-GC heap, DOM nodes and listeners at 1, 5, 10 open tabs and
  every 10 cycles to 50; fail on positive slope beyond noise (> 0.05 MB/cycle) or
  > budget.
- **T5** Polling: 10 open tabs, Messages inactive, 3 idle minutes; request count
  equals the single-tab count; with Messages active, exactly one list and one
  conversation poller.
- **T6** Duplicate requests: per activation, no identical GET in flight twice.
- **T7** Token expiry: API with a 60 s TTL; after expiry, switching tabs triggers
  one refresh and no visible error.
- **T8** Revocation: remove a permission server-side, refresh account; tabs for the
  revoked module are dropped and the API refuses actions.
- **T9** History: scripted Back/Forward across open, switch, close and reopen.
- **T10** Responsive/a11y: 1440/1024/768/390, short height, 200 % zoom, EN/FR;
  no horizontal overflow; axe checks on strip and switcher; keyboard-only flows.
