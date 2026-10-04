# Issue #124 — My Agenda browser evidence

**Date:** 2026-10-04  
**Script:** `scripts/issue-124-agenda-browser-evidence.mjs`  
**Database:** D-071 disposable `hireme_test_20261004230106_a8ead8330e64` (provisioned locally, seed ×2, bootstrap admin reset to `Synthetic-admin-123!`)  
**API / web:** `pnpm --filter @hire-me/api dev` on port 3000, Vite web on `http://127.0.0.1:5173`

## Execution summary

- **Persona:** `admin@example.test` (full permissions including `meetings:view`, tasks, missions, training).
- **Locales:** English (`en`) and French (`fr`) via `hireme.locale` localStorage before sign-in.
- **Viewports:** 1440, 1024, 800, 430, 390.
- **Agenda views exercised per locale/viewport:** Today, Week, Month, Upcoming, Overdue, Past (view `<select>`).
- **Source filter:** Meetings / Réunions per locale/viewport.
- **Checks on each capture:** no visible UUIDs in `main`, no horizontal overflow on `main`.
- **Keyboard:** Tab traversal from agenda after EN capture pass.
- **Artifacts:** 70 PNG captures + `manifest.json` under `/opt/cursor/artifacts/issue124-agenda-evidence/`.

## Deep links (manual spot-check during dev)

- Agenda **Open** uses server `deepLink` values: `/tasks?task=`, `/missions?mission=&process=&interview=`, `/training?program=&session=`, `/meetings?meeting=` (meetings open on dedicated `MeetingsPanel`, not ignored on `/agenda`).

## Limits

- Evidence script does not record every deep-link destination screen (missions/training/meetings detail) in the 70-shot matrix; API integration tests and web route wiring cover those paths.
- Synthetic agenda rows depend on disposable DB seed; empty states appear when no dated fixtures exist for a view window.

## How to reproduce

1. Provision D-071 (`pnpm test:db:provision` with `TEST_DATABASE_ADMIN_URL`).
2. Point `DATABASE_URL` in `.env` at the disposable URL; bootstrap admin password via `AUTH_BOOTSTRAP_ADMIN_PASSWORD` + `pnpm --filter @hire-me/api auth:bootstrap-admin`.
3. Start API and web; install Playwright Chromium (`pnpm exec playwright install chromium`).
4. Run `node scripts/issue-124-agenda-browser-evidence.mjs`.
