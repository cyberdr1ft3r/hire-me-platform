# Project Status

Last updated: 2026-07-21
Status owner: repository maintainer

## Overall state

**Phase:** Secured internal administration foundation
**Health:** PR #14 security-review fix is implemented and PR checks are the source for the latest CI result.
**Current blocker:** Local Docker Desktop is unavailable, so database checks are confirmed by GitHub Actions.
**Next executable development task:** Confirm PR #14 CI and maintainer review.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | Complete | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | No action |
| Issue #3 | Complete | Implement the foundational Prisma schema and database lifecycle | No action |
| Issue #10 | Complete | Implement local authentication, session security, RBAC resolution, and authentication audit logs | No action |
| Issue #13 | In review | Implement secured internal user administration, role assignment, status management, permission visibility, and session revocation | Confirm PR #14 CI and maintainer review |

## Completed foundation work

- Private GitHub repository created.
- Initial README added.
- Codex repository instructions and project-local skills added.
- Discovery and clarification questionnaires completed and analyzed.
- Issue #5 completed through merged PR #6, establishing persistent repository memory, goals, status, roadmap, decisions, risks, and agent handoffs.
- Issue #1 completed through merged PR #4, establishing the approved product scope, architecture, domain model, workflows, and permissions.
- Issue #3 completed through merged PR #9, establishing the foundational Prisma schema, migration, role/permission seed, API-owned Prisma boundary, and database lifecycle checks.
- Issue #10 completed through merged PR #11, establishing local authentication, Argon2id password credentials, rotating refresh sessions, reuse detection, secure cookies, normalized permission resolution, deny-by-default guards, and safe authentication audit logs.
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
- Draft PR #14 is open. GitHub Actions run `29861073885` passed PostgreSQL Docker Compose health, migration deploy, seed twice, database integration tests, and quality checks.
- The latest blocking security review is addressed locally by making the central auth guard explicitly verify current active/not-archived account eligibility and by adding a PostgreSQL-backed regression test that reuses still-unexpired access tokens after suspension and archival.

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
- Detailed per-module permission names.
- Dashboard formulas and revenue authorization rules.
- Integration synchronization and retry policies.

## Immediate next actions

1. Confirm PR #14 CI.
2. Review draft PR #14.
3. Accept or request changes on internal administration authorization, immediate access-token authorization invalidation after suspension/archive, last active `SUPER_ADMIN` invariant protection, session revocation, safe audit logs, web/admin contract isolation, and scope exclusions.
4. Merge issue #13 only after maintainer approval.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
