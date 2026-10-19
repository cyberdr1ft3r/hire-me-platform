# Issue #202 — cross-tab refresh coordination (R-059)

Date: 2026-10-15. Draft PR #209 on branch `cursor/issue-202-cross-tab-auth-cf71` from
`main` `bdfbf5f`.

## Review finding reproduced

The original PR head `7de3218` checked only whether the local access token changed after Web
Lock acquisition. A deterministic controlled-channel test can hold Tab A's refresh message,
release the lock to Tab B, and show that Tab B reaches `POST /auth/refresh` before processing the
message. This confirms the security review finding without sleeps or scheduler timing.

## Corrected protocol

[D-090 design](../design/auth-cross-tab-refresh-coordination.md): Web Lock plus a synchronously
readable, non-secret completion marker and a request-correlated BroadcastChannel sync. The marker
stores only a random event ID and event kind; no token, user data, or auth payload enters browser
storage. A waiting tab can detect a completed refresh after lock handoff even while the ordinary
message is delayed, then obtain only the matching in-memory `AuthResponse` from the leader.

Refresh rotation, family reuse detection, in-tab single-flight, one retry, and the HTTP-only
refresh cookie remain unchanged. No server grace window was added.

## Deterministic unit evidence

Focused command:

```text
pnpm --filter @hire-me/contracts build
pnpm --filter @hire-me/web exec vitest run \
  src/auth/auth-cross-tab.test.ts src/auth/authenticated-request.test.ts
```

Result: **2 files, 42 tests passed** (10 cross-tab + 32 request-core tests).

Covered behavior:

- lock handoff before delivery of Tab A's ordinary refresh message; correlated sync completes and
  Tab B performs zero refresh requests;
- delayed ordinary delivery remains idempotent after sync;
- in-tab concurrent callers share one request;
- the App-level restored-session handoff preserves the refresh completion marker for waiters;
- current terminal events propagate;
- logout while lock-waiting suppresses refresh, and logout from an older generation cannot end a
  new login;
- malformed, unexpected, schema-invalid, and marker-mismatched messages are ignored;
- leader exit after marker publication falls back to one new serialized rotation after the
  bounded sync wait;
- lock cancellation returns `unavailable` without an HTTP request or local sign-out;
- an aborted caller does not cancel the shared refresh (request-core regression test).

Formatting, architecture, monorepo lint, monorepo typecheck, and production build pass. Lint
reports one pre-existing unrelated unused-disable warning in
`apps/web/src/clients/ClientsPanel.test.tsx` and no errors. The focused 42 auth tests and the
updated App storage-boundary regression pass.

The complete root test command is not green on this Windows host: the first sandboxed run denied
API hard-link and loopback operations, and the lockfile install could not build the optional
`pkcs11js` native lab binding because Visual Studio C++ tools are absent. Rerunning the API suite
outside the sandbox with only that native lab file excluded passed 208/209; the one 5-second PDF
timeout passed in isolation in 1.99 seconds. The web run reached 1016/1019: the updated auth
storage test and unrelated training timeout pass in isolation; the remaining foundation test is
a pre-existing CRLF-sensitive CSS source assertion on Windows. Exact-head Linux CI is therefore
the authoritative complete-suite gate; no test was skipped or weakened in the repository.

## Security assessment

- BroadcastChannel trusts every script, iframe, and worker on the same origin; it is not scoped
  to the HireMe route or to a set of known tabs.
- Broadcasting the access token expands direct observation to a listening same-origin context.
  It is accepted here because a waiter cannot meet the one-refresh requirement without the new
  access token. The refresh token remains HTTP-only and no token is persisted.
- A versioned allow-listed parser validates every incoming message and parses auth payloads with
  `AuthResponseSchema`. A state event must match the current synchronous marker; sync responses
  additionally match the pending request ID.
- Same-origin XSS, compromised dependencies, or mutually untrusted applications hosted on the
  same origin defeat this trust model. CSP, dependency control, and origin isolation remain
  required controls.
- Client-only code cannot eliminate the crash gap between server token consumption and browser
  cookie commitment. Reuse detection remains fail closed in that interval.

## Real-API Phase F

Phase F in [`expiry.mjs`](./issue-202-auth-expiry/tools/expiry.mjs) asserts exactly one
`POST /auth/refresh` across two independent tabs and no sign-out after concurrent module bursts.

Status: **passed locally on the corrected working tree** with PostgreSQL 16.4 in a throwaway
tmpfs container, the real API at a 60-second access-token TTL, installed Chrome 155 through
`playwright-core`, and two independent pages in one browser context. The access token expired
naturally while both pages were hidden; there was no API traffic before the burst.

Result: Tab 1 refresh `[201]`, Tab 2 refresh `[]`, exactly **one** total refresh, and neither tab
signed out. Raw evidence: [`F_cross_tab.json`](./issue-202-cross-tab-auth/results/F_cross_tab.json)
and [`phase-f-results.json`](./issue-202-cross-tab-auth/results/phase-f-results.json).

Reproducible focused command after starting the disposable API and Vite server:

```text
PHASE=F WEB=http://127.0.0.1:5173 API=http://127.0.0.1:3000 \
  EMAIL=<synthetic disposable-test admin> PW=<synthetic password> TTL=60 \
  node docs/audit/issue-202-auth-expiry/tools/expiry.mjs \
  <absolute playwright-core path> <output directory>
```

Exact-head CI remains required after commit and push.

## Remaining limitations

- Full one-refresh behavior requires Web Locks, usable same-origin localStorage for the
  non-secret marker, and BroadcastChannel. The exact fallback matrix is documented in D-090.
- A leader crash after a successful response but before token handoff can cause a second
  serialized rotation; it does not add grace or intentionally bypass reuse detection.
- Issue #202 Scope B (hashed refresh limiter and verified proxy hops / R-055) is unchanged.
- PR #208 is untouched.
