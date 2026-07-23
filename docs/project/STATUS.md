# Project Status

Last updated: 2026-07-23
Status owner: repository maintainer

## Overall state

**Phase:** ATS recruitment workflow foundation
**Health:** Issue #23 implementation is complete in draft PR #24; the interview/evaluation schema, API, contract, web, documentation, database tests, and quality gates have passed locally.
**Current blocker:** GitHub Actions has not reported checks for the latest PR #24 branch head even after corrective pushes and a close/reopen retry; local validation is complete.
**Next executable development task:** Review draft PR #24 and confirm GitHub Actions scheduling for the latest branch head.

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
| Issue #23 | Draft PR open | Implement interviews and structured candidate evaluations under mission-candidate processes | Review PR #24 and CI |

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
- Confirmed requirements now include detailed recruitment workflows, multiple recruiters per mission, client access, multi-session training attendance, document versioning, messaging, dashboards, outputs, integrations, migration scale, and scoped permissions.

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
- Normal client/contact permissions are seeded only to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`; unresolved team or assigned scopes do not receive broad client access by default.
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
- The API exposes permission-code guarded nested `/v1/missions/:missionId/candidates` endpoints with shared Zod contracts, safe DTOs, permanent `(missionId, candidateId)` uniqueness, responsible-recruiter ownership, explicit presentation, and manual integration confirmation.
- The implemented pipeline uses the approved states `NEW`, `CV_TO_REVIEW`, `HR_PRESELECTION`, `HR_INTERVIEW_SCHEDULED`, `HR_INTERVIEW_COMPLETED`, `TECHNICAL_TEST`, `INTERNAL_VALIDATION`, `PRESENTED_TO_CLIENT`, `CLIENT_INTERVIEW_1`, `CLIENT_INTERVIEW_2`, `CLIENT_OFFER`, `ACCEPTED`, `INTEGRATED`, `PROBATION_COMPLETED`, `PROCESS_COMPLETED`, plus `WAITING`, `POSTPONED`, `CANDIDATE_REJECTED`, `CLIENT_REJECTED`, `WITHDRAWN`, and `TALENT_POOL`.
- Optional skips are limited to `HR_INTERVIEW_COMPLETED` to `INTERNAL_VALIDATION` and `CLIENT_INTERVIEW_1` to `CLIENT_OFFER`; both require an explicit skip request, reason, and audit history.
- Candidate profile and compensation values remain live source-of-truth data from `Candidate`; mission-candidate records do not snapshot salary/profile values.
- Client visibility starts only after explicit presentation. Linking a candidate to a mission remains internal-only.
- Manual integration confirmation increments filled placement count once and does not close the mission automatically.
- PR #22 blocking-review correction makes `PRESENTED_TO_CLIENT` reachable only through the dedicated presentation action, which atomically sets visibility, timestamp, presenter identity, process event, and safe audit event. Generic transition attempts return `MISSION_CANDIDATE_PRESENTATION_ACTION_REQUIRED` without partial metadata.
- PR #22 blocking-review correction makes repeated integration confirmation a true no-op that preserves placement count, confirmation metadata, process-event history, and audit history.
- Mission-candidate writes use the documented PostgreSQL lock order from D-033.
- Local checks after the PR #22 blocking-review correction passed: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm prisma:migrate:deploy`, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db` with 54 PostgreSQL integration tests passing, `pnpm check:architecture`, static Mermaid validation for all 8 documentation diagrams, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- Actual Mermaid CLI rendering could not run locally because no renderer is installed and temporary `@mermaid-js/mermaid-cli` download/execution was rejected by approval policy.

## Issue #23 Verification State

- Interview and structured-evaluation implementation is complete in draft PR #24 on branch `feat/interviews-evaluations`.
- The API exposes permission-code guarded nested interview and evaluation endpoints under mission-candidate processes.
- The implementation refines the existing provisional `Interview` and `CandidateEvaluation` models and adds explicit `InterviewParticipant` and `InterviewEvent` records.
- Client interviews require explicit mission-candidate presentation, and client interview 2 requires an appropriately progressed first client interview.
- Interview writes use the established lock order: parent `RecruitmentMission`, existing `MissionCandidate`, parent `Candidate`, then `Interview` when applicable.
- Evaluations are structured business records with bounded scores, recommendations, strengths, weaknesses, risks, comments, explicit idempotent finalization, and permission-aware redaction.
- PR #24 blocking-review correction makes repeated and concurrent interview cancellation a true no-op after the first state change, preserving the original `canceledAt`, cancellation event, reason history, and audit history.
- Local checks passed after the cancellation-idempotency correction: focused `interviews.integration.test.ts` regression coverage, `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm prisma:migrate:deploy`, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db` with 61 PostgreSQL integration tests passing, `pnpm check:architecture`, Mermaid CLI rendering for all 10 documentation diagrams, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- `pnpm test:db` initially failed in the local shell because authentication test secrets were intentionally absent from `.env`; it passed after setting safe synthetic `AUTH_ACCESS_TOKEN_SECRET` and `AUTH_REFRESH_TOKEN_PEPPER` values for the command invocation only.
- `pnpm build` passed with Vite's existing large-chunk advisory warning.

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
- Integration synchronization and retry policies.

## Immediate next actions

1. Review draft PR #24 and CI.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
