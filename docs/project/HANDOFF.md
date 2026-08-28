# Current Agent Handoff

Last updated: 2026-08-28

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, #19, #21, #23, #25, #27, and #29 are complete and merged on `main`.
- Issue #29 / PR #30 implemented the internal offer-to-placement lifecycle. PR #30 merged as commit `249bca8a0fa1a7619dc5f7bbcff44034b5457cc0`.
- Final blocking-fix commit `440ea9cb3dec204f0e2308eeb7c02cf4dcae4822` retired the legacy integration-counting path. Final-head GitHub Actions run `31719561145` passed all jobs.
- Offer-backed `MissionPlacement` is the authoritative counted-placement record. Offer acceptance alone does not count placement.
- Generic `MissionCandidate` transition into `INTEGRATED` is blocked and requires the dedicated offer-backed placement action.
- The legacy `confirm-integration` route is compatibility-only and returns `PLACEMENT_OFFER_CONFIRMATION_REQUIRED`; it must not increment `filledPlacementCount`, create `MissionPlacement`, or infer an offer version.
- Historical `MissionCandidate.placementConfirmedAt` metadata must not be silently converted into fabricated offer-backed placements. Any future reconciliation must be explicit and audited.
- Issue #33 is documentation/project-memory reconciliation only. It must not change application behavior.

## Next Action

Complete the Issue #33 documentation-only PR and keep it draft and unmerged for review. After that, Issue #31, "Implement internal task management, reminders, comments, and notifications," is the next executable development feature unless a newer approved issue supersedes it.

For Issue #31, preserve these boundaries:

- Do not reopen or modify Issue #29 / PR #30 placement behavior.
- Do not count placements without offer-backed `MissionPlacement` confirmation.
- Do not add candidate accounts, public offer acceptance, payroll, invoice/accounting implementation, or unrelated business modules.
- Keep task management scoped to ownership, assignees, priority, due dates, status, context links, reminders, comments, mentions, notifications, and audit history as approved by the issue.
- Keep the authenticated internal platform and bounded unauthenticated public opportunity/application surface intact.

## Verification Notes

Issue #29 final validation passed before merge: PostgreSQL Docker Compose health on `127.0.0.1:55432`, `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice after reset, focused affected PostgreSQL tests with 13 tests passing, full `pnpm.cmd test:db` with 77 PostgreSQL integration tests passing, `pnpm.cmd check:architecture`, Mermaid CLI rendering for all 13 documentation diagrams, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, and `git diff --check`. GitHub Actions run `31719561145` passed all jobs on the final PR #30 head.

Issue #33 requires at minimum `pnpm.cmd format:check` and `git diff --check`. Mermaid rendering is required only if Mermaid-bearing documentation changes.

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
