# Issue #115 — Core UI accessibility and polish browser evidence

**Gate:** `ISSUE 115 UI POLISH GATE: PASS` (local Chrome; exact-head CI recorded on the PR)

### Environment

- **Branch:** `fix/issue-115-ui-a11y-polish`, based on `main` `fcf459c`.
- **Browser:** installed Google Chrome through `playwright-core` (`channel: 'chrome'`, headless), which supports `appearance: base-select`.
- **App:** local Vite web + API (development) against a disposable database provisioned with `pnpm test:db:provision` and synthetic seed data (clients, contacts, candidates, missions, tasks, overdue-task notifications). The database was dropped afterwards.
- **Matrix:** 1440, 430, and 390 px; EN (`en-GB`) and FR (`fr-FR`).
- Screenshots and raw metrics stay with the audit runner and are not committed.

### Measured before → after

| Defect | Before (main) | After (branch) |
| --- | --- | --- |
| Notifications: select vs "Mark all read" | select 41px, bottom 1756; button 35px, bottom 1740 (EN 1440) | both 40px with the same top edge at 1440; both 44px at 430/390 |
| Notifications: opened choice list | native OS list | Hire-Me surface, radius, popover shadow, checkmark, focus fill + inset ring (Chrome `base-select`) |
| Notifications keyboard | — | Tab focuses the select (3px focus ring); Enter opens; Arrow moves; Enter selects (`UNREAD`); Escape closes and returns focus to the select, EN and FR at every width |
| Muted text / selected row | 4.32:1 | 4.71:1 (gate pair added) |
| Muted hint / subtle surface | 4.47:1 | 4.89:1 (gate pair added) |
| `.ui-field` stretch (Missions link-candidate form) | controls 39 / 41 px | all 37 px |
| Client status badges | 299px in a 323px row | 83px (content width), all widths |
| Client lifecycle on a Prospect | "Mark prospect" enabled (no-op) | only "Mark active", "Mark inactive", "Archive client" |
| Reporting drilldown at 1440 | FR `scrollWidth` 1090 > 1082 (last column clipped); no region role | fits (1082/1082) EN and FR; `role=region`, `tabindex=0`, localized name |
| Reporting zero-trend rows | 88px each | 32px one-line "No activity in this window" |
| Mobile drawer nav targets (430/390) | links 36px, session buttons 35px | links and Close / Refresh / Sign out 44px |
| FR Task filter values at 1440 | "Échéance, la plus proche d’abord" truncated | no truncated select value on any route at 1440/430/390, EN or FR |
| Task card people line (FR 1440) | "Responsable : Development Administrator" wrapped (85px) | "Responsable : vous" (44px) |
| Missions picker label | "Search Client", "Search Team member" | "Search: Client", "Search: Team member" (matches FR "Rechercher : …") |
| Salary range | could break inside one amount | each bound is `nowrap`; wraps only between bounds |
| Over-long prose lines | Task "Reminder delivery" ≈136 chars/line; FR candidate empty state ≈101 | bounded by `--layout-reading-measure` (72ch) |

### Regression sweep

Every route (`/`, Tasks, Reporting, Clients, Candidates, Missions, Training, Documents, Admin) at 1440/430/390 in EN and FR: **no horizontal page overflow**, **no truncated select value**, and one select height per density (37px compact; 40px standard; 44px Notifications on phones).
