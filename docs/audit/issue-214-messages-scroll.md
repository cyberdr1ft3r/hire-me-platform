# Issue #214 Messages scrolling audit

Date: 2026-10-16
Scope: Messages conversation list, message thread, composer, and nested scroll containers at desktop and mobile sizes.

## Root cause

Issue #212 changed the shared Workspace Surface pane bodies to `overscroll-behavior-y: auto`, but
Messages has an additional, intentional nested scroll owner: `.messages-log`. That selector still
declared `overscroll-behavior: contain`. In Chrome, the thread scrolled normally until it reached an
edge, then the containment rule discarded the remaining wheel/trackpad/touch gesture rather than
handing it to the workspace page.

The audit found no application `wheel`/`onWheel` handler. The only body scroll locks belong to the
responsive navigation and modal Drawer lifecycles; neither was active during reproduction. The
conversation, message-log, and shared Workspace Surface flex/grid chains already have the necessary
`min-height: 0`, `minmax(0, 1fr)`, and `flex: 1 1 auto` sizing. The composer textarea intentionally
owns only its bounded text overflow.

The focused fix leaves the message log as the independent thread scroller and changes only its
boundary behavior to `overscroll-behavior-y: auto`.

## Installed-Chrome evidence

The evidence runner is `scripts/issue-214-scroll-evidence.mjs`. It uses synthetic local users,
conversations, and messages in installed Chrome. The before capture reapplies the exact removed
`contain` declaration in-page; after captures use the committed CSS.

- [Before: wheel trapped at the message-log bottom](issue-214-scroll/before-messages-wheel-trap.png)
- [After: wheel hands off to the workspace page](issue-214-scroll/after-messages-wheel-handoff.png)
- [After: trackpad-like deltas hand off](issue-214-scroll/after-messages-trackpad-handoff.png)
- [After: mobile touch scroll](issue-214-scroll/after-messages-mobile-touch.png)
- [Raw measurements](issue-214-scroll/results.json)

Measured behavior:

| Target / input | Before | After |
| --- | --- | --- |
| Thread bottom + mouse wheel | log `3543/3543`, document `0 → 0` | log remains `3543/3543`, document `0 → 479` |
| Thread bottom + trackpad-like deltas | trapped by the same declaration | document `0 → 140` |
| Thread top + mouse wheel | n/a | independent log `0 → 360` |
| Focused thread + `PageDown` | n/a | independent log moved |
| Focused conversation row + Enter | n/a | long conversation opened |
| Conversation-list area without local overflow | n/a | wheel handed to the document |
| Composer and conversation header | n/a | wheel moved the document `0 → 350` |
| Touch swipe at 390×844 | n/a | document-flow shell moved; no horizontal overflow |

The desktop thread fixture measured `3807px` of content in a `264px` scrollport. The mobile layout
deliberately returns to document flow, so touch moves the shell rather than creating a second nested
scroll range.

## Regression coverage

`workspace-scroll.test.ts` now protects the Messages log's independent `overflow-y: auto`, native
boundary handoff, and absence of the old containment declaration. Existing Messages workspace and
state tests cover keyboard-open behavior and the conversation/thread composition.

The PNGs and JSON report contain synthetic data only. A physical precision touchpad and physical
mobile device were not available; Chrome wheel deltas and CDP touch events cover those input paths,
but a human device recording remains optional follow-up evidence.
