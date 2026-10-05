# Issue #116 — Stacked master-detail reveal/focus evidence

**Gate:** `STACKED MASTER-DETAIL GATE: PARTIAL` (automated unit/accessibility tests **PASS**; Chromium matrix script ready — live capture blocked on this cloud VM without Docker/PostgreSQL)

### Shared contract

- Module containers (`.candidates`, `.clients`, `.missions`) use the same breakpoint math as their CSS container queries (`60rem` for Candidates/Clients, `64rem` for Missions).
- Explicit selection bumps a monotonic `revealToken`; `useStackedMasterDetailReveal` focuses a `tabIndex={-1}` detail heading only when stacked and the token has not yet been applied for that navigation.
- Background refresh, stale responses, pagination reconciliation, and locale-only rerenders do not advance the token.

### Automated tests (local)

| Suite | Result |
| --- | --- |
| `apps/web/src/layout/stacked-master-detail.test.ts` | **PASS** (layout math + hook) |
| `apps/web/src/candidates/CandidateWorkspace.test.tsx` | **PASS** (stacked focus + locale stability) |
| `apps/web/src/clients/ClientsPanel.test.tsx` | **PASS** (stacked client focus) |
| `apps/web/src/missions/MissionsWorkspace.test.tsx` | **PASS** (pipeline name control + stacked process focus) |

### Browser matrix script (800 / 430 / 390 × EN / FR)

Runner: `node scripts/issue-116-stacked-master-detail-evidence.mjs`  
Prerequisites: `docker compose up -d postgres`, migrations/seed, `pnpm dev`.

Captures per cell: Candidates selection focus, Clients selection focus, Missions selection focus, Missions process open via `button.mission-pipeline__select` (Actions column hidden on narrow pipeline cards).

**Cloud agent note:** Docker is unavailable on the execution VM (`docker: command not found`), so PNG/`summary.json` under `/opt/cursor/artifacts/issue116-evidence/` were not produced in this run. Re-run the script locally or in CI with the standard dev stack to complete the matrix.
