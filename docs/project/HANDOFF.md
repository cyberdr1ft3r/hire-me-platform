# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 is complete through merged PR #8; the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI foundation are active on `main`.
- Issue #3 is in review through draft PR #9 on branch `feat/foundational-prisma-schema`.
- Issue #3 implements the foundational Prisma schema, initial migration, development seed, database lifecycle commands, and PostgreSQL integration tests.
- The latest PR #9 blocking review required deterministic Prisma ownership in the pnpm monorepo: `apps/api` owns Prisma dependencies, schema, generated client output, seed, and database tests; `apps/web` and `packages/contracts` remain ORM-independent.

## Next Action

Review the updated draft PR #9. The latest boundary-fix CI run passed.

Check especially:

- Prisma schema coverage for required issue #3 entities and approved relationships;
- explicit Prisma generator output at `apps/api/prisma/generated/client`;
- generated Prisma client imports routed through `apps/api/src/persistence/prisma/generated-client.ts`;
- absence of Prisma dependencies and imports in `apps/web` and `packages/contracts`;
- `pnpm check:architecture` coverage for Prisma boundary and uncommitted generated output;
- CI proof that generated output is deleted and regenerated before typecheck, tests, build, and database checks;
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

Completed locally by Codex during issue #3 work:

- `pnpm install`
- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`
- migration SQL generation from the Prisma schema

Confirmed through GitHub Actions run `29841648591` after the boundary-fix push:

- `pnpm prisma:migrate:deploy` against real PostgreSQL
- `pnpm prisma:seed` twice
- `pnpm test:db`
- clean Prisma regeneration from an empty `apps/api/prisma/generated/client`
- quality checks and architecture boundary checks

Blocked locally:

- `docker compose up -d postgres` cannot start PostgreSQL in the Codex local environment because Docker Desktop/daemon is unavailable. Real PostgreSQL migration, seed, and integration-test verification should be confirmed through GitHub Actions.

GitHub Actions:

- The workflow runs Docker Compose PostgreSQL health, migration deploy, seed twice, database integration tests, install, Prisma validation, clean Prisma generation, architecture boundary checks, format check, lint, typecheck, tests, and build.
- Latest PR #9 check result: passed in run `29841648591`.

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
