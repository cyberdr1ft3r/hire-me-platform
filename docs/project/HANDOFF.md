# Current Agent Handoff

Last updated: 2026-11-14

## Current situation

- `feat/invoice-consolidation` is based exactly on PR #262
  `4622314a27945d47e705a3963e4de81128cb77b1` and integrates stabilized PR #263
  `7a951806610cadad1723cd8489ae3f8f1beef1c7`. Keep #253, #262 and #263 open and unmerged.
- Template v8 combines the optional manual-buyer fields and draft/non-issued identity with the revised
  PDF layout. Final issuance still uses the stored issue date, numbering, immutable business snapshot,
  authorization and audit paths; standalone invoices remain outside registered-client accounting.
- The review policy labels the stored issue date separately from a reliable common service date and
  preserves differing line dates. It does not modify historical rows or replace historical document bytes.
- The unavailable VPS-only recovery commit means exact VPS source parity remains unverified even though
  its documented invoice behaviors and source-controlled hotfixes are accounted for.
- Local invoice evidence is green: renderer 25/25, Documents 25/25, PostgreSQL document generation
  49/49, catalog 5/5, clean 28-migration provisioning, build/assets and a networkless read-only final
  container render. Four synthetic one-page A4 samples cover draft/issued, full/minimal buyer data and
  common/differing/absent service dates. Exact-head Linux CI is still required.

## Unresolved decisions

1. Accounting must approve or reject the proposed separate `Date d’émission` and
   `Date de prestation` presentation. Do not change stored dates or regenerate official PDFs first.
2. The company must accept or reject the legal/accounting risk of final tax invoices for a standalone
   buyer with a required name but no address. The technical implementation is not compliance approval.

## Next concrete action

1. Validate the consolidation from a clean database and run all six exact-head CI jobs.
2. Review the generated synthetic PDFs only; do not regenerate official invoices or replace historical
   `DocumentVersion` bytes.
3. Review the successor draft PR; keep #253, #262 and #263 open/unmerged until an authorized maintainer
   selects the consolidation PR as their successor.

## Completion conditions

- The consolidation branch has no unresolved conflicts and proves numbering, snapshots,
  authorization, audit history, document immutability, draft/final separation and optional-address
  behavior.
- Accounting decisions on invoice-date presentation and optional buyer addresses are recorded before
  merge, deployment, official regeneration or live-data correction.
- No Administration redesign, deployment, VPS change, live-data mutation or invoice regeneration is included.
