# Known limitation — cross-tab access-token refresh (Issue #202)

Status: open, not addressed by PR #203. Recorded as risk R-059.

## What happens

PR #203 makes refresh single-flight **within one browser tab**: concurrent 401s in a tab
share one `POST /auth/refresh`. Tabs do not coordinate. Every tab of the same browser
profile sends the same `hire_me_refresh` cookie, and the API rotates it on each refresh.

When two tabs meet an expired access token at about the same time:

1. Tab 1 refreshes first; the API consumes the cookie's session and issues a new one.
2. Tab 2 presents the cookie that was just consumed. The API treats it as reuse
   (`apps/api/src/auth/auth.service.ts`: a consume that does not update exactly one
   row revokes the whole session family) and answers 401.
3. Tab 2 signs out. Tab 1 keeps its new access token until it expires, but its refresh
   token belongs to the revoked family, so its next refresh also fails and it signs out
   then.

## Evidence

Phase F of the [real-API expiry acceptance](../audit/issue-202-auth-expiry-acceptance.md)
(two tabs, same profile, both shown together after a natural 60 s expiry):
`tab1Refresh: [201]`, `tab2Refresh: [401]`, tab 2 signed out, tab 1 still signed in at
that moment ([raw result](../audit/issue-202-auth-expiry/results/F_cross_tab.json)). Tab
1's later sign-out follows from the family revocation in the code above; it was not
measured.

## Exposure

Needs two or more open tabs whose first post-expiry requests overlap within the refresh
round trip. Visibility-aware polling makes background tabs mostly quiet, but tabs made
visible together (window restore, several monitors) and the planned Console Workspace
(D-089) make it more likely. The effect is an unexpected sign-out and lost unsaved
input; it does not expose data.

## Candidate follow-up (needs a decision; not in #203)

- Client: coordinate refresh across tabs, for example a Web Locks
  (`navigator.locks`) critical section around refresh plus a `BroadcastChannel` that
  hands the new access token to the other tabs.
- Server: a short grace window in which the immediately previous refresh token is
  accepted once. This is a security trade-off for the application-security review.
- Any change to the refresh limiter or proxy trust (R-055, #202 Scope B) stays separate.
