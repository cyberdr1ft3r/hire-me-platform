# Console Workspace v1.0 — interaction behavior matrix (proposed)

Status: **Proposed — Issue #198 Phase A.** Each row is a testable contract for
Phase B/C and the basis of the clickable prototype the issue still requires. It
follows the proposed [ADR (D-089)](./console-workspace-v1-adr-proposed.md).

Legend — **Today**: behavior measured or read on `bd46f59`. **Proposed**: target.
**Hist.**: browser history effect (`push` = new entry, `replace` = same entry,
`—` = none). IDs `C1…` are referenced by the regression tests in the
[preflight](./console-workspace-v1-preflight.md#suggested-performance-and-regression-tests).

## Navigation and opening

| ID | Trigger | Today | Proposed | Hist. |
| --- | --- | --- | --- | --- |
| N1 | Select a module in the rail/context panel | Unmounts current module, mounts target, `main` scroll reset, focus to `main` | `openWorkspace(module)`: focus existing workspace tab with its snapshot, or create it | push |
| N2 | Same module selected again while active | Remount-free no-op (same route) | No-op; does not reset filters | — |
| N3 | Row click in a list (Clients, Candidates, Missions) | Preview in the same pane; Candidates/Missions update the URL | Unchanged preview (`previewRecord`); no tab created | replace |
| N4 | Explicit **Open in tab** on a row or record header | Not available | `openRecord(record, { from: active workspace })` | push |
| N5 | Contextual related record (e.g. a mission inside a client) | Navigates to the other module and loses the client context | `openRecord` as a sibling subtab under the originating workspace | push |
| N6 | Open a record that is already open (any workspace) | — | Focus the canonical tab; no duplicate, no reparenting | push |
| N7 | Open from a record tab (record → related record) | — | Sibling under the same workspace, never nested | push |
| N8 | Ctrl/Cmd/middle click on any destination or "Open in tab" link | Native new browser tab | Unchanged native behavior; the new browser tab starts its own console from the URL | — |
| N9 | Create Client/Mission (drawer, #196) | Drawer/disclosure inside module | Drawer remains in the active tab; on success the created record previews in the workspace; "Open in tab" optional | replace |
| N10 | Notification Center / Messages deep link (#199) | `navigateToPath('/messages?conversation=…')` | Same operation set: Messages focuses its workspace and the conversation; task links focus the Tasks workspace with the task selected | push |
| N11 | Agenda / Notes utilities | Agenda is a route | Remain utilities/routes, never console tabs | push |

## Closing, limits and drafts

| ID | Trigger | Today | Proposed | Hist. |
| --- | --- | --- | --- | --- |
| D1 | Close a clean record tab | — | Remove; activate most recent tab in the same workspace, else its workspace tab | replace |
| D2 | Close the active workspace tab that has record subtabs | — | Confirm closing the group (lists count); dirty subtabs block as D4 | replace |
| D3 | Close the last remaining tab | — | Not closable when it is the only tab; Overview workspace is the floor | — |
| D4 | Close a dirty tab | Not applicable (drafts are silently lost on navigation) | Dialog: **Keep editing** (default) / **Discard changes**; Escape = keep | replace on discard |
| D5 | Switch away from a dirty tab | Draft silently lost | Keep it mounted hidden (`<Activity>`, max 2 hidden dirty tabs); at the cap, D4 dialog | push |
| D6 | Sidebar navigation or Back/Forward while dirty and cap reached | Silent loss | D4 dialog before the transition; cancelling restores the URL with `pushState` | — |
| D7 | Reload/close the browser tab while dirty | Silent loss | Native `beforeunload` prompt only while a dirty draft exists | — |
| D8 | Open the 9th tab | — | Non-blocking notice (soft limit 8) | push |
| D9 | Open the 11th tab | — | Blocked with options: replace LRU **clean** tab, or open the overflow list to close tabs; never replaces a dirty tab | — |
| D10 | Overflow/search menu | — | Lists all tabs with workspace grouping, filter-as-you-type, close buttons; keyboard operable | — |

## History, deep links and session

| ID | Trigger | Today | Proposed | Hist. |
| --- | --- | --- | --- | --- |
| H1 | Back after switching tabs A → B | Previous module remounted from scratch | Activate A with its snapshot (cache permitting) | — |
| H2 | Back to an entry whose tab was closed | — | Reopen from the URL with fresh data; old draft never resurrected | — |
| H3 | Paste a record URL in a clean signed-in session | Candidates/Missions/Training/Tasks/Meetings resolve; Clients/Commercial/Accounting/Documents have no record parameter | Opens the record (preview or record tab per `tab=`); workspace parent created lazily without fetching | — |
| H4 | Paste a record URL while signed out | Login, then route from URL (path and query kept by the page) | Same; after login the deep link is honored once | — |
| H5 | Reload | Active route restored; everything else lost | Active tab restored from the URL; other tabs not restored in Phase B | — |
| H6 | Malformed/duplicated/unknown parameters | Ignored before any read | Unchanged; never creates a tab | — |
| H7 | Record later deleted/archived or access revoked | Module error state | Tab marked unavailable with message + Close; no background retry | — |
| S1 | Sign-out | Token/user cleared, navigate home | `reset`: all tabs, snapshots, cached responses dropped | push |
| S2 | Account refresh returns different permissions | User replaced; current route re-checked | Principal change → `reset`, then reopen the URL's tab if still permitted | replace |
| S3 | Access token expires (300 s default) | Module reads fail with `401` and show errors; no automatic refresh | Shared request core refreshes once (single-flight) and retries; failure → S1 | — |
| S4 | Second browser tab of the app | Independent app; shares refresh cookie | Independent console; no cross-tab sync in v1.0 (documented) | — |

## Keyboard, accessibility and responsive

| ID | Behavior | Proposed |
| --- | --- | --- |
| A1 | Tab strip semantics | `role="tablist"` per row with roving `tabindex`; Left/Right move, Home/End jump, Enter/Space activate; each tab has a separate close button (`aria-label` "Close <title>") reachable by Tab |
| A2 | Keyboard shortcuts | Optional and conflict-checked: `Ctrl+Alt+W` close, `Ctrl+Alt+[ / ]` previous/next; never override browser shortcuts |
| A3 | Focus on activation | Focus moves to the workspace heading (as AppShell does today on route change); closing returns focus to the newly active tab |
| A4 | Announcements | Polite live region for "Tab opened", "Tab closed", limit notices; localized EN/FR |
| A5 | Dirty indicator | Visible dot plus text in the accessible name ("unsaved changes") |
| R1 | 1440 / 1024px | One strip row; long titles truncate with tooltip; overflow button appears before tabs shrink below a readable minimum |
| R2 | 768px (≥ 900px shell boundary not met) | Mobile switcher (R4) |
| R3 | Short height / 200% zoom | Strip never wraps into multiple rows; `main` remains the scroll owner (Workspace Surface rules) |
| R4 | < 900px | "Workspaces" button opens a list dialog (same operations, close buttons, dirty markers); no desktop tab strip |
| L1 | EN/FR | Titles from data; chrome strings from dictionaries; French strings measured for truncation |
