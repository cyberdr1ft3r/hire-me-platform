# Current Agent Handoff

Last updated: 2026-07-23

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, #19, and #21 are complete and merged on `main`.
- Issue #23 is implemented in draft PR #24 on branch `feat/interviews-evaluations`.
- The implementation covers interviews and structured evaluations only: Prisma schema/migration, API service/controller, shared contracts, minimal protected web controls, seed permissions, PostgreSQL-backed tests, and documentation.
- Excluded Issue #23 scope remains excluded: calendar integrations, reminders, documents, PDF/Word exports, technical-test execution, client portal, offers, dashboards, imports, AI, custom evaluation builders, and physical deletion.

## Next Action

Review draft PR #24 and CI.

Check especially:

- Every interview belongs to exactly one `MissionCandidate`.
- Interview actions do not automatically move `MissionCandidate.state`.
- Client interviews require explicit candidate presentation.
- Client interview 2 requires a completed or postponed client interview 1.
- Internal users and client contacts are validated as active, non-archived participants, and client contacts must belong to the mission client.
- Duplicate active interview participants are rejected.
- Rescheduling and postponement preserve required reason history.
- Completion and evaluation finalization are idempotent.
- Evaluation drafts are author-owned, and finalized evaluations reject ordinary mutation.
- Internal evaluation content and client feedback are redacted unless the caller has the matching visibility permission.
- Candidate salary values do not appear in evaluation responses or audit metadata.
- Interview and evaluation writes follow lock order: `RecruitmentMission`, `MissionCandidate`, `Candidate`, then `Interview`.
- `apps/web` and `packages/contracts` remain Prisma-independent.

## Verification Notes

Completed locally:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm prisma:migrate:deploy`
- `pnpm prisma:migrate:reset --force`
- `pnpm prisma:seed`
- second `pnpm prisma:seed`
- `pnpm test:db` with 59 PostgreSQL integration tests passing
- Mermaid CLI rendering for all 10 documentation diagrams
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Notes:

- The first local `pnpm test:db` attempt failed because the shell did not have authentication secrets configured. It passed with safe synthetic `AUTH_ACCESS_TOKEN_SECRET` and `AUTH_REFRESH_TOKEN_PEPPER` values set only for the command.
- `pnpm build` passed with Vite's large-chunk advisory warning.

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
- Link the issue or pull request that supports changes.
- Report checks performed and remaining blockers.
