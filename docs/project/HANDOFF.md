# Current Agent Handoff

Last updated: 2026-07-22

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, and #17 are complete and merged on `main`.
- Issue #19 is implemented on branch `feat/recruitment-missions` with PR #20 blocking-review corrections and is ready for draft PR review.
- The implementation is documentation, schema, API, contracts, web, seed, and test work for recruitment missions and mission assignments only.
- Excluded Issue #19 scope remains excluded: candidate-to-mission linkage, ATS pipeline transitions, interviews, evaluations, offers, documents, tasks, notifications, dashboards, training, client portal, AI matching, integrations, uploads, and physical deletion.

## Next Action

Review the Issue #19 draft PR.

Check especially:

- Missions belong to valid writable clients.
- The mission state machine preserves every confirmed stage in `docs/workflows.md`.
- Terminal closure requires structured closure reasons.
- `CLOSED_WITH_RECRUITMENT` requires all planned positions to be filled.
- Archival is separate from operational closure and uses no physical deletion.
- Mission updates, status changes, closure, archival, assignment writes, assignment archival, assignment activation eligibility, lead replacement, and effective salary-range validation share the parent `RecruitmentMission` PostgreSQL row lock.
- Active duplicate assignments and multiple active lead recruiters are rejected by database-backed constraints.
- Nested assignment routes verify the assignment belongs to the mission in the URL.
- Only active, non-archived internal users can be assigned, reactivated, or selected as lead recruiter; assignment activation and lead selection re-check the assigned user inside the parent-mission locked transaction.
- Mission salary and commercial fields require dedicated `mission_commercial_data:*` permissions.
- Partial mission salary updates validate the effective next minimum and maximum together inside the parent-mission locked transaction.
- `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER` receive normal mission permissions by default; only `SUPER_ADMIN` receives mission commercial permissions by default.
- `apps/web` and `packages/contracts` remain Prisma-independent.

## Verification Notes

Completed locally during Issue #19 work:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm prisma:migrate:deploy`
- `pnpm prisma:migrate:reset --force`
- `pnpm prisma:seed`
- second and third `pnpm prisma:seed`
- `pnpm test:db`
- Mermaid CLI rendering for all 8 documentation diagrams
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

`pnpm test:db`, `pnpm test`, and `pnpm build` were rerun outside the filesystem sandbox when esbuild/Vite needed access to local config paths. Safe synthetic auth environment values were used for the local test process only because the local `.env` did not contain auth secrets. PostgreSQL used Docker Compose on `127.0.0.1:5432`.

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
