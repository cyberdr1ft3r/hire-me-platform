# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 is complete through merged PR #8; the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI foundation are active on `main`.
- Issue #3 is complete through merged PR #9; the foundational Prisma schema, initial migration, development seed, database lifecycle commands, and PostgreSQL integration tests are active on `main`.
- Issue #10 is in review through draft PR #11 on branch `feat/auth-rbac-foundation`.
- Issue #10 implements local email/password authentication, Argon2id password credentials, rotating hashed refresh sessions, refresh-token reuse detection, secure refresh-cookie handling, in-memory web access-token handling, normalized permission-code resolution, deny-by-default guards, and safe authentication audit logs.

## Next Action

Review draft PR #11.

Check especially:

- Argon2id parameters and absence of plaintext password storage.
- Generic login-failure behavior.
- Short-lived access tokens and no token persistence in `localStorage` or `sessionStorage`.
- Refresh-token hash storage, rotation, reuse detection, and family revocation.
- Refresh cookie `HttpOnly`, scoped path, `SameSite=Strict`, and production `Secure` behavior.
- One Nest-managed Prisma provider for runtime code.
- Normalized permission resolution through role and permission joins.
- Deny-by-default authorization guard behavior.
- Safe authentication audit logs without secrets, tokens, cookies, or confidential payloads.
- Web and contracts remaining Prisma-independent.
- Absence of registration, password reset, MFA, SSO, user-management CRUD, and business modules.

## Verification Notes

Completed locally by Codex during issue #10 work:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Pending before completion:

- None known.

Blocked locally if Docker Desktop/daemon is unavailable:

- Docker Compose PostgreSQL startup, migration deploy, seed, bootstrap, and database integration-test verification should be confirmed through GitHub Actions if local Docker is unavailable.

Confirmed through GitHub Actions run `29847170395`:

- PostgreSQL Docker Compose health.
- Migration deploy against real PostgreSQL.
- Development seed twice.
- Development admin bootstrap twice with synthetic values.
- Database integration tests.
- Install, Prisma validation, clean Prisma generation, architecture boundary checks, format check, lint, typecheck, tests, and build.

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
