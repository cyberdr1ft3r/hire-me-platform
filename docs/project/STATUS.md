# Project Status

Last updated: 2026-07-22
Status owner: repository maintainer

## Overall state

**Phase:** Core recruitment CRM foundation
**Health:** PR #18 blocking permission-boundary fix passed local quality and PostgreSQL validation.
**Current blocker:** None locally.
**Next executable development task:** Review draft PR #18.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | Complete | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | No action |
| Issue #3 | Complete | Implement the foundational Prisma schema and database lifecycle | No action |
| Issue #10 | Complete | Implement local authentication, session security, RBAC resolution, and authentication audit logs | No action |
| Issue #13 | Complete | Implement secured internal user administration, role assignment, status management, permission visibility, central active-user authorization, and session revocation | No action |
| Issue #15 | Complete | Implement client organization and client-contact CRM | No action |
| Issue #17 | In progress | Implement reusable candidate master records and structured candidate profiles | Review draft PR #18 |

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

- Candidate master/profile implementation is in progress on branch `feat/candidate-profiles`.
- The API exposes permission-code guarded `/v1/candidates` endpoints with shared Zod contracts, safe DTOs, structured skills/languages/work-experience/education nested routes, candidate-child ownership checks, archival lifecycles, and safe audit summaries.
- Candidate normalized email uses the existing global unique constraint and rejects duplicates without automatic merging.
- Candidate archival and dependent candidate/profile writes share one transaction-scoped PostgreSQL row lock on the parent `Candidate`.
- Candidate compensation fields require `candidate_compensation:*` permissions; candidate consent fields require `candidate_consent:*` permissions.
- Normal candidate/profile permissions are seeded only to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`; only `SUPER_ADMIN` receives candidate compensation and consent permissions by default.
- PR #18 blocking security review was addressed by making candidate detail and mutation responses respect `candidate_profile:view` independently from candidate mutation permissions. Callers without `candidate_profile:view` receive empty structured profile arrays even when create/update/status/archive mutations are allowed.
- Local checks after the blocking fix passed: `pnpm prisma:validate`, `pnpm prisma:generate`, fresh migration deploy, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice after reset, `pnpm test:db`, `pnpm check:architecture`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- `pnpm test:db` now includes a PostgreSQL-backed regression test for a synthetic mutation-capable role without `candidate_profile:view`; 42 database integration tests passed locally.
- Local PostgreSQL validation used Docker Compose with `POSTGRES_PORT=55432` because another project already occupied `127.0.0.1:5432`.
- Draft PR #18 is open, linked with `Closes #17`, and GitHub Actions run `29875687083` passed PostgreSQL Docker Compose health, migration/seed/database integration tests, and quality checks.

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
- Detailed per-module permission names beyond the implemented administration, client CRM, and candidate profile catalog.
- Dashboard formulas and revenue authorization rules.
- Integration synchronization and retry policies.

## Immediate next actions

1. Review candidate authorization, lifecycle transitions, archival behavior, audit safety, web/contracts Prisma isolation, and excluded scope.
2. Merge Issue #17 only after maintainer approval.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
