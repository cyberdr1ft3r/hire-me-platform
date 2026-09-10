# Project Status

Last updated: 2026-09-10
Status owner: repository maintainer

## Overall state

**Phase:** Issue #52 representative surfaces. The Recruitment/Reporting dashboard (Issue #56) is the first one, built on the merged UI-DNA, AppShell, PageHeader, and localization foundations.
**Health:** `main` is at `6e6cf6fd499800ed019a9c0d82680bde8b275f2e`, the merge commit for Issue #54 / PR #55. Issue #56 is implemented on branch `design/reporting-dashboard-v1` for review.
**Current blocker:** Technical and visual review of the Reporting representative surface. Candidate workspace and Public Opportunity redesigns do not begin until Reporting is approved.
**Next executable development task:** Review the draft Reporting PR; keep it open/unmerged, and do not start the Candidate or Public Opportunity redesigns until Reporting is accepted.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | Complete | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | No action |
| Issue #3 | Complete | Implement the foundational Prisma schema and database lifecycle | No action |
| Issue #10 | Complete | Implement local authentication, session security, RBAC resolution, and authentication audit logs | No action |
| Issue #13 | Complete | Implement secured internal user administration, role assignment, status management, permission visibility, central active-user authorization, and session revocation | No action |
| Issue #15 | Complete | Implement client organization and client-contact CRM | No action |
| Issue #17 | Complete | Implement reusable candidate master records and structured candidate profiles | No action |
| Issue #19 | Complete | Implement recruitment missions and multiple recruiter/contributor assignments | No action |
| Issue #21 | Complete | Implement mission-specific candidate processes and the approved ATS pipeline | No action |
| Issue #23 | Complete | Implement interviews and structured candidate evaluations under mission-candidate processes | No action |
| Issue #25 | Complete | Realign product documentation around internal operations, public applications, training identities, and commercial accounting | No action |
| Issue #27 | Complete | Implement public opportunity and unauthenticated candidate application foundation | No action |
| Issue #29 | Complete | Implement internal offer-to-placement lifecycle | No action |
| Issue #31 | Complete | Implement internal task management, reminders, comments, and notifications | No action |
| Issue #33 | Complete | Reconcile project memory after Issue #29 / PR #30 merge | Closed on GitHub; superseded by later reconciliations |
| Issue #35 | Complete | Implement document management foundation and contract taxonomy, incorporating Issue #12 | Merged via PR #40 into `main` |
| Issue #36 | Complete | Implement recruitment reporting, KPI dashboards, and safe exports | Merged via PR #43 into `main` |
| Issue #37 | Complete | Implement training operations foundation: programs, sessions, enrollment, and attendance | Merged via PR #45 into `main` as `09c506262ad3284efd69f70440c1ee06175c6e00` |
| Issue #38 | Complete | Implement commercial workflow foundation for quotations, recruitment/training contracts, purchase orders, and invoices | Merged via PR #46 into `main` as `e1976f8a4b888657abe74c40ddf99c730032934a` |
| Issue #39 | Complete | Implement payments, expenses, client balances, and profitability accounting | Merged via PR #47 into `main` as `54def73831df9b6cd7b0064171c52dff9b55e2ac` |
| Issue #48 | Complete | Reconcile project memory after the accounting merge | Merged via PR #50 into `main` as `2ad1a551023a8b0acaa01d9bea05435e3aaaec6a` |
| Issue #49 | Complete | Implement template-driven document and business-output generation | Merged through PR #51 into `main` as `e2879b38c54dcc1b42b85aa345680260487454dc` |
| Issue #52 | Open | Establish HireMe UI/UX v1 foundations and later representative surfaces | Tasks 1–2 merged via PR #53; the Reporting representative surface is in review under Issue #56. Candidate workspace and Public Opportunity redesigns not started |
| Issue #54 | Complete | Add the English/French localization foundation to the web interface | Merged via PR #55 into `main` as `6e6cf6fd499800ed019a9c0d82680bde8b275f2e` |
| Issue #56 | Open | Redesign the bilingual Recruitment Reporting dashboard as the Reporting representative surface | Implemented on `design/reporting-dashboard-v1`; draft PR open and awaiting technical and visual review |

## Issue #56 Verification State

- Branch `design/reporting-dashboard-v1` was created from exact `main` `6e6cf6fd499800ed019a9c0d82680bde8b275f2e`.
- Reporting presentation was extracted from `App.tsx` into `apps/web/src/reporting/`. `App.tsx` keeps routing and every other module panel.
- No API, contract, Prisma, KPI-calculation, authorization, record-scope, filter-semantic, or CSV change was made. The five reporting reads, their query shape, and the export flow are unchanged.
- Navigation stays gated by `reporting:recruitment:view`; the CSV export action is not rendered at all without `reporting:recruitment:export`.
- The dashboard is fully bilingual, so `reporting` was removed from `deferredEnglishRoutes` and no `lang="en"` boundary remains around the module.
- Switching language re-renders labels and `Intl` formatting only; the report is not refetched.
- Drilldown paging replaces the table alone and does not refetch the aggregates; applying filters restarts the report at page 1.
- `pnpm install --frozen-lockfile`, `format:check`, `git diff --check`, `check:styles`, `check:architecture`, `lint`, `typecheck`, `test`, and `build` all passed locally. Test totals: contracts 23, API 67, web 140 (was 121).
- The production build contains only `index.html`; the development-only `reporting.html` review surface is excluded.
- Reviewed at 1440, 1024, 900, 800, 430, and 390 px in both languages with no whole-page horizontal overflow; drilldown overflow stays inside the data region.

## Completed foundation work

- Private GitHub repository created.
- Initial README added.
- Codex repository instructions and project-local skills added.
- Discovery and clarification questionnaires completed and analyzed.
- Issue #5 completed through merged PR #6, establishing persistent repository memory, goals, status, roadmap, decisions, risks, and agent handoffs.
- Issue #1 completed through merged PR #4, establishing the approved product scope, architecture, domain model, workflows, and permissions.
- Issue #3 completed through merged PR #9, establishing the foundational Prisma schema, migration, role/permission seed, API-owned Prisma boundary, and database lifecycle checks.
- Issue #10 completed through merged PR #11, establishing local authentication, Argon2id password credentials, rotating refresh sessions, reuse detection, secure cookies, normalized permission resolution, deny-by-default guards, and safe authentication audit logs.
- Issue #13 completed through merged PR #14, establishing secured internal user administration, permission-code authorization, safe DTOs, active-user authorization checks, session revocation, and safe administration audit logs.
- Issue #15 completed through merged PR #16, establishing client organization and client-contact CRM, commercial-data gating, archival lifecycle rules, parent-client concurrency locking, and PostgreSQL-backed authorization/lifecycle tests.
- Issue #17 completed through merged PR #18, establishing reusable candidate master/profile CRM, candidate compensation and consent gating, parent-candidate concurrency locking, and PostgreSQL-backed authorization/lifecycle tests.
- Issue #19 completed through merged PR #20, establishing recruitment mission CRM, multiple recruiter/contributor assignments, structured mission closure, commercial-data gating, parent-mission concurrency locking, and PostgreSQL-backed authorization/lifecycle tests.
- Confirmed requirements now include detailed recruitment workflows, multiple recruiters per mission, public opportunity applications, optional future client access, multi-session training attendance, document versioning, messaging, dashboards, commercial operations, outputs, integrations, migration scale, and scoped permissions.

## Issue #2 Verification State

- Dependency installation completed with pnpm and a committed lockfile.
- Prisma schema validation and client generation completed against safe placeholder environment values.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed locally.
- API runtime health check returned a structured `ok` response.
- API dev/start scripts load the repository-root `.env` created from `.env.example`.
- Web Vite configuration reads environment variables from the repository root.
- Local web, API, CORS, and database examples consistently use `127.0.0.1`.
- Web dev server responded on `127.0.0.1:5173` with `VITE_API_BASE_URL` configured for the local API.
- React test coverage verifies that the web app renders the API health response from the configured client path.
- GitHub Actions includes a dedicated Docker Compose job that copies `.env.example` to `.env`, validates Compose configuration, starts PostgreSQL, waits for the container to become healthy, prints diagnostics on failure, and always runs `docker compose down -v`.
- Local Docker Compose PostgreSQL startup could not be confirmed by Codex because the Docker daemon was unavailable.

## Issue #3 Verification State

- Foundational Prisma schema implementation is merged through PR #9.
- Initial migration is included from the approved domain model.
- Development seed is limited to the eight approved roles and safe synthetic permissions.
- Prisma is owned by `apps/api` with one explicit generated output under `apps/api/prisma/generated/client`.
- `pnpm check:architecture` verifies that web/contracts remain ORM-independent and that no generated Prisma client is committed.
- PR #9 CI run `29841648591` passed PostgreSQL health, quality checks, clean Prisma regeneration, migration deploy, seed twice, and database integration tests.

## Issue #10 Verification State

- Local email/password authentication, Argon2id password credentials, rotating hashed refresh sessions, reuse detection, secure refresh-cookie handling, in-memory web access-token handling, normalized permission resolution, deny-by-default guards, and safe authentication audit logs are merged.
- The API uses one Nest-managed Prisma provider for runtime code. The development bootstrap script and database tests remain separate-process/test exceptions.
- Unit tests cover password hashing and token validation. Web tests cover login/logout and confirm browser storage is not used for tokens. PostgreSQL integration tests cover login, refresh rotation, reuse detection, logout, permission enforcement, audit safety, and development bootstrap idempotency.

## Issue #13 Verification State

- Internal user administration is implemented as permission-code guarded `/v1/admin` endpoints with shared Zod contracts and a minimal protected web administration screen.
- Local checks passed: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm check:architecture`, Mermaid CLI rendering for all 8 diagrams, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- Local Docker Compose PostgreSQL startup failed because Docker Desktop is not running, so `pnpm prisma:migrate:deploy`, `pnpm prisma:seed`, and `pnpm test:db` could not complete locally.
- PR #14 is merged. GitHub Actions run `29861073885` passed PostgreSQL Docker Compose health, migration deploy, seed twice, database integration tests, and quality checks.
- The blocking security review was addressed by making the central auth guard explicitly verify current active/not-archived account eligibility and by adding a PostgreSQL-backed regression test that reuses still-unexpired access tokens after suspension and archival.

## Issue #15 Verification State

- Client organization and client contact CRM is merged through PR #16.
- The API exposes permission-code guarded `/v1/clients` endpoints with shared Zod contracts, safe DTOs, contact ownership checks for nested routes, archival lifecycles, and safe audit summaries.
- Client contacts keep normalized email uniqueness within one client; the same normalized email may exist under different clients.
- Client archive is transactional and archives active contacts under the same client without physical deletion.
- PR #16 lifecycle/concurrency correction serializes client archive, contact creation, client updates, client status changes, contact updates, contact status changes, and contact archive through one transaction-scoped PostgreSQL row lock on the parent `Client`.
- Normal client/contact permissions are seeded only to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`; unresolved team, assigned, or optional future client scopes do not receive broad client access by default.
- Commercial client fields require `commercial_data:access`; ordinary client access receives `commercial: null`.
- Local checks passed: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm check:architecture`, Mermaid CLI rendering for all 8 diagrams, fresh migration deploy, migration reset, seed twice, `pnpm test:db`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- Local PostgreSQL validation used Docker Compose with `POSTGRES_PORT=55432` because another project already occupied `127.0.0.1:5432`.

## Issue #17 Verification State

- Candidate master/profile implementation is merged through PR #18.
- The API exposes permission-code guarded `/v1/candidates` endpoints with shared Zod contracts, safe DTOs, structured skills/languages/work-experience/education nested routes, candidate-child ownership checks, archival lifecycles, and safe audit summaries.
- Candidate normalized email uses the existing global unique constraint and rejects duplicates without automatic merging.
- Candidate archival and dependent candidate/profile writes share one transaction-scoped PostgreSQL row lock on the parent `Candidate`.
- Candidate compensation fields require `candidate_compensation:*` permissions; candidate consent fields require `candidate_consent:*` permissions.
- Normal candidate/profile permissions are seeded only to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`; only `SUPER_ADMIN` receives candidate compensation and consent permissions by default.
- PR #18 blocking security review was addressed by making candidate detail and mutation responses respect `candidate_profile:view` independently from candidate mutation permissions. Callers without `candidate_profile:view` receive empty structured profile arrays even when create/update/status/archive mutations are allowed.
- Local checks after the blocking fix passed: `pnpm prisma:validate`, `pnpm prisma:generate`, fresh migration deploy, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db`, `pnpm check:architecture`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- `pnpm test:db` now includes a PostgreSQL-backed regression test for a synthetic mutation-capable role without `candidate_profile:view`; 42 database integration tests passed locally.
- Local PostgreSQL validation used Docker Compose with `POSTGRES_PORT=55432` because another project already occupied `127.0.0.1:5432`.
- PR #18 is merged, and GitHub Actions run `29875687083` passed PostgreSQL Docker Compose health, migration/seed/database integration tests, and quality checks before merge.

## Issue #19 Verification State

- Recruitment mission and assignment implementation is merged through PR #20.
- The API exposes permission-code guarded `/v1/missions` endpoints with shared Zod contracts, safe DTOs, documented lifecycle transitions, structured closure reasons, mission archival, nested assignment ownership checks, and safe audit summaries.
- Mission creation verifies the parent client is valid and writable.
- Mission updates, status changes, closure, archival, assignment writes, assignment archival, and lead-recruiter replacement share one transaction-scoped PostgreSQL row lock on the parent `RecruitmentMission`.
- Assignment activation and lead-recruiter selection re-check that the assigned user is still active, non-archived, and internal inside the parent-mission locked transaction.
- Mission salary updates validate the effective next range inside the parent-mission locked transaction by combining supplied values with persisted values.
- Active duplicate assignments are rejected, and the database enforces at most one active lead recruiter per mission.
- Mission salary and commercial fields require dedicated `mission_commercial_data:*` permissions; ordinary mission access receives `commercial: null`.
- Normal mission and assignment permissions are seeded only to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`; only `SUPER_ADMIN` receives mission commercial permissions by default.
- Local checks passed: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm check:architecture`, `pnpm prisma:migrate:deploy`, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db`, Mermaid CLI rendering for all 8 diagrams, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- `pnpm test:db` now includes PostgreSQL-backed regression coverage for reactivating an inactive assignment after assignee suspension, selecting an existing assignment as lead after assignee suspension or archival, and stable `MISSION_SALARY_RANGE_INVALID` responses for partial salary minimum/maximum updates against persisted counterpart values.

## Issue #21 Verification State

- Mission-candidate process implementation is merged through PR #22.
- The API exposes permission-code guarded nested `/v1/missions/:missionId/candidates` endpoints with shared Zod contracts, safe DTOs, permanent `(missionId, candidateId)` uniqueness, responsible-recruiter ownership, and explicit presentation.
- The implemented pipeline uses the approved states `NEW`, `CV_TO_REVIEW`, `HR_PRESELECTION`, `HR_INTERVIEW_SCHEDULED`, `HR_INTERVIEW_COMPLETED`, `TECHNICAL_TEST`, `INTERNAL_VALIDATION`, `PRESENTED_TO_CLIENT`, `CLIENT_INTERVIEW_1`, `CLIENT_INTERVIEW_2`, `CLIENT_OFFER`, `ACCEPTED`, `INTEGRATED`, `PROBATION_COMPLETED`, `PROCESS_COMPLETED`, plus `WAITING`, `POSTPONED`, `CANDIDATE_REJECTED`, `CLIENT_REJECTED`, `WITHDRAWN`, and `TALENT_POOL`.
- Optional skips are limited to `HR_INTERVIEW_COMPLETED` to `INTERNAL_VALIDATION` and `CLIENT_INTERVIEW_1` to `CLIENT_OFFER`; both require an explicit skip request, reason, and audit history.
- Candidate profile and compensation values remain live source-of-truth data from `Candidate`; mission-candidate records do not snapshot salary/profile values.
- Client visibility starts only after explicit presentation. Linking a candidate to a mission remains internal-only.
- Issue #29 supersedes independent manual integration counting with offer-backed `MissionPlacement` confirmation from the current accepted offer version; confirmation increments filled placement count once and does not close the mission automatically.
- PR #22 blocking-review correction makes `PRESENTED_TO_CLIENT` reachable only through the dedicated presentation action, which atomically sets visibility, timestamp, presenter identity, process event, and safe audit event. Generic transition attempts return `MISSION_CANDIDATE_PRESENTATION_ACTION_REQUIRED` without partial metadata.
- PR #22 blocking-review correction makes repeated integration confirmation a true no-op that preserves placement count, confirmation metadata, process-event history, and audit history.
- Mission-candidate writes use the documented PostgreSQL lock order from D-033.
- Local checks after the PR #22 blocking-review correction passed: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm prisma:migrate:deploy`, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db` with 54 PostgreSQL integration tests passing, `pnpm check:architecture`, static Mermaid validation for all 8 documentation diagrams, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- Actual Mermaid CLI rendering could not run locally because no renderer is installed and temporary `@mermaid-js/mermaid-cli` download/execution was rejected by approval policy.

## Issue #23 Verification State

- Interview and structured-evaluation implementation is merged through PR #24.
- The API exposes permission-code guarded nested interview and evaluation endpoints under mission-candidate processes.
- The implementation refines the existing provisional `Interview` and `CandidateEvaluation` models and adds explicit `InterviewParticipant` and `InterviewEvent` records.
- Client interviews require explicit mission-candidate presentation, and client interview 2 requires an appropriately progressed first client interview.
- Interview writes use the established lock order: parent `RecruitmentMission`, existing `MissionCandidate`, parent `Candidate`, then `Interview` when applicable.
- Evaluations are structured business records with bounded scores, recommendations, strengths, weaknesses, risks, comments, explicit idempotent finalization, and permission-aware redaction.
- PR #24 blocking-review correction makes repeated and concurrent interview cancellation a true no-op after the first state change, preserving the original `canceledAt`, cancellation event, reason history, and audit history.
- Local checks passed after the cancellation-idempotency correction: focused `interviews.integration.test.ts` regression coverage, `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm prisma:migrate:deploy`, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db` with 61 PostgreSQL integration tests passing, `pnpm check:architecture`, Mermaid CLI rendering for all 10 documentation diagrams, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- `pnpm test:db` initially failed in the local shell because authentication test secrets were intentionally absent from `.env`; it passed after setting safe synthetic `AUTH_ACCESS_TOKEN_SECRET` and `AUTH_REFRESH_TOKEN_PEPPER` values for the command invocation only.
- `pnpm build` passed with Vite's existing large-chunk advisory warning.

## Issue #25 Verification State

- Issue #25 is documentation and architecture realignment only.
- Confirmed product direction: the main application is authenticated and internal; candidates apply through unauthenticated opportunity links without accounts or dashboards.
- Public opportunity lifecycle, application-link availability, and public listing are independent controls.
- Client portal is optional future scope, not MVP.
- Training participants are records by default, while trainers and internal training operators require internal accounts.
- Commercial and operational accounting is in scope with explicit boundaries excluding full legal accounting, general ledger, tax declarations, and bank reconciliation unless later approved.
- Issue #27 is implementing the public opportunity and candidate application foundation.
- Local checks passed for the documentation-only change: Mermaid CLI rendered all 11 documentation diagrams, `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm check:architecture`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- `pnpm build` passed with Vite's existing large-chunk advisory warning.
- PR #26 blocking comment correction reconciles D-027 with D-037 by making D-027 govern staff-controlled external client sharing without assuming a client portal. The correction also removes stale "Clients see" and client-portal visibility-boundary wording while preserving the confidentiality exclusions for internal notes, confidential scores, unrelated missions, internal history, protected salary or compensation data unless specifically approved, and recruiter-only operational information.
- Local checks after the PR #26 blocking-comment correction passed: Mermaid CLI rendering for all 11 documentation diagrams, `pnpm check:architecture`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.

## Issue #27 Verification State

- Public opportunity and unauthenticated candidate application foundation is merged through PR #28.
- The implementation adds API-owned `PublicOpportunity`, `PublicCandidateApplication`, and `PublicCandidateApplicationFile` Prisma models plus shared public DTOs that are separate from internal mission DTOs.
- Public list/detail responses expose only approved public fields. Client name and salary remain hidden unless explicitly enabled, and commercial data, recruiter assignments, application counts, pipeline data, internal notes, audit metadata, and client-contact data are never included.
- Public submissions accept structured candidate information, consent, and configured private files through the protected storage abstraction. CV submissions preserve version history and are linked to the exact opportunity submission and mission-candidate process.
- Candidate reuse is deterministic by normalized email for active candidates only; phone does not merge records and archived candidates are not silently reactivated.
- Submissions create an internal `MissionCandidate` process at `NEW`, keep `clientVisible = false`, and assign an eligible active internal mission recruiter. The implementation does not present candidates to clients.
- PostgreSQL-backed public-application tests cover listed/unlisted confidentiality, submission creation, file traceability, active-candidate reuse across missions, duplicate same-mission prevention, concurrent duplicate prevention, archived-candidate handling, invalid file rejection, consent requirement, unavailable opportunities, missing-recruiter safe responses, and internal configuration permissions.
- PR #28 blocking review correction adds protected mission-workspace controls for authorized staff to view and edit public opportunity configuration, independently enable/disable application links, list/unlist website publication, configure publication dates and file requirements, copy/open the generated public link, and inspect mission-related public applications.
- The latest correction adds an explicit "Copy public link" action using the opaque public slug, handles clipboard failures visibly, enforces publish permission for publish-controlled API fields, validates effective publication windows on partial updates, and expands PostgreSQL-backed coverage for manage-only edits, each protected publish field, audit non-writes on denied attempts, and deterministic `CLIENT_USER` role permission restoration.
- Web coverage verifies that users without public permissions do not see the controls, read-only users cannot edit or publish, publication actions require `public_opportunities:publish`, application review requires `public_applications:view`, authorized users can save configuration, listed/unlisted/disabled states are visible, and generated public links use public slugs rather than internal mission IDs.
- Earlier failed workflow run `30005337078` failed in `mission-candidates.integration.test.ts`, not the public-application suite: `serializes mission archival and candidate archival races against process creation` expected `409` but received `201`. The test passed locally on the corrective tree, and GitHub Actions run `30444387092` passed on the current PR #28 head.
- Local checks passed: `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd check:architecture`, PostgreSQL Docker Compose health, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice after reset, full `pnpm.cmd test:db` with 70 PostgreSQL integration tests passing, `pnpm.cmd --filter @hire-me/web test` with 13 web tests passing, `pnpm.cmd format:check`, package-level lint/typecheck/test/build fallbacks after the known Windows Turbo `spawn UNKNOWN` issue, and `git diff --check`.
- GitHub Actions run `30444387092` passed PostgreSQL Docker Compose health, database migration/seed/integration tests, and quality checks.
- Package-level builds passed locally after the known Windows Turbo `spawn UNKNOWN` issue, with the web build retaining Vite's existing large-chunk advisory warning; GitHub Actions run `30444387092` passed the root quality commands.

## Issue #29 Verification State

- Issue #29 is complete; PR #30 merged into `main` as merge commit `249bca8a0fa1a7619dc5f7bbcff44034b5457cc0`.
- Final blocking-fix commit `440ea9cb3dec204f0e2308eeb7c02cf4dcae4822` retired the legacy integration-counting path, and final-head GitHub Actions run `31719561145` passed all jobs.
- Scope is limited to internal staff-managed offer versions, offer negotiation outcomes, explicit placement confirmation, placement correction, closure eligibility, and bounded commercial eligibility for future invoicing.
- Offer acceptance alone does not count a placement; `filledPlacementCount` changes only after explicit authorized placement confirmation.
- Placement confirmation and correction are designed to be idempotent and serialized through the established mission-candidate lock order.
- Final blocking-review correction retired the legacy `confirm-integration` route as a counting mutation, blocked ordinary transitions into `INTEGRATED`, and keeps historical `MissionCandidate.placementConfirmedAt` rows as compatibility metadata unless a later audited reconciliation creates canonical `MissionPlacement` rows.
- Offer-backed `MissionPlacement` is the authoritative counted-placement record. Offer acceptance alone does not count placement; generic `MissionCandidate` transition into `INTEGRATED` is blocked and requires the dedicated offer-backed placement action.
- The legacy `confirm-integration` route is compatibility-only and returns `PLACEMENT_OFFER_CONFIRMATION_REQUIRED`; it must not increment `filledPlacementCount`, create `MissionPlacement`, or infer an offer version.
- Moroccan payroll is recorded as future product scope only; no payroll, invoice, accounting, or candidate self-service implementation is included in Issue #29.
- Local checks passed after the PR #30 legacy-integration blocking-review correction: PostgreSQL Docker Compose health on `127.0.0.1:55432`, `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice after reset, focused affected PostgreSQL tests with 13 tests passing, full `pnpm.cmd test:db` with 77 PostgreSQL integration tests passing, `pnpm.cmd check:architecture`, Mermaid CLI rendering for all 13 documentation diagrams, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, and `git diff --check`.
- Local root `pnpm.cmd test` and `pnpm.cmd build` initially hit the known Windows sandbox/esbuild access issue and passed when rerun outside the sandbox. Web tests pass with existing React `act(...)` warnings around asynchronous mission workspace state updates.

## Issue #31 Verification State

- Issue #31 is complete; PR #32 merged into `main` as commit `621976272e7029b8bbca962684c8ad074b5e7ef8`.
- The merged implementation adds authenticated internal task ownership, multiple assignees, lifecycle, comments, explicit mentions, durable in-app reminders, task-generated notifications, own-notification controls, searchable/filterable task lists, and permission-aware task visibility.
- Task visibility requires base `tasks:view` or explicit `tasks:view_all` plus record scope. Mentions, reminder recipients, and notification link shaping do not treat users without task-view permission as task viewers.
- Reminder processing uses due-row discovery followed by Task and TaskReminder row locking/rechecking with explicit state transitions, not `FOR UPDATE SKIP LOCKED`.

## Issue #35 Implementation State

- Issue #35 is complete; PR #40 merged the internal document-management foundation on top of the current `main`, which now includes merged Issue #31 task-management functionality.
- Issue #12 is incorporated by adding distinct centralized document taxonomy values for `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION`. The old generic contract database value is retained only as compatibility taxonomy and is not offered for new document creation.
- The API adds permission-code guarded `/v1/documents` endpoints for document list/detail, create/register, metadata update, archive, immutable version upload, version list, and protected authorized download.
- Document authorization combines exact document capability with linked business-context permission and scope. Current implemented contexts are client, candidate, recruitment mission, mission-candidate process, and interview; mission, process, and interview contexts use context-specific scope override rules rather than one blended mission-document bypass. Training contract taxonomy is distinct but training operations/rendering remain future work.
- Document visibility is enforced consistently across list, detail, version list, download, and mutation paths. List visibility is enforced by the database query predicate. `PRIVATE` and `ASSIGNED_ONLY` are owner-only until a separate assignment model exists; null owner does not broaden private access. `CLIENT_SHARED` does not grant external/client access.
- Uploads use server-generated protected storage keys, separate safe original filename metadata and sanitized download filenames, bounded strict base64/content size checks, MIME/extension/signature validation including bounded DOCX/XLSX OOXML ZIP-package validation, checksums, and safe DTOs that omit storage keys, filesystem paths, and document contents. Version numbers are assigned while holding a PostgreSQL `Document` row lock.
- Metadata update and document archive audit records are written atomically with their mutations.
- Task create/update document context links reuse the centralized server-side document visibility policy. Task and notification responses preserve internal FKs but redact `documentId` unless the actor can independently view the linked document at read time.
- Candidate CV/public-application uploads remain on `CandidateDocument` / `CandidateDocumentVersion`; Issue #35 does not migrate or rewrite that behavior.

## Issue #36 Implementation State

- Issue #36 merged the first authenticated internal recruitment reporting layer through PR #43.
- API module `apps/api/src/reporting` exposes permission-guarded `GET /v1/reporting/recruitment` endpoints: `summary`, `pipeline`, `trends`, `breakdowns`, `drilldown`, and `export.csv`. Shared contracts live in `packages/contracts/src/reporting.ts`. No Prisma schema change or migration was required.
- Reporting requires the reporting capability plus the underlying operational reads, so it cannot bypass operational read permissions. Record scope reuses the mission-candidate oversight model. Reporting never exposes salary/compensation, commercial values, confidential evaluation bodies, internal notes, storage metadata, or secrets.
- CSV export requires `reporting:recruitment:export`, neutralizes spreadsheet formula injection, rejects over-large exports instead of truncating, and audits only successful exports with safe metadata.

## Issue #37 Implementation State

- Issue #37 implements the internal training-operations module on the existing training records. No parallel training model was introduced.
- Schema work is additive only, in migration `20260904143000_training_operations_foundation`: program reference/normalized reference, optional client context and planned window; session title, sequence, scheduled end, delivery mode, reschedule and cancellation metadata; enrollment actor, lifecycle timestamps, withdrawal reason, and active-participant key; participation actor, attendance timestamp, and correction metadata.
- The API adds permission-guarded `/v1/training` endpoints. Sessions, enrollments, and participation are nested under their training program so the full parent chain is verified server-side.
- Program, session, and participation lifecycles follow `docs/workflows.md` exactly. Enrollment additionally supports an explicit authorized withdrawal to `canceled` from any active state, with a recorded reason and preserved history.
- Active enrollment uniqueness and session participation uniqueness are enforced by PostgreSQL unique constraints, so concurrent duplicate attempts resolve deterministically to a single record.
- Concurrent reschedule, cancel, lifecycle, and attendance writes serialize through row locks taken in the order program, session, enrollment, participation.
- Authorization combines an explicit training capability with server-side record scope. `training_programs:view_all` is the separate broad oversight capability. Client-linked programs additionally require `clients:view` and are otherwise excluded from both the list predicate and the detail path.
- Attendance correction is a separate capability from recording attendance and always records a reason, a correction count, and audit history. Trainer notes are redacted from actors who may not manage participation.
- Certificate readiness is a derived durable boundary over `completedAt`, withdrawal, archival, and certificate status. No certificate or contract file is generated, and no `Document` records are created for training records.
- Training commercial data is deliberately absent. `TrainingEnrollment.paymentStatus` remains an untouched pre-existing column and is not exposed. The stable identifiers a later commercial feature can consume are the training program id/reference, training session id, and training enrollment id.
- Validation ran against a dedicated local PostgreSQL database because a concurrent agent reset the shared development database mid-task.
- PR #45 review corrections (decision D-050): participant linking now requires the source domain's own read authorization and fails closed indistinguishably; enrollment reads redact source identifiers; the migration backfills and validates legacy active enrollments and adds a keyless-active check constraint; `PARTICIPATION_ARCHIVED` is reachable through an explicit audited idempotent archive action; attendance is gated by session state and can no longer be rewritten through the ordinary action; training query booleans are parsed explicitly; the reschedule reason is persisted; and certificate readiness requires an explicit `PENDING` status.
- After integrating latest `main` (PR #43 recruitment reporting), the full suite was rerun from a clean database. Following the review correction pass, `pnpm test:db` totals 189 PostgreSQL integration tests across 14 files (140 merged baseline + 49 training).
- Reviewed head is `d955aa061c64eec943389c629884ba9f65fd9393`. Exact-head Actions run `33896393313` passed Quality checks, PostgreSQL Docker Compose health, and Database migration, seed, and integration tests (189 passed).
- PR #45 merged into `main` as merge commit `09c506262ad3284efd69f70440c1ee06175c6e00`; Issue #37 is complete.

## Issue #38 Implementation State

- Issue #38 is complete. PR #46 merged the commercial workflow foundation into `main` as merge commit `e1976f8a4b888657abe74c40ddf99c730032934a`.
- The branch adds structured commercial records for quotations, commercial contracts, purchase orders, and invoices. These are business records, not `Document` records; generated or signed files remain future `DocumentVersion` outputs.
- Server-calculated totals are authoritative. Client-submitted subtotals or totals are not accepted by shared contracts; invoices store immutable line and amount snapshots once issued.
- Commercial writes require the matching `*:manage` permission plus `commercial_data:access`; views require matching `*:view` and redact amounts, line details, contract terms, and free-form history reasons without commercial-data access.
- Commercial APIs combine route permissions with underlying client and mission source scope. Linked quotations, contracts, purchase orders, correction invoices, and placement invoice sources are checked server-side for same client, compatible business context, currency, required source status, and actor access. Hidden and nonexistent commercial/source UUIDs are masked behind the same generic not-found response.
- Historical commercial reads remain available from the durable commercial record scope after parent client or mission archival; new upstream commercial source creation may keep stricter writable-source checks.
- Placement-backed invoices require locked/re-read authoritative confirmed `MissionPlacement` eligibility; accepted offers and historical legacy integration metadata do not authorize invoices. Mission state `CLOSED_WITH_RECRUITMENT` does not by itself block invoicing when the placement remains confirmed, eligible, visible, not archived, and linked to the requested client and mission. Commercial mutations write domain history and global audit rows atomically in the same transaction; idempotent archive/status retries do not duplicate history or audit.
- PostgreSQL-backed regressions cover commercial redaction and write denial, route-plus-source authorization, hidden-vs-missing masking, quotation lifecycle and terminal mutation blocking, relationship context/currency/status rejection, correction invoice validation, archive filtering/idempotency, historical parent-archive reads, reason redaction, monetary overflow rejection, exact contract/PO snapshot preservation, placement stale-read protection, closed-mission placement invoicing, duplicate placement-backed invoice creation, quotation accept/cancel concurrency, atomic audit rollback, duplicate references, invoice snapshots, placement-backed invoicing, and concurrent invoice issue idempotency.
- Latest-main integration preserved merged Issue #37 training operations alongside the commercial behavior. The reviewed head was `25b0e6f0db6e3d1ca41ff4d1afdeeb73b4803fe4`; exact-head GitHub Actions run `34166398141` passed Quality checks, PostgreSQL Docker Compose health, and Database migration, seed, and integration tests with 210/210 PostgreSQL integration tests across 15 files.

## Issue #39 Implementation State

- Issue #39 is complete. PR #47 merged the accounting foundation into `main` as merge commit `54def73831df9b6cd7b0064171c52dff9b55e2ac`. The final reviewed head was `cdb0ef3b295ab9b749c4bdd92ecab1e74af3c34a`, and exact-head GitHub Actions run `34213661408` passed Quality checks, PostgreSQL Docker Compose health, and Database migration, seed, and integration tests with 263/263 PostgreSQL integration tests across 16 files.
- Issue #39 adds payments, payment-to-invoice allocation, and operational expenses on top of the merged Issue #38 commercial records. Quotations, contracts, purchase orders, and invoices are not remodelled.
- Schema work is additive only, in migration `20260908120000_accounting_foundation`: `Payment`, `PaymentAllocation`, `PaymentEvent`, `Expense`, and `ExpenseEvent`, plus their enums. No merged migration was edited, renamed, reordered, or squashed.
- Invoice settlement is derived from the immutable issued invoice total plus active allocations. Nothing is stored, so a payment can never mark an invoice paid merely by existing. States are not-receivable, unpaid, partially paid, paid, and overdue.
- Allocation validates a positive amount, exact currency match, the payment's unallocated remainder, and the invoice's remaining receivable, all computed while the payment and invoice rows are locked in that fixed order.
- Financial invariants are enforced in PostgreSQL as well as service code: positive-amount checks on payments, allocations, and expenses; a unique index permitting at most one active allocation per payment/invoice pair; and a check constraint keeping the active allocation key consistent with allocation status so an active row cannot hold a null key and escape the index.
- Allocation supports an idempotency key: a replayed request returns the original allocation with no second history or audit row. Reversal preserves the allocation row, releases the key, and frees the balance.
- Correcting a payment amount requires its own capability and reason and can never drop below the amount already allocated. A payment with active allocations cannot be archived.
- Receivables and profitability are separated per currency with no FX conversion. Profitability follows decision D-053: issued invoice revenue minus directly linked operational expenses, excluding canceled and archived invoices.
- Profitability contexts are client, recruitment mission, and placement. Training-program profitability is unsupported because the merged commercial model carries no authoritative invoice-to-training-program link; training expenses are still recorded and readable.
- Authorization combines the accounting capability, `commercial_data:access` for any amount, and the underlying client/mission record scope. Aggregates fail closed rather than returning redacted shells, and hidden, out-of-scope, and nonexistent identifiers share one not-found envelope.
- Payroll, statutory/accrual/tax accounting, depreciation, FX conversion, and receipt files remain out of scope.

### Review blockers found and addressed

The first ChatGPT review of PR #47, on head `81a242f53e37b4d76126e3802d7bc7b55b417408`, returned four blocking findings. All four were fixed before the merge.

1. **Invoice cancellation could strand allocated cash.** `CommercialService.cancelInvoice()` now counts `ACTIVE` payment allocations while it already holds the invoice row lock and, if any exist, rejects with `INVOICE_HAS_ACTIVE_ALLOCATIONS`. Allocations are never auto-reversed or deleted: the operator reverses them explicitly first. `archiveInvoice()` needed no change, because it already refuses issued invoices and only issued invoices can carry allocations. The previous race test mutated the invoice status straight through Prisma, which bypassed the guard under test; it is replaced by tests that drive the real commercial cancellation endpoint.
2. **Accounting aggregates ignored mission source scope.** A deterministic scope predicate now mirrors the merged commercial visibility rule (`clients:view`, plus `missions:view` and either `mission_candidates:transfer` or an active `MissionRecruiter` assignment for mission-linked records) and is applied to expense listing, client receivables, overdue receivables, and client, mission, and placement profitability. Regression tests use a synthetic role that is deliberately not one of the seeded shapes.
3. **Expense context integrity was incomplete.** `validateExpenseContext()` now resolves each supplied context to its own chain (placement to mission to client, mission to client, training program to its optional client) before requiring the chains to agree, which closes a client combined with a placement from another client when the mission field was omitted. `assertExpenseScope()` now validates placements through their mission and training programs through client scope, so a null `clientId` no longer opens a read path.
4. **Money input bound did not match storage.** `PositiveCentsSchema` is capped at `MAX_ACCOUNTING_CENTS` (2,147,483,647), matching the PostgreSQL `integer` range of the accounting columns, so an oversized amount fails request validation instead of failing later at persistence. Response-side totals stay uncapped because a sum over many rows can legitimately exceed the per-row range. No `BigInt` was introduced: nothing in the product needs values beyond that range.

Optional hardening in the same pass: reusing an allocation idempotency key for a different invoice or amount now fails with `ALLOCATION_IDEMPOTENCY_KEY_CONFLICT` instead of returning an unrelated allocation. An identical replay still returns the original allocation with no second history or audit row.

### Second review round, three blockers addressed

The second ChatGPT review, on head `fd8f739e040e73a2fae05dd75ec2fd09f98c76ca`, verified the first four fixes and returned three further blocking findings. All three were fixed before the merge.

1. **Training-linked expenses did not follow training source scope.** Accounting checked a training program only through its `clientId`, so `clients:view` was an alternate path to a program the training domain hides. Accounting now mirrors the merged `TrainingService.visibleProgramWhere` rule exactly: broad oversight needs `training_programs:view_all`, otherwise the actor must own the program or train one of its sessions, and a client-linked program additionally needs client read capability. The rule is mirrored as a Prisma predicate using existing permission constants, so no circular Nest module dependency is created. It applies to expense creation with a training context, expense detail, expense listing, and the update, correction, and archive paths that resolve scope through the same helper.
2. **Placement-linked accounting did not require `placements:view`.** The authoritative placement API and the merged commercial invoice path both require it before a `MissionPlacement` may be used. `AccountingAccess` now carries `placementsView`, and it is required for creating an expense with a placement context, reading or listing placement-linked expenses, and PLACEMENT profitability. Client scope, mission scope, and the `MissionRecruiter` or `mission_candidates:transfer` rule still apply on top. `placement_commercial_eligibility:view` is deliberately not required, because no accounting operation evaluates commercial eligibility.
3. **Accounting list date ranges were unbounded.** `PaymentListQuerySchema` and `ExpenseListQuerySchema` now require that both endpoints are omitted or both supplied, that the window is ordered, and that it spans at most `MAX_ACCOUNTING_DATE_RANGE_DAYS` (366). A one-sided window is rejected instead of silently widening into an unbounded ledger sweep. Validation is deterministic Zod in the Prisma-independent contracts, so the controllers keep returning `INVALID_PAYMENT_LIST_QUERY` and `INVALID_EXPENSE_LIST_QUERY`.

Every capability the new checks rely on is already granted by the existing seed to the roles that hold broad oversight, so no seed change was needed.

### Accounting scope deliberately left for later issues

Merged through Issue #39: payments, payment allocations, derived invoice settlement with partial/paid/overdue behavior, operational expenses, client receivables, overdue receivables, and D-053 issued-invoice profitability, all separated per currency with no FX conversion.

Still requiring their own approved issues: Moroccan payroll; statutory, general-ledger, and tax accounting; credit notes and refunds; aging buckets beyond the current overdue outstanding figure; accounting exports; and training-program profitability, which first needs an authoritative link from commercial revenue to a training program.

## Issue #49 Implementation State

- Issue #49 adds template-driven generation of business output files on top of the merged `Document` / immutable `DocumentVersion` foundation. Structured business records stay authoritative; a generated file is only an output snapshot and never a second source of truth.
- Output families: commercial quotation, purchase order, recruitment contract, training contract, issued invoice, and training certificate. Each renders to PDF and to Word-compatible DOCX in French or English.
- Schema work is additive only, in migration `20260908160000_document_output_generation`. `Document` gains `generatedSourceType`, a unique `generatedDocumentKey`, `generatedLanguage`, and authoritative `commercialQuotationId`, `commercialContractId`, `purchaseOrderId`, and `invoiceId` relations with `onDelete: Restrict`. `DocumentVersion` gains `templateId`, `templateVersion`, `generationLanguage`, and a unique `generationIdempotencyKey`. The existing `trainingEnrollmentId` relation is reused rather than duplicated, and one new `DocumentType.TRAINING_CERTIFICATE` taxonomy value is added because none existed.
- Four PostgreSQL check constraints keep provenance unambiguous: a generated document names exactly one source relation, its taxonomy matches that source family, its generated identity is complete or entirely absent, and a generated version always carries template identity, language, output family, and a checksum. All four use `CASE` with `IS NULL` / `IS NOT NULL` because PostgreSQL accepts a null check result.
- Templates are a code-owned registry of ordinary TypeScript functions that map a typed view model onto a neutral, data-only renderable document. There is no template language, no HTML, no expression evaluation, no uploaded template, and no remote fetch, so a business value can never be interpreted. Every string passes one sanitization boundary that removes control characters, collapses whitespace, folds typographic punctuation, and bounds length.
- Renderers are pure JavaScript: `pdfkit` for PDF, with `fontkit` OpenType shaping and `bidi-js` for UAX #9 bidirectional ordering, and `docx` for Word output. None needs a native binary, headless browser, office suite, or shell, so generation adds no machine prerequisite.
- PDF output embeds repository-owned SIL Open Font License Noto faces from `apps/api/assets/fonts`, resolved relative to the module rather than the working directory so the compiled build finds them. Supported scripts are Latin, Latin Extended, Greek, Cyrillic, and Arabic, including mixed Latin/Arabic lines with correct bidirectional ordering and Arabic contextual joining. Coverage is decided per code point by asking the chosen face whether it contains the glyph, not by a Unicode block range; a character no registered face can draw fails closed with `GENERATION_PDF_SCRIPT_UNSUPPORTED`, and nothing is ever substituted or drawn as a missing-glyph box.
- PDF text is real text in both senses: the glyphs on the page are the shaper’s contextual forms in UAX #9 visual order, and every drawn glyph maps back to the source characters, so copying, searching, and extracting an Arabic or mixed line returns the exact source Unicode.
- View models are built server-side from one authoritative snapshot; the renderer never queries the database. Issued invoice lines and totals are copied verbatim from the immutable issued snapshot, nothing is recomputed, and placement eligibility is never re-evaluated.
- Eligibility follows merged lifecycle semantics: a quotation must be issued, accepted, rejected, or expired; a purchase order must not be canceled or archived; a contract must not be canceled or archived; only an issued, non-canceled, non-archived invoice produces an invoice output; and a certificate requires the merged training readiness rule, so `NOT_APPLICABLE` and `ISSUED` are both refused. Generating a certificate never transitions the enrollment: issuance stays the explicit audited training action.
- Logical document identity is one document per source record, output family, and language. First generation creates version 1; regeneration adds version N+1 and never overwrites a historical version or its bytes. A publish locks in this order: the rendered source rows parent-first, then `Document`, then `DocumentVersion`.
- Idempotency keys are resolved globally. The same key with the same effective request returns the original version; the same key against a different source, output family, language, or template is a deterministic `GENERATION_IDEMPOTENCY_KEY_CONFLICT`.
- Storage and PostgreSQL are not one transaction, and the boundary is documented rather than claimed away: bytes are rendered in memory, published to a server-generated storage key, and only then committed inside a transaction. A failed transaction deletes the object this attempt published and never touches a historical object, so the database never references missing bytes and at most one unreferenced object can be left if compensation itself fails.
- Authorization requires `documents:generate` plus the source domain's own rule: for commercial outputs the matching `*:view` capability, `commercial_data:access`, and the merged client/mission record scope; for certificates the merged training program visibility rule plus `training_enrollments:view`, and the participant's own source-domain read capability before the participant name is rendered. Generated-document detail, version listing, and both current and historical downloads re-authorize the underlying source at request time, and the same rule is mirrored in the document list predicate, so a leaked document UUID cannot bypass the source domain. Hidden and nonexistent sources share one envelope.
- Out of scope and unchanged: candidate summaries, interview reports, generic HR templates, an arbitrary template editor, e-signature, delivery by email or WhatsApp, payment receipts, accounting exports, payroll documents, OCR or AI extraction, and any client or candidate portal.

### Review blockers found and addressed

The first ChatGPT review of PR #51, on head `0fb4ab5a0b4f845b0e767cc6347279c8447afe07`, returned four blocking findings. All four are fixed.

1. **Generated certificates did not re-check the participant source on read.** Generation already required the participant's own source-domain capability before rendering a name, but document detail, version listing, and downloads only checked enrollment and program visibility, so a certificate document identifier could disclose a candidate or client-contact name the actor could not otherwise read. `DocumentsService` now applies the same participant rule (`candidates:view` for a candidate; `clients:view` plus `client_contacts:view` for a client contact; internal users and external participants stay training-owned) on detail, version listing, current and historical downloads, and as a predicate in the document list.
2. **A stale source snapshot could be committed.** Rendering happens outside any transaction, and mutable generation-eligible records such as a draft purchase order or contract can change while a file renders, which the lifecycle check alone could not detect. Every generated version now records a `sourceSnapshotSha256` fingerprint over exactly the authoritative fields the output renders, including ordered line rows. The source is re-read inside the publishing transaction, the fingerprint is recomputed, and a mismatch rejects with `GENERATION_SOURCE_CHANGED` and compensates the published object. No row lock is held across rendering or storage I/O.
3. **The renderer could silently alter authoritative text.** Sanitization no longer truncates at 500 characters and no longer substitutes characters, and PDF table cells no longer clip to one physical line. Text wraps across lines and pages, an unbroken token is split rather than dropped, explicit line breaks are preserved, and DOCX carries full Unicode untouched. The PDF standard-font repertoire is now the complete WinAnsi set, so the French `oe` ligature, the euro sign, and typographic punctuation render properly; text a standard font genuinely cannot encode fails with `GENERATION_PDF_UNSUPPORTED_CHARACTERS` instead of being corrupted, and the Word output remains available for it.
4. **The web download control did not download.** It now routes the protected-endpoint blob through the repository's existing object-URL pattern: create the object URL, click a temporary anchor carrying the authorized filename, remove the anchor, and revoke the URL. No storage key is ever exposed.

Hardening in the same pass: a bounded French/English selector on the generation control, caught API failures with a bounded error state, generation buttons disabled for lifecycle-ineligible records, version history gated on `documents:view` so an actor with only `documents:generate` degrades gracefully, a `DocumentVersion` check constraint that additionally requires `generationIdempotencyKey` and `sourceSnapshotSha256` on every generated version, and protected storage publication through a temporary file plus an atomic link so a failed write can never leave a partial object at the final key.

### Second review round, three blockers addressed

The second ChatGPT review, on head `71d3465e4ffd195656b2ac76985b3dfbcc3a6164`, accepted the four earlier fixes and returned three further blocking findings. All three are fixed.

1. **Source stability was provenance, not an invariant.** Comparing fingerprints inside the transaction still left a window in which a concurrent mutation could commit between the comparison and the version insert. The publishing transaction now takes a **shared row lock on every row whose values the output renders** before that comparison: the commercial client, the optional recruitment mission, and the commercial root, whose exclusive lock is the only path through which its line rows change; and for a certificate the client, program, enrollment, and the participant record whose name is rendered. Locks are acquired parent-first in the order the merged mutation paths already use, are taken as `FOR SHARE` so concurrent generations never block one another, and are never held across rendering or storage publication.
2. **PDF Unicode support was incomplete.** The renderer moved from `pdf-lib` standard fonts to `pdfkit` with embedded Noto faces, `fontkit` OpenType shaping, and `bidi-js` UAX #9 ordering, so Arabic renders as joined contextual forms in correct right-to-left order and mixed Latin/Arabic lines order correctly. The old `GENERATION_PDF_UNSUPPORTED_CHARACTERS` path is replaced by a narrower `GENERATION_PDF_SCRIPT_UNSUPPORTED` that only triggers for scripts no bundled face covers.
3. **Project-memory dates were future-dated.** D-054 and the Issue #49 migration timestamp were dated 2026-09-09 while the repository date is 2026-09-08; both are corrected, and the migration is renamed to `20260908160000_document_output_generation`, which still sorts after the merged tail.

### Final review gate, three findings addressed

The ChatGPT final gate, on head `78620f2a5de640d0a66dbc469aa3334b96fab991`, returned two PDF fidelity findings and one documentation correction. All three are fixed.

1. **Arabic PDF text was drawn correctly but did not extract as source Unicode.** Noto Sans Arabic decomposes a dotted letter into a dotless skeleton plus a separate dots glyph, so one glyph serves several letters and the dots glyph carries no source characters at all. PDFKit keys its `ToUnicode` map by glyph id and writes an empty destination for an unattributed glyph, which loses characters and confuses `س` with `ش`. The renderer now allocates a distinct CID per *(glyph, code points)* pair, re-creates glyph objects so each occurrence reports its own characters, and maps a glyph that stands for no source character to U+2060 WORD JOINER instead of to an empty destination. Fixing the same seam also supplies the shaping direction UAX #9 resolved and draws a whole same-face stretch of a line as one text object, which corrected two rendering defects found while proving the first: PDFKit laid right-to-left words out left to right, and fontkit reversed Arabic-Indic digits inside Arabic. Nine round-trip vectors now assert exact source recovery through `pdfjs-dist`, and separate assertions read the content stream directly to prove page order; the vacuous assertion and the placeholder filtering the review named are gone.
2. **Font coverage was decided by Unicode ranges rather than by the faces.** `font-registry.ts` now parses every registered face with `fontkit` and answers coverage with `hasGlyphForCodePoint` for the weight that will draw the character, trying the block hint first and then the approved fallbacks. The range classifier remains as a routing optimisation only. A character the classifier admits but no face contains — Armenian, which shares a span with Latin Extended, Greek, and Cyrillic — is now refused with `GENERATION_PDF_SCRIPT_UNSUPPORTED` rather than drawn as a box, and a neutral character the surrounding face lacks, such as `€` inside Arabic, opens a run in a face that has it.
3. **The service lock comment was stale.** It still described locking only `Document` then `DocumentVersion` and claimed source rows were never locked, which the second round had already made untrue. It now describes the real order: stabilize the rendered source rows parent-first, fingerprint, lock or create `Document`, insert `DocumentVersion`, commit.

Hardening in the same pass: the shared-lock helper no longer takes a table name as text and no longer uses `$queryRawUnsafe`; a closed `LockableTable` union selects a written-out parameterized statement per table, so no caller can route text into SQL. The unused `pdf-lib` dependency is removed and `fontkit` becomes a direct dependency, since the registry now uses it at runtime.

## Issue #52 UI/UX v1 State

- Branch `design/ui-ux-v1` started from authoritative `main` `e2879b38c54dcc1b42b85aa345680260487454dc`.
- `docs/design/HIREME_UI_DNA.md` is the canonical visual source of truth. It defines exact semantic colors, type, spacing, radii, borders, elevation, motion, density, responsive behavior, interaction states, composition, data-visualization, accessibility, raw-value, and future dark-mode rules.
- Web CSS is layered through `tokens.css`, `reset.css`, `base.css`, `components.css`, and `utilities.css`; the root stylesheet is an import entry. Raw color literals outside `tokens.css` fail `pnpm check:styles`, which also calculates the required WCAG contrast pairings.
- The restrained deep teal brand descends from the historical app color and is paired with neutral-first surfaces. Internal compact, internal standard, and public spacious contexts use the same identity with different control and spacing rhythms.
- The foundation set is limited to Button, field/input/select/checkbox controls, StatusBadge, InlineMessage, Skeleton, and EmptyState. No component framework or new dependency was added.
- `apps/web/design-system.html` is a development-only, synthetic, API-free preview entry and is not linked from production navigation or included in the normal production build entry.
- Owner review `5153241889` corrections keep danger hover/pressed states inside the destructive color family, add a visible check marker to the selected preview row, remove undocumented display tracking, extend deterministic contrast coverage, and make inline messages non-live by default with explicit announcement behavior for dynamic feedback.
- The maintainer approved the Phase 1 foundation on 2026-09-09 and authorized Task 2.
- Task 2 hosts every authenticated internal module in a single `AppShell` while leaving login and public opportunity routes outside it. One navigation definition owns route paths, permission visibility, and generic direct-route denial; History API navigation now also restores `popstate`.
- The shell groups Workspace, Recruitment, Operations, Business, and System destinations; removes unauthorized items and empty groups; shows `aria-current` plus a visible marker; and exposes only compact API health, display name, email, refresh, and sign-out session chrome.
- At and below 900px (`56.25rem`) the sidebar becomes an off-canvas modal-style navigation region with a scrim, explicit close control, Escape handling, focus containment/restoration, inert background content, and 44px touch targets; 1024px retains the persistent laptop shell. Route changes focus the main content target and a skip link is present.
- `PageHeader` supplies the canonical internal title, concise purpose, optional metadata, and wrapping action group. Button labels do not shrink or wrap. The padded 100vh sidebar uses border-box sizing, its navigation is the flexible scroll region, and its session footer remains fully reachable. Existing module panels retain their business behavior and density; no representative module redesign is included.
- `apps/web/app-shell.html` is a second development-only, synthetic, API-free review entry and remains outside product navigation and the normal production build.
- Candidate workspace, Recruitment/Reporting dashboard, and Public Opportunity representative redesigns remain intentionally untouched. Recruitment/Reporting is next only after AppShell visual approval.

## Issue #54 Localization State

- Branch `feat/web-i18n-en-fr` started from authoritative `main` `a0236fe66936891d8235236c924e652c8067ab13`, the PR #53 merge commit.
- `apps/web/src/i18n` holds the whole localization layer: `locale.ts` (allow-list, metadata, selection, persistence), `message.ts` (plural shape), `messages/en.ts` (canonical dictionary and the `Messages` contract), `messages/fr.ts`, `messages/index.ts` (static frozen dictionary map), `translate.ts` (typed key paths, lookup, interpolation, plurals), `format.ts` (`Intl` helpers), `context.ts`, `I18nProvider.tsx`, and `useI18n.ts`. No third-party i18n dependency was added.
- English is canonical. French is annotated with `Messages`, so a missing, extra, renamed, or misspelled key fails `pnpm typecheck`. The canonical dictionary is `as const`, so `MessageKey`, each key's required `{placeholder}` names, and its count requirement are all derived from it: `t('overview.signedInAs')`, `t('overview.signedInAs', { name })`, and `t('common.counts.candidates')` are compile errors. `translate.type-test.ts` holds that contract through `@ts-expect-error`, exercised by `pnpm typecheck`. Runtime lookup, interpolation, and plural misuse still throw as defence in depth.
- Structural typing cannot prove that a translator kept a template's placeholder names, so deterministic tests assert cross-locale parity: identical placeholder sets for ordinary messages, and identical non-count placeholder sets for count-sensitive ones, with `count` compared separately and plural categories free to differ per locale.
- Deferred English surfaces declare their own language. `LegacyEnglishContent` renders one `display: contents` boundary with `lang="en"`, so the document stays on the active locale while untranslated content is announced correctly. `deferredEnglishRoutes` names the ten internal destinations it covers; the public opportunity list and detail are wrapped at the routing layer. The translated Overview, permission denial, and login screen carry no boundary.
- `Locale` is `'en' | 'fr'`. English formats as `en-GB` and French as `fr-FR`. `LocaleMetadata` carries `direction`, currently `ltr` for both; RTL layout is not implemented and `dir` is untouched.
- Selection order is a valid stored preference, then a browser language starting with `fr`, then English. The value lives in `localStorage` under `hireme.locale`, is validated before use, holds no token or business data, and never reaches an import specifier or path.
- The provider wraps the whole application, so the public opportunity routes already share the active locale even though their copy stays English until their own redesign. `document.documentElement.lang` follows the locale.
- Translated in this task: the `AppShell` (brand subtitle, skip link, navigation regions, group and destination labels, API health, identity chrome, refresh, sign out, menu and drawer controls), the `PageHeader`-hosted authenticated Overview, the login screen, the permission-denied surface, shared `common.*` action and count labels, and the synthetic AppShell preview. Navigation carries typed message keys instead of display text.
- Deliberately untranslated: every legacy business module panel in `App.tsx` (administration, clients, candidates, missions, tasks, documents, training, reporting, commercial, accounting) and the public opportunity pages. They migrate when each is redesigned. Reporting is first and must be bilingual from its initial redesign.
- The language control is one native `<select>` in the shell session region, labelled `Language`/`Langue`, with each language named in its own language and no flags. It stays inside the mobile drawer with a 44px target.
- Domain values stay language-neutral. `domain.recordState.ACTIVE|DRAFT|ARCHIVED` is a presentation mapping keyed by the stored value; the preview demonstrates it through `StatusBadge` and no localized label is ever returned to the API.
- No database change: no `preferredLocale` column and no migration.
- `.ui-page-header__metadata` now wraps its items as a group so a longer translation of one field cannot collide with the next.
- Web tests went from 59 to 121. The 62 new tests cover locale resolution and persistence, allow-list rejection, dictionary and placeholder parity, markup-free values, typed lookup failure, interpolation, `Intl.PluralRules` plurals in both locales, `Intl` number/date/currency formatting with an explicit timezone and explicit `MAD`/`EUR` codes, live language switching, unchanged route and destinations, absence of API calls on switch, sign-out after switching, `documentElement.lang`, the public/auth boundary, and the language-of-content boundary for deferred internal and public surfaces.
- Verified manually at 390, 430, 800, 1024, and 1440 px in both locales: no clipping, no horizontal shell overflow, session controls in view, `<= 900px` off-canvas and `> 900px` persistent unchanged.

## Closed without merge

- PR #42 (Cursor Cloud development environment) was closed without merge as obsolete environment-specific guidance. Nothing from it is pending.
- Issue #12 (recruitment/training contract document taxonomy) is closed as completed through the merged Issue #35 document foundation, which keeps `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` as distinct taxonomy values.

## Current open technical questions

- Microsoft 365 authentication and account-linking strategy.
- MFA, password reset, registration, invitation, and forced first-login password-change sequencing.
- Arbitrary role creation and permission-editing workflow design.
- Production secret rotation and emergency session invalidation playbooks.
- Distributed authentication rate limiting.
- Background-job technology.
- Production file-storage provider.
- Advanced-search implementation.
- Real-time messaging and notification transport.
- Detailed per-module permission names beyond the implemented administration, client CRM, candidate profile, recruitment mission, and mission-candidate process catalogs.
- Dashboard formulas and revenue authorization rules.
- Production public opportunity URL strategy beyond opaque slugs, CAPTCHA provider, production malware scanner, production storage provider, public upload retention schedule, and applicant duplicate-review workflow.
- Commercial numbering/correction policy beyond unique caller-supplied references, payment allocation, overdue handling, expenses, client balances, revenue/profitability, and settlement rules.
- Integration synchronization and retry policies.

## Immediate next actions

1. Review the Issue #54 localization foundation on draft PR #55, including the French shell at `http://127.0.0.1:5173/app-shell.html`; keep the PR open/unmerged.
2. After acceptance only, continue Issue #52 with the Recruitment/Reporting representative surface, built bilingual from its first commit. Candidate and Public Opportunity redesigns remain later checkpoints.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
