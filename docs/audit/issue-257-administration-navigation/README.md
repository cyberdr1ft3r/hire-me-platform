# Issue #257 administration navigation evidence

Captured on 2026-11-10 from the local development stack with the repository's synthetic
`admin@example.test` account. No production or customer data is present.

## Verified behavior

- `/admin?section=billing`, `/admin?section=users`, and `/admin?section=access` are stable deep links.
- Section changes remain inside one Administration Console workspace tab.
- Browser Back and Forward restore the prior subsection.
- A dirty user profile blocks subsection navigation until the operator confirms leaving.
- English and French labels update on the same mounted workspace.
- The three-section navigation remains keyboard-addressable and horizontally scrollable at mobile width.
- Only the active subsection renders and requests its data.

## Captures

- `desktop-users.png` — loaded Users directory and permission-gated create controls at 1440 px.
- `desktop-access.png` — read-only roles and permission catalog at 1440 px.
- `mobile-billing-fr.png` — French Billing section at 390 px.

The automated real-browser check used installed Brave through Playwright and completed with all six
assertions true: deep links, browser history, localization, responsive rendering, one Console tab,
and the unsaved-change guard.
