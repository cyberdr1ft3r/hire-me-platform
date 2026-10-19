# Issue #221 — Messages page-system migration

Date: 2026-10-19
Base: `main` `7e6d0af7187a16e3955a3394f3fa83708312be25` (merged PR #220)
Scope: Messages page frame and shared fill-page sizing only
Draft PR: #222

## Architecture and behavior audit

Messages already had the correct domain and interaction architecture. `MessagesPanel` owns the
session-keyed workspace state, filters, paging, polling, exact conversation intent, selection, and
focus return. `WorkspaceSurface` owns the responsive list/detail composition. `ConversationPane`
owns membership-scoped reads, message polling, read cursors, composer state, and the independent
thread log. The API client and server remain unchanged.

The migration therefore replaces only the local `PageHeader` frame with a fill-layout
`DirectoryPage` and shared `ContextualActions`. Existing read-only and success feedback move into
the page's notice slot without changing their live-region behavior. There is still one `h1`.

PR #215 remains authoritative for scrolling: `.messages-log` keeps `overflow-y: auto` and
`overscroll-behavior-y: auto`; the list pane and thread pane retain their Workspace Surface scroll
behavior; the bounded composer textarea retains its own draft overflow. There are no application
wheel handlers, and the responsive navigation body lock is inactive while Messages is in use.

The first installed-Chrome pass exposed a fill-sizing integration defect: the new
`.ui-page-shell__content` flex layer used an auto basis, so a long thread contributed its full
content height and the log lost its independent scroll range. The smallest shared correction uses
`flex: 1 1 0` with the existing `min-height: 0`. Chrome then measured a bounded log at every normal
viewport and preserved native boundary handoff in the short-viewport fallback.

## Preserved contracts

- Conversation list filters, keyset paging, polling, unread/read state, and safe list reconciliation.
- Private/group conversation workflows, composer, editing, withdrawal, hide, group details, and
  read-only states.
- `messages:view` / `messages:create`, internal-user and membership-scoped API enforcement, and
  session-generation isolation.
- `/messages?conversation=<uuid>` intent, browser history, stacked-pane reveal, and focus return.
- EN/FR authored-data boundaries and responsive list/detail behavior.
- No API, contract, schema, permission, retention, navigation, launcher, or drawer change.

## Regression coverage

- Focused Vitest: Messages workspace, composer, state rules, unread summary, Page System, and
  workspace scroll ownership — 54/54 passing.
- Added assertions for one page `h1`, `data-page-kind="directory"`, fill layout, and the zero-basis
  fill-content sizing needed by nested scroll owners.
- Existing Messages tests continue to cover deep links, filters, paging, permissions, unread/read
  transitions, group/private workflows, errors, polling, late-response isolation, EN/FR, stacked
  panes, keyboard opening, and focus restoration.

## Installed Google Chrome evidence

The evidence runner is `scripts/issue-221-messages-evidence.mjs`. It runs the production Vite build
in installed Google Chrome with contract-shaped synthetic API responses. No real account, message,
or personal data is present.

Six EN/FR scenarios passed at 1440×900, 768×1024, and 390×844. They verify:

- one page `h1`, one shared directory frame/action group, and no horizontal overflow;
- conversation-list unread presentation and keyboard `Enter` selection;
- independent thread mouse-wheel, fine-delta trackpad-like, `PageDown`, and native CDP touch input;
- `overscroll-behavior-y: auto` plus actual boundary handoff at 1440×440 in both locales;
- composer draft preservation, mobile back focus return, exact deep-link opening, and browser
  back/forward behavior;
- zero browser page errors.

Evidence:

- [Machine-readable results](issue-221-messages/report.json)
- [Desktop EN directory](issue-221-messages/desktop-en-directory.png)
- [Desktop FR thread](issue-221-messages/desktop-fr-thread.png)
- [Tablet EN thread](issue-221-messages/tablet-en-thread.png)
- [Mobile FR thread](issue-221-messages/mobile-fr-thread.png)

Physical precision-touchpad, physical-device, and screen-reader recordings remain optional human
acceptance follow-ups. The automated evidence uses Chrome wheel deltas and native CDP touch events.

## Baseline note

Latest-main run `39248516124` on `7e6d0af` passed all four jobs on attempt 2. Its first attempt had
timed out in the unrelated `MissionsWorkspace.test.tsx` edit-mission test (1032/1033 web tests
passed), before build; rerunning that failed job succeeded without changing the branch. Exact-head
four-job CI on the final PR head remains the release gate.
