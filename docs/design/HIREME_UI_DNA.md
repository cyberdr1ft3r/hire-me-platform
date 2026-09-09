# HireMe UI-DNA v1

Status: Phase 1 foundation, awaiting maintainer visual approval

Canonical implementation: `apps/web/src/styles/tokens.css`
Review harness: `apps/web/design-system.html`

This document is the visual source of truth for HireMe. Components and production surfaces must consume its semantic tokens and follow its composition rules. The named product influences are directional inputs, never designs to copy: Linear 30%, Fluent 20%, Carbon 20%, Apple 10%, Stripe 10%, Google 7%, and Vercel 3%.

## A. Design principles

1. **Calm before decorative.** Neutral surfaces carry most of the interface. Brand and semantic colors communicate action or state.
2. **Trust through explicit hierarchy.** Titles, labels, state text, and borders make structure predictable. Color is never the only signal.
3. **Efficient at working scale.** Internal views are compact where actions repeat, but page edges and major sections retain whitespace.
4. **Borders before elevation.** Surface tone, whitespace, and a one-pixel border establish ordinary hierarchy. Shadows mean temporary elevation.
5. **One HireMe system.** Internal and public experiences share color, type, spacing, radius, motion, and interaction logic. Density and composition change; identity does not.
6. **Tokens before local invention.** A missing visual value is a design-system question, not permission to add a local literal.

## B. Internal versus public density

| Context | Attribute | Intended use | Rhythm |
| --- | --- | --- | --- |
| Internal compact | `data-density="internal-compact"` | tables, filters, toolbars, queue actions, navigation | 32px controls, 36px rows, 4–12px local gaps |
| Internal standard | `data-density="internal-standard"` | record detail, ordinary forms, settings, review flows | 40px controls, 44px rows, 8–16px local gaps |
| Public spacious | `data-density="public-spacious"` | opportunity reading and application flows | 44px controls, 24px component spacing, 32–64px section spacing |

Density does not reduce text below the defined scale, hide labels, or shrink a pointer target used on touch. Compact controls may be 32px high inside pointer-dense internal toolbars; isolated mobile actions use at least `--hit-target-min` (44px).

## C. Color

### Primitive palette

Primitives construct semantics and must not be consumed by components directly.

- Neutrals: `--neutral-0`, `25`, `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900`, `950`.
- Brand: `--brand-100`, `200`, `600`, `700`, `800`, `900`.
- State primitives: green 100/700, amber 100/800, red 100/700, blue 100/700.
- Chart primitives: blue, violet, copper, and slate. They are reporting colors, not module identity.

### Semantic palette

| Family | Tokens | Use |
| --- | --- | --- |
| Surfaces | `--color-canvas`, `surface`, `surface-subtle`, `surface-raised` | page, content, grouping, true elevation |
| Borders | `--color-border`, `border-strong` | ordinary separation, stronger control edges |
| Text | `--color-text`, `text-secondary`, `text-muted`, `text-inverse` | primary copy, supporting copy, metadata, inverse actions |
| Brand | `--color-brand`, `brand-hover`, `brand-pressed`, `brand-subtle`, `brand-subtle-hover` | primary action, link, selection support |
| Focus | `--color-focus` | focus-visible outline on all interactive controls |
| State | `--color-success`, `warning`, `danger`, `info` plus each `-subtle` token | paired state foreground/background |
| Disabled | `--color-disabled-fg`, `disabled-bg` | unavailable controls; state remains visible without opacity |
| Selection | `--color-selection`, `selection-fg` | browser selection and selected UI support |
| Tables | `--color-table-header`, `table-hover`, `table-selected` | dense data-only surfaces |

The brand is a refined descendant of the historical `#174f64`: `--brand-700` is a slightly clearer deep teal. It retains HireMe continuity, reads as professional rather than promotional, sits quietly beside neutrals, supports a strong white action label, and provides distinct hover (`800`) and pressed (`900`) states. `--brand-600` is reserved for the focus ring because it stays visible on canvas and surface.

### Verified contrast

`pnpm check:styles` reads the canonical CSS and calculates WCAG relative luminance. Current deterministic results:

| Pair | Ratio | Requirement |
| --- | ---: | ---: |
| primary text / canvas | 14.89:1 | 4.5:1 |
| secondary text / canvas | 6.49:1 | 4.5:1 |
| primary text / surface | 15.87:1 | 4.5:1 |
| inverse text / brand button | 7.67:1 | 4.5:1 |
| danger / danger subtle | 6.37:1 | 4.5:1 |
| success / success subtle | 6.39:1 | 4.5:1 |
| warning / warning subtle | 6.83:1 | 4.5:1 |
| focus / surface | 5.33:1 | 3:1 non-text |
| focus / canvas | 5.00:1 | 3:1 non-text |
| disabled foreground / disabled background | 4.47:1 | 3:1 internal target |

## D. Typography

No web font is required. `--font-family-ui` uses a system-first stack; Inter is used only if already installed locally. `--font-family-mono` is allowed for identifiers, code, and fixed-width values, not ordinary body text.

| Role | Token recipe | Usage |
| --- | --- | --- |
| Display/page title | size 7 (32px), tight line height, semibold | one page title; public hero may use the same maximum |
| Section heading | size 6 (24px), heading line height, semibold | major page sections |
| Subsection heading | size 5 (18px), heading line height, semibold | local group titles |
| Body | size 4 (16px), body line height, regular | reading and explanations |
| Compact body | size 3 (14px), body line height, regular | internal records and controls |
| Label | size 3, medium, `--letter-spacing-label` | form and data labels |
| Caption/meta | size 1 (12px), body line height | timestamps and supporting metadata |
| KPI value | size 7, tight, semibold, tabular numerals | reporting/commercial emphasis |
| Table text | size 2 (13px), body line height | compact rows |
| Button text | size 3, tight, semibold | all button variants |

Use `font-variant-numeric: tabular-nums` for money, KPI, duration, and comparable counts. Internal headings do not exceed 32px. Letter spacing is limited to compact labels and short uppercase kickers.

## E. Spacing

The bounded four-pixel-derived scale is 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px through `--space-0`, `0-5`, `1`, `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, and `16`.

- `--space-control`: 4px compact, 8px standard, 12px public.
- `--space-component`: 12px compact, 16px standard, 24px public.
- `--space-section`: 32px default; 40–64px is valid for major/public separation.
- `--space-page-x` and `--space-page-y`: responsive 16–48px and 24–64px.
- Optical exceptions require a comment in both the token file and this document. Local 13px, 17px, or 29px gaps are not allowed.

## F. Radii

- `--radius-small` 4px: controls and small contained elements.
- `--radius-medium` 8px: panels, popovers, and grouped surfaces.
- `--radius-large` 12px: rare large public or dialog surfaces.
- `--radius-full`: badges, status pills, avatars, and genuinely circular geometry only.

Tables are not rounded internally. A scrolling table wrapper may carry a medium radius around its border. Buttons are not pills by default.

## G. Borders

`--border-width` is the default one-pixel separator. Use `--color-border` for section and table separation and `--color-border-strong` for controls. Selection normally uses a subtle brand fill; a selected border is added only when fill is insufficient. Focus uses `--focus-ring-width` plus `--color-focus` and an offset; do not remove it.

## H. Elevation and shadow

Ordinary dashboard surfaces have no shadow. Use `--shadow-popover` for menus/popovers and `--shadow-overlay` for dialogs, drawers, and temporary elevated layers. A shadow never substitutes for a boundary, state, or spacing decision.

## I. Motion

- `--motion-fast` 120ms: hover, press, focus-adjacent transitions.
- `--motion-standard` 180ms: local disclosure and state changes.
- `--motion-overlay` 240ms: dialog/drawer/popover entry.
- `--ease-standard`: state changes; `--ease-enter` and `--ease-exit`: appearance/disappearance.

Enter may combine fade with a short directional translation. Exit is shorter or equal to enter. No looping decoration is allowed; skeleton pulse and bounded progress indicators are the only foundation exceptions. The global `prefers-reduced-motion: reduce` rule makes animations and transitions effectively immediate and disables smooth scrolling.

## J. Component height and density

| Component | Compact | Standard | Public/mobile |
| --- | ---: | ---: | ---: |
| Button/input/select | 32px | 40px | 44px |
| Textarea | content-led, minimum 64px | content-led, minimum 80px | content-led, minimum 96px |
| Table row | 36px | 44px | use list/card alternative when necessary |
| Toolbar action | 32px | 40px | 44px |
| Navigation item | 36px | 36–40px | 44px |

Icon-only controls require an accessible name. Touch contexts require a 44px hit area even if the visible glyph is smaller.

## K. Responsive behavior

Breakpoints describe behavior; local CSS uses the corresponding widths only when that behavior changes.

- **Desktop (≥1280px):** expanded sidebar; 48px horizontal page padding; full table and optional contextual detail region; KPI grids may use four columns.
- **Laptop (1024–1279px):** sidebar may collapse by user choice; 32px page padding; KPI grids use two to four columns; secondary actions may move into an overflow menu later.
- **Tablet (768–1023px):** sidebar collapses; top-level mobile trigger appears; filters wrap once then move to a drawer when they obstruct data; two-column forms become one or two columns by field relationship; KPI grids use two columns.
- **Mobile (<768px):** off-canvas navigation; 16px horizontal padding; actions stack or preserve one primary action; forms are one column; KPI grids are one column; wide tables scroll with the first identifying column preserved when practical or transform into labeled rows; filters use a drawer; dialogs become near-full-width and drawers may become full-screen.

Additional rules:

- Dialog maximum is `--layout-dialog-max`; viewport margins use the spacing scale.
- Drawers enter from the logical inline end and never obscure their close control.
- Public opportunity prose uses `--layout-public-max` and does not stretch to dashboard width.
- A table must have an overflow wrapper and a non-color indication of selection.
- Do not simply shrink a desktop layout.

## L. Interaction states

| State | Visual and behavior rule |
| --- | --- |
| Default | neutral surface, explicit label, predictable border |
| Hover | subtle surface/border change; never the sole way to discover an action |
| Active/pressed | darker brand or stronger subtle fill for the duration of press |
| Focus-visible | 3px `--color-focus` outline with 2px offset; keyboard-only where the platform supports it |
| Selected | brand-subtle fill plus semantic selection (`aria-selected`, checked state, or current marker) |
| Disabled | native `disabled`; disabled tokens; no opacity-only treatment; explain why when not obvious |
| Loading | preserve geometry, expose `aria-busy`, block repeat activation, show concise progress language |
| Error | associate the field and message; danger foreground on subtle background; explain recovery |
| Success | concise status/message; do not rely on green alone |
| Warning | explain consequence and next action; warning is not used for neutral attention |
| Empty | state what is absent and offer one relevant recovery action where available |
| Permission-hidden | do not render unauthorized actions; a protected route may show a generic denial without leaking which capability is absent |

## M. Content and page composition

Canonical internal page order:

1. `PageHeader`: title and concise purpose.
2. Optional metadata: owner, lifecycle, dates, or scope.
3. Primary action followed by lower-emphasis secondary actions.
4. Optional KPI/summary band.
5. Filters and tooling.
6. Main content or data region.
7. Contextual side/detail region only when comparison or continuity benefits.
8. Inline feedback beside the action or content it explains.

**Avoid nested card soup.** `PageSection` does not imply `Card`. Tables and forms may sit directly in a page section, separated by whitespace, headings, borders, or `--color-surface-subtle`. Use a contained surface only when it establishes a meaningful boundary.

Internal copy is direct, operational, and specific. Buttons use verbs. Errors state what failed and how to recover without revealing confidential or permission-sensitive detail.

## N. Data-visualization rules

Use `--color-chart-1` through `--color-chart-5` in order. The brand is one series, not every series. Status colors retain semantic meaning and are not reassigned to arbitrary categories. Every series also needs a label, legend, direct annotation, pattern, marker, or line style; color alone is insufficient. Use tabular numerals, visible axes where they aid interpretation, and explicit units. Avoid 3D, gradients, rainbow palettes, decorative area fills, and truncated axes that distort comparisons. Charts inherit the same canvas, text, border, focus, tooltip, and empty/loading states as tables.

## O. Accessibility

- Target WCAG 2.2 AA for normal product UI.
- Use native buttons, links, inputs, selects, checkboxes, headings, tables, and dialogs before ARIA.
- Every form control has a visible label. Hint and error text are connected with `aria-describedby`; invalid controls use `aria-invalid`.
- Focus-visible is never removed without an equally visible replacement.
- Status meaning uses text and/or icons in addition to color.
- Keyboard order follows visual reading order. Do not create positive `tabindex` values.
- Loading controls prevent duplicate activation and retain an accessible progress label.
- Pointer targets are at least 44px in touch contexts; compact internal exceptions require surrounding spacing and are not used for primary mobile actions.
- Honor reduced motion and system zoom; layouts must reflow at narrow widths.

## P. Anti-patterns

Do not use random gradients, glassmorphism, decorative blur, large shadows on ordinary surfaces, module-specific rainbow colors, oversized internal marketing headings, pill buttons everywhere, rounded tables, giant rounded rectangles, duplicated page headings, clickable `div` elements, placeholder-only labels, card-inside-card composition, or local CSS values invented outside the token system.

## Q. Raw-value policy

All CSS colors live in `apps/web/src/styles/tokens.css`. Production CSS consumes semantic tokens. The lightweight `scripts/check-web-style-tokens.mjs` check rejects hex/rgb/hsl literals in every other CSS file under `apps/web/src`; tests and documentation may include values for verification and explanation. `pnpm check:styles` also verifies the required contrast pairs, and `pnpm check:architecture` invokes it in the existing quality path.

Spacing and radius literals are not automatically linted in Phase 1 because media queries, percentages, and optical layout constraints make a low-noise rule less reliable. Review must reject new component spacing/radii that do not use tokens. If drift appears, add a narrowly scoped check from observed cases rather than a mega-linter with broad false positives.

## R. Future dark-mode compatibility

Components depend on semantic tokens, never assumptions that a surface is white or text is black. A future dark mode will override semantic tokens under an explicit theme selector while retaining the primitive audit, contrast checks, and state meaning. Do not use alpha overlays whose result depends on an unknown background for ordinary text or controls. Elevation may require theme-specific shadow values. Dark mode is compatibility work only in this phase; no dark palette or user control is implemented.

## Foundation component boundary

Phase 1 proves only `Button`, `FieldFrame`, `TextField`, `TextArea`, `Select`, `Checkbox`, `StatusBadge`, `InlineMessage`, `Skeleton`, and `EmptyState`. These components use native semantics, small variant sets, density tokens, and explicit states. `AppShell`, production data-table abstractions, modal/drawer frameworks, charts, tabs, and pagination belong to later approved Issue #52 checkpoints after visual review.
