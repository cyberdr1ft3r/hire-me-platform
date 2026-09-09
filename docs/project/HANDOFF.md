# Current Agent Handoff

Last updated: 2026-09-09

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current situation

- Authoritative `main` is `e2879b38c54dcc1b42b85aa345680260487454dc`, the merge commit for Issue #49 / PR #51.
- Issue #52 is open on branch `design/ui-ux-v1`, created from that exact `main`.
- Issue #52 Task 1 / Phase 1 establishes only the HireMe UI-DNA and implementation foundation. It does not redesign production surfaces.
- The canonical visual source of truth is `docs/design/HIREME_UI_DNA.md`.
- CSS is layered through `apps/web/src/styles.css` into tokens, reset, base, components, and utilities. Raw colors outside the canonical token file and required contrast failures are rejected by `pnpm check:styles`, which is also invoked by `pnpm check:architecture`.
- The foundation component set is intentionally small: Button, field/input/select/checkbox controls, StatusBadge, InlineMessage, Skeleton, and EmptyState.
- `apps/web/design-system.html` is an isolated development-only preview containing synthetic data and no API imports or calls. It is absent from production navigation and is not the normal production build entry.

## Visual direction to preserve

- Calm, trustworthy, professional, mature, and efficient.
- Neutral-first surfaces with a restrained deep teal brand descended from the historical app accent.
- Strong typography, subtle borders, rare overlay-only shadows, moderate radii, compact functional areas, and generous page whitespace.
- Three expressions share one system: internal compact, internal standard, and public spacious.
- Avoid nested card soup, arbitrary raw values, gradients, glassmorphism, module rainbows, decorative motion, and giant rounded containers.
- Target WCAG 2.2 AA with native semantics, explicit labels/errors, visible focus, textual status meaning, reduced motion, and touch-appropriate targets.

## Next action

The maintainer must visually review the Phase 1 preview before any further Issue #52 work.

Run from the repository root:

```text
pnpm --filter @hire-me/web dev
```

Open `http://127.0.0.1:5173/design-system.html`.

Completion conditions for this checkpoint:

- The token system and HireMe visual character are approved or specific changes are requested.
- Local quality gates and exact-head GitHub Actions are green.
- The Issue #52 pull request remains draft, open, and unmerged.
- Candidate workspace, Recruitment/Reporting dashboard, Public Opportunity, AppShell, and broad production migration remain unstarted.

## Explicit hard stop

Do not continue to representative production surfaces until the maintainer explicitly approves the UI-DNA. Nothing from this handoff authorizes a merge or deployment.

## Mandatory rehydration checklist

Before resuming:

- Read `AGENTS.md`, the full Issue #52 and comments, and all required project-memory files.
- Load all materially applicable project skills, including `project-memory`.
- Fetch `origin` and verify whether `main` or `design/ui-ux-v1` advanced.
- Inspect review comments and exact-head CI before changing the branch.

Before finishing:

- Update status, this handoff, decisions, risks, and roadmap only where current truth changed.
- Re-run the full applicable quality gate from the repository root.
- Keep the PR draft/open/unmerged and report the exact head.
