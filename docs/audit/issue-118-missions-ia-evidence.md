# Issue #118 — Missions IA browser evidence (executed)

**Captured:** 2026-10-06 (Chromium headless, local `pnpm dev` + PostgreSQL)  
**Manifest:** `/opt/cursor/artifacts/issue118-evidence/manifest.json`  
**Fixture:** `/opt/cursor/artifacts/issue118-evidence/fixture.json`  
**Screenshots:** `/opt/cursor/artifacts/issue118-evidence/{locale}_{viewport}_tab_{section}.png` (full-page)

## Baseline vs measured (Issue #118 audit)

Pre-#118 audit baseline: unstructured single column ~**3400px** desktop detail scroll; mobile ~**7500px** page height.

Post-#118 representative metrics (bounded tabs, synthetic fixture `Issue118 Evidence Mission`):

| Metric | Pre-#118 | Post-#118 (representative) |
| --- | --- | --- |
| **Page height** @ 1440 Pipeline tab (no process open) | ~3400px unstructured stack | **1667px** |
| **`.mission-detail` scroll height** @ 1440 Pipeline tab | (same stack) | **1351px** |
| **Active panel scroll height** @ 1440 Pipeline tab | — | **1171px** |
| **Page height** @ 1440 with process open (split) | — | **3152px** page / **2740px** detail / **2560px** active panel (expected: pipeline list + sticky process detail) |
| **Page height** @ 390/430 (max across tabs, Public tallest) | ~7500px | **≤2274px** |
| Horizontal overflow | audit concern | **0** in 10 matrix rows |
| Process ↔ pipeline | detached | **Split workspace** when process open (`hasSplit: true` @ 1440/1024) |

Bounded tabs reduce dead scrolling: operators see one of Overview / Team / Pipeline / Public at a time instead of a single ~3400px stack.

## Matrix (10/10 PASS)

Viewports: **1440, 1024, 800, 430, 390** × **EN, FR**.

Runner: `scripts/issue-118-missions-ia-evidence.mjs` (fails the job on assertion regression).

### Browser-backed checks (all matrix rows unless noted)

| Check | Result |
| --- | --- |
| Local IA tabs | Overview, Team, Pipeline, Public opened (4 tabs) |
| Keyboard @ ≥1024 | ArrowRight, ArrowLeft, Home, End; focus stays on `role="tab"`; `aria-selected` matches activated tab (1440 EN sample: all **true**) |
| Read-first profile | Edit form hidden → Edit reveals → Cancel read-first → Save read-first |
| Mission-only deep link | `?mission=` opens fixture mission; Overview active |
| Process deep link | `?mission=&process=` → Pipeline active; **Issue118 Primary Candidate** process open |
| Interview deep link | `?mission=&process=&interview=` → Pipeline + process + **HR interview** detail visible (`#mission-interview-<id>`, row selected) |
| Pipeline / #116 | Candidate-name control in viewport @ 430/390; process heading visible |
| Stacked focus @ ≤800 | Process heading focused on open; locale switch does **not** refocus (browser) |
| Overflow / UUIDs | No page-level horizontal overflow; no operator-facing UUIDs in body text |
| Desktop split | `.mission-pipeline-workspace--split` with process open @ 1440/1024 |

### Unit-backed checks (recorded in manifest `staticChecks`)

| Check | Test |
| --- | --- |
| Single-section a11y (Overview-only actor) | `MissionsWorkspace.test.tsx` — *names the Overview panel without a missing tab when navigation is omitted* (`role="region"`, no tablist, no dangling `aria-labelledby`) |
| Stacked reveal focus | `MissionsWorkspace.test.tsx` — *opens a process from the candidate name control and focuses it on stacked layouts* |
| Background list refresh focus | Design: no `aria-live` on process reveal; generation guards in `MissionsPanel` (not re-exercised in browser matrix) |

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

- **729+** `@hire-me/web` tests (includes single-section Overview region naming, navigation, deep links).
- Exact-head CI: **green** run `37453546466` on `0540c6b` (PR #139).
- Unrelated document-generation flake fix: **PR #140** only (not in #139 diff).
