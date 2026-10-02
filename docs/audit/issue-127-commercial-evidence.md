# Issue #127 — Commercial V1 workspace browser evidence

**Gate:** `ISSUE 127 COMMERCIAL WORKSPACE GATE: PASS` (local Chromium; exact-head CI recorded on PR #130)

### Environment

- **Branch:** `cursor/issue-127-commercial-workspace-eafa` (PR #130), stacked on the D-079 prerequisite `cursor/issue-127-commercial-source-labels-eafa` (PR #129), base `main` `2193c19`.
- **Browser:** Playwright Chromium, headless; `en-GB` and `fr-FR` contexts with the stored locale preference set.
- **App:** local Vite web (port 5174) and API (port 3100) against a D-071 disposable database from `pnpm test:db:provision` (seeded twice, bootstrap administrator), so the evidence run never touched the development database.
- **Data:** synthetic only. Personas were created directly in the disposable database. Commercial records were created through the real API as the operator, so lifecycle and totals follow server rules. The data covers two clients, one with a long French name; a no-mission devis → contrat → commande → facture chain (`DEV-2026-0142`, `CTR-2026-0031`, `BC-ATLAS-77812`, `FAC-2026-0398`); drafts, issued, canceled, and EUR records; and a mission-linked accepted quotation (`DEV-2026-0170`).
- **Matrix:** 1440, 1024, 800, 430, and 390 px, EN and FR.
- Screenshots, recordings, and raw metrics stay with the audit runner and are not committed.

### Personas

| Persona | Role (seeded) | Expected Commercial capability |
| --- | --- | --- |
| Operator | `SUPER_ADMIN` | Every record type, every write, mission and placement sources, generation |
| Finance Manager | `FINANCE_MANAGER` (D-078) | Every record type and write without `missions:view`: no-mission records only, no mission or placement picker (R-050) |
| Limited | `GUEST` + `clients:view`, `invoices:view` (disposable DB only) | Invoices by reference and status only: no amounts, no lines, no writes, no other record type |

### Automated checks (794, 0 defects)

| Scenario | Coverage | Result |
| --- | --- | --- |
| List, detail, and create for each record type | Operator, 4 types × 5 widths × EN/FR (120 states) | **PASS**: no page overflow and no workspace overflow; no UUID in text or inputs; money and list dates on one line; no clipped button, label, badge, header, or legend; at most one primary action per detail |
| Linked chain flow, recorded | EN 1440 and FR 390: accepted quotation → follow-up purchase order (prefilled client, quotation, derived mission) → mark received → follow-up invoice → issue with confirmation | **PASS**: the issued invoice's chain shows `DEV-2026-0170` → `BC-FLOW-…` → `FAC-FLOW-…`; the contract link says "Not linked" / "Non liée" |
| Finance Manager | EN/FR × 1440/390 | **PASS**: four record types; mission-linked `DEV-2026-0170` absent; `DEV-2026-0142` visible; invoice form without mission or placement picker; zero `/v1/missions` and zero `placement-options` requests |
| Limited | EN/FR × 1440/390 | **PASS**: Invoices only; no "New" action; "Amounts are hidden" copy and no amount text; no lifecycle group; zero quotation, purchase-order, or contract requests |
| Keyboard | EN/FR at 1440 | **PASS**: Tab reaches New, the four record types, the filters, and each reference in order, with visible focus throughout; Enter on a reference opens it and moves focus to its heading |
| Locale switch | EN → FR at 1440 with a record open | **PASS**: zero Commercial requests after the switch; the selected record stays open |

### Defects found and fixed during the run

| Finding | Fix |
| --- | --- |
| At FR 390 the quotation and contract detail panes were 10px wider than the workspace: the nowrap button "Créer un bon de commande à partir de cette pièce" set their width | Action buttons inside `.commercial-actions` wrap within the pane |
| At 1024 the list's date column wrapped "15 Sept 2026" onto two lines | List dates are `nowrap`, and the audit now checks them |
| An invoice created from a purchase order linked only the purchase order, so its chain showed the quotation as "Not linked" | A follow-up carries the source's own quotation and contract links when the server sent their references (D-080); covered in `commercial-rules.test.ts` |

### Observations (not changed; outside Issue #127 scope)

- "Mark received" does not set a purchase order's received date. That date only comes from the create form. This is unchanged server behavior.
- The generation language defaults to the interface language when a record opens and keeps the user's choice across a later locale switch.
