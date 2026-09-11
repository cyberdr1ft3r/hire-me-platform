# Current Agent Handoff

Last updated: 2026-09-11

## Current situation

- Authoritative `main` is `922b5ecc1b7aa4724d3026a18f7015026328c847`, the PR #57 merge commit. Issue #56 (Reporting) is complete.
- Issue #52 remains open for its representative-surface checkpoints. The Public Opportunity surface has not started.
- Issue #60 redesigns the Candidate workspace on `design/candidate-workspace-v1`, created from that exact `main`. A draft PR (`Closes #60`, `Refs #52`) is open for technical and visual review. Do not merge or deploy it.
- It is presentation work only: no candidate endpoint, contract, Prisma schema, lifecycle, duplicate, archival, authorization, audit, or redaction change. The only non-presentation web change is that `candidateRequest` in `apps/web/src/api.ts` now throws `CandidateRequestError` carrying the HTTP status and stable API error code; the server message is discarded.
- Candidate presentation moved out of `App.tsx` into `apps/web/src/candidates/`: `CandidatesPanel` (container: reads, mutations, confirmations, request sequencing, permission-derived `CandidateAccess`) and presentation components (`CandidateWorkspace`, `CandidateList`, `CandidateFilters`, `CandidateCreateForm`, `CandidateDetailView`, `CandidateProfile`, `CandidateProfileForm`, `CandidateSkills`, `CandidateLanguages`, `CandidateExperience`, `CandidateEducation`, `CandidateSensitiveData`). No other module moved.
- Requests are identical to the previous panel. No capability was added: pagination controls, a source filter, child-record edit/remove, and compensation/consent editing stay unexposed. Unauthorized actions and every write action on an archived candidate are hidden rather than disabled. Compensation and consent render only with their own view permissions and are read-only.
- Candidates is bilingual (`candidate.*`, `domain.candidateStatus`, `domain.consentStatus`, `preview.candidate`) and left `deferredEnglishRoutes`; only that route was removed.
- Development-only `apps/web/candidate.html` renders the real workspace with synthetic data and full, recruiter, and read-only access profiles.
- Technical review `5178734523` corrections are implemented: candidate-scoped write results are suppressed once the selection or session context changes (the server write still completes); one global write lock guards every write entry point; a successful create restores focus to `New candidate`. Compensation and consent remain read-only by review decision; editors would be a separate product task. The next gate is the ChatGPT technical re-review, then visual review.

## Review target

Run from the repository root:

```text
pnpm --filter @hire-me/web dev
```

Open `http://127.0.0.1:5173/candidate.html`. Review:

- the `PageHeader` (`Recruitment` / `Recrutement`, `Candidates` / `Candidats`) with `New candidate` present only for `candidates:create`;
- the list: compact rows with status, title and location, source, and last update; `aria-current` plus an inline-start bar on the selected row; the count, and the truncation hint when more than 20 match;
- the record: secondary identity heading, status and last update, then contact and profile, source and record, skills and languages, work experience, education, and restricted information;
- the three access profiles: restricted information disappears entirely for the recruiter profile, and every write action disappears for the read-only viewer, whose structured records are reported as unavailable;
- the create, edit, and add-record forms with localized validation beside each field;
- 1440, 1024, 900, 800, 430, and 390 px in French, with the drawer open and closed at 390: no clipping and no whole-page horizontal overflow.

With French active, `/candidates` must carry no `lang="en"` boundary, while a still-English module such as Tasks keeps its boundary.

## Completion conditions

- Local quality gates and exact-head GitHub Actions are green on the PR head.
- Candidate endpoints, payloads, lifecycle, archival, duplicate handling, authorization, and redaction are provably unchanged.
- The web dependency set is still React, ReactDOM, Vite, and `@hire-me/contracts`.
- The production build contains no development preview page.
- The draft Candidate PR remains draft, open, and unmerged.
- The maintainer/ChatGPT technical and visual reviews accept the surface or request a bounded correction.

## Explicit hard stop

Do not begin the Public Opportunity redesign until the Candidate workspace is accepted. Do not begin a task-pipeline surface, a legacy-module translation sweep, a server-stored locale preference, Arabic or RTL work, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #52, Issue #60, the Candidate PR review history, and the project-memory files.
- Fetch `origin`; verify `main`, the branch head, the draft PR state, and exact-head CI.
- Keep any requested correction inside the Candidate boundary: `apps/web/src/candidates`, `apps/web/src/candidate-preview`, `apps/web/candidate.html`, the `candidate.*`, `domain.candidateStatus`, `domain.consentStatus`, and `preview.candidate` dictionary entries, and the design/project documentation.
- The intermittent local late-request rejection from `src/i18n/content-language.test.tsx` is a known pre-existing multi-agent environment issue; do not change that test unless it is reproduced deterministically in an isolated environment.
