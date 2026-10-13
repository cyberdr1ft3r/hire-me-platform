# Internal messaging V1 — architecture preflight

Date: 2026-10-12. Base: `main` @ `daf1d549327e6689450cff22007b10e6d652ef04`.
Status: **Proposed** (D-087). Design only: no production code, migration, permission, or seed change in this preflight.

## 1. Audit of the current repository

### Confirmed requirements

| Source | Confirmed fact |
| --- | --- |
| `PROJECT_MEMORY.md` | V1 communication requires private messages and discussion groups, in addition to comments, mentions, and notifications. |
| `docs/product-scope.md` | "Internal private messaging and discussion groups" is a core module; supported through `Conversation`, `ConversationMember`, `Message`, and message attachments. Messages are confidential data. |
| `docs/domain-model.md` | Conceptual `Conversation` (type, title, status), `ConversationMember` (role, muted, active), `Message` (body, status active/edited/archived). Archival over deletion. Audit logs never store message bodies. Message attachments use protected `Document` records. |
| `docs/permissions.md` | `messages:view` and `messages:create` are named. Sensitive conversation membership changes are audited. Message previews must not expose confidential payloads to unauthorized users. |
| `docs/architecture.md` | Separate messaging module; integration tests for messaging membership; real-time messaging transport is later work. |
| `docs/project/ROADMAP.md` | Phase 7 lists "Private messages and discussion groups" as not started. |

### Still undefined (resolved by this preflight as proposals)

Real-time delivery, read receipts, moderation, attachment limits (`product-scope.md` / `domain-model.md` "Unresolved"), direct-conversation uniqueness, group types, edit/delete policy, history visibility for new or removed members, participant discovery, retention.

### What already exists physically (important)

| Artifact | State on `main` | Consequence |
| --- | --- | --- |
| `Conversation`, `ConversationMember`, `Message` tables + enums `ConversationType {PRIVATE, GROUP}`, `ConversationStatus`, `ConversationMemberRole {OWNER, MEMBER}`, `MessageStatus {ACTIVE, EDITED, ARCHIVED}` | Created by the foundational migration (`20260721143000_foundational_schema`). **No service, controller, contract, seed row, or test uses them.** | The model is dormant in application code and lacks ordering, read cursors, uniqueness for direct pairs, membership-history semantics, edit history, and bounds. **Dormant does not prove zero rows in a deployed database.** PR A must fail closed if destructive reshape preconditions are not met, or explicitly migrate existing rows; it must never silently discard conversation data. |
| `Conversation.relatedEntityType` / `relatedEntityId` | Free-form polymorphic pair. | Conflicts with the repository convention (task/notification/document context uses explicit optional FKs, never free-form references). PR A should drop it; any future context link adds typed FKs. |
| `Document.messageId` + `DocumentType.MESSAGE_ATTACHMENT` | Present, unused by the Documents service. | Attachment path exists for later; V1 does not use it. |
| `messages:view` / `messages:create` | Seeded with `ASSIGNED` scope; granted to `SUPER_ADMIN`, `ADMIN`, `HR_MANAGER`, `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, **and `CLIENT_USER`**. Not granted to `FINANCE_MANAGER` or `GUEST`. | No route uses them today, so no current exposure. The `CLIENT_USER` grant contradicts "internal messaging" and must be removed before any route ships (R-053), while the service still enforces `userType = INTERNAL` as defense in depth. **Maintainer decision:** `FINANCE_MANAGER` receives both messaging permissions because it is an internal collaboration role. |

### Reusable patterns

- Task comments (`TaskComment`): author edit with `editedAt/editedByUserId`, archive with `archivedByUserId`, body `max(4000)`; mention requires existing visibility. Messaging should mirror the bounds and archival vocabulary but **not** reuse the comment tables or routes.
- Pickers: Issue #64 `GET /v1/tasks/user-options` and D-072 `assignment-user-options` return `{id, displayName, email}`, ≤ 20 rows, active internal non-archived users, write revalidates. Messaging gets its own purpose-scoped source; it does **not** call Admin user APIs (`users:view` semantics are administration, not collaboration).
- Locking: row `FOR UPDATE` with sequence allocation (`document-signing.lifecycle.ts`, `SigningEvent`) is the precedent for per-conversation message ordering.
- Notifications (`Notification`): own-user only, idempotency keys, generic `bodySummary`; no `conversationId` column exists.
- AuthGuard already rejects suspended/archived users at every request (`findCurrentlyEligibleUser`), but does **not** check `userType`.
- Web: `BoundedCombobox`, stacked master-detail layout helper, typed EN/FR dictionaries, permission-gated navigation (`internal-navigation.ts`). Notifications UI currently lives inside the Tasks workspace; AppShell has no unread badge.
- No `Team` entity exists, so "team groups" cannot be modelled safely in V1.

## 2. V1 scope

### In scope

| Area | V1 decision |
| --- | --- |
| Direct conversations (`PRIVATE`) | Exactly two internal users. One conversation per unordered pair (find-or-create). Membership is immutable. Any user with `messages:create` may start one with an eligible colleague. |
| Discussion groups (`GROUP`) | Named, ad-hoc, small: title required (1–120 chars), 3–50 active members including the creator. **Accepted:** any internal user with `messages:create` may create one; no separate group-create permission in V1. The creator becomes `OWNER`. Owners add/remove members, rename, promote another owner, and archive. Members may leave. |
| Content | Plain text only, 1–4000 characters after trim, newlines preserved. No HTML, Markdown, link unfurling, reactions, threads, or mentions. |
| Read state | Per-member read cursor; unread conversation count in AppShell navigation. |
| Delivery | Polling (no WebSocket/SSE). |
| Edit | **Accepted:** author only, within 15 minutes of creation, while the conversation is active; previous body kept as an immutable revision; "edited" marker shown to all. |
| Withdraw | Author may withdraw (archive) their own message while the conversation is active; others see a tombstone. Direct conversations remain active in V1. Archived groups are fully read-only. No hard deletion. |

### Explicitly out of scope for V1

Team groups (no team model), automatic per-mission/client/candidate chats, context links (§7), attachments (§8), mentions and per-message notifications (§6), real-time transport, read receipts per message ("seen by"), typing indicators, reactions, threads, search across messages, moderation/admin reading of others' conversations, retention purge, external users (client portal, guests, candidates), email/WhatsApp relay.

### Lifecycle decisions

- **Suspended/archived users** stay visible historically: their name renders with an "inactive" marker; their messages remain. They cannot sign in (guard). A direct conversation whose counterpart is inactive becomes read-only (`409 CONVERSATION_RECIPIENT_INACTIVE` on send). Inactive group members cannot post, are not counted as recipients, and cannot be added.
- **Leaving / removal:** a member who leaves or is removed loses **all** read access to that conversation, including the period they were a member (no "frozen" history copy in V1). This is the simplest rule that cannot leak post-removal content.
- **History for added members:** a newly added (or re-added) group member stores the current `lastMessageSequence` as `historyAfterSequence` and sees only messages with a larger sequence. Adding someone can never disclose earlier confidential discussion. The add dialog states this.
- **Hiding a direct conversation:** per-member "hide" removes it from that member's list until a new message arrives. It does not delete anything.
- **Group archive:** owner-only; the group becomes read-only for all members and moves to an "Archived" filter. Unarchive is out of scope.
- **Last owner:** cannot leave or be removed while other active members exist; they must promote another owner first. Owners cannot remove other owners in V1 (only demotion-free promotion), avoiding owner takeover fights.

## 3. Proposed persistence model (PR A forward migration on dormant tables)

Names follow the existing physical tables. All IDs are UUID. Timestamps are server-generated.

**Migration safety gate:** repository dormancy is not evidence that a deployed database has zero rows. Before dropping polymorphic columns or replacing membership state, PR A must include a deterministic precondition/diagnostic for `Conversation`, `ConversationMember`, and `Message`. If any legacy rows exist, the migration must either transform them losslessly under an explicitly reviewed mapping or fail with a clear operator action; it must not drop or overwrite them silently.

### `Conversation`

| Column | Notes |
| --- | --- |
| `id` | PK |
| `type` | `PRIVATE` (direct, exactly two members) or `GROUP` |
| `title` | `GROUP`: required, trimmed 1–120. `PRIVATE`: must be NULL (CHECK). |
| `directKey` | `PRIVATE` only: `"<lowerUuid>:<higherUuid>"`; **UNIQUE**; NULL for `GROUP` (CHECK). Prevents duplicate direct pairs under concurrency. |
| `createdByUserId` | FK `User`, `Restrict` |
| `status` / `archivedAt` / `archivedByUserId` | `GROUP` only may be archived (CHECK). |
| `lastMessageSequence` | `BIGINT NOT NULL DEFAULT 0`; allocated under the conversation row lock. |
| `lastMessageAt` | nullable; list ordering. |
| `createdAt` / `updatedAt` | |
| drop `relatedEntityType`, `relatedEntityId` | polymorphic pair removed (convention). |

Indexes: unique `directKey`; `(status, lastMessageAt DESC)`; `createdByUserId`.

**Cardinality enforcement:** SQL CHECK constraints can enforce PRIVATE/GROUP column shape, but not “exactly two membership rows” or a 50-row membership cap across another table. Those are transactional service invariants. Direct find-or-create locks/creates the conversation and inserts exactly the canonical two members atomically; V1 exposes no membership mutation route for PRIVATE conversations. Group create/add/remove operations lock the Conversation row and re-count active members before commit. Integration tests must prove both invariants under concurrency.

### `ConversationMember`

| Column | Notes |
| --- | --- |
| `id`, `conversationId`, `userId` | unique `(conversationId, userId)` kept: one row per person, reactivated on re-add (membership history is in `AuditLog`). |
| `role` | `OWNER` / `MEMBER` (`PRIVATE`: both `MEMBER`). |
| `status` | new enum `ACTIVE` / `LEFT` / `REMOVED` (replaces boolean `active` + `archivedAt`). |
| `joinedAt`, `leftAt`, `removedByUserId` | lifecycle. |
| `historyAfterSequence` | `BIGINT`: the conversation's current `lastMessageSequence` at (re)join; `0` for founding members. It is an **exclusive** boundary: a member may read only messages with `sequence > historyAfterSequence`. |
| `lastReadSequence` | `BIGINT NOT NULL DEFAULT 0`; monotonic (`GREATEST`), ≤ `lastMessageSequence`. |
| `hiddenAt` | direct-conversation hide; cleared when a newer message arrives. |
| `muted` | kept, unused in V1 (no per-message notifications). |

Indexes: `(userId, status)`; `(conversationId, status)`. CHECK `lastReadSequence >= 0`, `historyAfterSequence >= 0`.

### `Message`

| Column | Notes |
| --- | --- |
| `id`, `conversationId`, `authorUserId` | |
| `sequence` | `BIGINT`; unique `(conversationId, sequence)`; the only ordering key. |
| `clientMessageId` | UUID supplied by the client; unique `(conversationId, authorUserId, clientMessageId)` makes retried sends idempotent. |
| `body` | CHECK `char_length(body) BETWEEN 1 AND 4000`. |
| `status` | `ACTIVE` / `EDITED` / `ARCHIVED` (= withdrawn). |
| `editedAt`, `editCount` | |
| `archivedAt`, `archivedByUserId` | withdrawal. |
| `createdAt` | |

Indexes: `(conversationId, sequence DESC)`; `authorUserId`.

### `MessageRevision` (new)

`id`, `messageId` (FK `Restrict`), `revisionNumber`, `previousBody`, `editedByUserId`, `editedAt`; unique `(messageId, revisionNumber)`. Append-only, server-side only in V1 (no API). It exists so an edit cannot silently rewrite what a colleague read (repudiation), and so a later approved moderation/export capability has the record.

### Not changed

`Notification` (no new column), `Document` (keeps dormant `messageId`), `AuditLog`.

Withdrawn message bodies stay in the database (business-communication auditability); every API response returns `body: null` for withdrawn messages. **V1 implements no automated purge. This is not a permanent “retain forever” policy:** before broad production rollout, the operator must approve and document a messaging retention policy (retention period, legal/privacy owner, export/hold expectations, and purge procedure). Schema/API implementation may proceed before that policy, but production-readiness cannot claim the retention question closed.

## 4. Authorization model

Every rule is server-enforced and permission-driven; no role names are checked.

1. **Route permission** (existing guard): reads require `messages:view`; writes require `messages:create`.
2. **Actor eligibility** (messaging service, every call): actor `userType = INTERNAL`. This makes the stray `CLIENT_USER` grant inert even before the catalog is corrected. Active status is already enforced by `AuthGuard`.
3. **Record scope = active membership.** Every conversation lookup is a single scoped query (`id = :id AND EXISTS active membership for actor`). Missing, foreign, left, and removed all return the identical `404 CONVERSATION_NOT_FOUND`. There is no "list all conversations" capability for anyone, including `SUPER_ADMIN`.
4. **History window.** Message reads add `sequence > member.historyAfterSequence`. Message-level IDs in paths (`:messageId`) are resolved inside the scoped conversation and window; otherwise `404 MESSAGE_NOT_FOUND`.
5. **Writes** run in a transaction that locks the `Conversation` row `FOR UPDATE`, then rechecks: actor still an active member; conversation `ACTIVE`; for `PRIVATE`, counterpart user still active internal; for edits, author = actor, status not withdrawn, within window.
6. **Group management** requires the actor's **membership role `OWNER`** in that group (record-level authority granted by the data, not by a platform role) plus `messages:create`.
7. **Adding members** revalidates each target: active, non-archived, `INTERNAL`, currently holds effective `messages:view`, not already active, group under the 50-member cap. Bulk adds are all-or-nothing.
8. **Losing `messages:view`** blocks all routes for that user immediately; membership rows are kept so access returns if the permission is restored (permission removal is an admin action already audited).

### Permissions

- **Reuse** `messages:view` and `messages:create` (already seeded, `ASSIGNED` scope = membership). No new permission is required for V1 because group management is membership-scoped.
- **Catalog correction (PR A, seed change):** remove `messages:view` / `messages:create` from `CLIENT_USER`; add both to `FINANCE_MANAGER`. The messaging service still requires `userType = INTERNAL` on every call, so role grants are not the external-user boundary.
- **Deferred, proposed name only:** `messages:moderate` for a future, separately approved compliance/moderation capability (withdraw others' messages, read reported content). Not in V1.

## 5. Participant discovery

`GET /v1/messages/user-options?purpose=direct|group-create|group-add&search=<text>&conversationId=<id>`

| Rule | Value |
| --- | --- |
| Permission | `messages:create` + internal actor. `group-add` additionally requires the actor to be an `OWNER` of `conversationId` (else the same `404`). |
| Search | Required, trimmed, 2–120 chars, matched against display name and email prefix. **No empty-query listing and no pagination cursor**, so the endpoint cannot be paged into a staff directory. |
| Limit | ≤ 20 rows, ordered by display name then ID. |
| Eligibility | `status ACTIVE`, `archivedAt NULL`, `userType INTERNAL`, holds effective `messages:view`; excludes the actor; `group-add` excludes current active members. |
| Fields | `id`, `displayName`, `email` (same shape as the Task and Mission pickers, needed to disambiguate namesakes). Never roles, permissions, status, last login, or session data. |
| Scope | No team/client/mission narrowing in V1: messaging is organisation-wide among internal users by design. |
| Abuse | Target: 60 lookups/minute per actor. The repository has no shared/distributed rate-limit substrate today, so PR B must state exactly where this limit is enforced and treat it as abuse mitigation, **not** an authorization/confidentiality boundary. The write still revalidates every chosen user. |

## 6. Read/unread and notifications

- **Source of truth:** `Message` + `ConversationMember.lastReadSequence`. Notifications are never the source of truth.
- **Unread conversation:** `conversation.lastMessageSequence > member.lastReadSequence` (O(1) per row). **Unread count per conversation:** messages with `sequence > max(lastReadSequence, historyAfterSequence)` and `authorUserId <> actor`, capped at display "99+".
- **Sending** advances the sender's own cursor in the same transaction.
- **Marking read:** explicit `POST .../read { upToSequence }`; server applies `GREATEST(current, min(upToSequence, lastMessageSequence))`, so out-of-order or replayed calls can never move the cursor backward or past real messages (prevents unread-count drift). The web client calls it when the latest page of an open conversation is visible and the tab is visible.
- **AppShell badge:** `GET /v1/messages/unread-summary` → `{ unreadConversationCount }` (active memberships, not hidden, active or archived conversations). Shown on the Messages navigation item; polled every 60 s while visible.
- **No `Notification` rows in V1** for messages or group additions. Reasons: notification unread state would duplicate and drift from message unread state; `Notification` has no conversation FK; and notification titles are a side channel. Being added to a group appears in the conversation list.
- **Mentions** are deferred. If later approved, a mention creates one idempotent `Notification` (`messages.mention`, generic body "You were mentioned in a conversation.", new typed `conversationId` FK), only for an active member who can see that message; notification read state stays independent from message read state.

## 7. Context links to business records

**Deferred out of V1.** Conversations carry no client, mission, candidate process, training, or commercial context; the polymorphic columns are dropped. Rationale: every source domain has its own scope rules (mission assignment, R-050 finance limits, compensation/consent redaction); a chat label is an easy bypass.

Conditions for a future, separately approved context PR:

- Typed optional FKs (e.g. `recruitmentMissionId`), never free-form type/id.
- Creating or linking requires the actor's own source-domain read authorization; adding a member requires that member's source authorization at add time.
- The link grants nothing in the source domain.
- The context label is rendered per viewer only if they currently pass the source read check; otherwise it reads "Restricted record" with no identifier.
- Source archival does not delete the conversation; history survives and the label shows the archived state only to authorized viewers.
- Users must not be told to use chat as the system of record for decisions belonging to a structured record (feedback, offers, evaluations).

## 8. Attachments

**Decision A: out of scope for V1.** When approved later, attachments use the existing protected `Document`/`DocumentVersion` store with `documentType = MESSAGE_ATTACHMENT` and `Document.messageId`, authorised by conversation membership plus the history window, with existing upload validation, size limits, and audited downloads. No second file store, no public URLs, no inline image rendering.

## 9. Edit, withdraw, archive policy

| Action | Who | Rule | Audit |
| --- | --- | --- | --- |
| Edit | Author | ≤ 15 min after creation, conversation active, not withdrawn; max 10 edits; previous body → `MessageRevision`; status `EDITED`, `editedAt` shown. | `messages.message.edited` (conversationId, messageId, revisionNumber) |
| Withdraw | Author | While the conversation is active; status `ARCHIVED`; tombstone "Message withdrawn"; body hidden in API, retained in DB. Direct conversations remain active in V1; archived groups are read-only. Not reversible. | `messages.message.withdrawn` (conversationId, messageId) |
| Moderator withdraw | — | Not in V1 (`messages:moderate` deferred). | — |
| Hard delete | Nobody | Not implemented (business-communication history; matches archival-over-deletion rule). | — |
| Group archive | Owner | Read-only for all. | `messages.group.archived` |

Ordinary sends are **not** written to `AuditLog` (high volume; the `Message` row is the record). Audited: conversation creation (type, member count), member added/removed/left, owner promoted, group renamed (no title text), group archived, message edited, message withdrawn. Audit metadata never contains message bodies, titles, or search text.

## 10. Threat model

| Threat | Mitigation |
| --- | --- |
| IDOR on conversation/message IDs | Single membership-scoped query; identical `404` for missing/foreign/removed; message IDs resolved inside the scoped conversation and history window. |
| Participant enumeration | Picker needs a ≥ 2-char search, returns ≤ 20, no cursor, rate-limited; group member lists only visible to active members. |
| Employee-directory leakage | Only `id/displayName/email` of messaging-eligible internal users; no roles/status/login data; not reachable without `messages:create`. |
| Context permission bypass | No context links in V1; future rules in §7. |
| Removed participant access | Removal/leave revokes all access, checked per request; no cached grants. |
| Late joiner reading old history | `historyAfterSequence` window. |
| Notification side channel | No message notifications in V1; future mention notifications use generic text. |
| Edit repudiation | 15-min window, immutable revisions, visible "edited" marker, audit event. |
| Attachment leakage | Attachments deferred; future path is protected `Document`. |
| XSS / rich text | Plain text only; React text nodes; no `dangerouslySetInnerHTML`, no Markdown, no link auto-rendering; control characters (except `\n`, `\t`) rejected by the contract. |
| Oversized messages | Zod `max(4000)` + DB CHECK; JSON body limit unchanged; titles ≤ 120. |
| Spam / flooding | Abuse-control targets: 30 sends/min, 10 new conversations/hour, 60 picker lookups/min; group cap 50; idempotent `clientMessageId`. No distributed limiter exists on `main`, so PR B must document enforcement scope and must not rely on rate limiting for authorization or confidentiality. |
| Pagination races | Per-conversation `sequence` allocated under row lock; keyset pagination (`before`/`after` sequence); no offset paging; no timestamp ordering. |
| Unread-count drift | Monotonic `GREATEST` cursor bounded by `lastMessageSequence`; counts derived, not stored per message. |
| Archived/suspended users | Guard blocks sign-in; sends to an inactive direct counterpart rejected; inactive users excluded from picker and adds; history rendered with "inactive" marker. |
| External roles (`CLIENT_USER`, `GUEST`) | `userType INTERNAL` check in every messaging call; `CLIENT_USER` grant removed in PR A. |
| Duplicate direct conversations | Unique `directKey`; find-or-create retries on unique violation. |
| Audit over-collection | No bodies/titles/search text in audit metadata; sends not audited. |
| Super-admin over-reach | No "view all conversations" route; moderation deferred to an explicit permission. |
| Confidential data posted in chat | Product guidance in UI empty state; V1 has no automated purge; broad production rollout requires an approved/documented retention policy (§13). |

## 11. UX outline (UI-DNA v1 tokens, v1.1 interaction grammar)

- **Navigation:** "Messages" / "Messages" (FR) item in the Workspace group, gated by `messages:view`, with an unread-conversation count badge (`aria-label` "3 unread conversations" / "3 conversations non lues").
- **Layout:** stacked master-detail. Desktop: conversation list (left) + selected conversation (right). Mobile (< 768 px): list, then full-width conversation with a back control; composer pinned above the keyboard.
- **Conversation list:** filters All / Unread / Archived; each row shows the counterpart or group title, member count for groups, relative last-activity time, single-line plain-text preview (tombstone for withdrawn), unread dot + count. Keyboard: list is a listbox, arrow keys move, Enter opens.
- **New message:** "New message" opens a `BoundedCombobox` person search (direct) — opening an existing pair instead of creating a duplicate. "New group" asks for title + members (multi-select, min 2 others) and states that later-added members see only new messages.
- **Conversation view:** header (title/counterpart, inactive marker, details button), message log (`role="log"`, `aria-live="polite"` only for newly arrived messages, grouped by day with localized `Intl` dates), "Load earlier" control for keyset paging, "edited" and "withdrawn" markers, author actions (Edit within window, Withdraw with confirmation).
- **Composer:** multi-line textarea with label; Enter sends, Shift+Enter newline on desktop; on touch devices Enter inserts a newline and the Send button sends; counter appears after 3500 chars; disabled with explanation when read-only (archived group, inactive counterpart).
- **Group details (drawer):** members with role and inactive markers; owner actions (add, remove, promote, rename, archive); member action (leave, with confirmation).
- **States:** skeleton list; empty list ("No conversations yet"); empty conversation; generic not-found (same copy for removed/foreign); network error with retry; rate-limit message.
- **EN/FR:** all copy in `messages.*` keys of both dictionaries (typed parity); user-authored content is never translated; no content-language field in V1.
- **Not built:** reactions, threads, typing indicators, read receipts, presence, search across message text.

## 12. Proposed API surface (PR B)

All under `/v1/messages`; read routes `messages:view`, write routes `messages:create`.

| Route | Purpose |
| --- | --- |
| `GET /conversations?filter=all\|unread\|archived&cursor=` | Actor's conversations, keyset by `lastMessageAt, id`, page 25. Direct conversations created by the counterpart appear only once they contain a message. |
| `GET /unread-summary` | `{ unreadConversationCount }` |
| `GET /user-options` | §5 |
| `POST /conversations/direct { userId }` | Find-or-create the pair. |
| `POST /conversations/groups { title, memberUserIds }` | Create group. |
| `GET /conversations/:id` | Conversation + active members (`id`, `displayName`, inactive flag, role). |
| `GET /conversations/:id/messages?before=&after=&limit=` | Keyset page (≤ 50). |
| `POST /conversations/:id/messages { body, clientMessageId }` | Send. |
| `PATCH /conversations/:id/messages/:messageId { body }` | Edit (author, window). |
| `POST /conversations/:id/messages/:messageId/withdraw` | Withdraw (author). |
| `POST /conversations/:id/read { upToSequence }` | Advance cursor. |
| `POST /conversations/:id/hide` | Direct only. |
| `PATCH /groups/:id { title }`, `POST /groups/:id/members { userIds }`, `POST /groups/:id/members/:userId/remove`, `POST /groups/:id/members/:userId/promote`, `POST /groups/:id/leave`, `POST /groups/:id/archive` | Owner / member management. |

Stable error codes: `CONVERSATION_NOT_FOUND`, `MESSAGE_NOT_FOUND`, `CONVERSATION_ARCHIVED`, `CONVERSATION_RECIPIENT_INACTIVE`, `MESSAGE_EDIT_WINDOW_EXPIRED`, `MESSAGE_WITHDRAWN`, `GROUP_MEMBER_LIMIT`, `GROUP_LAST_OWNER`, `MESSAGING_USER_NOT_ELIGIBLE`, `MESSAGING_RATE_LIMITED`.

## 13. Maintainer decisions (2026-10-12)

1. **FINANCE_MANAGER messaging:** **YES.** Grant `messages:view` and `messages:create` in PR A. Messaging is organization-wide internal collaboration; Finance is an internal role. Record/business-domain permissions are not widened by conversation membership.
2. **Edit policy:** **15-minute author edit window accepted**, with immutable `MessageRevision` history, max 10 edits, no message text in `AuditLog`.
3. **Retention:** **no automated purge in V1**. Do not call indefinite storage the final policy. Before broad production rollout, document an approved retention period and operational/legal owner plus export/hold/purge handling. A later purge implementation is a separate reviewed change. **Draft policy/runbook:** `docs/runbooks/messaging-retention-policy.md` (Issue #190; **Proposed — maintainer approval required**).
4. **Groups:** **50 active-member cap accepted; any internal actor with `messages:create` may create a group.** No separate group-creation permission in V1. Conversation lock + transactional member-count checks enforce the cap; rate limits are abuse mitigation only.
5. **Moderation:** **not required as a V1 production code gate.** There is no super-admin “read all messages” backdoor. If compliance or incident handling later requires content moderation, add a separately approved `messages:moderate` capability with purpose-limited access and mandatory audit. An operational escalation process may exist without giving admins universal message-read access.

### Architecture-review corrections

- `historyAfterSequence` is an **exclusive** boundary. A member added when `lastMessageSequence = N` may read only `sequence > N`; this fixes the preflight's original off-by-one leak.
- Dormant schema ≠ proven empty database. PR A migration must fail closed or losslessly transform legacy rows before destructive reshape.
- Direct two-member cardinality and group member-count limits are cross-row transactional invariants, not simple CHECK constraints.
- Messaging rate limits must not be described as globally distributed unless PR B actually implements a shared enforcement mechanism.
## 14. Implementation split

| PR | Scope | Migration | Seed/catalog | Prod code |
| --- | --- | --- | --- | --- |
| **A — foundation** | Forward migration reshaping the dormant tables (§3) + `MessageRevision` + CHECK/unique constraints, with a fail-closed/lossless legacy-row migration gate before destructive changes; remove polymorphic columns only after that gate; contracts (Zod DTOs, limits, error codes); `MessagingAccessService` (internal-actor check, scoped membership lookup, exclusive history boundary, lock helper); catalog correction (`CLIENT_USER` removal, `FINANCE_MANAGER` grant); catalog snapshot update; unit + DB constraint/concurrency tests. No routes. | Yes | Yes | Yes |
| **B — API** | Controllers/services for §12, rate limits, audit events, integration tests: IDOR matrix (non-member, left, removed, client user, guest, suspended), history window, concurrent direct find-or-create, concurrent sends ordering, idempotent retry, monotonic read cursor, edit window, withdraw redaction, last-owner rule, picker eligibility/limits, no bodies in `AuditLog`. | No | No | Yes |
| **C — web** | Bilingual Messages workspace, navigation item + unread badge, polling, accessibility, EN/FR parity tests, responsive browser evidence. | No | No | Yes |
| **D — optional, each separately approved** | Mentions + notifications; typed context links; attachments via `Document`; real-time transport; moderation. | Per item | Per item | Yes |
