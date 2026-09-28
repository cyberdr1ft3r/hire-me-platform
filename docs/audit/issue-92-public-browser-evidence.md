# Issue #92 — Public Opportunity browser evidence (paste to GitHub)

Post the body below as a single comment on [Issue #92](https://github.com/cyberdr1ft3r/hire-me-platform/issues/92). Evidence files live on the audit runner at `/opt/cursor/artifacts/issue92-evidence/`.

<!-- BEGIN GITHUB COMMENT -->

## Issue #92 — Public Opportunity real-browser evidence (EN/FR)

**Gate:** `PUBLIC OPPORTUNITY BROWSER GATE: PASS`

### Environment

- **`main` SHA:** `b3486e6b6e52838bdce74edbd8a7d5816c090e92`
- **Browser:** Chromium 140.0.7339.16 (Playwright headless)
- **OS / runtime:** Linux (Cloud Agent VM), Node v22.14.0
- **App URLs:** `http://127.0.0.1:5173` (web) → `http://127.0.0.1:3000` (API)
- **Database:** D-071 disposable DB (`hireme_test_20260926230544_78eaa6b1728b`), synthetic seed only (3 public slugs: `audit-en-platform-engineer`, `audit-fr-ingenieur-plateforme`, `audit-null-language-analyst`)

### Evidence bundle

Indexed screenshots + metrics: 57 PNGs, `index.json`, `summary.json` (audit runner artifact path: `/opt/cursor/artifacts/issue92-evidence/`). Naming: `{index}-vp{width}-{locale}-{surface}.png`, plus `d070-*` and `locale-switch-*`.

### Matrix (viewport × locale)

| Viewport | Locale | List | Detail | Form | Validation | Overflow | Keyboard | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | EN | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 1440 | FR | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 1024 | EN | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 1024 | FR | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 800 | EN | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 800 | FR | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 430 | EN | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 430 | FR | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 390 | EN | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 390 | FR | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |

### D-070 language-of-parts (authored vs UI chrome)

All checks scoped to `#public-main` authored nodes (UI chrome inherits document `lang`).

| Case | UI locale | Slug | Expected authored `lang` | Viewports exercised | Result |
| --- | --- | --- | --- | --- | --- |
| A | FR | `audit-en-platform-engineer` | `en` | 1440–390 | **PASS** |
| B | EN | `audit-fr-ingenieur-plateforme` | `fr` | 1440–390 | **PASS** |
| C (EN UI) | EN | `audit-null-language-analyst` | `""` | 1440–390 | **PASS** |
| C (FR UI) | FR | `audit-null-language-analyst` | `""` | 1440 | **PASS** |

Recorded checks: `document.documentElement.lang` matches UI locale; authored titles/body/facts keep declared `lang`; no auto-translation of opportunity text; UI section headings (`Key details` / `Informations clés`, form labels) follow UI language.

Automated D-070 records: 16 (all **PASS**).

### Locale switch + form retention (430px, EN → FR)

- Pre-switch fill: name `Locale Retention Test`, email `retention@example.test`
- Values retained after switch: **yes**
- Authored `h1` `lang` before/after: `en` / `en` (unchanged)
- Extra `GET /v1/public/opportunities/audit-en-platform-engineer` after switch: **0** (no unnecessary refetch observed)
- Screenshot: `057-locale-switch-fr-after-fill.png`
- Result: **PASS**

### Responsive / overflow

At every matrix cell: `document.scrollWidth <= document.clientWidth` (**PASS**). Mobile widths (430, 390): language `<select>` and CV file input remained in viewport; no horizontal page scroll.

### Keyboard / focus (Chromium)

- Skip link receives first Tab on list and detail (**PASS**).
- Skip link activates `#public-main` focus target (**PASS**).
- Language selector, back link, apply anchor, form fields, file input, consent, submit reachable via Tab (**PASS**).
- Honeypot `website` field not focused during traversal (**PASS**).
- One `h1` per list/detail page (**PASS**).
- Client-side validation: summary banner + per-field `role="alert"` / `aria-invalid` associations (**PASS**).

### Public-conformance observations (observable on synthetic data)

- CV required; certification/diploma/additional upload slots hidden when disabled in contract (**PASS**).
- Salary amount uses decimal text field (not cents) with localized hints (**PASS**).
- No internal mission/client IDs rendered in public DOM (**PASS**).
- List title link accessible name equals authored title text (no extra `aria-label`) (**PASS**).
- `clientName: null` opportunity omits company name field (confidential placeholder not applicable on this fixture).

### Not exercised

- Public list/detail **loading** skeleton timing capture (pages reached `ready` quickly on local dev).
- Public **empty** list (seed always lists 3 opportunities).
- Public **API error** / **404** pages (not reachable without synthetic API fault injection).
- **payloadTooLarge** / transport-size error copy in live browser (requires oversized upload attempt; covered in API/integration tests on `main`, not re-run here).
- **D-068** production reverse-proxy/body-size operational verification (explicitly out of scope).

### Defects

None observed in this audit run.

---

**PUBLIC OPPORTUNITY BROWSER GATE: PASS**

<!-- END GITHUB COMMENT -->

## Issue #75 update (factual)

On `main` at `b3486e6b6e52838bdce74edbd8a7d5816c090e92`, Issue #92 captured real Chromium EN/FR evidence at viewports 1440/1024/800/430/390 for public list, detail, application form (validation + partial fill), D-070 cases, keyboard/responsive checks, and locale-switch form retention. **Public Opportunity browser conformance gate: PASS.** D-068 production env/proxy body-size verification remains a separate operational check (not closed).

## Issue #66 update (factual)

Public Opportunity representative surface (#62) browser evidence gate completed via #92 with **PASS** on merged `main` `b3486e6`. AppShell/i18n audit items outside this public surface remain as tracked on #66.
