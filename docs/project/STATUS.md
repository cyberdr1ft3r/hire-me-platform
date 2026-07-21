# Project Status

Last updated: 2026-07-21
Status owner: repository maintainer

## Overall state

**Phase:** Repository and local development bootstrap
**Health:** Implementation in progress
**Current blocker:** Docker Desktop is not running in the local verification environment, so PostgreSQL container health could not be confirmed by Codex.
**Next executable development task:** Review PR #8 after the environment-loading and CORS-origin correction.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | In progress | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | Review PR #8 for reproducible root `.env` loading, CI parity, and Docker health once Docker is available |
| Issue #3 | Blocked | Implement the foundational Prisma schema and database lifecycle | Start only after issue #2 is reviewed and merged |

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
- Docker Compose PostgreSQL startup could not be confirmed because the Docker daemon was unavailable.

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

1. Review PR #8 after the latest blocking review correction.
2. Run `docker compose up -d postgres` in an environment where Docker Desktop is running and confirm `docker compose ps` reports PostgreSQL healthy.
3. Review GitHub Actions results for the PR and confirm CI runs install, Prisma validation, format check, lint, typecheck, tests, and build.
4. Merge issue #2 only when fresh-clone setup, Docker health, API/web connectivity, local checks, and CI checks are satisfactory.
5. Begin issue #3 only after issue #2 is complete.

## Status Update Rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
