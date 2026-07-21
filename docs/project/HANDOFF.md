# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 is complete through merged PR #8; the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI foundation are active on `main`.
- Issue #3 is complete through merged PR #9; the foundational Prisma schema, initial migration, development seed, database lifecycle commands, and PostgreSQL integration tests are active on `main`.
- Issue #10 is complete through merged PR #11; local authentication, secure refresh-session handling, normalized permission resolution, deny-by-default guards, and safe authentication audit logs are active on `main`.
- Issue #13 is in progress on branch `feat/user-access-management`.

## Next Action

Open the Issue #13 draft PR with `Closes #13`, then confirm GitHub Actions PostgreSQL checks.

Check especially:

- Every administration route is guarded by explicit permission codes, not hard-coded role checks.
- API runtime code continues to use the one Nest-managed Prisma provider.
- `apps/web` and `packages/contracts` remain Prisma-independent.
- Internal user responses never expose password hashes, refresh-token hashes, raw tokens, cookie values, secrets, or confidential payloads.
- Role assignment cannot grant permissions outside the actor's effective permission set.
- Last active `SUPER_ADMIN` demotion, suspension, and archival are protected atomically in PostgreSQL.
- Self-demotion, self-suspension, and self-archival are rejected.
- Suspending or archiving a user revokes active refresh sessions in the same transaction.
- Administration audit logs are safe summaries only.
- Excluded scopes remain excluded: registration, password reset, invitations, MFA, SSO, arbitrary role creation, permission editing, client/candidate/mission/training/document/messaging/dashboard modules, and business workflow behavior.

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

Blocked locally because Docker Desktop is not running and PostgreSQL is unavailable at `127.0.0.1:5432`:

- `docker compose up -d postgres`
- `pnpm prisma:migrate:deploy`
- `pnpm test:db`
- `pnpm prisma:seed`
- second `pnpm prisma:seed`

Use GitHub Actions on the draft PR to confirm the real PostgreSQL migration, seed, and database integration-test path.

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
