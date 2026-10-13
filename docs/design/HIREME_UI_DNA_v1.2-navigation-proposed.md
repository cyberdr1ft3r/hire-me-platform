# HireMe AppShell v1.2 — proposed navigation addendum

Status: **Proposed; human visual review required.** This addendum does not replace
the approved v1 visual tokens or v1.1 interaction grammar.

Source: [PR #194 direction comment](https://github.com/cyberdr1ft3r/hire-me-platform/pull/194#issuecomment-6155196465)
and [Concept D](https://www.figma.com/design/eGbwbrNUnmkA7ViC96mgSR?node-id=9-2).
Implementation is a separately reviewable follow-up based on #194. Its Messages,
Administration, control and module layout improvements remain intact.

## Shell behavior

- Desktop: 64px primary rail plus an independently collapsible 176px contextual
  panel. The utility header is 56px. No horizontal module navigation or stacked
  navigation rows are introduced.
- New browsers start expanded. `hireme.navigation.expanded` stores only a boolean
  display preference, following the existing browser-local language preference
  approach. Invalid/unavailable storage defaults safely to expanded. Mobile open
  state is transient and never overwrites the desktop preference.
- The shell grid physically removes the contextual track when collapsed. Its
  scoped `--layout-content-max: 100%` lets every internal workspace consume the
  released width, rather than introducing module-specific overrides. Prose keeps
  the existing independent reading-measure tokens.
- Rail buttons reveal the authorized contextual destinations. They do not change
  the current route until a destination is chosen. The current domain remains
  visibly marked even when another domain's menu is being inspected. Destination
  anchors keep their existing URLs and modified-click browser behavior.
- Below the existing 900px boundary, navigation is a single scrollable overlay
  drawer. It includes all authorized destinations, language, health and session
  actions, handles safe-area insets, traps Tab, closes on Escape/scrim and restores
  trigger focus. Background content is inert and body scrolling is locked.
- Desktop health/language/account utilities remain outside the collapsible panel.
  The account disclosure exposes identity, refresh and sign-out. Escape and an
  outside pointer close it. Messages unread badges remain visible in the rail and
  the relevant destination, with localized accessible counts.
- Icons use consistent local vector strokes, full accessible control names,
  visible keyboard focus and hover/focus tooltips dismissible with Escape.

## Existing route projection

| Domain | Existing destinations |
| --- | --- |
| Overview | Overview, Tasks, My Agenda |
| Recruitment | Candidates, Missions, Reporting |
| Commercial | Commercial, Accounting |
| Operations | Clients, Training, Documents |
| Communication | Messages |
| Administration | Administration |

Meetings retains its existing deep-link-only behavior and Overview domain context.
This is a presentation projection of the existing permission-filtered registry;
no path, permission rule, backend source or authentication behavior changes.

## Review boundaries

The Figma reference supplies navigation proportions and visual direction. Its
illustrative global search, extra notification glyphs and message previews are
not new product requirements or invented controls. Existing notifications and
message badge behavior stay in their current workflows. No new font, color,
dependency, business module, schema or production operation is introduced.

Approval requested through normal PR review: domain labels/grouping, rail icon
clarity and the account-disclosure placement. Administration's pre-existing
English-content boundary remains; shell labels are bilingual.

Verify actual panel-width gain, expanded/collapsed persistence, route/history and
RBAC behavior, keyboard and storage failure handling, and synthetic Messages,
Candidates, Commercial and Administration at 1440/1024/768/390px in EN/FR.
Automated contrast and keyboard checks support, but do not constitute, full
screen-reader or physical-device certification.
