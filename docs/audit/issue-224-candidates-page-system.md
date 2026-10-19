# Issue #224 — Candidates page-system migration audit

## Scope and baseline

- Base: `main` at `b48c0295ffd6660c957d3f8cd90b7a536ff7e6b9` (merged PR #223).
- Baseline GitHub Actions run: [39271060367](https://github.com/cyberdr1ft3r/hire-me-platform/actions/runs/39271060367), four required jobs passed.
- Scope is presentation composition only. Candidate API calls, permission checks, tenant-scoped server behavior, route/query deep links, forms, mutations, recruitment workflows, and business state remain owned by the existing Candidates module.

## Existing architecture and reuse decision

`CandidatesPanel` remains the data and capability boundary. `CandidateWorkspace` remains the presentation coordinator for the existing directory, quick preview, create drawer, and focused record. The migration reuses the Issue #218 foundation instead of introducing a parallel page abstraction:

- `DirectoryPage` for the directory/preview route state.
- `RecordPage` for the focused candidate route state.
- `ContextualActions` for permission-gated page actions.
- `FilterToolbar` for the existing search/filter form.
- Existing `WorkspaceSurface`, `WorkspacePane`, list, preview, record, form, and action-menu components without workflow rewrites.

The directory continues to own nested scrolling at desktop widths. At tablet/mobile widths the responsive document remains the scroll owner. The quick preview remains a side pane where space permits and the existing bottom sheet on narrow/touch layouts.

## Focused implementation

- Replaced the Candidates page's hand-composed header/root with the shared directory and record page composition.
- Kept one semantic `h1` in both directory and record states.
- Moved the existing create action into the shared contextual-action pattern without changing its permission or write-lock behavior.
- Moved the existing search, apply, disclosure, reset, and result status into `FilterToolbar`; advanced filters and their submitted values are unchanged.
- Preserved drawer/sheet focus restoration, quick-preview selection semantics, browser history, and candidate deep links.
- Added a split-preview-only toolbar layout so the shared toolbar stays inside the narrowed directory column.
- Kept the existing desktop nested list scroller and responsive document scrolling; no wheel handler or scroll lock was added.

## Installed-Chrome evidence

The deterministic runner uses installed Google Chrome with contract-shaped synthetic API responses and 36 candidate records. It checks EN and FR at 1440×900, 768×1024, and 390×844 (touch), including directory, quick preview, and focused record screenshots.

| Viewport | Scroll owner | Wheel | Trackpad-like deltas | PageDown | Touch |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop EN/FR | nested directory list | 0→520 | 0→504 | 0→187 | n/a |
| Tablet EN/FR | document | 418→578+ | 0→504 | 0→578+ | n/a |
| Mobile EN/FR | document | 471→991 | 0→504 | 0→738 | 0→315 |

All six scenarios also passed:

- zero horizontal document overflow;
- exactly one directory/record page root and one page `h1`;
- shared toolbar and contextual action presence;
- quick preview without a candidate-detail API read;
- side-pane versus bottom-sheet behavior;
- Escape close and focus return;
- record deep link plus browser back/forward preservation;
- no uncaught page errors.

Machine-readable results and 18 screenshots are in [`docs/audit/issue-224-candidates/`](./issue-224-candidates/). Re-run with:

```text
pnpm --filter @hire-me/web build
pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort
node scripts/issue-224-candidates-evidence.mjs
```

## Limitations

- Browser evidence uses deterministic contract-shaped fixtures rather than a shared staging tenant, so server-side tenant isolation is protected by unchanged contracts and existing automated coverage rather than re-proven by this visual runner.
- Chrome is automated headlessly through its installed executable; screenshots and native wheel, keyboard, CDP touch, and fine-delta events are retained for review.
- This PR intentionally does not migrate Missions or any unrelated workspace.
