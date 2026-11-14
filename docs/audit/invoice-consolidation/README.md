# Invoice consolidation PDF evidence

Generated on 2026-11-14 from invoice template v8 with only synthetic identities and values:

```powershell
pnpm --filter @hire-me/api exec tsx scripts/generate-invoice-consolidation-samples.ts
```

| Sample | Coverage | SHA-256 |
| --- | --- | --- |
| `issued-full-common-service-date.pdf` | Issued invoice; address, ICE and IF present; authoritative issue date plus one common service date | `95C23551D75A322EF3D1423CC717AA4B71D3F75F8EEDD319F985D94AA5B397AB` |
| `issued-minimal-differing-service-dates.pdf` | Issued invoice; optional buyer fields absent; differing service dates retained on their lines | `F894E8F73EFC79E9D1FCEAD1D437649EA4C5970B2B045AC7EDEE168EBA4ECE2E` |
| `draft-full-common-service-date.pdf` | Draft preview; optional buyer fields present; non-issued markings; common service date | `9031CEE3FDF8E678788834941CBB702175A889F2F17BB4449607EBB7A7A8B921` |
| `draft-minimal-no-service-date.pdf` | Draft preview; optional buyer fields absent; non-issued markings; no service date | `895CBBD9A00B1AA0FD6B45211A41470B3C0CBD6CAC8E14ADBE7F354FC8FAAF1C` |

All four artifacts are one-page A4 PDFs. Poppler rendering at 120 DPI was inspected for clipping,
overlap, broken glyphs and table alignment. The first draft render exposed a title/reference overlap;
the renderer now uses a bounded title size for long document labels, and the regenerated artifacts
have no observed visual defect.

These files are review evidence only. They are not official invoices, do not come from live data and
must not be used as evidence of legal or accounting approval.
