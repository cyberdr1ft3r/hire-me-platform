# Bundled font assets

These fonts are committed so the API can render Unicode PDF output with no network access
at build time or at runtime. They are used only by the Issue #49 document-generation PDF
renderer.

The binaries are byte-for-byte upstream releases. They are **not** modified, subsetted,
renamed, or re-hinted, so the SIL Open Font License reserved-name requirements are met.

## Provenance

| File                         | Bytes   | SHA-256                                                            | Upstream                                                                                                                                                         |
| ---------------------------- | ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotoSans-Regular.ttf`       | 431,364 | `f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8` | `notofonts/notofonts.github.io` `fonts/NotoSans/unhinted/ttf/NotoSans-Regular.ttf` at commit `28b15b4b43b7bed62b5cf6e6b0b5ff5846270535` (2024-11-21)             |
| `NotoSans-Bold.ttf`          | 432,376 | `87cb2d84472a7d66da659ee47b6cdb9552326e8c128245231f191b6ac72529d9` | `notofonts/notofonts.github.io` `fonts/NotoSans/unhinted/ttf/NotoSans-Bold.ttf` at commit `28b15b4b43b7bed62b5cf6e6b0b5ff5846270535` (2024-11-21)                |
| `NotoSansArabic-Regular.ttf` | 142,140 | `bd86ca02f087d7f3c3788ba458fb6b73744c7639ed276b8d870dba6def6c40d0` | `notofonts/notofonts.github.io` `fonts/NotoSansArabic/unhinted/ttf/NotoSansArabic-Regular.ttf` at commit `4dba672c5e3c703bc97966db0f39995bc5d43b5f` (2025-10-16) |

- Canonical upstream project: <https://github.com/notofonts/notofonts.github.io>
- Acquired: 2026-09-08
- License: SIL Open Font License 1.1, reproduced verbatim in `OFL.txt`
- Unhinted builds are used deliberately: PDF viewers rasterise with their own hinting, so
  the hinted builds would add roughly 190 KB per face for no rendering benefit.

## Why these three faces

- `NotoSans` covers Latin, Latin Extended, Greek, and Cyrillic, which is the repertoire
  European and Moroccan business records use for names, references, and amounts.
- `NotoSansArabic` covers the Arabic script including the Arabic-Indic digits and the
  contextual forms Arabic shaping requires.
- A bold Arabic face is deliberately **not** bundled. Bold is used only for template
  labels, headings, and table headers, which are always rendered in the template language
  (French or English). An Arabic run therefore always falls in a regular-weight context;
  if one ever reaches a bold context it renders in `NotoSansArabic-Regular`, which is a
  weight difference rather than a loss of meaning.

## Script coverage

Supported today: Latin (including Latin Extended), Greek, Cyrillic, and Arabic, plus
mixed Latin/Arabic lines with correct bidirectional ordering.

Text in a script outside this coverage fails closed with
`GENERATION_PDF_SCRIPT_UNSUPPORTED` rather than being substituted or dropped. Adding a
script means committing its Noto face here, recording it in this table, and registering it
in `font-registry.ts`; no renderer change is required.
