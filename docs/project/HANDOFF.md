# Current Agent Handoff

Last updated: 2026-07-22

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, and #19 are complete and merged on `main`.
- Issue #21 is implemented on branch `feat/mission-candidate-pipeline` and is still pending commit, push, and draft PR creation.
- The implementation covers mission-specific candidate processes only: Prisma schema/migration, API service/controller, shared contracts, minimal protected web controls, seed permissions, PostgreSQL-backed tests, and documentation.
- Excluded Issue #21 scope remains excluded: interviews, evaluations, technical-test scoring, offers, documents, client portal, full client feedback, tasks, reminders, notifications, email, calendars, WhatsApp, dashboards, imports, exports, AI matching, training, custom pipeline builders, and physical deletion.

## Next Action

Open a draft PR with `Closes #21`.

Check especially:

- One reusable `Candidate` can join multiple missions but has only one process ever for the same `(missionId, candidateId)` pair.
- Terminal rejected, withdrawn, talent-pool, or completed processes cannot be recreated for the same mission.
- The implemented pipeline state names match Issue #21 exactly.
- Optional skips are limited to technical test and second client interview, and require a reason plus audit history.
- Every process has exactly one responsible recruiter at a time.
- Responsible recruiters are active, internal, non-archived, and actively assigned to the mission.
- Responsible recruiter transfer is reasoned, audited, and atomic.
- Mission-candidate writes follow lock order: `RecruitmentMission`, existing `MissionCandidate` when present, then `Candidate`.
- Candidate archival and mission closure or archival races return stable conflicts without committing dependent writes.
- Candidate salary, compensation, consent, and profile values remain live source-of-truth data and are permission-shaped on response.
- Linking a candidate to a mission is internal-only until explicit presentation.
- Integration confirmation counts placement once, is idempotent, and never closes the mission automatically.
- Business records remain structured records, not document tables.
- `apps/web` and `packages/contracts` remain Prisma-independent.

## Verification Notes

Completed locally during Issue #21 work:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm prisma:migrate:deploy`
- `pnpm prisma:migrate:reset --force`
- `pnpm prisma:seed`
- second `pnpm prisma:seed`
- `pnpm test:db` with 54 PostgreSQL integration tests passing
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`
- static Mermaid validation for all 8 documentation diagrams

Actual Mermaid CLI rendering could not run locally because no renderer is installed and temporary `@mermaid-js/mermaid-cli` download/execution was rejected by approval policy. `pnpm test:db`, `pnpm test`, and `pnpm build` were rerun outside the filesystem sandbox when Vitest/esbuild/Vite needed access to local config paths. Safe synthetic auth environment values were used for local test processes only because the local `.env` did not contain auth secrets. PostgreSQL used Docker Compose on `127.0.0.1:5432`.

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
