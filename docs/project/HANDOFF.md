# Current Agent Handoff

Last updated: 2026-09-07

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #38 is implemented on branch `feat/commercial-workflow` in draft PR #46.
- The branch started from `origin/main` at `cebd87ffa0f3686418e2244570a1b1d40f995541`, then incorporated latest `origin/main` at `6ff19ad2a03f3f6dc6bdbbf00be9db68d6779a2a`.
- The current correction pass resolves review `5130759040` on exact head `87c096f79040e0f16ca83b7efeb7006a0e9f0c18`.
- Commercial records are structured business records, not `Document` records. Generated or signed files remain future `DocumentVersion` outputs.
- Commercial writes require the relevant `*:manage` permission and `commercial_data:access`. Views require the relevant `*:view` permission and redact amounts, quotation/invoice lines, contract terms, and free-form history reasons without `commercial_data:access`.
- Commercial access is combined with underlying client and mission source scope. Hidden and nonexistent commercial/source UUIDs return the same generic not-found response.
- Historical commercial reads remain available from the commercial record's durable authorized business scope after parent client or mission archival. New upstream quotation, contract, or purchase-order creation may still require currently writable source context.
- Links between clients, missions, quotations, contracts, purchase orders, correction invoices, and placements are checked server-side for same client, compatible business context, matching currency, required source status, and actor access.
- Invoice snapshots derived from contracts or purchase orders preserve exact authoritative source subtotal, tax, and total cents instead of recalculating from rounded tax rates.
- Placement-backed invoicing uses authoritative locked/re-read confirmed `MissionPlacement` eligibility. `CLOSED_WITH_RECRUITMENT` does not by itself block invoicing when the placement remains confirmed, eligible, visible, not archived, and linked to the requested client and mission.
- Default commercial lists exclude archived records; `includeArchived=true` must be explicit. Archive/status retries are idempotent and do not duplicate domain history or global audit rows.
- Payments, partial payments, overdue balances, expenses, client balances, revenue/profitability, settlement behavior, generated files, e-signature, external portals, training operations, private messages/groups, email, WhatsApp, and calendar delivery remain out of scope.

## Next Action

Hand draft PR #46 back for final human/ChatGPT review after confirming the pushed exact-head GitHub Actions run is green. Keep PR #46 draft/open/unmerged. Issue #39 remains blocked until Issue #38 is reviewed and merged.

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
