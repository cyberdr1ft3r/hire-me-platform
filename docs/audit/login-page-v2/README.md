# Login Page v2 browser acceptance

Date: 2026-10-24  
Base: `main` at `4c3d85aec7b89b80322889a539b7857b9a58250e`

## Scope

This evidence covers the public HireMe login surface only. Authentication endpoints, access-token
handling, refresh-cookie behavior, session restoration, cross-tab coordination, logout, permissions,
and backend authorization are unchanged.

All browser checks used intercepted synthetic responses in installed Google Chrome. No real account,
credential, token, or operational diagnostic is present in the screenshots.

## Captures

| View | Locale | Viewport | Evidence |
| --- | --- | --- | --- |
| Desktop | English | 1440 × 900 | [login-desktop-en-1440x900.png](./login-desktop-en-1440x900.png) |
| Tablet | English | 800 × 1000 | [login-tablet-en-800x1000.png](./login-tablet-en-800x1000.png) |
| Mobile | French | 390 × 844 | [login-mobile-fr-390x844.png](./login-mobile-fr-390x844.png) |

## Verified interactions

- No horizontal overflow at desktop, tablet, or mobile widths.
- Keyboard focus order is language, email, password, password visibility, then submit.
- The password visibility control exposes its pressed state and restores masking.
- Enter submits the form once; the synchronous pending guard prevents duplicate requests.
- Login errors are localized and do not display backend response bodies or health-service details.
- Successful authentication uses the existing session bootstrap and authenticated landing route.

Machine-readable results are in [browser-check.json](./browser-check.json).
