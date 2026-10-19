# ADR proposal — HireMe Console Workspace v1.0 tab manager (D-089)

Status: **Proposed — Issue #198 Phase A. Human sign-off required before Phase B.**
Nothing here is an accepted decision or an implementation. Companion documents:
[preflight assessment](./console-workspace-v1-preflight.md),
[interaction matrix](./console-workspace-v1-interaction-matrix.md) and
[performance baseline](../audit/console-workspace-v1-baseline.md).

Base: integration branch `fix/ui-refinement-demo-20261013` at `bd46f59` (AppShell
v1.2 #195 and Workspace Surface v1.0 #197 merged into it; #194 into `main` and the
Notification Center #199 are still open drafts).

> **Amendments A1–A7 from Issue #228 (2026-10-19, `main` `cfe6be6`) — approved in the PR #229
> review with refinements RV1 (tab identity in `history.state`, URL-only fallback) and RV2 (guard
> asks only for genuinely unsaved input).**
> The [#228 preflight](./console-workspace-tabs-preflight-228.md#amendments-proposed-by-this-preflight)
> re-audited `main`: B0 (request core, #203/#209) and B1 (lazy routes, #208) are done, and
> Workspace v2 made the quick preview local state and the record query a pushed focused view.
> It proposes: **A1** keep today's URLs and treat tab membership as session state (replaces §4's
> `tab=record` grammar; only cross-module record tabs add `in=`); **A2** no response cache in
> Phase B (§5); **A3** confirm-only drafts, no hidden `<Activity>` tabs (§1, §6), because hidden
> Activity would release the effect-based leave guard; **A4** prune tabs on permission-only
> changes, remount on user/session changes (§7); **A5** desktop strip in the utility-bar
> breadcrumb slot (§9); **A6** reuse `navigation-guard.ts` and extend guard coverage first;
> **A7** optional, versioned workspace snapshots. Sections below are unchanged and must be read
> together with those amendments.

## Context

Issue #198 asks for Salesforce-inspired, deliberately simpler in-app tabs: primary
workspace tabs per module and flat record subtabs, inside one browser tab, with
performance as a hard gate. The current web app (measured and read in the
preflight) has:

- a hand-rolled router in `App.tsx` — `{ route, search }` state, `pushState` on
  navigation, one `popstate` listener, `replaceState` when Candidates, Missions and
  Training change selection; one path per module, record identity in query
  parameters validated by `navigation/record-deep-links.ts`;
- exactly one mounted module panel (`switch (route)`); leaving a module unmounts
  it, so filters, page, selection, scroll and **unsaved drafts are discarded with no
  warning** (no dirty tracking exists in any of the 80 forms);
- no client data cache: twelve per-module request helpers in `api.ts` call `fetch`
  directly; every activation refetches (measured: 551 requests for 250 revisits);
- the access token in `AppRoutes` state, passed as a prop and listed in effect
  dependencies; module requests do not retry after `401`, and only `/auth/me`
  helpers refresh; the refresh token rotates with reuse detection;
- one eagerly loaded 1.23 MB (303 KB gzip) JavaScript chunk containing every
  module and both locale dictionaries;
- visibility-aware polling only in Messaging (unread summary 60 s at app level;
  list 30 s and open conversation 15 s while Messages is mounted). #199 adds a 60 s
  notification poll in the shell.

## Decision (proposed)

### 1. Active-only rendering with serializable tab snapshots

- Only the **active tab's module is mounted**. An inactive tab is a descriptor plus
  a bounded, serializable UI snapshot — not a hidden React tree, iframe or second
  app instance.
- **Single exception, measured before adoption:** a tab with a dirty draft may be
  kept mounted under React 19.2 `<Activity mode="hidden">` (React 19.2.7 is already
  installed). Hidden Activity keeps component state but destroys effects, so its
  polls and subscriptions stop. Cap: at most **2 hidden dirty tabs**; a third dirty
  tab must be saved, discarded or kept active. If Phase B evidence shows any
  hidden-tab work or unbounded memory, fall back to guarded switching (§6).

Rejected: keeping every opened tab mounted (memory and duplicate effects scale with
tab count — the issue's main risk); iframes / multiple app roots (duplicate auth,
polling and memory); a generalized window manager.

### 2. Central tab manager — small, dependency-free

One `ConsoleProvider` (React context + `useReducer`) under `AppRoutes`, owning:

```ts
type TabKind = 'workspace' | 'record';
type ConsoleModule = 'clients' | 'missions' | 'candidates' | /* other routes */ InternalRoute;
type RecordType = 'client' | 'mission' | 'candidate'; // Phase C scope only

interface TabDescriptor {
  id: string; // canonical, see §3
  kind: TabKind;
  module: ConsoleModule; // module whose panel renders this tab
  record?: { type: RecordType; id: string }; // UUID, validated like record-deep-links
  parentId?: string; // workspace tab id; record tabs only; never another record tab
  openedAt: number;
  lastActiveAt: number;
  snapshot: TabSnapshot; // bounded, JSON-serializable
  dirty: boolean; // reported by forms through the draft registry
  status: 'ready' | 'unavailable'; // unavailable after 403/404 or revocation
}

interface TabSnapshot {
  // Each module declares a versioned schema; unknown/oversized snapshots are dropped.
  v: 1;
  query?: Record<string, string | number | boolean>; // applied filters, sort
  page?: number;
  selectedId?: string; // preview selection inside a workspace tab
  section?: string; // active record section/tab key
  scrollTop?: number;
}

interface ConsoleState {
  tabs: TabDescriptor[]; // display order
  activeId: string;
  principalKey: string; // user id + sorted permission hash
}
```

Operations are the **only** way to change tabs; navigation, deep links,
Notification Center and Messages all call the same functions:

| Operation | Contract |
| --- | --- |
| `openWorkspace(module)` | Focus the module's workspace tab, creating it if absent. Never creates duplicates. |
| `openRecord(record, { from })` | Canonicalize; if a tab for the record exists anywhere, focus it (no reparenting); otherwise create it under `from`'s workspace (or the record's own module when opened by URL) and focus it. |
| `previewRecord(record)` | Update the active workspace tab's `selectedId` only (today's row click). No new tab, `replaceState`. |
| `activate(id)` | Re-check route permission, snapshot the outgoing tab, mount the incoming one, `pushState`. |
| `close(id)` | If dirty → draft decision (§6). Remove and activate the fallback (§4). |
| `reset(reason)` | Sign-out, principal change, refresh failure: drop every tab, snapshot and cached response. |

Module panels receive their snapshot as initial props (`initialQuery`, `initialPage`,
`initialSelectedId`, …) and report changes through one `onSnapshotChange` callback —
the same shape as today's `initialCandidateId` / `onSelectionChange`, so adoption is
per module and incremental.

No new runtime dependency is proposed. A router library or TanStack Query would
each add a dependency and a broad migration; see §5 and the open questions.

### 3. Stable identity

- Workspace tab: `ws:<module>` — one per module.
- Record tab: `rec:<recordType>:<uuid>` — **one per record across the console**.
  The parent is presentation only; reopening from another workspace focuses the
  existing tab, it does not move or copy it.
- Subtabs are flat siblings under one workspace. A record opened from a record tab
  becomes a sibling under the same workspace, never a child of the record tab.
- Labels are resolved from data at render time and kept in memory only; tab IDs
  contain no names (candidate/client names are personal or commercial data).

### 4. URL and history semantics

The URL always describes the **active tab** completely; it is sufficient on its own
in a clean session.

| Active tab | URL | Notes |
| --- | --- | --- |
| Workspace, nothing selected | `/clients` | Unchanged existing paths |
| Workspace with preview selection | `/candidates?candidate=<uuid>` | Existing deep links keep working as preview |
| Record tab | `/candidates?candidate=<uuid>&tab=record` (parent implied by module) or `…&tab=record&in=clients` | Additive; the parameter grammar extends `record-deep-links.ts`; `in` is validated against the registry and the user's permissions |

Rules:

- Activating a different tab = `pushState`. Preview selection, filter and page
  changes inside a tab = `replaceState` (today's behavior). History therefore
  records tab switches, not every row click.
- Back/forward restores whatever the URL says: if that tab is open it is
  activated with its snapshot; if it was closed it is **reopened from the URL**
  (fresh data, empty snapshot). A closed tab never resurrects its old draft.
- Close = remove + `replaceState` to the fallback: the most recently active
  remaining tab in the same workspace, else the workspace tab, else the previous
  active tab overall.
- Unknown, malformed or duplicated parameters are ignored exactly as today and
  never trigger a read; unauthorized targets render the existing access-denied
  state without leaking the record's existence beyond what the API returns.
- Modified clicks (Ctrl/Cmd/middle) keep native browser behavior: a new browser
  tab, which starts its own independent console from the URL.

Reload: the active tab is restored from the URL. **Other tabs are not restored in
Phase B.** Restoring the open-tab list from `sessionStorage` is deferred to a
separately approved step (security review: IDs only, no labels, snapshots or
drafts; key bound to user id; cleared on sign-out, principal change and refresh
failure).

### 5. Data, cache and polling

- **Prerequisite (Phase B0):** one shared request core in `api.ts` with
  single-flight refresh and one retry on `401`, and a stable token getter so that
  token rotation no longer re-runs every `[accessToken]` effect. Without it, long-
  lived tabs hit expired tokens (TTL 300 s default, 900 s max) and parallel
  refreshes risk reuse detection.
- **Response cache:** a bounded in-memory map keyed by
  `principalKey + method + path + query`, GET only, with in-flight deduplication,
  short TTL (proposed 30 s list / 60 s detail), stale-while-revalidate on tab
  activation, LRU cap (proposed 100 entries) and explicit invalidation by the
  mutating module (record type + id). Never persisted. Cleared on `reset`.
  Alternative: TanStack Query (maintained, well-understood) — requires explicit
  maintainer approval as a new dependency; recommended only if the in-house cache
  grows beyond ~150 lines or needs retries/refetch policies.
- Render a snapshot-driven skeleton immediately and the cached response if fresh;
  always show a visible loading state for first loads and revalidation. Do not
  fake instant loads.
- **Polling ownership:** pollers live only in mounted components or in one shell-
  level registry. Inactive tabs are unmounted (or Activity-hidden), so they run no
  polls. The shell keeps one unread-summary poll shared by the badge and the
  Notification Center (#199 currently adds a second 60 s shell timer).

### 6. Drafts

- A small draft registry: forms report `dirty` for their tab; the manager blocks
  silent loss on close, tab switch (when the tab cannot be Activity-hidden),
  sidebar navigation, `popstate` and `beforeunload`.
- Close/switch on a dirty tab opens one accessible confirmation: **Keep editing**
  (default focus) / **Discard changes**. Saving stays in the form.
- No draft content is persisted to storage. Optional in-memory form snapshots are
  out of scope until a module needs them.

### 7. Authorization and session

- A tab descriptor is never an authorization artifact. Every activation re-runs
  `canAccessInternalRoute` against the current user; the API remains the authority
  for every read and action, including in reused tabs.
- `principalKey` change (sign-out, `onRefreshUser` returning different
  permissions, failed refresh) → `reset`: tabs, snapshots and cache are dropped.
- A `403`/`404` on a record tab marks it `unavailable` with a localized message and
  a Close action; it does not retry in the background.

### 8. Loading and bundles

- `React.lazy` per module route behind a Suspense boundary inside the workspace
  surface, so AppShell and the tab strip stay interactive; locale dictionaries
  split per module and locale. No preloading of every module at entry; optional
  idle prefetch of the hovered/focused destination only.

### 9. Limits and responsive behavior

- Soft limit 8 open tabs (non-blocking notice), hard limit 10. At the hard limit
  the open action offers "Replace least recently used clean tab" or opens the
  overflow list to close tabs; a dirty tab is never replaced.
- Desktop (≥ 900px shell): one tab strip row in the workspace header: workspace
  tabs, then the active workspace's record subtabs, then an overflow/search
  button. No empty subtab row (the Figma frames reserve one).
- Mobile (< 900px): no tab strip; a "Workspaces" switcher (list dialog) in the
  header with the same operations, keyboard and screen-reader semantics.

## Consequences

Positive: bounded memory (one mounted module, ≤ 2 hidden dirty tabs), no inactive
polling, URL-complete deep links, incremental per-module adoption without a
router/state library, and a fix for today's silent draft loss and token expiry.

Costs: each participating module must accept snapshot props and report dirty
state; the request core and cache touch `api.ts` (high-conflict file); reactivation
remains a remount (cheap with cache, measured ~100–400 ms today without it).

## Open questions for sign-off

1. Record-tab URL grammar: `?…&tab=record` (proposed, additive) or new path
   segments (cleaner but changes `pathToRoute` exact matching).
2. In-house response cache (proposed) vs TanStack Query (new dependency).
3. Hidden-Activity retention of up to 2 dirty tabs vs confirm-only drafts.
4. Whether any multi-tab restoration after reload is wanted in v1.0.
5. Which modules join Phase C beyond Clients, Missions and Candidates.
