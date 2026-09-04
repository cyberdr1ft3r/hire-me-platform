# Current Agent Handoff

Last updated: 2026-09-04

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #38 is active on branch `feat/commercial-workflow`, started from latest `main` at `cebd87ffa0f3686418e2244570a1b1d40f995541`.
- Issue #31 and Issue #35 are merged into `main`; task management and centralized document management are baseline behavior.
- The branch implements structured quotations, commercial contracts, purchase orders, and invoices as business records, not `Document` records.
- Commercial writes require the relevant `*:manage` permission and `commercial_data:access`. Views require the relevant `*:view` permission and redact amounts, quotation/invoice lines, and contract terms without `commercial_data:access`.
- Totals are calculated server-side. Issued invoice totals and lines are immutable snapshots.
- Cross-client links between clients, missions, quotations, contracts, purchase orders, placements, and correction invoices are rejected server-side.
- Placement-backed invoicing uses authoritative confirmed `MissionPlacement` eligibility. Accepted offers and historical legacy integration metadata do not authorize invoices.
- Payments, partial payments, overdue balances, expenses, client balances, revenue/profitability, settlement behavior, generated files, e-signature, external portals, training operations, private messages/groups, email, WhatsApp, and calendar delivery remain out of scope.
- Local PostgreSQL validation used Docker Compose PostgreSQL on `127.0.0.1:55442`; `.env` is local ignored runtime config.

## Next Action

Finish final validation, fetch latest `main` and incorporate it if it advanced, push `feat/commercial-workflow`, open exactly one draft PR with `Closes #38`, wait for the exact-head GitHub Actions run, and keep the PR open and unmerged for human review.

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
