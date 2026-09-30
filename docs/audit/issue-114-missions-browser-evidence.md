# Issue #114 — Missions first public-opportunity browser evidence

**Gate:** `MISSIONS PUBLIC OPPORTUNITY EMPTY GATE: PASS`

### Environment

- **Branch:** `cursor/missions-public-opportunity-empty-eafa` (PR #122)
- **Base `main` SHA:** `2e7859e26b4e1d8aa83d3024b2cb9bd7524aa265` (unchanged during verification; no rebase required)
- **Browser:** Chromium (Playwright headless)
- **App URLs:** `http://127.0.0.1:5173` → `http://127.0.0.1:3000`
- **Database:** local `hire_me_dev` with disposable Issue #114 fixtures from `scripts/issue-114-evidence-setup.ts`

### Synthetic audit personas (local dev only)

| Email | Permission set (effective) | Role in evidence |
| --- | --- | --- |
| `admin@example.test` | Bootstrap super admin | Existing/missing/create/error scenarios |
| `issue114-view@test.hireme.test` | `missions:view`, `public_opportunities:view` (GUEST + dev-only role grants) | Read-only missing empty state |

Mission UUIDs (stable on re-run of setup script): see `summary.json` → `setup.missions`.

### Evidence bundle

15 PNGs + `summary.json` under `/opt/cursor/artifacts/issue114-evidence/` (audit runner artifacts; not committed to the repository).

Capture runner: `scripts/issue-114-missions-browser-evidence.mjs` (requires local `pnpm dev`, setup script, and a one-off Playwright install).

### Scenarios

| Scenario | EN 1440 | EN 390 | FR 1440 | FR 390 | Result |
| --- | --- | --- | --- | --- | --- |
| Existing public opportunity loads | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Missing → localized empty (not section error) | ✓ | ✓ | ✓ | ✓ | **PASS** (`hasSectionError=0`, `hasEmptyTitle=1`) |
| Read-only missing (no save) | ✓ | ✓ | ✓ | ✓ | **PASS** (`saveVisible=0`) |
| First PATCH create → ready + publication controls | ✓ (dedicated capture) | — | — | — | **PASS** |
| Real 5xx → section error | ✓ (routed probe) | — | — | — | **PASS** (`hasSectionError=1`) |

### Responsive / layout

For each matrix cell, `document.documentElement.scrollWidth <= clientWidth + 1` (**PASS** in `summary.json` → `missingLayout` / `existingLayout`).

Mission titles are human-readable in the UI; no raw mission UUIDs are shown in captured screenshots.

### Keyboard / focus (390 EN)

Playwright spot-check @ 390 EN: focus `input[name="publicTitle"]`, then Tab through the editor reaches the “Save public opportunity” submit control (`keyboard-spot-check.json` → `reachedSave: true`). **PASS**

### Stale-response regression

Covered by `apps/web/src/missions/MissionsPublicOpportunityEmpty.test.tsx` (Mission A late response must not populate Mission B). Re-run with missions web tests on final head.

### Locale

UI strings verified in captures: EN empty title “No public opportunity yet”; FR “Aucune annonce publique pour l’instant”; FR section error “Section indisponible”.
