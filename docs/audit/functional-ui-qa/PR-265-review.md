# Invoice draft review — PR #265

Reviewed exact head `8080bd72a5c7123b58a1a406025cf8f5338bb295` in a separate checkout and marked database. Invoice issuance was disabled.

## Browser acceptance

1. Create a synthetic manual-buyer invoice in DRAFT with the buyer name only. In Chrome, open Commercial, Invoices, then the draft.
2. Select French and click Generate PDF. The UI said the document would be marked DRAFT and would not issue the invoice. The generation API returned HTTP 201 and the UI displayed version 1, French, and Download. Word generation was not offered.
3. Download the actual output. The 11,991 byte PDF was one page with SHA-256 `28e5b6f80bbe0c0897f43b4af391cef06aa51c7403ed8cf30e95a65b50cc0e24`, matching the generation response. The rendered page shows `BROUILLON — FACTURE`, `DOCUMENT NON ÉMIS`, the synthetic buyer, and a draft reference. The sampled rendering showed no clipping or overlap.
4. Re-read persisted records. The invoice remained DRAFT with no linked client or issuance date; the resulting INVOICE document was active in its separate draft preview identity.

[Browser flow](evidence/pr265-draft-preview-ui.png) · [Rendered first page](evidence/pr265-actual-draft-preview-page1.png)

## Remaining checks and approvals

- The four committed branch samples match their documented SHA-256 checksums and each is one page. Branch tests specify preview generation without invoice, customer, payment or numbering changes and reject Word on the preview path. Source rejects preview signing; add a signing-endpoint acceptance regression on that branch.
- Accounting and legal sign-off remains open for buyer address and service date. A synthetic preview does not authorize issuance.

No source changes were made to PR #265. No official invoice was issued.
