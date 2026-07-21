# Project Status

Last updated: 2026-07-21
Status owner: repository maintainer

## Overall state

**Phase:** Authentication and authorization foundation
**Health:** Issue #10 draft PR #11 is review-ready after CI passed.
**Current blocker:** None known.
**Next executable development task:** Maintainer review of draft PR #11.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | Complete | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | No action |
| Issue #3 | Complete | Implement the foundational Prisma schema and database lifecycle | No action |
| Issue #10 | In review | Implement local authentication, session security, RBAC resolution, and authentication audit logs | Maintainer review of draft PR #11 |

## Completed foundation work

- Private GitHub repository created.
- Initial README added.
- Codex repository instructions and project-local skills added.
- Discovery and clarification questionnaires completed and analyzed.
- Issue #5 completed through merged PR #6, establishing persistent repository memory, goals, status, roadmap, decisions, risks, and agent handoffs.
- Issue #1 completed through merged PR #4, establishing the approved product scope, architecture, domain model, workflows, and permissions.
- Issue #3 completed through merged PR #9, establishing the foundational Prisma schema, migration, role/permission seed, API-owned Prisma boundary, and database lifecycle checks.
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

- Local email/password authentication, Argon2id password credentials, rotating hashed refresh sessions, reuse detection, secure refresh-cookie handling, in-memory web access-token handling, normalized permission resolution, deny-by-default guards, and safe authentication audit logs are implemented on `feat/auth-rbac-foundation`.
- The API uses one Nest-managed Prisma provider for runtime code. The development bootstrap script and database tests remain separate-process/test exceptions.
- Unit tests cover password hashing and token validation. Web tests cover login/logout and confirm browser storage is not used for tokens. PostgreSQL integration tests cover login, refresh rotation, reuse detection, logout, permission enforcement, audit safety, and development bootstrap idempotency.
- Draft PR #11 is open. GitHub Actions run `29847170395` passed PostgreSQL health, clean Prisma regeneration, migration deploy, seed twice, development admin bootstrap twice, database integration tests, and quality checks.

## Current open technical questions

- Microsoft 365 authentication and account-linking strategy.
- MFA, password reset, registration, and user-management workflow sequencing.
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

1. Review draft PR #11.
2. Accept or request changes on authentication security, cookie handling, RBAC resolution, audit safety, database lifecycle evidence, and scope exclusions.
3. Merge issue #10 only after maintainer approval.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
