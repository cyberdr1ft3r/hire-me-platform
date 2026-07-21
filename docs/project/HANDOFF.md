# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 implementation has been prepared on branch `chore/bootstrap-typescript-monorepo`; PR #8 is open as a draft.
- The latest PR #8 blocking review about Docker Compose PostgreSQL health verification has been addressed with a dedicated GitHub Actions job on the same branch.
- Issue #3 must not start until issue #2 is reviewed and merged.

## Next Action

Review PR #8 from `chore/bootstrap-typescript-monorepo`.

Check especially:

- pnpm workspace and Turborepo root scripts;
- `apps/web` React + Vite placeholder and API health display;
- `apps/api` NestJS structured `GET /health` endpoint;
- `packages/config` shared TypeScript configuration;
- `packages/contracts` shared health contract;
- Docker Compose PostgreSQL service and health check;
- GitHub Actions Docker Compose PostgreSQL health job;
- Prisma datasource wiring without business models;
- safe `.env.example` placeholders and startup environment validation;
- root `.env` loading for API development/startup and Vite environment loading;
- consistent `127.0.0.1` local web/API/CORS URLs;
- GitHub Actions parity with local quality commands;
- README fresh-clone setup accuracy;
- absence of authentication, business modules, business schema, real personal data, client data, or CV content.

## Verification Notes

Completed locally by Codex:

- `pnpm install`
- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- API runtime check for `GET /health`
- Web dev server strict-port check on `127.0.0.1:5173`
- Root `.env` loading correction for API and web development paths
- GitHub Actions Docker Compose PostgreSQL health job added

Blocked locally:

- `docker compose up -d postgres` could not start PostgreSQL in the Codex local environment because Docker Desktop/daemon was unavailable. CI now verifies the Docker Compose health path on Ubuntu.

GitHub Actions:

- The workflow is configured to run Docker Compose PostgreSQL health, install, Prisma validation, format check, lint, typecheck, tests, and build.
- Confirm the latest PR check result after each pushed correction.

## Mandatory Rehydration Checklist For Every New Agent

Before working:

- Read `AGENTS.md`.
- Read `PROJECT_MEMORY.md`.
- Read `docs/project/STATUS.md`.
- Read `docs/project/DECISIONS.md`.
- Read this handoff.
- Read the full assigned issue and all comments.
- Inspect relevant merged documentation and active pull requests.
- Load all materially applicable project skills, including `project-memory`.
- State the active skills and current source-of-truth understanding.

Before finishing:

- Update `STATUS.md`.
- Replace this handoff with the next concrete action.
- Update the decision and risk logs when applicable.
- Link the issue and pull request that support changes.
- Report checks performed and remaining blockers.
