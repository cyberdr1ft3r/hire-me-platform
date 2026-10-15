# Cross-tab refresh coordination (Issue #202 / R-059)

Status: **Proposed** — implemented in the cross-tab auth PR; pending review.

## Problem

PR #203 single-flights refresh **within one tab**. Two tabs that hit an expired access token
at the same time each call `POST /auth/refresh` with the same rotating refresh cookie. The
second request presents a consumed token, triggers reuse detection, and revokes the session
family ([limitation note](./auth-cross-tab-refresh-limitation.md)).

## Goals

- At most **one** refresh HTTP request across all same-origin tabs at a time.
- Preserve server refresh rotation and reuse detection (no server grace window in this PR).
- Refresh tokens remain HTTP-only; never read or broadcast.
- Access tokens stay in module memory only (not `localStorage` / `sessionStorage`).
- Logout and terminal refresh failure propagate to other tabs.
- Degrade safely when APIs are missing.

## Non-goals (this PR)

- Scope B refresh limiter / proxy trust (R-055).
- Console Workspace tabs.
- Sharing refresh tokens or persisting access tokens in web storage.

## Chosen design: Web Locks + BroadcastChannel

### Web Locks (`navigator.locks.request`)

- Lock name: `hire-me:auth-refresh` (exclusive).
- Only the lock holder performs `POST /auth/refresh`.
- Other tabs queue on the lock; when the holder finishes, the next tab acquires the lock.
- If the holder succeeded, waiters **must not** refresh again with the already-rotated cookie
  unless they still lack the new access token (see broadcast below).
- **Tab crash:** the lock is released when the holder's document is destroyed; waiters proceed.
- **Hung refresh:** same as today — waiters block until the network completes or the tab closes.

### BroadcastChannel (`hire-me-auth-session-v1`)

Same-origin only; no cross-site leakage.

| Message | Payload | When |
| --- | --- | --- |
| `refresh` | `AuthResponse` (access token + user; no refresh token in API body today) | After a coordinated refresh succeeds in the lock holder |
| `session-ended` | `expired` \| `user-changed` \| `logout` | Terminal refresh failure, user mismatch, or explicit logout |
| `session-replaced` | `userId` | Login / `startAuthSession` in another tab |

**Why broadcast the access token?** Waiters need the new access token without a second refresh.
A second refresh after the cookie rotated is usually **safe** (not reuse) but wastes rotation
and can amplify rate limits. Broadcast avoids extra refresh calls and matches the single-flight
intent across tabs.

**Security implications of cross-tab access token broadcast:**

- XSS in any tab can already read module memory; broadcast does not expand attacker capability
  beyond same-origin script.
- Token is short-lived; refresh token never enters JavaScript.
- A malicious extension could intercept channel messages — same class as reading memory.
- Preferable alternative (broadcast “done” only, force waiters to refresh) still requires exactly
  one waiter refresh per wave; we chose broadcast to minimize refresh churn and rate-limit risk.

### Waiter algorithm (inside `refreshAuthSession`)

1. In-tab single-flight (unchanged).
2. Subscribe briefly for `refresh` / `session-ended` while coordinating.
3. Acquire exclusive lock (or proceed directly if locks unavailable — see degradation).
4. If a `refresh` message already updated this tab’s session for the current epoch, return success.
5. Otherwise perform `POST /auth/refresh`, apply outcome once, publish `refresh` on success.
6. On terminal rejection in `settleRefresh`, publish `session-ended`.

### Logout

- Local `endAuthSession` first (unchanged), then server logout (unchanged).
- Publish `session-ended: logout` so other tabs clear without another revoke call.

### Login / session replace

- `startAuthSession` publishes `session-replaced`.
- Other tabs with an active **different** user end with `user-changed`.

## Degradation

| Capability | Behavior |
| --- | --- |
| Locks + BroadcastChannel | Full coordination |
| BroadcastChannel only | Reduces duplicate refresh when holder publishes; race window remains without lock |
| Neither | Same as PR #203 (in-tab single-flight only) |

Feature detection at runtime; no polyfill dependencies.

## Trade-offs rejected

- **Server grace window** for previous refresh token: security trade-off; stop for review if required.
- **SharedWorker** refresh owner: extra complexity and lifecycle edge cases.
- **localStorage token handoff:** violates storage constraint.

## Verification

- Unit tests with mocked locks/channel (multi-tab simulation).
- Extend `expiry.mjs` phase F from observation to **pass** when both tabs stay signed in and
  total refresh count across tabs is 1.
- Real API + throwaway PostgreSQL for race tests (same harness as #203 acceptance).
