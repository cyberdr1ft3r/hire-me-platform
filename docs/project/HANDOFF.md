# Current Agent Handoff

Last updated: 2026-07-23

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, #19, #21, #23, and #25 are complete and merged on `main`.
- Issue #27 is implemented locally on branch `feat/public-applications`.
- This branch adds the first public opportunity and unauthenticated candidate application implementation. Keep remaining changes inside Issue #27.
- The approved direction is an authenticated internal Hire Me platform plus a bounded unauthenticated public opportunity/application surface.
- PR #26 blocking comment correction reconciles D-027 with D-037: D-027 now governs staff-controlled external client sharing and no longer assumes a client portal.

## Next Action

Finish full validation, push `feat/public-applications`, and open a draft PR with `Closes #27`.

Check especially:

- Candidates do not have accounts or dashboards in the MVP direction.
- Candidate applications happen through unauthenticated opportunity links.
- Opportunity lifecycle, application-link availability, and public listing are documented as independent controls.
- Listed, unlisted link-only, and internal-sourcing-only modes are documented consistently.
- Public applications preserve candidate/file submission history and enforce one process per mission/candidate.
- Public fields are explicitly approved; confidential client, salary, commercial, recruiter, pipeline, internal, and audit data remains hidden.
- Client portal is optional future scope, not MVP and not permanently prohibited.
- `clientVisible` means approved for external sharing, not current portal visibility.
- Trainers and internal training operators require internal accounts.
- Training participants are business records and do not require accounts by default.
- Task management remains planned but not implemented.
- Commercial and operational accounting is in scope, while full legal accounting, general ledger, tax declarations, and bank reconciliation remain unresolved.
- Business records remain structured source-of-truth data; files/documents are uploaded, signed, archived, or generated representations.
- Public opportunity foundation is now the active implementation branch; offers/placements and task management remain later separate issues.

## Verification Notes

Completed locally for Issue #25:

- Mermaid CLI rendered all 11 documentation diagrams.
- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

`pnpm build` passed with Vite's existing large-chunk advisory warning.

After the PR #26 blocking-comment correction, the focused validation also passed: Mermaid CLI rendered all 11 documentation diagrams, `pnpm check:architecture`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.

Completed so far for Issue #27:

- `pnpm prisma:validate`
- `pnpm prisma:generate`
- `pnpm check:architecture`
- `pnpm --filter @hire-me/contracts build`
- PostgreSQL Docker Compose health confirmed
- `pnpm prisma:migrate:deploy`
- `pnpm prisma:migrate:reset`
- `pnpm prisma:seed` twice sequentially
- Focused PostgreSQL `public-applications.integration.test.ts`
- Full `pnpm test:db` with 68 PostgreSQL integration tests passing
- Mermaid CLI rendering for all 11 diagrams
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

`pnpm build` passed with Vite's existing large-chunk advisory warning.

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
