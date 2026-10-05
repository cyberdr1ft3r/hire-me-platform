# Issue #117 — UI pattern audit (29 Sept 2026 baseline + post–#124 main)

**Audited head:** `main` after PR #136 (`1ea34d5`)  
**Modules:** Candidates, Clients, Missions, Commercial, Accounting, Training, Tasks, Documents, Agenda, Reporting, Admin (spot-check)

## Summary

| Pattern | Best reference | Main inconsistencies |
| --- | --- | --- |
| Read-first detail | **Candidates** | Clients, Missions expose live edit forms on open |
| Top-level create | **Candidates, Tasks** (header disclosure) | Clients permanent create in list pane |
| Nested create | Missions process/interview, Client contacts | Generally OK; density varies |
| Bounded async picker | MissionPicker, CommercialOptionPicker, TrainingOptionPicker | Four near-duplicate implementations; Tasks multi-select variant |
| No operator UUIDs | Candidates, Missions, Commercial V1, Accounting V1, Training V1 | Documents/commercial legacy called out in #112 |
| Lifecycle badges | Consistent on list rows | Some modules badge every metadata field |
| Action hierarchy | Commercial record detail | Missions: many peer sections with competing primaries |
| Stale-request guards | Missions, Training, Tasks | Clients simpler; still serviceable |
| EN/FR | Core workspaces bilingual | Deferred-English list shrinking |
| Responsive master–detail | Candidates container query | #116 stacked reveal/focus not standardized |

## Candidates

**Strengths**

- Read-first profile with explicit **Edit**; archived guard.
- PageHeader **Add candidate** with disclosed create; focus restore.
- Definition-list read mode; nested record sections with disclosure edit.
- List row selection with `aria-current`; side-by-side/stack via container query.
- StatusBadge on lifecycle only in list/detail heading.
- No operator UUID fields.

**Gaps**

- #116: stacked mobile reveal/focus not yet standardized (audit finding).

## Clients

**Strengths**

- List + detail split; filters; lifecycle sections; permission-aware commercial fields.
- Contact nested create under client context.
- StatusBadge on client/contact lifecycle.

**Gaps**

- **Live edit forms** for client (and contact) on selection—not read-first.
- **Permanent** client create form in list pane (should be header disclosure).
- No picker abstraction for client selection (N/A at top level).

## Missions

**Strengths**

- Mission create in `<details>` disclosure with client picker (D-074).
- Rich bounded pickers (`MissionPicker`); no UUID typing in redesigned paths.
- Write locks, session keys, process pagination preserved (#99/#106).
- StatusBadge on mission state in lists.

**Gaps**

- **Live mission profile form** in detail—not read-first.
- **Composition:** long single column (~audit scroll depths); #118 scope.
- Many peer sections with equal visual weight (lifecycle, close, team, pipeline, PO, applications, process stack).
- Mobile process open control / off-screen columns (#116, #118).

## Commercial

**Strengths**

- V1 workspace: one record type at a time; list/detail; D-079 pickers (`CommercialOptionPicker`).
- Primary lifecycle action per record; confirm on destructive transitions (D-080).
- Display labels on summaries; EN/FR.

**Gaps**

- Create flows dense; multiple linked pickers—acceptable but must stay hierarchy-compliant.
- Legacy UUID forms removed in V1 path per #112 audit.

## Accounting

**Strengths**

- Reuses Commercial pickers; permission-aware display labels (D-081).
- StatusBadge on payment/expense/allocation states.
- Area tabs inside workspace (Payments, Expenses, …).

**Gaps**

- Some forms long; read/edit not separated for every sub-record (acceptable for finance line items).

## Training

**Strengths**

- Bilingual workspace; D-073 pickers (`TrainingOptionPicker`); no raw training IDs in V1 path (D-076).
- Program/session hierarchy; nested creates under program.

**Gaps**

- Picker UI duplicated vs Mission/Commercial (implementation drift only).

## Tasks

**Strengths**

- Header-triggered task create; read/detail patterns; assignee picker with search (task-scoped source).
- Overdue signaling; permission gates.

**Gaps**

- Multi-select assignee picker is a variant not yet covered by shared primitive API (future extension).

## Documents

**Strengths**

- Contextual center; D-075 context-options direction.

**Gaps**

- #112: legacy register/metadata UUID fields and raw context display on some paths—fix in Documents rollout, not #117.

## Agenda / Reporting / Admin

- **Agenda:** read-only aggregation; filters; deep links—no record edit grammar needed.
- **Reporting:** dashboard KPI hierarchy per v1 §Reporting—read-only.
- **Admin:** diagnostic IDs may remain where explicitly technical (#112 exception).

## Picker duplication (implementation)

| Component | Location | Notes |
| --- | --- | --- |
| `MissionPicker` | missions | Reference behavior |
| `CommercialOptionPicker` | commercial | + `error` prop on Select |
| `TrainingOptionPicker` | training | Same skeleton |
| Task pickers | tasks | Multi-select + context pickers |
| `BoundedAsyncPicker` | ui (#117) | Target consolidation |

All use: async load, request id, `sourceKey`, native select, search row, Enter to search.

## Conclusion

Candidates + Commercial V1 demonstrate the intended grammar. **Clients and Missions** are the highest-impact read/edit and create-pattern debt. **Picker consolidation** is mechanical and safe without permission changes. **#118** addresses Missions composition without replacing this grammar.
