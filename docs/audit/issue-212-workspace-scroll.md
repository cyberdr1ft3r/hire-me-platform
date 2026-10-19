# Issue #212 workspace scrolling audit

Date: 2026-10-16
Scope: Clients, Candidates, Missions, Documents, and Admin; desktop and mobile.

## Root cause

Missions has a deliberately bounded, sticky candidate-process detail (`overflow: auto`). The detail
also declared `overscroll-behavior: contain`, so once it reached its top or bottom edge the browser
was forbidden from handing the remaining wheel/trackpad/touch gesture to the document. The same
containment existed on the shared Workspace Surface pane bodies used by desktop fill layouts.

The surrounding flex/grid sizing is valid: fill pages, layouts, panes, and pane bodies already use
`min-height: 0` and `minmax(0, 1fr)` at the points that must shrink. Missions, Clients, Documents,
and Admin stay in document flow; Candidates uses a fill layout only at desktop widths and returns to
document flow on mobile. No application `wheel`/`onWheel` listener exists. The only body scroll lock
is the modal Drawer lifecycle, which restores the prior body overflow value on cleanup and was not
active during reproduction.

The focused fix keeps the intended nested overflow owners and changes only their boundary behavior
to `overscroll-behavior-y: auto`, allowing native scroll chaining.

## Browser evidence

The evidence runner is `scripts/issue-212-scroll-evidence.mjs`. It uses synthetic local records and
installed Chrome at 1440×900 and 390×844. For the before capture it reapplies the exact removed
`contain` declaration in-page; the after captures use the committed CSS.

- [Before: wheel trapped at the bottom of the Missions detail](issue-212-scroll/before-missions-wheel-trap.png)
- [After: wheel hands off to the document](issue-212-scroll/after-missions-wheel-handoff.png)
- [After: small trackpad-like deltas hand off to the document](issue-212-scroll/after-missions-trackpad-handoff.png)
- [Raw measurements and workspace matrix](issue-212-scroll/results.json)

Measured behavior:

| Input | Before | After |
| --- | --- | --- |
| Mouse wheel at detail bottom | detail `1301/1301`, document `0 → 0` | detail `1301/1301`, document `0 → 809` |
| Trackpad-like small deltas | trapped by the same declaration | document `0 → 140` |
| Keyboard `PageDown` | n/a | document `0 → 809` |
| Touch swipe at 390×844 | n/a | Missions document `0 → 1035` |

## Workspace matrix

All ten route/viewport combinations loaded with body scrolling unlocked and no horizontal document
overflow. Every combination with fixture overflow moved its expected owner under a wheel gesture.

| Workspace | Desktop 1440×900 | Mobile 390×844 |
| --- | --- | --- |
| Clients | document wheel moved | document wheel moved |
| Candidates | content fit the desktop fixture; no lock/trap | document wheel moved |
| Missions | document wheel moved; nested detail handoff separately verified | document wheel and touch moved |
| Documents | document wheel moved | document wheel moved |
| Admin | document wheel moved | document wheel moved |

Candidates desktop intentionally uses the shared fill surface. Its fixture page fit the available
height, so there was no scroll distance to exercise; the CSS contract regression test covers its pane
owner and boundary handoff declaration directly.

## Regression coverage

- `workspace-scroll.test.ts` protects the nested overflow, shrink sizing, and scroll-handoff CSS.
- `shell-navigation.test.ts` explicitly protects Clients alongside Missions, Documents, and Admin as
  document-flow routes, and retains the existing Candidates desktop/mobile assertions.
- Existing Workspace Surface and Missions workspace suites remain green.

The JSON report and PNGs can be regenerated while the local API/web stack and synthetic evidence
fixture are running. They contain no production or personal data.
