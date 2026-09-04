# Project Status

Last updated: 2026-09-04
Status owner: repository maintainer

## Overall state

**Phase:** Training operations foundation (Phase 9) after merged task-management, document-management, and recruitment-reporting foundations.
**Health:** Issue #31 (PR #32), Issue #35 (PR #40), and Issue #36 (PR #43) are merged into `main`. Issue #37 is implemented on branch `feat/training-operations` as a draft PR. The branch was started from `main` at `cebd87ffa0f3686418e2244570a1b1d40f995541` (PR #44 coordination rules) and then integrated latest `main` at `6ff19ad2a03f3f6dc6bdbbf00be9db68d6779a2a` (PR #43 recruitment reporting). Both the merged reporting behavior and the Issue #37 training behavior are preserved.
**Parallelization:** Issue #38 (commercial/accounting, including training commercial records) is being implemented concurrently by another agent. Issue #37 does not depend on that branch and implements no pricing, billing, invoicing, payment, revenue, or profitability behavior.
**Current blocker:** Issue #37 awaits ChatGPT review and exact-head GitHub Actions on its draft PR.
**Next executable development task:** Human/ChatGPT review gate for the Issue #37 draft PR, kept open and unmerged.

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
| Issue #33 | Open | Reconcile project memory after Issue #29 / PR #30 merge | Superseded by later merges; revisit if still needed |
| Issue #35 | Complete | Implement document management foundation and contract taxonomy, incorporating Issue #12 | Merged via PR #40 into `main` |
| Issue #36 | Complete | Implement recruitment reporting, KPI dashboards, and safe exports | Merged via PR #43 into `main` |
| Issue #37 | Open | Implement training operations foundation: programs, sessions, enrollment, and attendance | Await ChatGPT review and exact-head CI on the draft PR from branch `feat/training-operations`; keep it open/unmerged |

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

- Issue #35 implements the internal document-management foundation on top of the current `main`, which now includes merged Issue #31 task-management functionality.
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
- After integrating latest `main` (PR #43 recruitment reporting), the full suite was rerun from a clean database. `pnpm test:db` totals 173 PostgreSQL integration tests across 14 files (140 merged baseline + 33 training).

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
- Commercial accounting numbering, correction, VAT/tax, partial-payment allocation, and profitability rules.
- Integration synchronization and retry policies.

## Immediate next actions

1. Review the Issue #37 draft PR on branch `feat/training-operations` and keep it open/unmerged until review completes.
2. Issue #38 may proceed in parallel (commercial/accounting, including training commercial records); Issue #39 remains blocked by Issue #38.
3. Require latest-`main` incorporation plus a clean-database migration, double seed, and full integration run from whichever of the remaining Prisma-heavy branches merges after Issue #37.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
