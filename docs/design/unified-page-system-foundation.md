# HireMe unified page system foundation

Status: **Foundation proposed for review.** This document inventories the current system and
defines the smallest reusable layer needed before any workspace migration. It does not change
routes, permissions, APIs, forms, business workflows, or the Clients v2.1 proposal in PR #210.

## Architecture decision

The page system is a composition layer over the accepted HireMe UI-DNA. It must not become a
second design system.

| Concern | Existing source of truth | Foundation decision |
| --- | --- | --- |
| Routes and permissions | `navigation/internal-navigation.ts` | Reuse unchanged. The shell continues to hide unauthorized destinations and direct URLs still render a denied state. |
| Salesforce-inspired shell | `ui/shell/AppShell.tsx`, `shell-navigation.ts` | Reuse the 64px domain rail, contextual navigation, utility header, mobile drawer, route history, badges, and permission filtering unchanged. |
| Page heading and actions | `ui/PageHeader.tsx` | Reuse and extend only through composition. Primary, secondary, and contextual actions remain React slots so existing permission checks stay in their modules. |
| Master-detail layout | `ui/Workspace.tsx` | Reuse `WorkspaceSurface`, `WorkspacePane`, `WorkspaceToolbar`, and `WorkspaceSection`; keep their nested scrolling and responsive container queries. |
| Feedback | `ui/Feedback.tsx`, `ui/InlineMessage.tsx` | Compose the existing skeleton, empty state, and inline message into a consistent page-state contract. |
| Drawers and forms | `ui/Drawer.tsx`, field and button primitives | Reuse unchanged. No form, validation, request, navigation-guard, or focus-trap logic moves into the page system. |
| Visual language | `styles/tokens.css` and UI-DNA v1/v1.1 | Use semantic tokens only. PR #210's proposed CRM accent remains a proposal, not a foundation token. |
| Localization | typed EN/FR dictionaries and `I18nProvider` | Shared state copy is translated centrally; domain copy and authored data remain owned by each workspace. Administration keeps its declared English boundary. |

## New composition primitives

- `PageShell`: the semantic page frame. It supplies consistent flow/fill sizing and spacing while
  leaving the outer application shell as the viewport scroll owner.
- `DirectoryPage`: `PageShell` + `PageHeader` + optional notices + directory content. It does not
  prescribe table markup, pagination, queries, or selection state.
- `RecordPage`: `PageShell` + `PageHeader` + optional notices + record content. Back navigation,
  tabs, edit state, and unsaved-input guards remain with the owning module.
- `FilterToolbar`: a responsive grouping for search, filters, result status, and contextual
  actions. Controls are supplied by callers, preserving current labels, forms, and APIs.
- `ContextualActions`: consistent primary/secondary/overflow grouping without implementing a new
  menu or permission layer.
- `PageState`: consistent loading, empty, error, and permission-denied presentation. Its live-region
  behavior is deliberate: loading uses `role=status`, errors use an announced inline message, empty
  content is a labelled section, and permission denial uses `role=alert`.

These primitives accept content rather than domain models. That boundary is what keeps them
compatible with all existing APIs and workflows.

## Fourteen-page audit and migration map

| Route | Current architecture | Reuse | Smallest later migration |
| --- | --- | --- | --- |
| Overview | `InternalHome`, shared header, flow page | Header, shell, tokens | Wrap with `PageShell`; keep the introductory section. |
| Tasks | Header, custom list/board toolbar, detail drawer | Header, drawer, navigation guard | `DirectoryPage` + `FilterToolbar`; retain list/board views and drawer. |
| My Agenda | Header, custom toolbar, shared empty/error states | Header and feedback | `DirectoryPage` + `FilterToolbar`; preserve date/source behavior. |
| Meetings | Deep-link-only record workspace | Existing route/domain fallback and API | `RecordPage`; keep it out of primary navigation. |
| Messages | Header + `WorkspaceSurface`, independent thread scroll | Entire workspace and fill-layout contract | `DirectoryPage` frame only; do not change thread/list scroll ownership or composer anchoring. |
| Candidates | Header + directory/preview/record + `WorkspaceSurface` | Entire workspace and drawer/deep-link behavior | `DirectoryPage`/`RecordPage` frames, then shared filter/action composition. |
| Missions | Header + directory/preview/record + `WorkspaceSurface` | Entire workspace, tabs, creation drawer | Same sequence as Candidates; no pipeline or public-flow changes. |
| Reporting | Header, shared loading/error, dashboard/drilldown panels | Header and feedback | `DirectoryPage`-style dashboard frame; keep reporting panels and URLs. |
| Commercial | Header, custom master-detail grid and notices | Header, feedback, existing forms | Adopt `WorkspaceSurface` first, then page frames and filter toolbar in its own PR. |
| Accounting | Header, area tabs and custom workspaces | Header, feedback, existing forms | Follow Commercial after its pattern is reviewed. |
| Clients | v2.0 directory/preview/record + `WorkspaceSurface`; v2.1 is PR #210 | Current production primitives; PR #210 remains untouched | Integrate the reviewed foundation before implementing the accepted parts of v2.1. |
| Training | Header, custom program/detail/operations grid | Header, feedback, existing forms | Adopt `WorkspaceSurface`, then page frames; preserve program/session URL state. |
| Documents | Header, register disclosure, custom master-detail grid | Header, feedback, existing document workflows | Resolve picker follow-up, then adopt `WorkspaceSurface` and page frames. |
| Administration | English boundary, header, custom forms/table | Shell permissions and current boundary | Localize/label in approved scope, then `DirectoryPage`; no opportunistic rewrite. |

## Migration sequence

Each step is a separate reviewable PR with EN/FR and 1440/1024/768/390px evidence. A migration
changes composition only unless its scope explicitly says otherwise.

1. Overview and central permission denial: prove page framing and state semantics with no business
   workflow changes.
2. Agenda and Tasks: prove `FilterToolbar` across list and board/list controls.
3. Messages: adopt only the page frame; preserve the Issue #214 scrolling contract.
4. Candidates and Missions: compose existing directory, preview, deep-link record, and action flows.
5. Clients: integrate the reviewed foundation before implementing the separately reviewed PR #210
   proposal.
6. Reporting: align loading/error/dashboard framing without changing metrics.
7. Commercial, then Accounting: migrate their parallel master-detail structures to the existing
   workspace surface before page framing.
8. Training, then Documents: migrate after their module-specific picker and layout prerequisites.
9. Meetings: align the deep-linked record last so Agenda/Task entry points remain stable.
10. Administration: migrate after its localization and form-label prerequisites are approved.

## Responsive and accessibility contract

- Desktop keeps the existing rail/context shell. Tablet and mobile keep its modal navigation,
  focus trap, Escape handling, inert background, and 44px touch targets.
- `PageShell` never introduces another viewport scroller. Fill routes pass `min-height: 0` through
  to `WorkspaceSurface`; flow routes keep document scrolling.
- Directory and record wrappers do not alter DOM order. At narrow widths headers, filter controls,
  and actions stack in reading order; long translated labels wrap rather than truncate.
- Each page has one `h1`. Filter grouping is a labelled region when a label is supplied. Status and
  error announcements are not duplicated.
- Reduced-motion, focus, contrast, spacing, and density remain token-driven.

## Review boundaries

This foundation intentionally does not add global search, new navigation destinations, new role or
permission logic, a new table, a new menu, a new record model, or Clients v2.1 styling. It does not
migrate all workspaces in one change. Those would be broad rewrites and would make regressions in
existing forms, APIs, and business workflows harder to isolate.
