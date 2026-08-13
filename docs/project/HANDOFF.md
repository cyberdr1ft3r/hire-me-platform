# Current Agent Handoff

Last updated: 2026-08-13

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issues #1, #2, #3, #5, #10, #13, #15, #17, #19, #21, #23, #25, and #27 are complete and merged on `main`.
- Issue #29 is active in draft PR #30 on branch `feat/offer-placement-lifecycle`.
- This branch adds the internal offer-to-placement lifecycle only: versioned staff-managed offers, negotiation outcomes, explicit placement confirmation, placement correction, mission fill/closure eligibility, and bounded commercial eligibility for future invoicing.
- The implementation must not add candidate accounts, public offer acceptance, payroll, invoice/accounting implementation, or unrelated business modules.
- The approved direction is an authenticated internal Hire Me platform plus a bounded unauthenticated public opportunity/application surface.
- PR #26 blocking comment correction reconciles D-027 with D-037: D-027 now governs staff-controlled external client sharing and no longer assumes a client portal.

## Next Action

Finish the PR #30 blocking-review correction, push `feat/offer-placement-lifecycle`, confirm GitHub Actions, and keep the draft PR unmerged.

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
- Public opportunity foundation is merged. Offers/placements are now the active implementation scope. Task management, accounting, training, client portal, and Moroccan payroll implementation remain later separate issues.
- Offer acceptance must not increment `filledPlacementCount`; placement counts only after explicit authorized confirmation.
- Placement confirmation is offer-backed through `MissionPlacement`; the retired legacy `confirm-integration` route must return `PLACEMENT_OFFER_CONFIRMATION_REQUIRED` and cannot infer an offer version or count placement independently.
- Placement confirmation must be idempotent and concurrency-safe.
- Revised offers create immutable new versions, with one current active version per mission-candidate process.
- Placement correction requires a reason, preserves original confirmation metadata, decrements at most once, and never makes count negative.
- Reaching capacity makes the mission closure-eligible but never closes it automatically; managers can keep recruiting.
- Confirmed placements may be flagged eligible for future invoicing, but invoices/accounting are out of scope.
- Complete Moroccan payroll is a confirmed future requirement to document only in this issue.
- Earlier failed workflow run `30005337078` failed in `mission-candidates.integration.test.ts`, not `public-applications.integration.test.ts`: the archival race test expected `409` and received `201`. That test passed locally on the corrective tree, and GitHub Actions run `30444387092` is green on the current PR #28 head.

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

Completed so far for the PR #28 blocking-review correction:

- Protected `/missions` workspace controls now load internal public opportunity configuration with `public_opportunities:view`.
- Edit controls require `public_opportunities:manage`; publish/list/link actions require `public_opportunities:publish`; application inspection requires `public_applications:view`.
- The UI exposes public title, summary, description, location, work arrangement, contract type, experience, skills, publication start, application deadline, client-name visibility, salary visibility, and upload requirement toggles.
- The generated link, copy action, and preview use `/opportunities/:publicSlug` and do not expose internal mission IDs; clipboard failure is handled with a visible UI message.
- Server-side authorization now requires `public_opportunities:publish` whenever protected publication fields are present, while still allowing manage-only ordinary configuration edits. PostgreSQL tests cover `status`, `applicationLinkEnabled`, and `listedOnWebsite` denial, publish-capable success, unchanged rows after denial, and no misleading audit writes.
- Public-application tests snapshot and restore the enum-bound seeded `CLIENT_USER` role permissions in `afterAll` so repeated database runs do not leak manage-only test permissions or race with suites that exercise `GUEST`.
- Focused validation passed: `pnpm.cmd test:db` with 70 PostgreSQL tests, `pnpm.cmd --filter @hire-me/web test` with 13 web tests, package-level typecheck/lint/test/build fallbacks after root Turbo commands hit the known Windows `spawn UNKNOWN` issue, and `git diff --check`.
- GitHub Actions run `30444387092` passed PostgreSQL Docker Compose health, database migration/seed/integration tests, and quality checks.
- PostgreSQL validation passed after Docker Desktop was unpaused: container healthy, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice, and `pnpm.cmd test:db` with 70 PostgreSQL integration tests passing.

Completed so far for Issue #29:

- Prisma schema and additive migration for offer aggregates, immutable offer versions, offer events, placement records, and placement events.
- Shared Prisma-independent contracts for offer and placement lifecycle requests/responses.
- API-owned generated-client boundary updated for new enums.
- Permission catalog and seed additions for offer and placement operations.
- Nested mission-candidate offer and placement endpoints with server-side permission checks, process ownership checks, safe audit metadata, and mission/process/candidate row locking.
- Minimal protected mission-workspace controls and focused web tests for permission-gated offer and placement actions.
- Final blocking-review correction retires the legacy `confirm-integration` counting path, blocks ordinary transitions into `INTEGRATED`, removes the stale web confirm-integration action, adds PostgreSQL regression tests for legacy-route bypass attempts and historical `placementConfirmedAt` compatibility, and updates source-of-truth documentation.
- Local validation passed after the PR #30 legacy-integration correction: PostgreSQL Docker Compose health on `127.0.0.1:55432`, `pnpm.cmd prisma:validate`, `pnpm.cmd prisma:generate`, `pnpm.cmd prisma:migrate:deploy`, `pnpm.cmd prisma:migrate:reset --force`, `pnpm.cmd prisma:seed` twice after reset, focused affected PostgreSQL tests with 13 tests passing, full `pnpm.cmd test:db` with 77 PostgreSQL integration tests passing, `pnpm.cmd check:architecture`, Mermaid CLI rendering for all 13 documentation diagrams, `pnpm.cmd format:check`, `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd build`, and `git diff --check`.
- Root `pnpm.cmd test` and `pnpm.cmd build` initially hit the known Windows sandbox/esbuild access issue and passed when rerun outside the sandbox. Web tests pass with existing React `act(...)` warnings around asynchronous mission workspace state updates.

Still required before handoff completion:

- Review final diff for unrelated changes.
- Commit, push, update draft PR #30, and report CI status.

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
