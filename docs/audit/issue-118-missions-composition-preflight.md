# Issue #118 — Missions composition preflight (main @ `4c0655d`)

Audit of the merged Missions workspace after #116 stacked reveal/focus and #117 UI-DNA v1.1 pickers. Goal: preserve every operator capability while rebinding UI into bounded local sections.

## Current single-column composition (before #118)

| Order | Section / UI | Permission gates | Data source (API) | Mutations | Deep-link / selection deps | Target area |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Mission header (title, client, state/priority badges) | `missions:view` | Selected mission detail | — | `?mission=` | Overview (header stays global) |
| 2 | Archived / closed notices | view | Mission state | — | Mission selection | Overview |
| 3 | Mission profile summary + **always-visible edit form** when `canUpdate` | `missions:update` + writable mission | `GET /missions/:id` | `PATCH /missions/:id` | Mission selection; edit draft in panel state | Overview (read-first + explicit edit) |
| 4 | Mission lifecycle (move / close / archive) | `missions:status:manage`, close, archive | Mission state | Status/close/archive endpoints | Mission selection | Overview (intentional, not peer tab) |
| 5 | Team / assignments | `mission_assignments:view` / `:manage` | `GET …/assignments`, user options | Create/update/archive assignment, lead recruiter | Mission selection | **Team** |
| 6 | Candidate pipeline table + link candidate | `mission_candidates:view` / create | `GET …/candidates` paginated | Link candidate, pagination | Mission + page; row select | **Pipeline** |
| 7 | Selected process (stage, present, transfer, offers, placements, interviews, evaluations) | Process + nested permissions | Process-scoped GETs | Full process lifecycle | `?process=`, `?interview=`; `activeProcessId` | **Pipeline** (child detail, not below public sections) |
| 8 | Public opportunity | `public_opportunity` view/manage | `GET internal public opportunity` | Publish/update content | Mission selection | **Public** |
| 9 | Public applications | applications view | `GET internal applications` | — (read) | Mission selection | **Public** |

## Deep links (preserve)

| Input | Resolution today | Required after IA |
| --- | --- | --- |
| `?mission=` | `selectMission` on mount | Mission selected; **Overview** tab (unless process intent) |
| `?process=` | After detail ready → `openProcess` | **Pipeline** tab + process detail + pagination semantics |
| `?interview=` | After process interviews ready → expand interview | **Pipeline** tab + process + interview expand |

## Stale / async guards (must not regress)

- `contextGeneration` / `processGeneration` / `interviewGeneration` + section request counters
- `captureMissionContext`, `captureProcessContext`, `captureInterviewContext`
- Process closed when page no longer contains open row (`processLeftPage`)
- Session/principal change resets all sections

## Chosen local IA (#118)

**Pattern:** `role="tablist"` local navigation (four bounded areas), reusing accounting segment styling where appropriate.

**Why tabs (not sticky index only):**

- Materially reduces unstructured scroll at 1440/390 without hiding operational state behind scroll.
- Maps cleanly to deep links (auto-select Pipeline for process/interview intent).
- Works with permissions (omit tabs the actor cannot use).
- EN/FR via existing message keys; keyboard roving focus on tabs; `aria-controls` / `tabpanel` for panels.
- Does not replace #116 reveal/focus on stacked layouts (process heading focus unchanged).

**Desktop pipeline:** pipeline table + process detail in a split grid within the Pipeline tab so the process reads as child of the selected row.

## Capability preservation checklist

All rows in the table above remain reachable in the mapped target area. No new raw UUID controls. #110 explicitly out of scope.
