# Issue #118 — Missions IA browser evidence (executed)

**Captured:** 2026-10-06 (Chromium headless, local `pnpm dev` + PostgreSQL)  
**Manifest:** `/opt/cursor/artifacts/issue118-evidence/manifest.json`  
**Fixture:** `/opt/cursor/artifacts/issue118-evidence/fixture.json`  
**Screenshots:** `/opt/cursor/artifacts/issue118-evidence/{locale}_{viewport}_tab_{section}.png` (full-page)

## Baseline vs measured (Issue #118 audit)

| Metric | Pre-#118 audit | Post-#118 (this run, max across matrix) |
| --- | --- | --- |
| Desktop unstructured detail scroll | ~3400px single column | **1667px** page height @ 1440 Pipeline tab; **1351px** `.mission-detail` scroll height |
| Mobile unstructured detail scroll | ~7500px | **≤2274px** page height @ 390/430 (Public tab tallest); Pipeline+process **≤ ~1700px** typical |
| Horizontal overflow | (audit concern) | **0** overflows in 10 captures |
| Process detached from pipeline | yes | **Split pipeline workspace** with process detail adjacent when a process is open (`hasSplit: true` at 1440/1024 with process open) |

Bounded tabs materially reduce dead scrolling: operators see one of Overview / Team / Pipeline / Public at a time instead of a single ~3400px stack.

## Matrix

Viewports: **1440, 1024, 800, 430, 390** × **EN, FR** (10 captures).

Verified per capture:

| Area | Result |
| --- | --- |
| Local IA (tabs) | Overview, Team, Pipeline, Public opened where permitted |
| Keyboard | ArrowRight moves tab focus @ ≥1024 |
| Mission profile | Edit form hidden until Edit; shown after click |
| Deep links | `?mission=&process=` selects Pipeline tab; interview query preserved |
| Pipeline / process | Candidate-name control in viewport; process heading visible |
| #116 stacked focus | @ ≤800: process heading focused on open; locale switch does **not** refocus |
| Public | Public tab reachable with opportunity + applications fixture |
| UUIDs | No operator-facing UUID substrings in body text |
| Overflow | No page-level horizontal overflow |

## Commands

```bash
sudo service postgresql start
export AUTH_BOOTSTRAP_ADMIN_PASSWORD='Synthetic-admin-123!'
pnpm prisma:migrate:deploy && pnpm prisma:seed && pnpm auth:bootstrap-admin
pnpm dev
cd apps/api && DATABASE_URL=… pnpm exec tsx ../../scripts/issue-118-evidence-setup.ts
node scripts/issue-118-missions-ia-evidence.mjs
```

## CI / unit coverage

- **729** `@hire-me/web` tests (includes single-section Overview region naming, navigation, deep links).
- Exact-head CI: pending on branch head after review fixes.
