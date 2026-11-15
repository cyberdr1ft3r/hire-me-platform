# Invoice consolidation PDF evidence

Generated on 2026-11-14 from invoice template v8 with only synthetic identities and values:

```powershell
pnpm --filter @hire-me/api exec tsx scripts/generate-invoice-consolidation-samples.ts
```

| Sample | Coverage | SHA-256 |
| --- | --- | --- |
| `issued-full-common-service-date.pdf` | Issued invoice; address, ICE and IF present; authoritative issue date plus one common service date | `54A8DB7D855A323ED867D0CF73836827C1A5295E64E47B1A39DD8229F865F481` |
| `issued-minimal-differing-service-dates.pdf` | Issued invoice; optional buyer fields absent; differing service dates retained on their lines | `4F964708911258C26236DCB847783EAA01D613EADE1A7E861675DB6EDE0D52B8` |
| `draft-full-common-service-date.pdf` | Draft preview; optional buyer fields present; non-issued markings; common service date | `CF399495F79FE72784D1993EAF6734AB39312B730BCB13DE234513ECE97A1923` |
| `draft-minimal-no-service-date.pdf` | Draft preview; optional buyer fields absent; non-issued markings; no service date | `AAC3F78B233313E3D03C2A09A6DF1ACBFF3E567B191C4CB0870D6163B50545B4` |

All four artifacts are one-page A4 PDFs. Poppler rendering at 120 DPI was inspected for clipping,
overlap, broken glyphs and table alignment. The visual correction restores the previously accepted
v4 geometry and palette while retaining template-v8 data behavior: 56 pt margins, the teal wordmark
and top rule, issued-status badge, stored due date, paired seller/client cards with pale-blue headings,
the equal-width five-column teal table, gray
subtotal/TVA rows, dark-teal TTC row, amount-in-words band, paired payment/reference cards and a
bottom-aligned legal footer. Drafts use the same visual system with conspicuous non-issued markings.

`approved-reference-restored-v8-comparison.png` places the repository's prior synthetic approved
business sample beside the regenerated v8 issued sample. Both sides contain only synthetic data. The
owner PDF named `invoice-fac-2026-0003-v3(1).pdf` was not exposed as a local task artifact, so exact
pixel comparison to that specific file remains pending a workspace-accessible copy; the correction
does not claim byte-for-byte or pixel-perfect parity with personal invoice data.

The focused renderer suite covers long descriptions, multiple line items, optional buyer fields and
an invoice-specific 24-line pagination case. The final line and reference panel must remain present
after the table spans multiple pages.

These files are review evidence only. They are not official invoices, do not come from live data and
must not be used as evidence of legal or accounting approval.
