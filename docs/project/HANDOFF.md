# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 implementation has been prepared on branch `chore/bootstrap-typescript-monorepo`.
- Issue #3 must not start until issue #2 is reviewed and merged.

## Next Action

Review the issue #2 draft PR after it is opened from `chore/bootstrap-typescript-monorepo`.

Check especially:

- pnpm workspace and Turborepo root scripts;
- `apps/web` React + Vite placeholder and API health display;
- `apps/api` NestJS structured `GET /health` endpoint;
- `packages/config` shared TypeScript configuration;
- `packages/contracts` shared health contract;
- Docker Compose PostgreSQL service and health check;
- Prisma datasource wiring without business models;
- safe `.env.example` placeholders and startup environment validation;
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

Blocked locally:

- `docker compose up -d postgres` could not start PostgreSQL because Docker Desktop/daemon was unavailable in the local environment.

GitHub Actions:

- The workflow is configured to run install, Prisma validation, format check, lint, typecheck, tests, and build.
- Confirm the actual PR check result after the draft PR is opened.

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
