# HireMe Workspace Surface v1.0 — proposed addendum

Status: **Proposed; human visual review required.** Builds on UI-DNA v1 tokens,
v1.1 interaction grammar and the proposed v1.2 navigation. It introduces no new
color, font, dependency, route, permission or backend behavior.

## Problem

Master–detail modules were assembled from separate floating regions: a page
header, a filter block, a list, a detail column and, in Messages, a bordered
log card. Nothing gave a page a definite height, so Messages capped its log at
`min(60dvh, 40rem)`. Header plus panes plus that guess exceeded the viewport:
the document and the log both scrolled and the composer fell below the fold.

## Root cause (Messages)

- The shell was pure document flow (`.app-shell { min-height: 100vh }`; the
  workspace, main and content had no height constraint), so no page could fill
  "the remaining viewport".
- `.messages-log` therefore guessed its own height from the viewport instead of
  the space left by the header, pane header and composer.
- Flex/grid children had no `min-height: 0`, so even a constrained parent could
  not shrink the log; overflow escaped to the document.

## Pattern

| Primitive | Responsibility |
| --- | --- |
| `WorkspaceSurface` | The one bordered surface; container query `workspace`; `split="standard"` (48rem) or `"wide"` (60rem); optional `view` for one-pane-at-a-time stacking |
| `WorkspacePane` | `kind="list" \| "detail"`; pinned `toolbar`, then a body that owns scrolling in fill layout |
| `WorkspaceToolbar` | Pane heading, actions and integrated search/filters, one rule below |
| `WorkspaceSection` | A ruled section inside a pane; never a nested card |
| `PageHeader compact` | Tighter heading rhythm for fill workspaces; content unchanged |

Rules: one surface border; one divider between panes; rules and whitespace
between toolbar, sections and rows; selected rows use the existing
`--color-table-selected` fill plus an inline-start brand bar; focus rings are
never removed.

## Fill layout

`workspaceLayoutForRoute()` assigns `fill` to Messages (every width) and to
Candidates beside the persistent rail (on the mobile shell its panes stack, so
ordinary page scrolling is kept). In fill layout, and only when the viewport is
at least 30rem tall, the shell column is exactly `100dvh`, `main` is its single
overflow owner and a definite height flows through `min-height: 0` flex
children. Side by side, each pane body scrolls; stacked panes fall back to one
scroller. `--layout-workspace-fill-min` (20rem) stops a short or zoomed
viewport from squeezing the surface: `main` scrolls instead, nothing is clipped.

Messages: header, flexible log (the only thread scroller) and composer anchored
at the bottom of the thread pane. A reader at the newest message stays there
when the log is resized by a growing draft or notice. On a stacked phone layout
the open thread uses the page description's space; the inbox keeps it.

## Navigation (v1.2 refinement)

A rail domain with exactly one authorized destination (Communication →
Messages, Administration → Administration, or any domain reduced to one item
by permissions) is rendered as that destination's link instead of a reveal
button. Selecting Messages can no longer leave Administration displayed as the
context; multi-destination domains keep the v1.2 inspect behavior.

## Creation drawer (Issue #196)

Top-level creation opens from the page header into a right-side modal drawer
(`ui/Drawer.tsx`: `Drawer`, `CreationDrawer`), never a form appended to a
directory. Fixed header with title and close, scrolling body, pinned Cancel /
Create footer that submits the body form by `form` id. Width
`--layout-dialog-max` (36rem) on desktop; a full-screen sheet below 40rem with
safe-area padding. It renders into `document.body`, marks the application
inert, traps Tab, closes on Escape, close or scrim, and returns focus to its
opener. Closing with input asks inside the footer (keep editing / discard).
Submitting shows progress and cannot repeat; failures appear inside the drawer
and keep the draft; success closes it and the module selects the new record.
`initialFocus="title"` is for forms whose first control opens a popup on focus.
Applied to Missions and Clients; module fields, pickers, validation, requests
and permissions are unchanged.

## Migration order (proposed)

1. **Commercial** — table list + record; tabs already consistent. Move filters
   into the list toolbar, adopt the surface, keep the `wide` split.
2. **Accounting** — same shape as Commercial; reuse its migration.
3. **Documents** — the register disclosure and three legacy pickers need the
   BoundedCombobox follow-up first; then adopt the surface.
4. **Clients / Missions / Training** — after their v1.1 read-first and
   create-disclosure work, so layout and interaction change once.
5. **Administration** — needs localization and labelled forms in its own
   approved scope before a surface migration.

Each migration is a separate, reviewable PR with EN/FR evidence at
1440/1024/768/390px. Do not migrate modules opportunistically.
