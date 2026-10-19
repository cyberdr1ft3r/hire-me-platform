# Issue #224 — Missions page-system migration audit

## Scope and baseline

- Base: `main` at `b48c0295ffd6660c957d3f8cd90b7a536ff7e6b9` (merged PR #223).
- Baseline GitHub Actions run: [39271060367](https://github.com/cyberdr1ft3r/hire-me-platform/actions/runs/39271060367), four required jobs passed.
- Scope is presentation composition only. Mission API calls, permission checks, tenant-scoped server behavior, route/query deep links, creation and edit forms, lifecycle transitions, assignments, candidate pipeline, interviews, evaluations, offers, placements, and public-opportunity workflows remain owned by the existing Missions module.

## Existing architecture and reuse decision

`MissionsPanel` remains the request, state, permission, and stale-response boundary. `MissionsWorkspace` remains the presentation coordinator for the existing directory, quick preview, create drawer, focused record, section navigation, and nested process workflows. The migration reuses the Issue #218 foundation:

- `DirectoryPage` for the directory/preview route state.
- `RecordPage` for the focused mission route state.
- `ContextualActions` for permission-gated creation.
- `FilterToolbar` for the existing mission search/filter form.
- Existing `WorkspaceSurface`, `WorkspacePane`, mission directory, quick preview, record sections, forms, and action components without workflow rewrites.

The existing mission record remains the width/focus boundary for stacked mission and candidate-process details. The directory workspace remains the narrow-layout boundary for choosing a side preview or bottom sheet. This preserves those independent responsibilities after the old outer wrapper is replaced by the shared page shell.

## Focused implementation

- Replaced the hand-composed page header/root with the shared directory and record composition.
- Kept one semantic `h1` in both route states and retained the existing mission record heading hierarchy.
- Moved the permission-gated create action into the shared contextual-action pattern without changing its write lock or drawer.
- Moved the existing search, apply, disclosure, and reset controls into `FilterToolbar`; all advanced filters, deadline validation, option sources, and submitted query values are unchanged.
- Preserved read-only and mutation feedback as shared page notices.
- Preserved quick-preview selection, Escape/focus restoration, browser history, mission deep links, unsaved-change protection, and stacked master-detail focus behavior.
- Retained natural document scrolling and added no wheel handler or scroll lock.

## Installed-Chrome evidence

The deterministic runner uses installed Google Chrome with contract-shaped synthetic API responses and 36 mission records. It checks EN and FR at 1440×900, 768×1024, and 390×844 (touch), including directory, quick preview, and focused record screenshots.

| Viewport | Scroll owner | Wheel | Trackpad-like deltas | PageDown | Touch |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop EN/FR | document | 322→433 | 0→433 | 0→433 | n/a |
| Tablet EN/FR | document | 388→389 | 0→389 | 0→389 | n/a |
| Mobile EN/FR | document | 498→1018 | 0→504 | 0→738 | 0→315 |

All six scenarios also passed:

- zero horizontal document overflow;
- exactly one directory/record page root and one page `h1`;
- shared toolbar and contextual action presence;
- quick preview without a mission-detail API read;
- side-pane versus bottom-sheet behavior;
- Escape close and focus return;
- record deep link plus browser back/forward preservation;
- no uncaught page errors.

Machine-readable results and 18 screenshots are in [`docs/audit/issue-224-missions/`](./issue-224-missions/). Re-run with:

```text
pnpm --filter @hire-me/web build
pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort
node scripts/issue-224-missions-evidence.mjs
```

## Limitations

- Browser evidence uses deterministic contract-shaped fixtures rather than a shared staging tenant. Tenant isolation, section APIs, and write contracts remain unchanged and are covered by the existing focused and exact-head CI suites.
- Chrome is automated headlessly through its installed executable; screenshots and native wheel, keyboard, CDP touch, and fine-delta events are retained for review.
- This PR intentionally does not include Candidates or any unrelated workspace; Candidates is independently reviewable in draft PR #225.
