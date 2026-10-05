# Issue #117 — UI-DNA v1.1 adoption matrix

Use this matrix to split **bounded follow-up PRs**. Issue #117 does **not** implement these rows unless noted.

Legend: **Done** = already matches v1.1 · **Partial** · **Gap** · **N/A**

| Module | Read-first detail | Explicit edit | Top-level create | Nested create | Bounded pickers | Action hierarchy | Lifecycle badges only | EN/FR | Responsive / #116 | Issue #117 delivery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Candidates** | Done | Done | Done (header) | Done (records) | N/A | Done | Done | Done | Partial (#116) | Reference only |
| **Clients** | Gap | Partial (always-on form) | Gap (permanent form) | Done (contacts) | N/A | Partial | Done | Done | Partial (#116) | Doc + example |
| **Missions** | Gap | Partial | Done (disclosure) | Done | Done (MissionPicker) | Gap (peer sections) | Partial | Done | Gap (#116/#118) | #118 consumes grammar |
| **Commercial** | Partial (detail forms) | Partial | Done | N/A | Done | Done | Done | Done | Partial | Doc |
| **Accounting** | Partial | Partial | Via areas | Nested lines | Done (reuse) | Partial | Done | Done | Partial | Doc |
| **Training** | Partial | Partial | Done (header) | Done | Done (duplicate UI) | Partial | Done | Done | Partial | Doc; picker unify later |
| **Tasks** | Partial | Partial | Done (header) | Done (comments) | Partial (multi) | Done | Partial | Done | Partial (#116) | Doc |
| **Documents** | Partial | Partial | Contextual | Contextual | Partial (D-075) | Partial | Partial | Done | Partial | #112 rollout |
| **Agenda** | N/A | N/A | N/A | N/A | N/A | Done | N/A | Done | Partial | N/A |
| **Reporting** | N/A | N/A | N/A | N/A | N/A | Done | N/A | Done | Done | N/A |
| **Admin** | Varies | Varies | Varies | Varies | Varies | Varies | Varies | Partial | Varies | Out of v1.1 scope |

## Recommended follow-up PR sequence

1. **Shared Combobox** — migrate legacy search+select pickers to `BoundedCombobox` (no API changes).
2. **Clients read/edit + create disclosure** — single module PR.
3. **#116** — stacked reveal/focus (Candidates, Clients, Missions process); uses v1.1 focus targets, not full read/edit.
4. **#118** — Missions IA/composition; adopts read-first + section action rules from v1.1 doc.
5. **Tasks** — optional read-first task detail if product prioritizes.
6. **Documents** — #112 UUID elimination + D-075 pickers (existing issue track).

## Shared primitive adoption

| Primitive | Candidates | Clients | Missions | Commercial | Accounting | Training | Tasks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `BoundedCombobox` | — | — | Wrap | Wrap | Wrap | Wrap | Multi-select follow-up |
| `ui.combobox` i18n | Reference (`BoundedCombobox`) | Future | Future | Future | Future | Future | Future |

## #118 explicit dependencies

#118 **must not** redefine picker sources or create a people directory. It **should**:

- Split detail into overview / team / pipeline / public-opportunity sections.
- Apply read-first mission profile when grammar PR lands (can be same or prior PR).
- Keep nested process/interview/evaluation creates in pipeline context.
- Use one primary action per section after IA split.
- Preserve deep links, stale-request guards, EN/FR, existing tests.

## #116 explicit dependencies

#116 **should**:

- Use focusable detail headings (`tabindex="-1"`) defined in v1.1 §10.
- Avoid coupling reveal behavior to read/edit mode toggles.
- Not change picker or create grammar.
