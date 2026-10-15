# Issue #202 — cross-tab refresh coordination (R-059)

Date: 2026-10-15. Branch `cursor/issue-202-cross-tab-auth-cf71` from `main` `bdfbf5f`.

## Design

[auth-cross-tab-refresh-coordination.md](../design/auth-cross-tab-refresh-coordination.md) — Web Locks
(`hire-me:auth-refresh`) + `BroadcastChannel` (`hire-me-auth-session-v1`). No server grace window;
refresh tokens stay HTTP-only.

## Before (PR #203 / phase F observation)

Two tabs after natural expiry: `tab1Refresh: [201]`, `tab2Refresh: [401]`, tab 2 signed out
([F_cross_tab.json](./issue-202-auth-expiry/results/F_cross_tab.json)).

## After (expected)

Phase F in [`expiry.mjs`](./issue-202-auth-expiry/tools/expiry.mjs) now asserts:

- Exactly **one** `POST /auth/refresh` across both tabs.
- Neither tab signed out after concurrent module bursts.

Real-API rerun requires throwaway PostgreSQL + Chrome (same harness as
[issue-202-auth-expiry-acceptance.md](./issue-202-auth-expiry-acceptance.md)). Not executed on the
2026-10-15 cloud agent VM (no Docker).

## Unit tests

- `apps/web/src/auth/auth-cross-tab.test.ts` — mock locks/channel, concurrent refresh, remote
  broadcast, session-ended propagation.
- `apps/web/src/auth/authenticated-request.test.ts` — unchanged PR #203 matrix (31 tests).

## Security notes

- Access token broadcast is same-origin only; refresh token never in JS or messages.
- Logout and terminal refresh failure broadcast `session-ended` to other tabs.
- Login publishes `session-replaced`; other tabs with a different user sign out (`user-changed`).
- Without Locks/BroadcastChannel, behavior falls back to in-tab single-flight (PR #203).
