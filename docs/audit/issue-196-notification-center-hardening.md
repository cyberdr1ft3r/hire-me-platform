# Issue #196 Notification Center unread-consistency follow-up

Date: 2026-10-19

## Architecture audit

The approved Notification Center and unread Messages composition already reached `main` through PR
#199 and its scrolling/layout correction through PR #217. The current shell correctly reuses the
own-notification endpoints, the Messages unread-summary and unread-conversation endpoints, and the
existing exact conversation deep link. Messages remain derived from `Message` plus
`ConversationMember.lastReadSequence`; no message-backed `Notification` row, schema, endpoint, or
second unread state is needed.

The follow-up audit found three narrow client defects:

1. Chrome could report a transient null focus destination while moving between popover controls.
   The root `onBlur` handler then closed the popover before a filter or row-action click fired.
2. Successfully reading one Notification while the Unread filter was active changed its status but
   left the now-read row visible in that filtered list.
3. An in-flight notification-count read could overwrite a newer local read mutation or a count from
   a replacement access token. Opening a conversation also triggered an unnecessary unread-summary
   refresh before the conversation read cursor had advanced.

The fix stays entirely in the AppShell composition layer. A document `focusin` boundary closes only
after focus actually reaches an outside element; outside pointer and Escape behavior are unchanged.
Notification count requests have a generation guard, successful mutations invalidate older reads,
and the Unread list removes the read row immediately. Message navigation performs no speculative
count refresh; the existing Messages workspace refreshes the summary only after its read-cursor call
succeeds.

## Installed-Chrome evidence

The reproducible runner is
`scripts/issue-196-notification-center-hardening-evidence.mjs`. It uses only synthetic Notification
and conversation responses with installed Google Chrome. Each scenario starts with one unread
Notification plus one unread conversation, switches to Unread, marks only the Notification read,
confirms the conversation remains, follows the exact conversation deep link, and verifies Escape
focus restoration.

| Locale | Desktop 1440×900 | Tablet 768×900 | Mobile 390×844 |
| --- | --- | --- | --- |
| EN | [screenshot](issue-196-notification-center-hardening/en-desktop.png) | [screenshot](issue-196-notification-center-hardening/en-tablet.png) | [screenshot](issue-196-notification-center-hardening/en-mobile.png) |
| FR | [screenshot](issue-196-notification-center-hardening/fr-desktop.png) | [screenshot](issue-196-notification-center-hardening/fr-tablet.png) | [screenshot](issue-196-notification-center-hardening/fr-mobile.png) |

[Machine-readable results](issue-196-notification-center-hardening/results.json):

- 6/6 rendered both authorized sources initially and only the unread conversation after the
  Notification mutation.
- 6/6 updated the badge from two mixed unread items to one unread conversation.
- 6/6 exposed and followed `/messages?conversation=<authorized-id>`.
- 6/6 restored focus to the bell after Escape.
- 6/6 had no document-level horizontal overflow or browser runtime error.

## Scope boundaries and remaining acceptance

- No backend, contract, database, permission, retention, polling interval, or message-send change.
- Mark-all remains Notification-only; message reads remain governed solely by the existing monotonic
  conversation cursor.
- The separately approved Utility Bar/Quick Notes work remains a separately gated product slice.
- The wordmark refinement still needs the referenced brand asset and verified/licensed typeface; it
  is not guessed in this Notification Center patch.
- Physical screen-reader and physical mobile-device recording remain optional human acceptance;
  installed Chrome covers keyboard, pointer, responsive layout, touch-capable mobile emulation, and
  focus restoration.
