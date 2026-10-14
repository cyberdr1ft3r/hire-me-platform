# Compact Notification Center — Phase 1

Status: Implemented on the dedicated Issue #196 draft branch. This note records the
architecture audit and the deliberately small integration boundary.

## Existing sources reused

| Activity | Read | Mutation | Authorization and source of truth |
| --- | --- | --- | --- |
| Task notifications | `GET /v1/notifications?status=&page=1&pageSize=25` | `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all` | `notifications:view_own` / `notifications:update_own`; existing `Notification.status` |
| Message activity | `GET /v1/messages/unread-summary`, `GET /v1/messages/conversations?filter=unread` | Existing `POST /v1/messages/conversations/:id/read`, called only by the open Messages conversation | `messages:view`; `Message` sequence plus the active member's monotonic `lastReadSequence` |
| Exact conversation | `GET /v1/messages/conversations/:id` | None in the Notification Center | Active internal membership; missing, hidden, removed and foreign records retain the existing generic not-found behavior |

No aggregation endpoint, schema change or message-created `Notification` row is
needed. The AppShell performs two independent authorized reads and merges their safe
response DTOs for presentation. A source failure does not turn the other source into
an error or change either source's read state.

## Read and count behavior

- The bell count is the task-notification unread total plus the number of unread
  conversations. The existing Messages navigation badge continues to show only
  unread conversations, so the two indicators have distinct labels.
- "Mark notifications read" calls only `/v1/notifications/read-all`. Message rows
  stay unread until their conversation is visible in Messages and the existing
  bounded read-cursor mutation succeeds.
- Opening a message row navigates to
  `/messages?conversation=<uuid>`. The Messages workspace resolves that ID through
  the existing membership-scoped detail API before rendering it.
- The ordinary notification API already nulls task/document links that the actor
  can no longer see. The center renders a destination only for a route currently
  available to the actor; the destination workspace performs its usual authorized
  record read.
- Existing 60-second visible-tab message summary polling is unchanged. Task
  notification counts use the same visible-tab interval, and opening the popover
  refreshes both activity sources immediately.

## Presentation boundary

The popover is 352px on desktop and viewport-inset on narrow screens. It uses the
existing semantic color, spacing, border, radius, shadow, control-height and focus
tokens. All/Unread filters, independent loading/error states, empty state, visible
unread markers, relative time, Escape dismissal, outside-pointer dismissal and focus
restoration live in the AppShell component. English and French copy remains in the
typed dictionaries.

Phase 1 does not add real-time transport, message previews, mentions, persistence,
branding changes, the proposed utility bar, Notes, or Missions/Clients drawers.
