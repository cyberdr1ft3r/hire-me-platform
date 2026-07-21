# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 is complete through merged PR #8; the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI foundation are active on `main`.
- Issue #3 is in progress on branch `feat/foundational-prisma-schema`.
- Issue #3 implements the foundational Prisma schema, initial migration, development seed, database lifecycle commands, and PostgreSQL integration tests.

## Next Action

Review the issue #3 draft PR after it is opened from `feat/foundational-prisma-schema`.

Check especially:

- Prisma schema coverage for required issue #3 entities and approved relationships;
- candidate-to-mission history through `MissionCandidate`;
- multiple recruiters per mission through `MissionRecruiter`;
- multiple client contacts per client;
- normalized roles and permissions through join models;
- document ownership, visibility, and version metadata;
- explicit archival strategy and deliberate foreign-key behavior;
- development seed containing only approved roles and safe synthetic permissions;
- migration, reset, seed, Prisma Studio, and database-test commands;
- PostgreSQL integration-test evidence in CI;
- absence of controllers, services, auth flows, pages, real personal data, client data, CV content, or confidential records.

## Verification Notes

Completed locally by Codex before opening the issue #3 PR:

- `pnpm install`
- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- migration SQL generation from the Prisma schema

Pending before completion:

- `pnpm prisma:migrate:deploy` against real PostgreSQL
- `pnpm prisma:seed`
- `pnpm test:db`
- `pnpm format:check`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Blocked locally:

- `docker compose up -d postgres` cannot start PostgreSQL in the Codex local environment because Docker Desktop/daemon is unavailable. Real PostgreSQL migration, seed, and integration-test verification should be confirmed through GitHub Actions.

GitHub Actions:

- The workflow is being extended to run Docker Compose PostgreSQL health, migration deploy, seed, database integration tests, install, Prisma validation, format check, lint, typecheck, tests, and build.
- Confirm the latest PR check result after pushing the issue #3 branch.

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
