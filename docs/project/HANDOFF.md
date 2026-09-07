# Current Agent Handoff

Last updated: 2026-09-07

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #37 / PR #45 training operations is merged into `main` as `09c506262ad3284efd69f70440c1ee06175c6e00`.
- Issue #38 is implemented on branch `feat/commercial-workflow` in draft PR #46.
- PR #46 started from `origin/main` at `cebd87ffa0f3686418e2244570a1b1d40f995541`, previously incorporated `6ff19ad2a03f3f6dc6bdbbf00be9db68d6779a2a`, and now incorporates current `origin/main` at `09c506262ad3284efd69f70440c1ee06175c6e00`.
- Substantive ChatGPT integration review passed on exact head `25b0e6f0db6e3d1ca41ff4d1afdeeb73b4803fe4`.
- Exact-head GitHub Actions run `34166398141` is green: PostgreSQL Docker Compose health, Quality checks, and Database migration, seed, and integration tests all passed, with 210/210 PostgreSQL integration tests across 15 files.
- The only commit after reviewed head `25b0e6f0db6e3d1ca41ff4d1afdeeb73b4803fe4` should be this narrow docs refresh unless a reviewer requests otherwise.
- Commercial records remain structured business records, not `Document` records. Generated or signed files remain future `DocumentVersion` outputs.
- Commercial writes require the relevant `*:manage` permission and `commercial_data:access`. Views require the relevant `*:view` permission and redact amounts, quotation/invoice lines, contract terms, and free-form history reasons without `commercial_data:access`.
- Commercial access is combined with underlying client and mission source scope. Hidden and nonexistent commercial/source UUIDs return the same generic not-found response.
- Historical commercial reads remain available from the commercial record's durable authorized business scope after parent client or mission archival. New upstream quotation, contract, or purchase-order creation may still require currently writable source context.
- Placement-backed invoicing uses authoritative locked/re-read confirmed `MissionPlacement` eligibility. `CLOSED_WITH_RECRUITMENT` does not by itself block invoicing when the placement remains confirmed, eligible, visible, not archived, and linked to the requested client and mission.
- Training operations from PR #45 remain separate from commercial billing; `TrainingEnrollment.paymentStatus` is not exposed by training APIs/contracts, and Issue #38 must not implement payments, revenue/profitability, settlement, generated files, e-signature, external portals, private messages/groups, email, WhatsApp, or calendar delivery.

## Next Action

Complete the final human/ChatGPT merge gate for PR #46. Keep PR #46 draft/open/unmerged until approved. Issue #39 remains blocked until Issue #38 / PR #46 merges.

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
