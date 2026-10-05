# Issue #116 — Stacked master-detail reveal/focus evidence

**Gate:** `STACKED MASTER-DETAIL GATE: PASS` (automated tests + live Chromium matrix)

**Branch head (evidence run):** `cursor/issue-116-stacked-master-detail-909e` (pre-push; see PR #138 for exact SHA after commit)

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

### Disposable data setup

Runner prerequisite (synthetic fixtures only):

```bash
pnpm --filter @hire-me/api exec dotenv -e ../../.env -- tsx ../../scripts/issue-116-evidence-setup.ts
```

Creates **Issue116 Evidence Client**, **Issue116 Evidence Candidate**, **Issue116 Evidence Mission**, and one **mission candidate process** linked to the admin recruiter.

### Browser matrix (800 / 430 / 390 × EN / FR)

**Runner:** `node scripts/issue-116-stacked-master-detail-evidence.mjs`  
**Stack:** API `http://127.0.0.1:3000`, web `http://127.0.0.1:5173`, seeded RBAC + Issue #116 fixtures above.  
**Executed:** 2026-10-05 (Cloud Agent VM, Chromium headless).

| Check | Result |
| --- | --- |
| Candidates stacked selection → focus on candidate `h2` (display name) | **PASS** all 6 cells |
| Clients stacked selection → focus on `.client-detail__title` | **PASS** all 6 cells |
| Missions stacked selection → focus on `.mission-detail__title` | **PASS** all 6 cells |
| Mission pipeline open → focus on `.mission-process__title` (candidate name) | **PASS** all 6 cells |
| Pipeline open control visible and within viewport at 430/390 (no horizontal hunt) | **PASS** |
| Locale switch via shell language select (EN↔FR) does not refocus detail | **PASS** (Candidates cells) |
| Candidate list refresh (filter submit) does not refocus detail | **PASS** (Candidates cells) |
| Page-level horizontal overflow (`scrollWidth` ≤ `clientWidth`) | **PASS** all cells |
| Focus targets expose meaningful names (candidate/client/mission headings) | **PASS** |

**Artifacts**

- Machine-readable: `/opt/cursor/artifacts/issue116-evidence/summary.json`
- PNG captures (24 files): `/opt/cursor/artifacts/issue116-evidence/`  
  Naming: `{en|fr}_{800|430|390}_{candidates_stacked_selection|clients_stacked_selection|missions_stacked_selection|missions_process_stacked_open}.png`

**Side-by-side (800):** At 800px width modules remain in stacked mode per container breakpoints; selection focus moves once to the detail heading without repeat focus on locale/refresh checks above. No unexpected focus jump observed in captured runs.

### Latest `main` integration (#117)

Issue #117 / PR #137 was **still open** when this evidence landed. **No merge/rebase onto latest `main` in this push** — integrate after #137 merges, then rerun exact-head CI on PR #138.
