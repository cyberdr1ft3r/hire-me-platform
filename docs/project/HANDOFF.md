# Current Agent Handoff

Last updated: 2026-10-24

## Current situation

- Issue #236 terminology alignment was squash-merged through PR #239 at
  `e74d47a1d70e4c44f88edfad0e47006ca699d05a`. The merged EN/FR presentation vocabulary keeps
  **General candidate pool / Vivier général** distinct from **Mission candidates / Candidats de la
  mission**, preserves the three Recrutement / Formation / Accompagnement pillars, and changes no
  backend enum, schema, API contract, workflow, permission, navigation destination, Training record,
  or `INDIVIDUAL_COACHING` semantic. The unidentified sixth official document remains R-060.
- Issue #237 remains the active P0 on draft PR #240. The invoice workflow captures an immutable
  issuance business snapshot and branded template v4 renders it in FR/EN with localized dates and
  money, explicit tax rate, HT line totals, framed identity blocks, emphasized totals, and only the
  approved `Hire`/`Me` spacing refinement. Authorization, lifecycle, concurrency protection,
  reload, generation, protected download, and duplicate prevention are covered.
- `Référence client` is an optional customer-provided reconciliation value. It is preserved in the
  immutable issuance snapshot, omitted from generated documents when absent, and remains distinct
  from invoice/customer/tax/internal identifiers. The synthetic acceptance invoice uses
  `BC-TEST-2026-0042`.
- Under D-093, standard 20% TVA invoices omit a dedicated fiscal-treatment block while retaining the
  rate, amount, and TTC in the financial table. Optional approved exceptional wording is snapshotted,
  fingerprinted, immutable, and rendered only when supplied; internal test or owner-confirmation
  notes never appear in customer output.
- The owner prototype was compared side by side with the generated 20% sample. Seller legal form,
  capital, address, ICE, RC, email, and site come from the prototype; missing IF and bank/RIB were
  not invented. Real invoicing remains blocked under R-061 until the owner approves production
  legal, tax, bank, customer, payment, numbering, and any historical-backfill information.
- PR #240 has incorporated the merged terminology work from `main`. Format,
  architecture/style/contrast, lint, typecheck, production build, focused Commercial/Missions/i18n
  tests (129/129), contracts (6/6), PostgreSQL Commercial/document generation (68/68), authorization
  catalog (5/5), and the authenticated browser create → issue → reload → generate → protected-download
  flow pass on the reconciled tree. All 26 migrations apply from empty and the invoice migrations
  remain additive. Exact-head CI is the remaining technical merge gate. Keep the PR draft and do not
  deploy.

## Next concrete action

1. Complete the four-job exact-head CI gate for draft PR #240.
2. Review the regenerated 20% sample and obtain owner business/legal approval before any real invoice
   is issued.
3. Keep PR #240 draft, unmerged, and undeployed until explicit approval.

## Completion conditions

- The merged terminology vocabulary and Issue #237 invoice behavior coexist without regression.
- Authorized users can create, issue, reload, generate, and download an invoice with server-owned
  totals and an immutable validated snapshot; duplicate issue/generation remains prevented.
- Additive migrations apply cleanly from latest `main`, focused commercial/invoice PostgreSQL tests
  and the browser acceptance flow pass, and all four exact-head CI jobs are green.
- Missing business/legal inputs remain explicit blockers; no merge, deployment, or real invoice
  issuance occurs without approval.
