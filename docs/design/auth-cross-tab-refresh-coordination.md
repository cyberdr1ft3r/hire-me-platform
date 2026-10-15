# Cross-tab refresh coordination (Issue #202 / R-059)

Status: **Proposed** — implemented in draft PR #209; pending review and real-API acceptance.

## Problem

PR #203 single-flights refresh **within one tab**. Two tabs that send the same rotating refresh
cookie concurrently cause reuse detection and family revocation. PR #209 initially added an
exclusive Web Lock and a refresh broadcast, but a waiter could acquire the released lock before
its asynchronous `BroadcastChannel` handler processed the leader's result. It would then perform
an unnecessary second rotation.

## Goals and non-goals

- At most one refresh HTTP request for a concurrent same-origin wave in a supported browser.
- Preserve server rotation and family reuse detection; no refresh grace window.
- Keep refresh tokens HTTP-only and access tokens in memory only.
- Preserve in-tab single-flight, one retry, logout and principal-change behavior.
- Reject stale, malformed and unexpected cross-tab messages.
- Recover when a lock request is cancelled or a leader tab exits.
- Scope B refresh limiter / proxy trust (R-055) remains separate.

## Chosen protocol

Full coordination requires all three browser capabilities:

1. **Web Locks** — `hire-me:auth-refresh` serializes refresh requests.
2. **Synchronous completion marker** — `localStorage['hire-me:auth-coordination-v1']` contains
   only `{ version, eventId, kind }`. `eventId` is random and `kind` is `refresh`,
   `session-ended`, or `session-replaced`. It contains no token, user identifier, expiry,
   permission, or authentication payload.
3. **BroadcastChannel v2** — `hire-me-auth-session-v2` carries validated state events and a
   request-correlated `sync-request` / `sync-response` handoff for the in-memory `AuthResponse`.

### Refresh state machine

1. A caller joins the existing in-tab single-flight and snapshots the marker before waiting.
2. It acquires the exclusive refresh lock.
3. If its local token already changed, it reuses that result.
4. It synchronously reads the marker. If a new `refresh` event exists, it sends a sync request
   containing that event ID and a fresh request ID while still holding the lock.
5. The previous leader answers only when its current in-memory auth result is paired with that
   exact event ID. The waiter validates the response, applies it once, and makes no HTTP request.
6. A successful HTTP refresher applies its result, writes the non-secret marker synchronously,
   broadcasts the result, then releases the lock.
7. If the marker changes to logout or session replacement before a pending refresh settles, the
   old operation is superseded and cannot publish or apply its result.

The marker closes the reviewed ordering gap: Tab B can determine synchronously that Tab A
completed even when Tab A's ordinary refresh message remains queued. The correlated sync is a
token handoff, not a timing assumption.

### Leader failure and cancellation

- Crash before a completion marker: the browser releases the Web Lock; the next tab refreshes.
- Crash after writing the marker but before message delivery: no tab can reconstruct the
  in-memory access token. After a bounded one-second sync wait, the lock holder performs a new
  serialized refresh with the browser's current cookie. This may rotate twice but does not
  intentionally accept a consumed token or weaken family reuse detection.
- Lock acquisition rejection/cancellation: the operation returns `unavailable`, keeps the local
  session, and performs no refresh request.
- There is an unavoidable browser/network commit gap if a tab dies after the server consumes a
  refresh token but before the browser commits the response cookie. Client-only coordination
  cannot prove which cookie is installed in that interval; the server correctly remains fail
  closed through reuse detection.

## Message validation and stale-event defense

- Every message must be a plain object with protocol version 2, a bounded identifier, a known
  discriminant, and the exact fields for that discriminant.
- `AuthResponse` payloads are parsed with the shared `AuthResponseSchema`; terminal reasons are
  allow-listed; unknown and malformed messages are ignored.
- A state message is accepted only if its event ID and kind still equal the synchronous marker.
  A delayed logout or refresh from an earlier generation therefore cannot end or overwrite a
  newly established session.
- Sync responses must match both the pending request ID and the observed refresh event ID.
- Applying the same refresh event after a successful sync is idempotent.
- In-tab epochs remain the final guard against local logout, login, or user switching while work
  is in flight.

## Same-origin trust and token broadcast

`BroadcastChannel` is isolated by origin, not by application route, tab, frame, or worker. Any
same-origin execution context that knows or discovers the channel name can listen and post. This
means the protocol trusts every script running on the HireMe origin, including same-origin
iframes and workers. A same-origin XSS or compromised same-origin dependency is already able to
act with the user's session; the channel additionally gives such a context a direct opportunity
to observe a short-lived access token from another tab. Browser extensions remain outside the
application trust model and may have broader page access.

Broadcasting an access token is not cryptographically necessary for serialization. It is
necessary for the client-only **one-refresh** guarantee: a waiter that learns only “refresh
completed” cannot authenticate its retry without either receiving the new access token or
performing another refresh. The v2 protocol therefore keeps the token memory-only and broadcasts
it only on a successful refresh or correlated sync response. Refresh tokens are never available
to JavaScript. Reducing this trust boundary further would require a privileged same-origin
coordinator (for example a carefully reviewed SharedWorker/service worker) or a new server
handoff endpoint; neither is the smallest change for this PR.

The origin must not host mutually untrusted applications. Content Security Policy, dependency
control, XSS prevention, and avoiding untrusted same-origin frames remain prerequisites.

## Alternatives evaluated

| Alternative | Decision |
| --- | --- |
| Web Lock + ordinary refresh broadcast | Rejected: asynchronous delivery can lag lock handoff (the reviewed race). |
| Generation/event ID sent only through BroadcastChannel | Rejected: still depends on message timing. |
| Non-secret synchronous marker + correlated acknowledgment | Chosen: the waiter detects completion independently of channel delivery and accepts only the matching result. |
| Leader waits for acknowledgments before releasing the lock | Rejected: a leader cannot know every pending/crashed waiter without another durable membership protocol; it can deadlock. |
| Store the access token in local/session storage | Rejected: violates the memory-only token boundary and increases persistence/exfiltration risk. |
| SharedWorker/service-worker refresh owner | Viable future design, but materially larger lifecycle, rollout, and compatibility surface. |
| Server grace window / accepting the previous refresh token | Rejected: weakens reuse detection and is explicitly out of scope. |
| New non-rotating server handoff endpoint | Not selected: expands the authentication API and server state for a client coordination fix. |

## Unsupported-browser fallback

| Available capability | Observable behavior |
| --- | --- |
| Locks + storage marker + BroadcastChannel | Full one-refresh coordination and stale-event defense. |
| Locks + marker, no BroadcastChannel | Refreshes remain serialized, but a waiter cannot receive the new access token and may perform a second sequential rotation after the sync fallback. |
| Locks only | Refreshes are serialized; duplicate sequential rotations are possible. |
| BroadcastChannel without Locks | State propagation and validation remain, but concurrent HTTP refresh cannot be prevented. |
| No usable coordination APIs | PR #203 in-tab single-flight only; multiple tabs are unsupported and R-059 remains. |

The fallback never stores tokens, adds a server grace window, or disables reuse detection. The UI
does not claim cross-tab safety when the required platform APIs are absent. Current evergreen
Chromium supports the full path used by Phase F; other browser/device support requires separate
acceptance evidence.

## Verification

- Deterministic unit test holds Tab B's lock callback, records Tab A's completion, releases the
  lock, and delivers only the correlated sync messages while the original refresh broadcast
  remains queued. It asserts zero refresh calls from Tab B.
- Unit coverage includes in-tab concurrency, delayed delivery, malformed messages, stale
  logout/re-login, aborted caller behavior, lock cancellation, terminal failure propagation,
  and leader failure after marker publication.
- Phase F must use two independent pages in one real browser profile with the real API and
  rotating refresh cookie. Acceptance is exactly one refresh and neither tab signed out.
