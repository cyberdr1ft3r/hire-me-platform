# Issue #237 — final invoice PDF acceptance review

Audit date: 2026-10-23. Scope is PR #240 only. No merge or deployment was performed.

## Acceptance outcome

The invoice workflow is technically ready for business acceptance, subject to exact-head CI. It is
not approved for real invoices: business/legal identity, tax wording, banking details, customer
data, and numbering policy still require owner approval.

## Prototype comparison

The owner-provided `hireme_devis_facture_prototype_v3.pdf` was compared with a real French PDF
generated and downloaded through the current PR #240 browser flow. The prototype is a layout and
terminology reference only. Its example 12% tax rate, fictional customer data, and placeholder bank
details were not copied.

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

### Visual improvements

- The generated document is a readable one-page A4 invoice, but it does not yet reproduce the
  prototype's teal branded header, two-column seller/client cards, strongly framed totals panel, or
  branded footer.
- These are visual-fidelity improvements; the compared invoice did not omit required tested content.

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

- [`hireme-test-invoice-20pct.pdf`](./hireme-test-invoice-20pct.pdf) — real template-v3 PDF created,
  issued, reloaded, generated, and downloaded through the authenticated browser flow
- [`invoice-final-acceptance-comparison.pdf`](./invoice-final-acceptance-comparison.pdf) — three-page
  side-by-side comparison, checklist, discrepancy classification, and acceptance decision
- [`browser-issued-invoice-20pct.png`](./browser-issued-invoice-20pct.png) — reloaded browser state and
  generated-version evidence

## Verification

- Contracts invoice validation: 3/3
- Invoice renderer/template tests: 24/24
- Commercial web regression, including EN/FR issuance fields: 35/35
- Disposable PostgreSQL commercial and document-generation integration: 65/65 after all 26
  migrations
- Authorization catalog integrity: 5/5
- Browser create → issue → reload → generate French template v3 → protected download: passed; PDF
  size 12,278 bytes
- Visual QA: both generated PDFs were rendered to images and inspected; no clipping or overflow was
  observed

Repository-wide formatting, lint, type checking, build, schema validation, and exact-head CI are
recorded in PR #240 after the final commit.

## Final decision

Technically ready for business acceptance after green exact-head CI. Not production-ready and not
approved for real invoice issuance until the business/legal items above are accepted. PR #240 must
remain draft, unmerged, and undeployed.
