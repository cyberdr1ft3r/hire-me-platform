# Workspace Surface v1.0 and Messages layout — verification evidence

Branch `feat/workspace-surface-v1`, based on `fix/ui-refinement-demo-20261013`
`25f8190` (PR #194 with AppShell v1.2 / PR #195 merged into it). Local Vite web +
API against a disposable PostgreSQL container with synthetic data created through
the public API (synthetic names, `.example`/`.test` addresses). Installed Chrome via
`playwright-core`. Design addendum: [Workspace Surface v1.0](../design/HIREME_UI_DNA_v1.3-workspace-surface-proposed.md).

## Measured before → after (`/messages`, 46-message synthetic thread)

| Viewport | Document scroll | Composer bottom (viewport) | Scroll owners |
| --- | --- | --- | --- |
| 1440×900 EN | 174px → **0** | 970 (hidden) → **795** | document + log → **log** |
| 1024×768 EN/FR | 270px → **0** | 934 (hidden) → **663** | document + log → **log** |
| 768×1024 EN | 212px → **0** | 1140 (hidden) → **923** | document + log → **log** |
| 390×844 EN/FR | 323px → **0** | 1059 (hidden) → **731** | document + log → **log** |
| 1440×620 EN | 286px → **0** | 802 (hidden) → **529** | document + log → **log** |

Candidates at 1440×900 and 1440×620: document scroll 891/1171px → 0, with the
directory and record panes scrolling independently. At 1024px (stacked) `main` is
the single scroller; on the mobile shell (768/390) ordinary document flow is kept.
No horizontal overflow in any EN/FR combination.

## Interaction checks (25/25 passed, 1440×900 EN unless noted)

Rail Administration link navigates to `/admin`; returning via Communication shows
only Messages in the context, marked current. Log opens at the newest message;
composer visible; a nine-line draft grows the composer 64→189px with no document
scroll and the newest message kept in view; clearing shrinks it back; send, edit
and withdraw work; switching conversations keeps the composer visible; focus ring
on conversation rows (3px solid); 1440×440 short viewport and a 720×450 (≈200%
zoom) viewport keep the composer reachable without overflow. Candidates: search
filter narrows to one row, selection marks the row and opens the record, reset
restores the list, keyboard focus ring visible on the stretched row target.

## Screenshots

[workspace-surface-v1/](workspace-surface-v1/) holds before/after pairs for Messages
(1440×900, 390×844, 1440×620, FR 1024×768), Candidates (EN and FR 1440×900) and the
grown-draft state. All content is synthetic.

## Limits

Viewport testing in Chromium only, not physical devices or a full screen-reader
pass. Mobile virtual keyboards over a fill-layout composer (iOS Safari `dvh`
behavior) need real-device confirmation. The local Windows checkout cannot run
the native PKCS#11 suite and `foundation.test.tsx` fails locally only because of
CRLF CSS; exact-head Linux CI is authoritative.
