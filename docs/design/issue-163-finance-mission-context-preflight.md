# Issue #163 — Bounded Finance visibility for mission-linked Commercial/Accounting (R-050/R-051)

Last updated: 2026-10-12  
Base `main`: `685a696c24cf60da7a17b36f52b1197b07dfb185`  
Scope: **preflight / authorization architecture only** (no production code, seed, or schema changes in this issue).

## Executive summary

`FINANCE_MANAGER` holds client-scoped Commercial and Accounting permissions but **not** `missions:view`, `placements:view`, or `placement_commercial_eligibility:view`. Commercial and Accounting services use **`missions:view` as a hard gate** on mission-linked records and on recruiter-assignment scope. Finance therefore operates in a **client-only slice**: mission-linked commercial rows are filtered out or rejected, placement-backed invoicing cannot run, Accounting hides mission-linked invoice references on allocations, and mission/placement profitability and expense contexts are unavailable.

**Do not** fix this by granting `missions:view` (Option A): that opens the full Missions API/workspace and still would not remove the **recruiter-assignment** filter without also granting `mission_candidates:transfer`.

**Recommended (Option B + D):** add one bounded permission (proposed code **`recruitment_financial_context:view`**, CLIENT scope) that participates **only** in Commercial/Accounting/generated-document financial predicates and **purpose-built finance context endpoints**. Do **not** grant Finance the generic recruitment permissions **`placements:view`** or **`placement_commercial_eligibility:view`**: the finance capability must authorize only the minimum placement context needed inside financial workflows, while the generic placement API keeps its existing recruitment authorization. Keep **`GET /v1/missions`** behind `missions:view`.

---

## Current FINANCE_MANAGER permission matrix (relevant subset)

Source: `packages/contracts/src/finance-manager-role.ts` (seed mirrors this list).

| Permission | Held | Role in problem |
| --- | --- | --- |
| `clients:view` | Yes | Client scope for all finance reads/writes |
| `commercial_data:access` | Yes | Amounts and commercial payloads |
| `quotations/contracts/purchase_orders/invoices` view + manage | Yes | Commercial CRUD |
| `payments/expenses` view + manage + correct | Yes | Accounting |
| `client_balances:view`, `profitability:view` | Yes | Receivables / profitability |
| `documents:view/download/generate` + financial signing | Yes | Outputs; signing re-checks commercial source |
| `missions:view` | **No** | **Primary gate** for mission-linked commercial/accounting scope |
| `placements:view` | **No** | Required for placement-backed invoice + placement options |
| `placement_commercial_eligibility:view` | **No** | Required for placement invoice eligibility |
| `mission_candidates:transfer` | **No** | Would bypass assignment filter (not acceptable for Finance) |
| `training_programs:view` / `view_all` | **No** | Training expense/profitability contexts (out of R-050/R-051 core) |

No role-name checks appear in Commercial, Accounting, or Documents source-scope code paths reviewed for this preflight.

---

## Authorization trace (server)

Legend: **FM** = actor with FINANCE_MANAGER grants only (no extra permissions).

### Commercial (`CommercialService`, `apps/api/src/commercial/commercial.service.ts`)

| Flow | Permissions | Mission / scope predicate | FM failure | Minimum context needed |
| --- | --- | --- | --- | --- |
| List quotations/contracts/POs/invoices | `*:view` + implicit `clients:view` | `missionRecordScopeWhere`: if `!missionsView` → `recruitmentMissionId: null` | Mission-linked rows **invisible** in lists | Client name; optional mission title on rows FM can already manage |
| Detail / lifecycle on mission-linked record | `*:view` / `*:manage` + `commercial_data:access` | `assertRecordSourceScope`: if `recruitmentMissionId` set and `!missionsView` → **404** | Cannot open mission-linked record by ID | Same display fields as D-079 `display` |
| Create/update with `recruitmentMissionId` | `*:manage` + `commercial_data:access` | `assertMissionContext`: `!missionsView` → **404** | Cannot attach mission to new quotation/contract/PO/invoice | Mission id + title + client match |
| Placement-backed invoice create | `invoices:manage`, `placements:view`, `placement_commercial_eligibility:view` | `assertPlacementInvoiceMissionContext`: requires `missionsView`; assignment unless transfer | **403** on missing placement permissions; **404** on mission context | Confirmed eligible placement; mission title; integration dates |
| `GET /v1/commercial/placement-options` | `invoices:manage`, `placements:view`, `placement_commercial_eligibility:view` | Early return **empty** if `!clientsView \|\| !missionsView`; else assignment filter | **Empty options** (FM) | Bounded placement list (no candidate identity) |
| `recordDisplay()` labels | Record already in scope | Mission title from join; placement dates if placement permissions | N/A if record never in scope | Client name, mission title, linked commercial refs |

Assignment mirror (when `missionsView` is true but no transfer): mission-linked records only if actor has **active recruiter assignment** on that mission — Finance staff are typically **not** assignees, so **`missions:view` alone would still fail** FM for most missions.

### Accounting (`AccountingService`, `apps/api/src/accounting/accounting.service.ts`)

| Flow | Permissions | Mission predicate | FM failure | Minimum context needed |
| --- | --- | --- | --- | --- |
| `visibleInvoiceScope` (lists, aggregates, allocation refs) | `clients:view`, `invoices:view` as applicable | `!missionsView` → `recruitmentMissionId: null` | Mission-linked invoices excluded from scope | Invoice reference when allocating to mission-linked invoice |
| `presentPayment` allocation display | `invoices:view` | Resolves refs via `visibleInvoiceScope` | **Amount visible, `invoiceReference: null`** for mission-linked allocation (R-051) | Invoice reference string |
| `visibleExpenseScope` | `expenses:view`, `clients:view` | `!missionsView` → force `recruitmentMissionId: null` and `missionPlacementId: null` | Mission/placement expenses hidden | Mission title / placement dates on expense |
| Create expense with mission/placement | `expenses:manage`, `commercial_data:access` | `assertMissionScope` / `assertPlacementScope` require `missionsView` | **404** | Picker labels for mission/placement |
| `getProfitability` RECRUITMENT_MISSION / PLACEMENT | `profitability:view`, `commercial_data:access` | `assertMissionScope` / `assertPlacementScope` | **404** | Mission/placement context label |
| `GET /v1/accounting/placement-options` | `placements:view`, `profitability:view` or `expenses:manage` | `assertMissionScope` (`missionsView`) | **403/404** | Same bounded placement rows as commercial |

### Generated documents & signing (`DocumentsService.assertGeneratedSourceScope`)

For commercial generated sources (quotation, PO, contract, invoice): after commercial view + `commercial_data:access` + `clients:view`, if `recruitmentMissionId` is set, requires **`missions:view`** and recruiter assignment (unless transfer). **FM cannot download/view generated PDFs** for mission-linked commercial records they might otherwise expect from `invoices:view`.

### Commercial option sources (web contract, D-079)

- Mission pickers: **`GET /v1/missions`** — controller requires **`missions:view`**; returns full mission summaries (not finance-bounded).
- Placements: **`GET /v1/commercial/placement-options`** — gated as above.

### Accounting option sources (D-081)

- Missions: **`GET /v1/missions`** with `missions:view`.
- Allocation invoices: commercial invoice list (respects same invoice scope).
- Placements: **`GET /v1/accounting/placement-options`**.

---

## Concrete failure paths

### R-050 (Commercial)

1. **List omission:** `missionRecordScopeWhere` → FM lists contain only records with `recruitmentMissionId: null`.
2. **Create with mission:** `assertMissionContext` → `404 COMMERCIAL_SOURCE_NOT_FOUND` when `recruitmentMissionId` is supplied.
3. **Placement invoice:** Missing `placements:view` / `placement_commercial_eligibility:view` → **403**; even with those, missing `missionsView` → **404** in `assertPlacementInvoiceMissionContext`.
4. **Generated document:** `assertGeneratedSourceScope` → **404 DOCUMENT_NOT_FOUND** for mission-linked commercial PDFs.

### R-051 (Accounting)

1. **Allocation reference:** Payment includes allocation to mission-linked invoice; `presentPayment` loads invoice refs through `visibleInvoiceScope` → FM sees **amount**, **`invoiceReference: null`** (by design in D-081, not a bug).
2. **Expense / profitability:** `assertMissionScope` with `!missionsView` → **404**; expense list predicate hides mission/placement-linked rows.
3. **Mission/placement pickers:** No `missions:view` → UI uses client-only sources; server rejects mission/placement IDs on write.

---

## Minimum Finance-visible recruitment context

Finance **does** need (for authorized financial workflows):

| Field | Needed | Notes |
| --- | --- | --- |
| `recruitmentMissionId` (internal) | Yes | FK on commercial/accounting rows |
| Mission title / reference | Yes | Human-readable context on records and pickers |
| Client identity | Yes | Already via `clients:view` |
| `missionPlacementId` | Yes | Placement-backed invoice and expenses |
| Integration / confirmed dates | Yes | Placement display (already in D-079/D-081 shapes) |
| Commercial eligibility | Server-enforced, not required as a raw field | Finance may select only finance-authorized eligible placement context; the server remains authoritative |
| Invoice/commercial references | Yes | Already on commercial rows with `*:view` |
| Financial amounts | Yes | `commercial_data:access` |

Finance **does not** need (default **deny**):

Candidate identity, CV, process state, assignments, interviews, evaluations, offers, internal notes, public applications, mission description/requirements/salary/commercial mission fields exposed by `missions:view` list/detail, recruiter directories, or unconstrained mission enumeration.

---

## Option comparison

### A — Grant `missions:view` to FINANCE_MANAGER

**Reject.**

- Opens **`GET /v1/missions`**, mission detail, and Missions workspace navigation (web gates on `missions:view`).
- Exposes mission summaries (title, state, priority, deadlines, client, assignment-driven fields per `toMissionSummary`).
- **Still insufficient alone:** Commercial/Accounting scope also requires **recruiter assignment** unless `mission_candidates:transfer` — granting transfer would be far broader than finance needs.
- Violates maintainer direction explicitly.

### B — Finance-specific recruitment-context permission

**Recommend core of solution.**

Proposed: **`recruitment_financial_context:view`** (name tentative), scope type **CLIENT** (or RECORD with client FK).

**May authorize:**

- Replace `missions:view` in **Commercial/Accounting financial predicates only** (`missionRecordScopeWhere`, `assertRecordSourceScope`, `assertMissionContext`, `visibleInvoiceScope`, `visibleExpenseScope`, `assertMissionScope`, placement-option mission checks, `assertGeneratedSourceScope` commercial branch) with:  
  `(missions:view OR recruitment_financial_context:view)` **and** client scope via `clients:view` on `mission.clientId`.
- For holders of **only** `recruitment_financial_context:view` (no `missions:view`): **omit recruiter-assignment filter** (client-scoped finance visibility).
- For holders of `missions:view`: keep existing assignment/transfer behavior unchanged.

**Must NOT authorize:**

- Missions controller routes (`@RequirePermissions(MISSIONS_VIEW)` unchanged).
- Candidate/process/interview/evaluation/offer APIs.
- Generic mission search across clients without `clientId` filter.

**FINANCE_MANAGER:** should receive this permission in a **future implementation** issue (not #163).

Do **not** grant FM the generic **`placements:view`** or **`placement_commercial_eligibility:view`** permissions. Instead, the follow-up implementation should introduce a finance-only placement-context check under **`recruitment_financial_context:view`** for Commercial/Accounting paths that need a placement. The authoritative invoice path must still enforce confirmed status, client/mission linkage, and `eligibleForInvoicing`, but Finance does not need the generic recruitment placement-detail capability. If a human-visible eligibility state is later required, expose only the minimum bounded financial DTO rather than the full placement record.

### C — Derive from existing Commercial/Accounting authority alone

**Insufficient without B.**

- List predicates currently **exclude** mission-linked rows before FM reaches detail authority.
- “If you can read the invoice, show mission title” works **after** scope fix (B); display joins already exist in `recordDisplay` / expense `display`.
- Pure C without new permission or predicate change cannot unlock mission-linked rows without widening `missions:view`.

### D — Dedicated Finance option/context endpoints

**Recommend as companion to B.**

- Add bounded endpoints, e.g.  
  `GET /v1/commercial/mission-context-options?clientId=&search=`  
  `GET /v1/accounting/mission-context-options?clientId=&search=`  
  requiring `clients:view`, `commercial_data:access`, relevant module view, and **`recruitment_financial_context:view`** (not `missions:view`).
- Return at most **20** `{ id, title }` (optional stable reference if exists), **no count**, client filter mandatory.
- Use purpose-built finance placement-context options (or a finance-specific authorization branch inside the Commercial/Accounting option handlers) under `recruitment_financial_context:view`; do not make the generic recruitment placement-detail API reachable. Preserve the same eligibility rules and return no candidate/process fields.

---

## Recommended architecture

**Implement Option B + D** in a follow-up issue (split PRs below). **Reject Option A.** **Option C** only as display-layer pattern after B unlocks scope.

**Invariants preserved:** client scope; `commercial_data:access`; commercial lifecycle validation; placement confirmation + eligibility; accounting amount predicates; D-079/D-081 patterns for bounded options; permission-driven auth; no role-name gates.

**Proposed decision:** see **D-086 (Proposed)** in `docs/project/DECISIONS.md`.

---

## Threat model (preflight)

| Threat | Current / proposed mitigation |
| --- | --- |
| Mission enumeration | Do not add unfiltered mission list; option endpoints require `clientId`, cap 20, no total count |
| Candidate identity leakage | Placement/commercial paths select only mission title + dates; no candidate joins in financial options |
| Recruiter/team leakage | Financial context permission must not expose assignments; keep assignment filter for `missions:view` actors |
| Mission salary / HR fields | Do not use Missions API; bounded fields whitelist in option/summary DTOs |
| Cross-client access | Every predicate keeps `mission.clientId` + `clients:view` / record `clientId` match |
| Archived/terminal missions | Reuse existing terminal checks on **writes**; reads on historical financial records may still show title for issued invoices (product rule to confirm in implementation) |
| Placement eligibility bypass | Keep server checks on `CONFIRMED`, `eligibleForInvoicing`, invoice uniqueness; no generic eligibility read permission is granted to Finance |
| Generic placement-detail widening | Keep `placements:view` out of FINANCE_MANAGER; finance-context permission must never satisfy the mission-candidate placement-detail route |
| Stale authorization | Future tests: revoke permission → immediate loss of scope |
| 403/404 side channels | Keep unified **404** envelopes on commercial/accounting scope denials |
| Accounting aggregate leakage | `visibleInvoiceScope` / `visibleExpenseScope` must stay aligned with detail paths (already design intent) |
| Generated document widening | Signing scope must use **same financial predicate** as commercial read, not raw `missions:view` |
| Signing-source widening | Phase B rechecks must mirror updated predicate |
| Generic options as recruitment directory | Separate routes; never reuse `/v1/missions` for Finance |

**No new production vulnerability identified** beyond the documented deliberate R-050/R-051 product limitation.

---

## Future implementation split (suggested)

1. **Permission + seed (D-071):** add `recruitment_financial_context:view` and grant it to FM. Do **not** grant generic `placements:view` or `placement_commercial_eligibility:view` to FM. ADMIN unchanged unless product wants parity.
2. **Commercial predicates + placement-options + mission-context-options endpoint.**
3. **Accounting predicates + placement-options + mission-context-options endpoint.**
4. **Documents `assertGeneratedSourceScope` alignment.**
5. **Web Commercial/Accounting:** switch mission pickers to new options when financial context held; keep `/v1/missions` for recruitment roles.
6. **Integration tests:** matrix below.

---

## Future regression test matrix

1. FM completes mission-linked quotation → contract → PO → placement-backed invoice for client C.
2. FM **`GET /v1/missions`** → **403**; Missions workspace unavailable without `missions:view`.
3. FM cannot read candidate/process/interview/evaluation/offer/note endpoints.
4. FM cannot access client C′ mission-linked records.
5. Commercial/Accounting responses show only approved `display` fields.
6. Random mission/placement UUIDs → **404**, no existence leak.
7. Placement invoice rejected when not confirmed / not eligible / wrong client.
8. Allocation shows `invoiceReference` when invoice in FM invoice scope.
9. Revoke `recruitment_financial_context:view` → mission-linked rows disappear; refs null.
10. ADMIN/HR_MANAGER regression on assignment-scoped recruitment paths.
11. D-071 catalog gate after seed change.
12. FINANCE_MANAGER with an active mission assignment still cannot call the generic mission-candidate placement-detail route without the existing `placements:view` permission; the new finance-context permission never becomes a recruitment-placement read capability.

---

## Seed / RBAC impact (future, not #163)

| Question | Answer |
| --- | --- |
| New permission required | **YES** (`recruitment_financial_context:view` proposed) |
| FINANCE_MANAGER grant change | **YES** (bounded financial context only; no generic placement read/eligibility grants) |
| ADMIN/HR_MANAGER grant change | **NO** (unless product chooses optional grant for parity) |
| Schema/migration | **NO** (permission catalog additive only) |
| Production code in #163 | **NO** |

---

## Related records

- R-050, R-051 (`docs/project/RISKS.md`) — **one shared boundary**; preflight complete in #163; implementation follows separately.
- D-079, D-081 — superseded **only** for Finance mission context after accepted implementation (document in implementation PR).
