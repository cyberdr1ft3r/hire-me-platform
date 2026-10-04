# Issue #131 — Accounting V1 workspace browser evidence

**Gate:** `ISSUE 131 ACCOUNTING WORKSPACE GATE: PASS` (local Chromium via `scripts/issue-131-accounting-browser-evidence.mjs`; exact-head CI on PR #135 when green)

### Environment

- **Branch:** `cursor/issue-131-accounting-workspace-eafa` (PR #135), stacked on D-081 prerequisite `cursor/issue-131-accounting-source-labels-eafa` (PR #133), base `main` `696a539`.
- **Browser:** Playwright Chromium, headless; `en-GB` and `fr-FR` contexts with `hireme.locale` preset.
- **App:** local Vite web (port 5173) and API (port 3000) against the development database (`admin@example.test` bootstrap). Finance Manager persona `issue131-finance@test.hireme.test` created through Admin API for the run.
- **Matrix:** 1440, 1024, 800, 430, and 390 px, EN and FR (operator); Finance Manager EN/FR at 1440 and 390.
- Screenshots and demo video: `/opt/cursor/artifacts/issue131-evidence/` (not committed).

### Personas

| Persona | Role | Expected Accounting capability |
| --- | --- | --- |
| Operator | `SUPER_ADMIN` (dev bootstrap) | All four areas, amounts, writes, mission/placement/training pickers when permitted |
| Finance Manager | `FINANCE_MANAGER` (D-078) | All four areas and writes without mission-linked pickers; zero `/v1/missions` and zero `placement-options` requests |

### Automated checks (56 layout/UUID states + interaction probes, 0 defects)

| Scenario | Coverage | Result |
| --- | --- | --- |
| Four areas, no overflow, no UUID in workspace text | Operator × 5 widths × EN/FR | **PASS** |
| Finance Manager layout and labels | EN/FR × 1440/390 | **PASS** |
| Finance Manager network guard | EN + FR full area tour | **PASS**: zero mission and placement-options requests |
| Keyboard | EN 1440: Tab from Payments reaches another accounting control | **PASS** |
| Locale switch | EN → FR via shell language select with Expenses area context | **PASS**: French tab label `Dépenses` visible |
| Demo recording | EN 1440 tour of all four areas | **PASS**: `issue131-accounting-demo.webm` |

### Observations (not changed; outside Issue #131 scope)

- Read-only limited persona (amounts hidden, payments list only) is covered by `AccountingPanel.test.tsx` and accounting access rules tests; no disposable-DB custom role was provisioned for this dev-database capture.
- Invoice → payment allocation chain flow was not re-recorded end-to-end in this dev-database run when no issued invoice fixtures were present; server allocation rules remain covered by `accounting.integration.test.ts` on D-071 disposable databases.
