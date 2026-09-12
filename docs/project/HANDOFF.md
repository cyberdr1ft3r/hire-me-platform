# Current Agent Handoff

Last updated: 2026-09-12

## Current situation

- Authoritative `main` is `2a411f030a031c25cd18424059d4c8e2b1ae2842`, the PR #61 merge commit. Issue #60 (Candidate workspace) is complete.
- Issue #52 remains open for its last representative surface. It closes only after the Public Opportunity experience is approved and merged.
- Issue #62 redesigns the public opportunity list, detail, and application form on `design/public-opportunity-v1`, created from that exact `main`. A draft PR (`Closes #62`, `Refs #52`) is open for technical and visual review. Do not merge or deploy it.
- It is presentation and localization only: no public endpoint, contract, Prisma schema, visibility, slug, application, duplicate, anti-enumeration, upload, or rate-limit change. The only non-presentation web change is that the three public calls in `apps/web/src/api.ts` throw `PublicRequestError` carrying the HTTP status; the response body is never read.
- Public presentation moved out of `App.tsx` into `apps/web/src/public-opportunities/`: `PublicOpportunitiesPanel` and `PublicOpportunityDetailPanel` (containers: requests, retries, submission, request sequencing, submission lock) and presentation components (`PublicSite`, `PublicOpportunityList`, `PublicOpportunityDetail`, `PublicApplicationForm`) plus pure helpers (`public-application.ts`, `public-opportunity-format.ts`, `public-opportunity-state.ts`). `LanguageSelect` gained an optional class prefix; its default behaviour is unchanged.
- Only public-contract fields render. Every 404 shows the same page. The request body is identical to the previous page.
- Pre-existing web defects fixed inside the boundary: a confirmed application used to display a failure message; the anti-spam field was visible; server-required document categories were not marked required.
- Not changed, needs a decision: the public salary expectation is sent as typed into `salaryExpectationCents`, while internal screens divide it by 100 (R-035).
- The public pages are bilingual (`publicOpportunity.*`, `domain.publicApplicationFileCategory`, `preview.publicOpportunity`) and carry no `lang="en"` boundary.
- Development-only `apps/web/public-opportunity.html` renders the real components with synthetic data and switchable states (`?state=` also selects one).

## Review target

Run from the repository root:

```text
pnpm --filter @hire-me/web dev
```

Open `http://127.0.0.1:5173/public-opportunity.html`. Review:

- the list: ruled rows with the title link, published location, work arrangement, and contract type, and the clamped summary; the count; empty, loading, and failure states;
- the detail: back link, title and summary, key details (company or "Confidential", salary and deadline only when present) with the single primary action, then the description, skills, and application;
- the application: fieldsets, visible labels, localized file controls, required markers, validation beside fields, the consent checkbox, and the received and not-sent states;
- the not-found and detail-failure states;
- 1440, 1024, 800, 430, and 390 px in French and English: no clipping and no whole-page horizontal overflow.

With French active, `/opportunities` and `/opportunities/:slug` must carry no `lang="en"` region, while a still-English internal module such as Tasks keeps its boundary.

## Completion conditions

- Local quality gates and exact-head GitHub Actions are green on the PR head.
- Public endpoints, payloads, visibility, anti-enumeration, slugs, and application semantics are provably unchanged.
- The web dependency set is still React, ReactDOM, Vite, and `@hire-me/contracts`.
- The production build contains no development preview page.
- The draft Public Opportunity PR remains draft, open, and unmerged.
- The maintainer/ChatGPT technical and visual reviews accept the surface or request a bounded correction.

## Explicit hard stop

Do not begin a task-pipeline surface, a legacy-module translation sweep, a server-stored locale preference, Arabic or RTL work, the R-035 salary fix, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #52, Issue #62, the Public Opportunity PR review history, and the project-memory files.
- Fetch `origin`; verify `main`, the branch head, the draft PR state, and exact-head CI.
- Keep any requested correction inside the public boundary: `apps/web/src/public-opportunities`, `apps/web/src/public-opportunity-preview`, `apps/web/public-opportunity.html`, the `publicOpportunity.*`, `domain.publicApplicationFileCategory`, and `preview.publicOpportunity` dictionary entries, the public routes in `App.tsx`, the public calls in `api.ts`, and the design/project documentation.
