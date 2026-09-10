# Current Agent Handoff

Last updated: 2026-09-10

## Current situation

- Authoritative `main` is `6e6cf6fd499800ed019a9c0d82680bde8b275f2e`, the PR #55 merge commit for the Issue #54 English/French localization foundation.
- Issue #52 remains open for its representative-surface checkpoints. PR #53 and PR #55 are merged and closed.
- Issue #56 and its draft PR are open on `design/reporting-dashboard-v1`. Do not merge or deploy them.
- Issue #56 redesigns the Recruitment/Reporting dashboard as the first representative surface. It is presentation work only: no API, contract, Prisma, KPI, authorization, record-scope, filter-semantic, or CSV change was made.
- Reporting is now fully bilingual, so it left `deferredEnglishRoutes`. Every other deferred route still declares `lang="en"` through the shared `LegacyEnglishContent` boundary.
- Reporting presentation moved out of `App.tsx` into `apps/web/src/reporting/`. No other module was moved and no unrelated refactor was performed.
- Technical review `5164555554` raised three corrections, all resolved on this branch: stale drilldown page responses are discarded through a request-sequence guard, the language-switch test now switches locale on one mounted dashboard, and CSV export again sends the current filter-control values as merged `main` did.
- Exact-head CI is red only on `generation-rendering.test.ts` > `wraps an unbroken token instead of dropping its tail`, a 5000 ms timeout outside this PR's files. It is tracked in Issue #58 and must not be patched from this branch. Once its fix is on `main`, integrate latest `main` here and rerun CI.

## Review target

Run from the repository root:

```text
pnpm --filter @hire-me/web dev
```

Open `http://127.0.0.1:5173/reporting.html`. It is a synthetic, API-free surface that renders the real `ReportingDashboard` inside the real `AppShell` and `I18nProvider`; there is no second copy of the dashboard. Review:

- the `PageHeader`: `Recruitment` / `Recrutement` eyebrow, the page title, a concise non-marketing description, and metadata carrying the reporting window and the actor scope;
- the CSV export as the page-level primary action, and the fact that it disappears entirely rather than being disabled when the export capability is absent;
- the filter toolbar: five controls (start, end, client, mission, recruiter) as one functional region between two rules, with `Apply filters` / `Appliquer les filtres` and `Reset filters` / `Réinitialiser les filtres`;
- the KPI band: six primary metrics as a measurement strip and six supporting metrics at lower weight, with semantic color only on overdue missions;
- the pipeline distribution: localized state labels, count, share, and a proportional bar, ordered by size, where the bar is never the only channel;
- the weekly trends: one labelled row per metric using chart tokens 1–5 in order, one shared maximum so rows stay comparable, and the complete weekly counts available as a text alternative;
- the drilldown: a dense seven-column table with real `<th>` headers, contained horizontal overflow, and working `Previous` / `Page X` / `Next` paging;
- the `Preview dataset` switch, which swaps a representative dataset for an empty one so the empty states can be reviewed;
- the language control, which must change labels and `Intl` formatting without reloading the page or refetching the report;
- 390, 430, 800, 1024, and 1440 px in French: no clipping, no whole-page horizontal overflow, `<= 900px` off-canvas and `> 900px` persistent navigation unchanged.

Then confirm the language-of-content boundary. With French active, `/reporting` shows a French shell around a French module and carries **no** `lang="en"` wrapper, while a still-English module such as Tasks keeps its boundary.

## Completion conditions

- Local quality gates pass, Issue #58 is fixed on `main`, latest `main` is integrated here, and exact-head GitHub Actions are green.
- The web dependency set is still React, ReactDOM, Vite, and `@hire-me/contracts`; no chart library, UI framework, or i18n framework was added.
- Reporting endpoints, KPI definitions, authorization, record scope, filter semantics, the pagination contract, and CSV generation are provably unchanged.
- The production build contains no development preview page.
- The draft Reporting PR remains draft, open, and unmerged.
- The maintainer accepts the Reporting representative surface or requests a bounded correction.

## Explicit hard stop

Do not begin the Candidate workspace or the Public Opportunity redesign until the Reporting surface is accepted. Do not begin a legacy-module translation sweep, a task-pipeline surface, a server-stored locale preference, Arabic or RTL work, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #52, Issue #56, the Reporting PR review history, and the project-memory files.
- Fetch `origin`; verify `main`, the branch head, the draft PR state, and exact-head CI.
- Keep any requested correction inside the Reporting boundary: `apps/web/src/reporting`, `apps/web/src/reporting-preview`, the `reporting.*` and reporting-owned `domain.*` dictionary entries, and the design/project documentation.
