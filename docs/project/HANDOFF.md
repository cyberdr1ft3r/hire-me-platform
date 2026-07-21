# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 is complete through merged PR #8; the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI foundation are active on `main`.
- Issue #3 is complete through merged PR #9; the foundational Prisma schema, initial migration, development seed, database lifecycle commands, and PostgreSQL integration tests are active on `main`.
- Issue #10 is complete through merged PR #11; local authentication, secure refresh-session handling, normalized permission resolution, deny-by-default guards, and safe authentication audit logs are active on `main`.
- Issue #13 is complete through merged PR #14; secured internal user administration and central active-user authorization checks are active on `main`.
- Issue #15 is complete through merged PR #16; client organization and client-contact CRM are active on `main`.
- Issue #17 is in progress on branch `feat/candidate-profiles`.

## Next Action

Review the Issue #17 candidate master/profile draft PR after CI completes.

Check especially:

- Every candidate and candidate-profile route is guarded by explicit permission codes, not hard-coded role checks.
- Nested profile routes verify that the child record belongs to the candidate id in the URL.
- API runtime code continues to use the one Nest-managed Prisma provider.
- `apps/web` and `packages/contracts` remain Prisma-independent.
- Candidate responses never expose Prisma internals or unapproved confidential payloads.
- Candidate compensation and consent fields require dedicated permissions even when ordinary candidate permissions are present.
- Manager, team-leader, employee, guest, and client-user roles do not receive broad candidate permissions until row scopes are implemented.
- Candidate and candidate-profile archive operations preserve records and do not physically delete.
- Candidate archival and every dependent candidate/profile write use one parent-candidate PostgreSQL row lock inside the mutation transaction.
- Candidate audit logs are safe summaries only.
- Excluded scopes remain excluded: CV uploads, documents, missions, pipelines, interviews, training, messaging, dashboards, exports, AI matching, integrations, uploads, and physical deletion.

## Verification Notes

Completed locally during Issue #13 work:

- `pnpm --filter @hire-me/contracts build`
- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- Mermaid CLI rendered all 8 diagrams from `docs/architecture.md`, `docs/domain-model.md`, and `docs/workflows.md`
- `pnpm --filter @hire-me/api typecheck`
- `pnpm --filter @hire-me/web typecheck`
- `pnpm --filter @hire-me/web test`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`
- Targeted security-review fix checks: `pnpm --filter @hire-me/api typecheck`, `pnpm --filter @hire-me/api lint`, `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm check:architecture`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`

Blocked locally because Docker Desktop is not running and PostgreSQL is unavailable at `127.0.0.1:5432`:

- `docker compose up -d postgres`
- `pnpm prisma:migrate:deploy`
- `pnpm test:db`
- `pnpm prisma:seed`
- second `pnpm prisma:seed`

Confirmed through GitHub Actions run `29861073885`:

- PostgreSQL Docker Compose health.
- Migration deploy.
- Development seed twice.
- Database integration tests.
- Quality checks.

Completed locally during Issue #15 work:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- Mermaid CLI rendered all 8 diagrams from `docs/architecture.md`, `docs/domain-model.md`, and `docs/workflows.md`
- Fresh migration deploy against Docker PostgreSQL on `127.0.0.1:55432`
- `pnpm prisma:migrate:reset`
- `pnpm prisma:seed`
- second `pnpm prisma:seed`
- `pnpm test:db`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Local PostgreSQL used `POSTGRES_PORT=55432` because another running project already occupied `127.0.0.1:5432`.

Completed locally during the PR #16 lifecycle/concurrency review fix:

- Service code now routes client archival, contact creation, client updates, client status changes, contact updates, contact status changes, and contact archival through one transaction-scoped row lock on the parent `Client`.
- PostgreSQL race tests were added for client archival against contact creation and ordinary contact update.
- Checks passed after the fix: `pnpm prisma:validate`, `pnpm prisma:generate`, `pnpm prisma:migrate:deploy`, `pnpm prisma:migrate:reset --force`, `pnpm prisma:seed` twice, `pnpm test:db`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:architecture`, and `git diff --check`.
- Local PostgreSQL validation used Docker Compose on `127.0.0.1:55432`.

Completed locally during Issue #17 work:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- fresh migration deploy against Docker PostgreSQL on `127.0.0.1:55432`
- `pnpm prisma:migrate:reset --force`
- `pnpm prisma:seed`
- second `pnpm prisma:seed`
- `pnpm test:db`
- `pnpm check:architecture`
- Mermaid CLI rendered all 8 diagrams from `docs/architecture.md`, `docs/domain-model.md`, and `docs/workflows.md`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

`pnpm test:db`, `pnpm test`, `pnpm build`, and Mermaid rendering were rerun outside the filesystem sandbox when esbuild or Puppeteer needed access to local config/browser paths. PostgreSQL used Docker Compose with `POSTGRES_PORT=55432`.

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
