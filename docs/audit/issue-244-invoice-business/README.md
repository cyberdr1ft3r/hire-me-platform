# Issue #244 invoice business acceptance evidence

All evidence in this directory uses synthetic people, addresses, identifiers, payment text, and contact
details. No real customer or unapproved HireMe legal/banking value is included.

## Browser acceptance

- Installed Chrome, 1440 × 900 desktop and 390 × 844 mobile.
- Authenticated Administration billing profile and Commercial invoice detail rendered without page
  errors.
- Explicit 2026 external baseline `41` produced `HM-2026-042`.
- Individual customer issued without ICE or IF.
- One ordinary Accompagnement line at 20% TVA produced HT `991.67 MAD`, TVA `198.33 MAD`, and TTC
  `1190.00 MAD`.
- Reload retained the issued record. Editing the current billing profile did not change the issued
  seller snapshot.
- French PDF generation and the protected authenticated download both succeeded.

Evidence files:

- `billing-settings-desktop.png`
- `issued-invoice-desktop.png`
- `issued-invoice-mobile.png`
- `browser-results.json`
- `sample-invoice-fr.pdf`
- `rendered/sample-invoice-fr-1.png`

## PDF visual review

The downloaded output is a single A4 page with no clipping or overlap. It preserves the approved teal
wordmark/header, Émetteur and Client facturé blocks, reference and dates, line table, emphasized HT/TVA/
TTC totals, French amount in words, payment and customer-reference framing, and immutable legal footer.
The individual buyer block correctly omits corporate identifiers. No bank detail or legal value was
invented.

## Verification summary

- Additive migration chain, seed twice, and administrator bootstrap twice: pass.
- PostgreSQL Administration, Commercial, generation, and database suites: 90/90 pass.
- Seeded authorization catalog: 5/5 pass.
- Contracts: 81/81 pass.
- Prisma validation, architecture/style/contrast, lint, typecheck, generation assets, and production
  build: pass locally (one unrelated pre-existing web lint warning remains).
- Repository-wide Windows run retains known host-only hard-link/native PKCS#11/literal-LF and timeout
  failures; focused changed tests pass and exact-head Linux CI is the authoritative complete-suite gate.

## Remaining approval gates

- Verify and approve the production seller legal name/form, registered address, capital, RC, ICE, IF,
  patente/PT, and contact details.
- Approve tax applicability and any exceptional legally required wording per invoice.
- Approve payment terms/method and banking details before storing them.
- Confirm the real highest externally issued number for each year before enabling automatic numbering.
- Keep real issuance disabled in staging/production until business/legal acceptance is recorded.
