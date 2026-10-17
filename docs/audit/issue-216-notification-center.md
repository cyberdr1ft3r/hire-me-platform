# Issue #216 Notification Center P1 hotfix

Date: 2026-10-17
Scope: Notification Center layout, actions, and scroll ownership at desktop, tablet, and mobile sizes.

## Root cause

The popover was a three-row CSS grid without an explicit row definition. Its notification body was
therefore an implicit auto-sized grid row whose automatic minimum grew to the full list height. The
panel's `max-height` constrained only the outer box; `overflow: hidden` then clipped the oversized
row. Because the body measured the same `clientHeight` and `scrollHeight`, its `overflow-y: auto`
never became a real scroll owner, so wheel, trackpad-like, keyboard, and touch input could not move
the list.

On the 22rem desktop popover, the same clipping hid parts of the French header and row actions. The
global button primitive intentionally uses `white-space: nowrap`, while the Notification Center did
not give its header copy a shrinkable minimum or permit these local action labels to wrap.

There is no Notification Center wheel handler or body scroll lock. Its placement and z-index were
correct. The responsive navigation and modal Drawer own unrelated, lifecycle-bounded body locks.
The shared workspace panes and Messages thread already use explicit zero-minimum flex/grid sizing;
the audit found no second instance of this implicit-row defect.

## Fix

The panel now declares `auto auto minmax(0, 1fr)` rows, and the body has `min-height: 0`, making the
third row the bounded independent scroll owner. `overscroll-behavior-y: auto` preserves native
handoff at its boundaries. The panel uses `overflow: clip` for visual clipping without becoming a
competing scroll container. Notification-only action labels can wrap, and the header copy may
shrink. No component logic, request, pagination, permission, unread-count, navigation, mutation, or
focus behavior changed.

## Installed-Chrome evidence

The reproducible runner is `scripts/issue-216-notification-center-evidence.mjs`. It uses synthetic
local notification responses and installed Google Chrome. The before capture reapplies the exact
removed sizing and clipping rules in-page. The matrix stress-injects all 100 rows into the UI even
though the production request remains intentionally unchanged at 25 rows per page.

- [Before desktop: clipped French actions and non-scrolling list](issue-216-notification-center/before-fr-desktop-20.png)
- [After desktop: 100 French notifications](issue-216-notification-center/after-fr-desktop-100.png)
- [Before mobile: long list clipped without a scroll range](issue-216-notification-center/before-fr-mobile-20.png)
- [After mobile: 100 French notifications with touch scrolling](issue-216-notification-center/after-fr-mobile-100.png)
- [Raw 24-case measurements](issue-216-notification-center/results.json)

Measured results:

| Coverage | Result |
| --- | --- |
| Counts × locales × sizes | 0, 1, 20, 100 × EN/FR × 1440×900, 768×900, 390×844 = 24/24 |
| Horizontal document or visible-action overflow | 0/24 failures |
| Long-list mouse wheel | 12/12 moved the notification body |
| Long-list trackpad-like deltas | 12/12 moved the notification body |
| Long-list `PageDown` and retained panel focus | 12/12 passed |
| Mobile CDP touch swipe | 4/4 moved the notification body |
| Escape focus restoration | 24/24 passed |
| Body scroll-lock leakage after close | 0/24 |
| Browser runtime errors | 0 |

Before the fix, the desktop 20-row body measured `4319/4319` client/scroll height and remained at
scrollTop `0` after a 500px wheel delta; the mobile body measured `4759/4759` with the same result.
After the fix, long desktop bodies are bounded to 455–474px, tablet bodies to 694px, and mobile
bodies to 570px, while the full list remains scrollable. Mouse wheel moved 500px, trackpad-like
deltas moved 100px, and touch/PageDown moved a viewport-appropriate distance in every applicable
case.

## Regression coverage and remaining recording limits

`AppShell.test.tsx` protects the explicit grid rows, zero-minimum scroll body, native overscroll
handoff, panel clipping mode, and Notification-only action wrapping. Existing Notification Center
tests continue to cover unread aggregation, notification-only mark-all, exact conversation and task
navigation, inside/outside focus transitions, pointer dismissal, and Escape focus restoration.

The evidence uses the installed Chrome executable, Chrome wheel deltas for mouse and precision-
trackpad-like input, and Chrome DevTools Protocol touch events. No physical precision touchpad,
physical mobile device, or screen reader was available, so a human device video and assistive-
technology pass remain optional recording follow-ups rather than code blockers.
