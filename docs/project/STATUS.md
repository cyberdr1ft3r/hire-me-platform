# Project Status

Last updated: 2026-07-21
Status owner: repository maintainer

## Overall state

**Phase:** Persistence foundation
**Health:** Implementation in progress
**Current blocker:** PR #9 blocking review requested deterministic Prisma package boundaries and clean generated-client regeneration evidence.
**Next executable development task:** Review the updated issue #3 draft PR after boundary fixes and CI rerun.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | Complete | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | No action |
| Issue #3 | In review | Implement the foundational Prisma schema and database lifecycle | Review PR #9 for schema coverage, API-owned Prisma boundary, migration safety, seed contents, and PostgreSQL integration-test evidence |

## Completed foundation work

- Private GitHub repository created.
- Initial README added.
- Codex repository instructions and project-local skills added.
- Discovery and clarification questionnaires completed and analyzed.
- Issue #5 completed through merged PR #6, establishing persistent repository memory, goals, status, roadmap, decisions, risks, and agent handoffs.
- Issue #1 completed through merged PR #4, establishing the approved product scope, architecture, domain model, workflows, and permissions.
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

- Foundational Prisma schema implementation is in progress.
- Initial migration is being prepared from the approved domain model.
- Development seed is limited to the eight approved roles and safe synthetic permissions.
- Prisma is owned by `apps/api` with one explicit generated output under `apps/api/prisma/generated/client`.
- `pnpm check:architecture` verifies that web/contracts remain ORM-independent and that no generated Prisma client is committed.
- Database lifecycle CI runs migrations, seed, and PostgreSQL integration tests after clean Prisma regeneration.

## Current open technical questions

These are not blockers for the issue #2 implementation PR:

- Authentication provider and session model.
- Background-job technology.
- Production file-storage provider.
- Advanced-search implementation.
- Real-time messaging and notification transport.
- Detailed per-module permission names.
- Dashboard formulas and revenue authorization rules.
- Integration synchronization and retry policies.

## Immediate next actions

1. Review PR #9 after the blocking-review fixes are pushed.
2. Confirm GitHub Actions applies migrations to PostgreSQL, runs the seed twice, passes database integration tests, and proves clean Prisma regeneration.
3. Confirm local quality checks, Prisma validation/generation, architecture boundary checks, and build/test commands pass.
4. Merge issue #3 only after schema coverage, Prisma boundary behavior, deletion behavior, seed safety, and database lifecycle evidence are accepted.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
