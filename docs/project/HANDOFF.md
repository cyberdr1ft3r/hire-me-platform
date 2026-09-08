# Current Agent Handoff

Last updated: 2026-09-08

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- `main` is at `2ad1a551023a8b0acaa01d9bea05435e3aaaec6a`, the merge commit for the Issue #48 reconciliation (PR #50).
- Issue #49 is implemented on branch `feat/document-output-generation`, branched from that exact `main`, and opened as a draft PR.
- Issue #31 (PR #32), Issue #35 (PR #40), Issue #36 (PR #43), Issue #37 (PR #45), Issue #38 (PR #46), and Issue #39 (PR #47) are all merged. Issue #12 is complete through the merged document foundation, and Issue #33 is closed.
- Issue #39 is complete. Its final reviewed head was `cdb0ef3b295ab9b749c4bdd92ecab1e74af3c34a`, and exact-head GitHub Actions run `34213661408` succeeded on Quality checks, PostgreSQL Docker Compose health, and Database migration, seed, and integration tests with 263 PostgreSQL integration tests across 16 files.
- PR #42 (Cursor Cloud development environment) was closed without merge as obsolete environment-specific guidance. Nothing from it is pending.
- Phase 8 commercial and operational accounting is complete through Issues #38 and #39.

## Merged Accounting Behavior To Preserve

- Invoice settlement is derived, never stored: the immutable issued invoice total plus active allocations. A payment never marks an invoice paid merely by existing. States are not-receivable, unpaid, partially paid, paid, and overdue.
- Profitability follows decision D-053: eligible issued invoice revenue minus directly linked operational expenses, excluding canceled and archived invoices. Received or allocated cash is exposed separately through settlement and receivables and is never the profitability basis.
- Every aggregate is separated per currency. There is no FX conversion anywhere.
- An invoice with active payment allocations cannot be canceled; the operator must reverse the allocations explicitly first. Allocations are never auto-reversed or deleted.
- Financial mutations lock rows in the fixed order client, payment, invoice, allocation.
- Accounting authorization combines the accounting capability, `commercial_data:access` for any financial amount, and the underlying source scope. Aggregates fail closed rather than returning redacted shells, and hidden, out-of-scope, and nonexistent identifiers share one `ACCOUNTING_RECORD_NOT_FOUND` envelope. Lists and aggregates apply the same source-scope rule as the detail paths.
- Training-linked accounting records follow the merged training source rule; placement-linked records additionally require `placements:view`.
- Per-row money input is capped at 2,147,483,647 minor units to match the PostgreSQL `integer` columns; response-side totals are uncapped. Accounting list date windows are bounded: both endpoints or neither, ordered, at most 366 days apart.

## Merged Generation Behavior To Preserve

- Structured business records stay authoritative. A generated file is an output snapshot published as a normal immutable `DocumentVersion` with `DocumentVersionSource.GENERATED`, never a second mutable record.
- One logical document exists per source record, output family, and language, keyed by a unique `generatedDocumentKey`. Regeneration adds version N+1; a historical version and its bytes are never overwritten.
- Templates are code-owned TypeScript functions over a neutral, data-only renderable document. No template language, no HTML, no evaluation, no uploaded template, and no remote fetch. Every generated version records the exact `templateId` and `templateVersion` used, so a later template change cannot re-explain an existing file.
- Renderers are pure JavaScript (`pdf-lib`, `docx`). No native binary, browser, office suite, or shell is involved.
- Issued invoice outputs copy the immutable issued lines and totals verbatim; nothing is recomputed and placement eligibility is never re-evaluated.
- Certificate generation reuses the merged training readiness rule and never transitions the enrollment. Certificate issuance stays the explicit audited training action.
- Generation requires `documents:generate` plus the source domain's own rule, and generated-document reads and downloads re-authorize that source at request time. A leaked document UUID cannot bypass the source domain; hidden and nonexistent sources are indistinguishable.
- Storage and PostgreSQL are not one transaction. Render, publish, then commit; a failed commit deletes only the object that attempt published and never a historical one.

## Next Action

Review the Issue #49 draft PR on branch `feat/document-output-generation` and keep it draft, open, and unmerged until that review completes.

Completion conditions:

- Review accepts the generation architecture, the template and renderer boundary, the authorization and re-authorization rules, and the documented storage compensation boundary.
- Exact-head GitHub Actions green on the reviewed head.
- The PR stays draft, open, and unmerged until a maintainer explicitly authorizes the merge.

## Known Follow-Up Work For Generation

Not implemented by Issue #49 and still requiring their own approved issues: candidate summaries, interview reports, generic HR templates, an arbitrary template editor, e-signature, delivery by email or WhatsApp, payment receipts, accounting exports, payroll documents, OCR or AI extraction, Excel generation, and any client or candidate portal.

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
