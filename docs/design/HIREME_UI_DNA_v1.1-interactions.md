# HireMe UI-DNA v1.1 — interaction grammar

Status: **Proposed** (Issue #117)  
Parent: [HIREME_UI_DNA.md](./HIREME_UI_DNA.md) (visual foundation v1)  
Related: Issue #112 (no operator UUIDs), #116 (stacked reveal/focus), #118 (Missions composition)

This document is the **authoritative product grammar** for record presentation, creation, editing, pickers, actions, lifecycle badges, localization, and responsive behavior across internal V1 workspaces. It does not restate color, spacing, or AppShell rules from v1.

## 1. Scope and non-goals

**In scope**

- Read-first record surfaces and explicit edit entry.
- Top-level versus nested creation patterns.
- Permission-safe async pickers (bounded option sources).
- Action hierarchy and destructive confirmation.
- Lifecycle pills/badges versus ordinary metadata.
- EN/FR and responsive expectations for the above.

**Out of scope for this grammar**

- Full Missions information architecture (#118).
- Overview/dashboard design.
- Backend authorization or new global directory APIs.
- Mass migration of every module in one PR.

**#112 remains authoritative:** pickers must use sources whose permission semantics match the write they prepare. Never introduce a broad “people directory” to simplify UI.

## 2. Read-first record presentation

### Default rule

When an operator selects a business record in a master–detail workspace:

1. Show a **read-optimized summary** first (definition lists, timelines, tables, status metadata).
2. Enter **edit mode only after an explicit Edit (or equivalent) control** when the actor holds the update permission.
3. **Inline edit** remains valid for **small, local** mutations (one field group, one nested row, sensitive slice) where a full-page edit mode would add friction without improving safety.

### Reference: Candidates (strong)

- Module title stays **Candidates**; selected person is a **section heading**, not a hero.
- Profile fields render as read-only `dl` until **Edit profile**.
- Structured child records (skills, experience) use read rows + **disclosure** for add/edit.
- Sensitive slices (compensation, consent) are **absent without permission**, not disabled placeholders.
- Archived records: no write actions rendered.

### Anti-pattern: live detail forms (Clients, Missions today)

- Client and Mission **detail panes** still bind many fields directly to editable controls.
- This lengthens pages, weakens scan hierarchy, and increases accidental-edit risk.

### Target contract (all V1 modules over time)

| Element | Read mode | Edit mode |
| --- | --- | --- |
| Identity heading | Name/title + lifecycle badge + key metadata | Unchanged heading; form replaces read blocks |
| Primary fields | `dl` or static text | Same fields in `TextField` / `Select` |
| Lifecycle | Status badge + explicit lifecycle actions | Lifecycle actions hidden or disabled while profile edit open (module choice) |
| Writes | Single `pending` lock per record session | Same lock; one in-flight mutation |
| Archived / terminal | Read-only summary + warning; no edit | No edit entry |

### Permission gating

- **Hidden, not disabled**, when the actor lacks capability (existing Candidate rule).
- Edit entry requires the **specific update permission**, not merely view.

## 3. Creation grammar

Do **not** force all creates into modals. Use **purpose-fit** containers:

### 3.1 Top-level entity creation

**Pattern:** `PageHeader` primary action → **disclosed panel** or dedicated create region.

| Module | Current | v1.1 target |
| --- | --- | --- |
| Candidates | Header **Add candidate** → inline create region; focus returns to trigger on close | **Canonical** |
| Tasks | Header **Add task** → inline create form | Align with Candidates |
| Training | Header action → program create disclosure | Align |
| Missions | `<details>` in **list pane** (transitional) | **PageHeader** primary → disclosed create (same grammar as Candidates) |
| Clients | **Permanent** create form in list pane | **PageHeader** primary → disclosed create |
| Commercial | Header + area-specific create | Keep header pattern; unify copy |

Rules:

- One **primary** create entry at module level (verb label from i18n).
- `aria-expanded` on the trigger while open.
- Successful create **closes** the create region and returns focus to the trigger.
- Create region uses **`internal-standard`** density.

### 3.2 Contextual nested creation

**Pattern:** Child records are created **inside the parent context** (parent id known; no cross-module navigation).

Examples:

- Client **contact** create form in client detail (not PageHeader).
- Mission **assignment**, **process link**, **interview** inside mission/process panels.
- Task **comment**, **reminder** on task detail.
- Training **session**, **enrollment**, **participation** under selected program.

Rules:

- Section heading names the child type.
- Submit is **secondary** to the parent region unless the section is the page’s main purpose.
- Nested create must not clear or replace unrelated parent state.

### 3.3 Permanently open create forms

**Exceptional only.** Require explicit product justification (e.g. high-volume data entry with no detail pane). Clients list-pane create is a **known deviation** to remove in a bounded Clients PR.

## 4. Type-ahead Combobox contract (#112-safe)

### 4.1 Problem (retire this pattern)

Several modules duplicate **search input + Search button + native `<select>`** (Missions, Commercial, Training, some Tasks flows). Issue #117 **replaces** that three-control pattern—not standardizes it. Legacy surfaces may still use **raw UUID text fields** (#112) until module rollouts.

### 4.2 Approved primitive: `BoundedCombobox`

Reference implementation: `apps/web/src/ui/BoundedCombobox.tsx` (Issue #117). Domain modules keep legacy pickers until bounded migration PRs.

**One operator-facing surface:** a single text input (`role="combobox"`) showing the selected human identity when closed and the type-ahead query when open, plus an associated popup **listbox**—no parallel Search button and no native `<select>` for the same choice.

**Data shape**

```ts
type BoundedPickerOption = {
  id: string; // API/state only; never shown to operators
  label: string;
  detail?: string | null;
};
type LoadBoundedOptions = (search: string) => Promise<BoundedPickerOption[]>;
```

**Async loading & bounds**

| Concern | Rule |
| --- | --- |
| Source | `loadOptions` from **one** workflow-authorized bounded API (max rows per D-072–D-081); **never** a broad user/client/entity directory |
| Query | Trimmed type-ahead; debounced async reload (~300ms) while open; max input length 120 |
| Stale responses | Monotonic request id; only the latest response may update the listbox |
| `sourceKey` | When the authorized source context changes, cancel in-flight loads, close listbox, reset options |
| Pagination | Server returns a bounded page; UI copy may ask the operator to refine search when results hit the cap—no silent truncation without feedback |
| Selected persistence | When closed, input shows `label · detail`; if the selected row is absent from the latest fetch, keep displaying the selected identity until cleared or replaced |
| Loading / empty / error | Distinct listbox status rows; `aria-busy` on listbox while loading |
| Disabled / read-only | Input `disabled` / `readOnly`; listbox does not open |
| IDs | **Never** render UUIDs in the input or listbox |

**Accessibility & keyboard (required)**

| Key / semantics | Behavior |
| --- | --- |
| `role="combobox"` on input | `aria-expanded`, `aria-controls` → listbox id, `aria-autocomplete="list"` |
| Listbox | `role="listbox"` with `aria-label`; options `role="option"`, `aria-selected` |
| Active option | `aria-activedescendant` on input while open |
| **ArrowDown** | Open listbox (if closed) or move active option down (wrap) |
| **ArrowUp** | Open listbox (if closed) or move active option up (wrap) |
| **Enter** | Select active option; close listbox; keep focus on input |
| **Escape** | Close listbox; restore closed display of current value without changing selection |
| Labels | Visible field label + hint via `aria-describedby`; field-level errors via `FieldFrame` |
| Focus | Pointer and keyboard focus stay on the combobox input; listbox is pointer-accessible but not a separate tab stop |

**i18n & responsive**

- Shared chrome under `ui.combobox.*` (EN/FR); domain field `label` stays module-specific.
- Listbox is width-aligned to the input, scrolls internally, and respects touch hit targets per UI-DNA v1 §K.

### 4.3 Deprecated (do not extend)

- **Search + button + `<select>`** pickers (`MissionPicker`, `CommercialOptionPicker`, `TrainingOptionPicker`, …)—migrate to `BoundedCombobox` or a thin domain wrapper.
- Reusing Admin, Task, or Mission user directories for unrelated writes (#112).

### 4.4 Domain source map (existing)

| Domain | Picker | Source |
| --- | --- | --- |
| Missions | Client, candidate, assignee, organizer, … | D-074 scoped endpoints / lists |
| Commercial / Accounting | Client, mission, linked docs | D-079 / D-081 |
| Training | Owner, trainer, enrollment | D-073 |
| Tasks | Assignees, watchers | Task user-options |
| Documents | Context kinds | D-075 context-options |

## 5. Action hierarchy

Per **region** (PageHeader, record section, nested form):

1. **At most one primary** action (brand button).
2. **Secondary** actions: outline/secondary variant; wrap before shrinking labels.
3. **Destructive**: quiet in layout (secondary or tertiary); **strong** only in confirm step (danger + explicit consequence copy).
4. **Sub-form submit** is secondary unless that form is the region’s principal purpose.
5. Desktop: action groups **size to content**; avoid arbitrary full-width button bars except mobile stack.

Lifecycle transitions (archive, cancel, close mission) use **confirm inline** or dedicated confirm panel—not the primary slot.

## 6. Lifecycle pills and badges

Use `StatusBadge` for:

- **Lifecycle states** with operational meaning (candidate status, mission state, invoice status, session status).
- **Terminal / warning** states (archived, canceled, overdue where product-defined).

Do **not** badge:

- Ordinary roles (recruiter role on assignment) unless needed for at-a-glance filtering.
- Priority unless the module already treats it as a queue signal (Tasks overdue uses copy + styling, not necessarily a pill for every priority).

Tone mapping stays in domain `*-labels.ts` files, not ad hoc in JSX.

## 7. Loading, empty, error

Align with v1 §L:

- **Loading** preserves layout; `aria-busy`; block duplicate submits.
- **Empty** states name what is missing + one recovery action (filter reset, create, select parent).
- **Error** on pickers and lists: localized message + retry; never leak permission details.

Record detail: three distinct states (loading skeleton, error + retry, empty selection)—Candidates model.

## 8. Stale request handling (records)

Existing module patterns (Missions, Training, Tasks) use **generation counters** and **session keys** on token/permission change.

Rules:

- Token or permission change → invalidate in-flight reads; reset selection-dependent pickers via `sourceKey`.
- Writes: single `pending` / `writesLocked` per workspace session.
- Locale switch alone must **not** refetch selection away or move focus (#116).

## 9. EN / FR

Follow v1 §S:

- All picker chrome, action labels, empty/error strings use message keys.
- Layout must survive 15–30% French expansion at 390–1440px.
- API enum values stay English; labels mapped at UI boundary.

## 10. Responsive behavior

- Master–detail: container query side-by-side vs stacked (Candidates CSS model).
- **Stacked selection reveal/focus:** #116 implements; modules must expose a focusable detail heading (`tabindex="-1"`).
- Filters: wrap then drawer per v1 §K.
- Pickers: single column on mobile; no horizontal page overflow.

## 11. Migration examples

### Candidates (keep; reference)

- Read-first profile; explicit edit; disclosure create at header; Mission-style pickers N/A; badges on lifecycle only.

### Clients (future PR)

- Move list-pane permanent create → header disclosure (match Candidates).
- Split client detail **read summary** + **Edit client** → form.
- Contact create stays nested under selected client.

### Missions (future PRs: grammar #117, composition #118)

- Mission profile: read-first + explicit edit (grammar).
- Keep nested process/interview creates in process context.
- #118 adds local IA (tabs/sections) without redoing picker sources.

## 12. Shared primitives roadmap

| Primitive | Status Issue #117 | Follow-up |
| --- | --- | --- |
| `BoundedCombobox` | Reference impl + keyboard/a11y tests | Replace legacy search+select pickers in module PRs |
| `RecordReadEditShell` | Documented only | Optional helper after 2+ modules migrate |
| `CreateDisclosure` | Documented pattern | Extract if Clients/Tasks unify markup |

## 13. Contracts for Issue #118 (Missions)

#118 should consume **without redefining**:

- Read-first mission profile + explicit edit entry points.
- Nested creates for process/interview/evaluation remain contextual.
- `MissionPicker` / assignment pickers unchanged (D-074).
- Action hierarchy inside each **local section** after IA split.
- StatusBadge only on mission/process lifecycle, not every metadata field.
- No new pickers; no UUID fields.

Local tabs/section index must preserve deep links, stale-request guards, and EN/FR.
