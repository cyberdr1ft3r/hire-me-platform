# Invoice consolidation PDF evidence

Regenerated on 2026-11-15 from invoice template v8 with only synthetic identities and values after
the business owner approved the issued synthetic preview against the supplied final invoice PDF:

```powershell
pnpm --filter @hire-me/api exec tsx scripts/generate-invoice-consolidation-samples.ts
```

| Sample | Coverage | SHA-256 |
| --- | --- | --- |
| `issued-full-common-service-date.pdf` | Issued invoice; address, ICE and IF present; authoritative issue date plus one common service date | `8818CE0627A268C97A48A71996EF38DE9511F8C4799B0DCE562E9900A7DF873D` |
| `issued-minimal-differing-service-dates.pdf` | Issued invoice; optional buyer fields absent; differing service dates retained on their lines | `ED7ABEA888AA8FD9D179078A6BE7D692AAE5F608C66EA8E1F80C406C54F990D6` |
| `draft-full-common-service-date.pdf` | Draft preview; optional buyer fields present; non-issued markings; common service date | `5C1D6754EB412B7E35A6D2BC46C20CD6EBAF329A7226238D67651EFF89D6D931` |
| `draft-minimal-no-service-date.pdf` | Draft preview; optional buyer fields absent; non-issued markings; no service date | `8A601F4404D9B2AF530238158DEDDF3B539159E4B43EDB239082EFBD1EAFEFF4` |

All four artifacts are one-page A4 PDFs. Poppler rendering at 120 DPI was inspected for clipping,
overlap, broken glyphs and table alignment. The approved layout has the thin teal top rule, unboxed
seller identity in the upper-left, invoice identity in the upper-right, one full-width pale-blue client
block, a wide designation column with compact numeric columns, pale-blue subtotal/TVA rows, dark-teal
TTC, a full-width amount-in-words band, one combined payment/reference panel and a minimal
bottom-aligned legal footer. Issued documents show neither an issued-status badge nor a due date.
Drafts preserve the same identity with `BROUILLON — FACTURE` and `DOCUMENT NON ÉMIS`; the redundant
badge was removed to avoid overlapping the seller identity.

The supplied owner PDF was visually inspected locally as the authoritative reference and was not
copied into the repository. The business owner approved the synthetic issued preview on 2026-11-15.
That visual approval does not constitute accounting, legal or production-release approval and does
not establish byte-for-byte parity or exact VPS source parity.

The focused renderer suite covers long descriptions, multiple line items, optional buyer fields and
an invoice-specific 24-line pagination case. The final line and reference panel must remain present
after the table spans multiple pages.

These files are review evidence only. They are not official invoices, do not come from live data and
must not be used as evidence of legal or accounting approval.
