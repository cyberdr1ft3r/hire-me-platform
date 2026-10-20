# Accepted Architecture Record — HireMe Console Workspace v1.0 (D-089)

Status: **Accepted — Issue #198 Phase A, 2026-10-19, with RV1 and RV2 refinements.**
This record describes the approved Phase A architecture. Each implementation phase remains
subject to its own review, exact-head CI, and explicit merge authorization.

Companion documents:
[#228 preflight assessment](./console-workspace-tabs-preflight-228.md),
[interaction matrix](./console-workspace-v1-interaction-matrix.md), and
[performance baseline](../audit/issue-228-console-tabs-preflight.md).

Decision baseline: main at cfe6be6, audited in PR #229. The original Issue #198
proposal below is retained only where it agrees with the accepted amendments and the
[#228 preflight](./console-workspace-tabs-preflight-228.md).

> **Accepted amendments A1–A7 and refinements RV1/RV2.** Keep existing record URLs and
> treat tab membership as in-memory console state; RV1 stores console-instance and
> canonical-tab identity in the existing router history state, with deterministic
> URL-only fallback and no second history authority. RV2 protects only genuinely
> unsaved input. Render only the active module; never retain inactive modules in hidden
> React Activity trees. Do not add a response cache in B2. Do not restore open tabs
> from sessionStorage in v1.0. The accepted preflight and this record supersede
> conflicting statements in the historical proposal sections below.

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

## Accepted architecture

### 1. Active-only rendering

- Exactly one active workspace module is mounted at a time. Inactive tabs are lightweight,
  bounded in-memory descriptors and (where implemented in a later approved phase) validated
  serializable UI snapshots.
- There is no hidden-module exception: never keep an inactive dirty module mounted in a
  hidden React Activity tree. Before a transition that would unmount a dirty module, the
  shared guard asks for confirmation. A confirmed discard permits the transition; staying
  keeps the active module mounted and its input intact.
- No iframe, duplicate application root, or hidden copy of a module. This keeps effects,
  polling, subscriptions, and memory bounded by the active module.

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

### 4. URL and history semantics (A1, RV1)

- Preserve existing paths and record query parameters. Examples include /clients,
  /clients?client=<uuid>, /candidates?candidate=<uuid>, and
  /missions?mission=<uuid>. Do not introduce a tab=record parameter or change
  pathToRoute URL behavior. The URL describes the active route/record intent; the open-tab
  collection is in-memory console state.
- A cross-module record-tab URL may carry the existing validated in=<module> hint. It is
  contextual intent only; malformed, duplicate, incompatible, or unauthorized hints are ignored.
- The existing pushHistoryPath / replaceHistoryPath functions remain the sole history
  writer and the existing popstate path remains the sole traversal authority. RV1 adds
  optional metadata to that existing state: a console-instance ID and canonical tab ID.
- Resolve an entry deterministically: a compatible open tab from the current console instance;
  otherwise an already-open canonical record tab compatible with the URL; otherwise the
  URL-only workspace/record intent. Missing, stale, malformed, closed-tab, or URL-incompatible
  metadata never resurrects stale tab state. In a clean session, the existing URL still works.
- Back/Forward applies only after the existing navigation guard accepts the traversal. A closed
  tab's old identity is not authorization and does not recover its old draft. Modified links keep
  native browser behavior.
- Reload preserves the active route from the URL only. Do not persist or restore the open-tab list
  from sessionStorage in v1.0; any later restoration requires a separately reviewed phase.

### 5. Data, caching and polling

- No response cache or request deduplication is introduced in B2. Workspace activation uses
  the existing request behavior. Revisit performance is evaluated against the measured #228
  baseline; a future cache would require a separate evidence-backed decision and authorization.
- Keep existing lazy route boundaries; do not eagerly load every workspace or introduce a new
  runtime dependency as part of B2.
- Existing polling owners remain unchanged. Because only the active module is mounted, inactive
  modules run no pollers. Do not add a shell poll registry or polling merely to support tabs.

### 6. Unsaved input and navigation guards (RV2)

- Reuse the existing navigation guard as the single authority for in-app navigation, tab
  activation/close, Back/Forward, and unload protection. Integrate the B0′ guard stack; do not
  create a second popstate listener or independent confirmation system.
- A form blocks only while it contains genuinely unsaved input: it was changed and its current
  values differ from the editing baseline. Unchanged, reverted, saved, reset, and search/filter
  forms do not block. Writes in flight remain protected until success or failure is known.
- Confirm before any dirty workspace is unmounted, closed, or replaced. If the user stays, preserve
  the active module and its input; if the user confirms discard, proceed. Dirty record groups must
  not be silently removed by hard-limit replacement.
- Do not persist draft content or keep inactive modules mounted to retain it.

### 7. Authorization and session

- A tab descriptor or RV1 history hint is never authorization. Check current route permissions
  before every tab open, activation, history resolution, and protected render; server-side
  authorization remains authoritative for every read and action.
- On permission changes, immediately remove revoked inactive tabs. If the active tab loses access,
  keep only the minimum descriptor needed to render the existing permission-denied state and a
  close action; never render its protected content.
- Reset all console state on sign-out, session termination/epoch change, or principal change.
  Permission-only changes retain only still-authorized tabs. No tab state crosses users or sessions.

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

Positive: one active module bounds mounted effects and polling; existing record URLs and deep links
remain valid; the existing router and guard remain the single navigation authorities; no response
cache or persisted tab collection creates a new data-leak surface.

Costs: tabs are session-local descriptors, not hidden module instances, so switching away from
unsaved input requires an explicit decision. Module snapshots and tab restoration are deferred
rather than assumed.

## Deferred scope, not open Phase A decisions

- Open-tab restoration after reload is not part of B2 or v1.0; any later proposal requires a
  separate security review and explicit approval.
- A response cache is not part of B2. Reconsider only if measured performance misses the agreed
  budget, with separate design and authorization.
- Contextual record-tab launch controls and further module participation belong to later approved
  phases; they do not change the accepted B2 routing/history contract.
