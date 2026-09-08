# Current Agent Handoff

Last updated: 2026-09-08

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #31 (PR #32), Issue #35 (PR #40), Issue #36 (PR #43), Issue #37 (PR #45), and Issue #38 (PR #46) are merged into `main`. `main` is at `e1976f8a4b888657abe74c40ddf99c730032934a`.
- Issue #39 is implemented on branch `feat/accounting-foundation`, branched from that exact `main`, and opened as a draft PR.
- Issue #39 extends the merged Issue #38 commercial records. `CommercialQuotation`, `CommercialContract`, `PurchaseOrder`, `Invoice`, their lifecycles, their server-calculated totals, and their immutable issued snapshots remain owned by Issue #38 and were not duplicated, replaced, or remodelled.
- The only schema change is the additive migration `20260908120000_accounting_foundation`, which sorts after every merged migration. No merged migration was edited, renamed, reordered, or squashed.
- New records: `Payment`, `PaymentAllocation`, `PaymentEvent`, `Expense`, `ExpenseEvent`.
- Invoice settlement is derived, never stored: the immutable issued invoice total plus active allocations. A payment never marks an invoice paid merely by existing.
- Profitability follows decision D-053: eligible issued invoice revenue minus directly linked operational expenses, excluding canceled and archived invoices, separated per currency. Received/allocated cash is exposed separately through settlement and receivables and is never the profitability basis.
- Profitability contexts are client, recruitment mission, and placement. Training-program profitability is deliberately unsupported: the merged commercial model has no authoritative invoice-to-training-program link, so training revenue cannot be derived without inventing one. Training expenses are still recorded and readable.
- Every aggregate is separated per currency. There is no FX conversion anywhere.
- Accounting authorization combines the accounting capability, `commercial_data:access` for any financial amount, and the underlying client/mission record scope. Receivable and profitability aggregates fail closed instead of returning redacted shells. Hidden, out-of-scope, and nonexistent identifiers all return the same `ACCOUNTING_RECORD_NOT_FOUND` envelope.
- Financial mutations lock rows in the fixed order client, payment, invoice, allocation, so concurrent allocations serialize without a deadlock cycle.
- Payroll, statutory/accrual/tax accounting, depreciation, FX conversion, and receipt files are out of scope. Receipt files remain owned by the document module.
- An invoice with active payment allocations cannot be canceled. `CommercialService.cancelInvoice()` rejects with `INVOICE_HAS_ACTIVE_ALLOCATIONS` while holding the invoice lock, and never reverses or deletes allocations on the operator's behalf. Canceled together with an active allocation is not a reachable state.
- Accounting lists and aggregates apply the same source-scope rule the detail paths enforce, so mission-linked amounts outside an actor's mission scope cannot be obtained through a total.
- Every supplied expense context must resolve to one consistent business chain, and each context is scoped on read, so a null `clientId` never exposes a placement-linked or training-linked expense.
- Per-row money input is capped at 2,147,483,647 minor units to match the PostgreSQL `integer` columns. Response-side totals are deliberately uncapped.

## Next Action

Re-review the Issue #39 draft PR on branch `feat/accounting-foundation` and keep it draft, open, and unmerged until that review completes. The first ChatGPT review returned four blocking findings; all four are fixed on the branch and are described under "Review blockers found and addressed" in `docs/project/STATUS.md`.

Completion conditions:

- ChatGPT/human review accepts the accounting implementation and the D-053 revenue policy.
- Exact-head GitHub Actions is green on the reviewed head.
- The PR stays draft/open/unmerged until a maintainer explicitly authorizes the merge.

## Known Follow-Up Work For Accounting

Not implemented by Issue #39 and still requiring their own approved issues:

- Moroccan payroll, which needs dedicated legal and regulatory validation.
- Statutory, accrual, and tax accounting, general ledger, chart of accounts, and tax declarations.
- FX conversion and any multi-currency consolidated total.
- Aging buckets beyond the current overdue outstanding figure.
- Credit notes, overpayment/credit balances, and refunds.
- Training-program profitability, which first needs an authoritative link from commercial revenue to a training program.
- Accounting exports, which would need their own dedicated export permission.
- Receipt file storage, which belongs to the document module.

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
