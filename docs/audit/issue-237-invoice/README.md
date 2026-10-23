# Issue #237 — final invoice PDF acceptance review

Audit date: 2026-10-23. Scope is PR #240 only. No merge or deployment was performed.

## Acceptance outcome

The invoice workflow and the approved visual direction are technically ready for business
acceptance, subject to exact-head CI. It is not approved for real invoices: business/legal identity,
tax wording, banking details, customer data, and numbering policy still require owner approval.

## Prototype comparison

The accessible owner-provided `hireme_devis_facture_prototype_v3.pdf` was used as the primary
branding and layout reference. The requested `hireme_devis_facture_prototype_v3(2).pdf` was not
present in the workspace or supplied file locations at review time, so exact fidelity to that
specific copy remains unverified. The prototype is a layout and terminology reference only. Its
example 12% tax rate, fictional customer data, and placeholder bank details were not copied.

The test invoice uses the owner-confirmed 20% TVA:

- Reference: `FAC-2026-TEST-0001`
- Issue date / due date: 23/10/2026 / 22/11/2026
- Quantity / unit price HT: 4 / 10 000,00 MAD
- Sous-total HT / TVA / Total TTC: 40 000,00 / 8 000,00 / 48 000,00 MAD
- Seller: documented HIRE ME legal form, capital, address, ICE, RC, email, and website from the
  prototype
- Buyer: conspicuously synthetic name and address
- Payment: 30 days and bank transfer; bank/RIB left blank
- Seller IF and buyer ICE/IF left blank because approved values were not provided

## Discrepancy classification

### Critical for issuing real invoices

Verified technical/template defects were corrected:

- Issued snapshots can now preserve optional seller legal form, capital, email, website, buyer tax
  identifier, billing contact, customer reference, and payment method.
- The French template now uses accented labels, localized dates and money, a visible uniform tax
  rate, and `Total HT` for each line instead of the ambiguous tax-inclusive `Total ligne`.
- The new fields participate in the generation source fingerprint, so idempotency and stale-source
  protection still cover the complete immutable snapshot.

No further reproducible technical blocker remained in the tested PDF/lifecycle scope.

### Visual improvements completed

- Added the accepted teal header treatment and preserved the existing wordmark, changing only the
  spacing between `Hire` and `Me`.
- Added framed seller/client identity cards, a teal line-item header, a strongly framed totals panel,
  paired payment/reference panels, and a restrained footer.
- Kept the prototype's structure, hierarchy, branding direction, and color usage without changing
  invoice calculations or business behavior.

### Business information still requiring approval

- Exact seller legal wording and confirmation of the prototype's legal form, capital, address, ICE,
  and RC
- Seller IF and production tax treatment; 20% is confirmed only for this test invoice
- Bank name and RIB/IBAN
- Real buyer legal name, address, ICE or IF, and billing contact
- Invoice numbering format, sequence scope, and reset policy
- Production payment terms/method and which quotation, order, contract, mission, or customer
  references are mandatory

## Acceptance artifacts

- [`hireme-test-invoice-branded-20pct.pdf`](./hireme-test-invoice-branded-20pct.pdf) — updated
  one-page template-v4 sample using the confirmed 20% TVA
- [`hireme-test-invoice-branded-20pct-page-1.png`](./hireme-test-invoice-branded-20pct-page-1.png) —
  rendered visual-QA view of the updated sample
- [`invoice-branding-before-after.pdf`](./invoice-branding-before-after.pdf) — concise one-page
  side-by-side comparison of the same synthetic invoice in template v3 and v4
- [`invoice-final-acceptance-comparison.pdf`](./invoice-final-acceptance-comparison.pdf) — three-page
  baseline comparison, checklist, discrepancy classification, and acceptance decision
- [`browser-issued-invoice-branded-20pct.png`](./browser-issued-invoice-branded-20pct.png) — reloaded
  browser state and template-v4 generated-version evidence

## Verification

- Contracts invoice validation: 3/3
- Invoice renderer/template and Unicode tests: 52/52
- Commercial web regression, including EN/FR issuance fields: 35/35
- Disposable PostgreSQL commercial and document-generation integration: 65/65 after all 26
  migrations
- Authorization catalog integrity: 5/5
- Browser create → issue → reload → generate French template v4 → protected download: passed
- Visual QA: the updated invoice and one-page before/after PDF were rendered to images and inspected;
  no clipping or overflow was observed

Repository-wide formatting, lint, type checking, build, schema validation, and exact-head CI are
recorded in PR #240 after the final commit.

## Final decision

Technically ready for business acceptance after green exact-head CI. Not production-ready and not
approved for real invoice issuance until the business/legal items above are accepted. PR #240 must
remain draft, unmerged, and undeployed.
