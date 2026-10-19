# Console Workspace v1.0 — interaction behavior matrix (proposed)

Status: **Proposed — revised for Issue #228 Phase A on `main` `cfe6be6`.** Each row is a testable
contract for Phase B/C. It follows the proposed [ADR (D-089)](./console-workspace-v1-adr-proposed.md)
as amended by the [#228 preflight](./console-workspace-tabs-preflight-228.md) (A1–A7). Row IDs from
the #198 version are kept; new rows are marked **new**.

Legend — **Today**: behaviour read or measured on `main` `cfe6be6`. **Proposed**: target. **Hist.**:
browser history effect (`push` = new entry, `replace` = same entry, `—` = none). **PR**: first PR
in the [#228 sequence](./console-workspace-tabs-preflight-228.md#5-implementation-sequence-and-acceptance-gates)
that must pass the row. Test IDs (U*, T*) are defined in the
[#228 test plan](../audit/issue-228-console-tabs-preflight.md#regression-strategy).

## Navigation and opening

| ID | Trigger | Today | Proposed | Hist. | PR |
| --- | --- | --- | --- | --- | --- |
| N1 | Select a module in the rail/context panel | Unmounts current module, mounts target (lazy chunk on first visit), `main` scroll reset and focus | `openWorkspace(route)`: focus the existing workspace tab (snapshot from B3) or create it | push | B2 |
| N2 | Same module selected again while active | No-op | No-op; filters kept | — | B2 |
| N3 | Row click in Clients/Candidates/Missions | Quick preview from the list row (local state, no request, no URL change) | Unchanged; never creates a tab | — | B2 (regression) |
| N4 | **Open full profile** (preview or row action) | Focused record in the module, `push` `/<module>?<record>=<id>` | `showRecord`: same view in the current workspace tab; if a record tab for it is open, focus that tab instead | push | C1 |
| N4b **new** | Explicit **Open in tab** (preview header, focused-record header) | Not available | `openRecordTab(record, { from: active workspace })` | push | C1 |
| N5 | Contextual related record (client → mission, candidate → related item, Reporting drill-down) | Navigates to the other module and loses the origin | `openRecordTab` as a sibling under the originating workspace; URL gets `in=<origin>` | push | C2 |
| N6 | Open a record that is already open (any workspace) | — | Focus the canonical tab; no duplicate, no re-parenting | push | C1 |
| N7 | Related record opened from a record tab | — | Sibling under the same workspace, never nested | push | C2 |
| N8 | Ctrl/Cmd/middle click on a link | Native new browser tab for real links (`CandidateRelated`, Reporting); `ClientRelatedMissions` is a button and cannot | Native everywhere; Phase C turns related buttons into links. The new browser tab starts its own console | — | C2 |
| N9 | Create Client/Mission/Candidate (drawer, #196/#204) | Drawer inside the module, guarded | Unchanged inside the active tab; success previews or opens the record as today | as today | B2 (regression) |
| N10 | Notification Center / Messages / Agenda destination | `navigateToPath` (`push`), guarded | Same paths through `openWorkspace`/`showRecord`; no new polling | push | D1 |
| N11 | Overview, Agenda, Meetings | Routes | Not console tabs; Overview is the permanent floor tab | push | B2 |

## Closing, limits and drafts

| ID | Trigger | Today | Proposed | Hist. | PR |
| --- | --- | --- | --- | --- | --- |
| D1 | Close a clean record tab | — | Remove; activate the most recent tab in the same group, else its workspace tab | replace | C1 |
| D2 | Close a workspace tab that has record tabs | — | One confirmation naming the count; unsaved members trigger D4 first | replace | C1 |
| D3 | Close Overview / the only tab | — | Not closable | — | B2 |
| D4 | Close a tab with unsaved input | — | Existing guard confirmation; cancel keeps editing; confirm discards and closes | replace on confirm | B2 |
| D5 | Switch away from a tab with unsaved input | Guarded surfaces ask; Tasks/Training/Accounting/Commercial/Documents/Admin/Messages composer lose input silently | Every module asks (B0′); no hidden mounted trees (A3) | push on confirm | B0′, B2 |
| D6 | Sidebar or Back/Forward with unsaved input | Guarded surfaces: undo + confirm + replay (`navigation-guard.ts`); others silent | Same mechanism for all modules and for tab activation | — | B0′ |
| D7 | Reload/close the browser tab with unsaved input | `beforeunload` on guarded surfaces only | `beforeunload` for every module while dirty | — | B0′ |
| D8 | Open the 9th tab | — | Polite notice (soft limit 8) | push | B2 |
| D9 | Open the 11th tab | — | Offer: replace least recently used tab without unsaved input, or open the tab list; never blocked without a way out | — | B2 |
| D10 | "More tabs" menu / mobile tab dialog | — | All tabs grouped by workspace, filter above 6 tabs, close buttons, unsaved markers, keyboard operable | — | B2 |
| D11 **new** | Sign-out with unsaved input | Sign-out does not ask (session ends); input lost | Unchanged by design (ending the session drops everything); documented | push | B2 |

## History, refresh, deep links and session

| ID | Trigger | Today | Proposed | Hist. | PR |
| --- | --- | --- | --- | --- | --- |
| H1 | Back after switching tabs A → B | Previous module remounts and refetches (median settled 91 ms at 4×) | Activate A (snapshot from B3) | — | B2 |
| H2 | Back to an entry whose tab was closed | — | View renders in its workspace tab with fresh data; no tab or draft resurrected | — | B2 |
| H3 | Paste a record URL in a clean signed-in session | Candidates/Clients/Missions/Training/Tasks/Meetings/Messages resolve; Commercial/Accounting/Documents have no record parameter | Unchanged: the view opens in its workspace tab; no record tab unless `in=` is present | — | B2 |
| H3b **new** | Clean session with `…&in=clients` | Parameter ignored | Creates `ws:clients` (no data fetch) and the record tab under it, if both routes are permitted; otherwise ignored | — | C2 |
| H4 | Paste a record URL while signed out | Login, then the URL is honoured | Same | — | B2 (regression) |
| H5 | Reload | Active view restored from the URL; everything else lost | Same: active view restored, other tabs not restored (no storage in Phase B) | — | B2 |
| H6 | Malformed, duplicated or unknown parameters | Ignored before any read | Unchanged; never creates a tab | — | B1 (U2) |
| H7 | Record deleted, archived or no longer accessible | Module error/denied state | Record tab shows "unavailable" with Close; no background retry | — | C1 |
| H8 **new** | Back/Forward across many tab switches | Remount per step | Every step activates or shows the URL's view; history length equals the number of activations | — | B2 |
| H9 **new** | Back while the guard holds a traversal | Undo + confirm + replay | Same; the strip shows the tab the user stays on | — | B2 |
| S1 | Sign-out (this browser tab or another, D-090) | `ended` event clears user/token; modules unmount | Console remounts empty (A4) | push | B2 |
| S2 | Account refresh changes permissions | User replaced; route gate re-evaluated | Prune tabs whose route is now denied; active denied tab shows the permission-denied state with Close (A4) | replace | B2 |
| S3 | Access token expires | Request core refreshes single-flight and replays (#203/#209) | Unchanged; tab activation never triggers a refresh by itself | — | B2 (regression) |
| S4 | Second browser tab of the app | Independent app, coordinated refresh (D-090) | Independent console; no tab sync in v1 | — | B2 |
| S5 **new** | Different user signs in on the same browser tab | New user state after login | Provider keyed by user id + session epoch: no tab, label or snapshot of the previous user survives | — | B2 |

## Keyboard and accessibility

| ID | Behaviour | Proposed | PR |
| --- | --- | --- | --- |
| A1 | Strip semantics | `role="tablist"` named "Open tabs" / « Onglets ouverts », roving `tabindex`; Left/Right, Home/End; Enter/Space activate (manual activation); each tab has a separate close button ("Close <title>") reachable by Tab; `Delete` on a focused tab closes it | B2 |
| A2 | Shortcuts | None beyond A1 in v1; never override browser shortcuts | — |
| A3 | Focus | Keyboard activation keeps focus in the strip; pointer/list activation focuses `main` as AppShell does today; after close, focus goes to the new active tab | B2 |
| A4 | Announcements | Polite live region for opened/closed/limit messages, EN/FR | B2 |
| A5 | Unsaved marker | Visible dot plus "unsaved changes" in the accessible name | B2 |
| A6 **new** | Nested tablists | Record-section tablists inside a record keep their own arrow-key handling; the strip never captures keys outside itself | B2 |
| A7 **new** | Mobile tab dialog | Modal dialog with focus trap, Escape closes and returns focus to the "Tabs" button, list items are buttons with close actions | B2 |

## Devices, zoom and locale

Measured today on `/candidates` (EN and FR identical): utility bar 56px; page header 77px tall on
desktop, 137px on mobile; no horizontal overflow at any size below.

| ID | Viewport | Today | Proposed | PR |
| --- | --- | --- | --- | --- |
| R1 | 1440×900 (main 1200px wide) | Breadcrumb in utility bar | Strip in the breadcrumb slot; ~6 tabs before overflow | B2 |
| R1b **new** | 1024×768 (main 784px) | Same | Strip in the slot; ~3 tabs then "More tabs"; titles truncate with full title in tooltip and accessible name | B2 |
| R2 | 768×1024 (mobile navigation, < 900px) | Modal navigation | No strip; "Tabs" button + dialog (R4) | B2 |
| R3 | 1280×400 short height, 200 % zoom | Document scrolls; `main` is not a fixed scroll box | Strip never wraps and adds no height (lives in the utility bar); no obscured controls | B2 |
| R4 | 390×844 | Modal navigation, document scrolls | "Tabs" button + dialog; no desktop strip or subtabs | B2 |
| L1 | EN/FR | Shell and migrated modules localized; Admin keeps the English boundary | Console strings in both dictionaries; FR truncation measured at 1024px; titles come from data | B2 |
| L2 **new** | Locale change with tabs open | Re-renders in place | Tabs and labels re-render; no tab is closed or refetched because of a locale change | B2 |
