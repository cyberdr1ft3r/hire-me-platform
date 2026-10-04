# Issue #124 — My Agenda browser evidence

**Date:** 2026-10-04  
**Script:** `scripts/issue-124-agenda-browser-evidence.mjs`

## How to capture

1. Start API and web (`pnpm dev` from repository root).
2. Ensure a dev user can sign in (default script uses `admin@example.test`).
3. Run `node scripts/issue-124-agenda-browser-evidence.mjs`.
4. Artifacts land under `/opt/cursor/artifacts/issue124-agenda-evidence/`.

## Expected surface

- Authenticated `/agenda` route with bilingual shell navigation entry **My Agenda / Mon agenda**.
- View and source filters, refresh control, grouped list or empty state.
- Item **Open** actions navigate via server-provided `deepLink` values.
