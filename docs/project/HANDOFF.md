# Current Agent Handoff

Last updated: 2026-09-27

## Current situation

- Authoritative `main` is `b3486e6b6e52838bdce74edbd8a7d5816c090e92`, including merged Issue #90 / PR #91 (**D-071**, A-75-08 corrected) and prior Public Opportunity corrections through D-070. D-070's additive migration `20260925120000_public_opportunity_content_language` has **not** run in production; production needs deployment approval, and the API must deploy with or before the web client.
- Issue #92 (audit-only) captured real Chromium EN/FR Public Opportunity evidence at 1440/1024/800/430/390 on synthetic D-071 disposable data. **PUBLIC OPPORTUNITY BROWSER GATE: PASS** (see `docs/audit/issue-92-public-browser-evidence.md`; post the embedded comment on GitHub Issue #92 if not already posted).
- D-068 production env/proxy body-size limits remain **unverified** operationally (separate from browser-layout acceptance). R-039 is unchanged.

## Next concrete action

1. Issue #92 evidence comment is posted on GitHub and the browser gate is PASS.
2. Close or update Issue #75 / #66 per audit outcome; do **not** treat D-068 production proxy verification as done.
3. Continue Issue #66 AppShell/i18n audit beyond the public surface.
4. Continue the separate seeded-role test-fixture follow-up tracked by Issue #93.

## Issue #92 completion (audit)

- Real Chromium evidence captured on `main` `b3486e6` with **PUBLIC OPPORTUNITY BROWSER GATE: PASS**.
- GitHub evidence comment posted on Issue #92; canonical report remains `docs/audit/issue-92-public-browser-evidence.md`.
