# Issue #196 — Missions and Clients creation drawers: verification evidence

Branch `feat/issue-196-creation-drawers` from `fix/ui-refinement-demo-20261013`
`bd46f59`. Local Vite web + API against a disposable PostgreSQL container with
synthetic records created through the public API. Installed Chrome through
`playwright-core`. Pattern: [Workspace Surface addendum — Creation drawer](../design/HIREME_UI_DNA_v1.3-workspace-surface-proposed.md#creation-drawer-issue-196).

## Before → after

- **Missions:** `New mission` was a disclosure after the filters and the whole
  directory. It is now a header action opening a drawer.
- **Clients:** a permanent `Create client` form sat under the directory. It is now
  a header `New client` action opening a drawer.
- Fields, client picker, validation, requests and permissions are unchanged.
- Client creation success is now visible; it was previously cleared by the
  selection it triggered.

## Browser acceptance (88/88 checks, EN and FR)

For Missions and Clients at 1440×900, 1024×768, 768×1024, 390×844, 1440×520
(reduced height) and 720×450 (≈200% zoom of 1440×900):

- the drawer opens from the header;
- the footer stays visible;
- no page overflow;
- the application behind is inert;
- the drawer is 576px wide from 640px up and a full-screen sheet below;
- Escape closes a clean drawer and returns focus to the header action.

At 1440×900 in both locales:

- Escape with a draft asks before discarding.
- Tab stays inside the drawer.
- A rejected create (intercepted 500) keeps the drawer and the draft and shows
  the error inside the drawer.
- Retrying creates the mission, closes the drawer and selects the new mission.
- Cancel keeps the URL and the directory selection.
- Clients: a long commercial summary scrolls inside the body; create closes the
  drawer and shows the new client selected with its success message.

## Automated tests

New `ui/Drawer.test.tsx` covers:

- modal labelling, the header/body/footer regions, first-field focus;
- the application marked inert, Escape, and focus return;
- the Tab trap;
- the unsaved-changes guard from Escape, Cancel and close;
- browser Back/Forward held for confirmation, Keep editing returning focus to the
  field, Discard completing the navigation, no hold for clean drawers, and
  `beforeunload` only while input is unsaved.

New `navigation/navigation-guard.test.ts` covers history indexing (including
after reload), exact undo/replay steps for Back and multi-entry Forward, the
swallowed return trip, repeated Back, unindexed entries passing through and
blocker ownership.
- footer submit and repeat blocking.

New Missions and Clients tests cover:

- the header placement and the absence of the inline form;
- the Missions title focus with no auto-opened suggestions;
- a single request on double submit, success selection and the success message;
- failure keeping the draft;
- the permission gate.

Existing tests now open the drawer and use the header action as the write-lock
indicator.

## Browser Back/Forward guard

Reproduced on `fa8ad05`: with input in either drawer, browser Back unmounted
the workspace and the drawer and discarded the draft without asking.

Fix: `App.tsx` writes every history entry through `pushHistoryPath` /
`replaceHistoryPath`, which store the entry's position. While a drawer holds
unsaved input it registers a blocker; a `popstate` is then not applied to the
router, the browser is returned with the exact opposite `history.go`, and the
drawer shows Keep editing / Discard changes. Discard closes the drawer and replays
the traversal; Keep editing restores focus to the field. No entry is added, so
nothing is trapped. Entries without a stored position (written outside the
router) pass through unguarded.

Production build, Chrome 155, API mocked at the network layer (synthetic data;
Docker was unavailable): **45/45 checks** for Clients and Missions — dirty Back and
Forward held with route and draft kept, focus on Keep editing, Enter/Escape keep
editing, Tab to Discard, Discard completing Back (and Forward) with the app
interactive and history length unchanged, Forward afterwards, clean drawer not
blocking, dirty reload prompting and keeping the draft when cancelled, clean
reload not prompting, successful Clients submission followed by unblocked Back,
and the prompt in view at 390px. axe-core 4.10 (WCAG 2.0/2.1/2.2 AA and best
practice) on the drawer with the prompt shown: **0 violations** at EN 1440×900,
FR 390×844, EN 1024×768 and FR 1440×520, no horizontal overflow.

## Screenshots

[issue-196-creation-drawers/](issue-196-creation-drawers/) (synthetic data only).

## Limits

Chromium viewport testing, not physical devices or a full screen-reader pass.
On-screen keyboard behavior over the sheet needs real-device confirmation
(R-056). Tasks keeps its own detail drawer; consolidating it on `Drawer` is a
possible follow-up.
