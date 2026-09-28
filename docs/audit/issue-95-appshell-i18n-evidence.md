# Issue #95 — AppShell / EN/FR i18n foundation evidence (paste to GitHub)

Post the body below as a single comment on [Issue #95](https://github.com/cyberdr1ft3r/hire-me-platform/issues/95). Evidence files live on the audit runner at `/opt/cursor/artifacts/issue95-evidence/`.

<!-- BEGIN GITHUB COMMENT -->

## Issue #95 — AppShell / EN/FR localization foundation audit

**Gate:** `APPSHELL / I18N FOUNDATION GATE: PASS`

### Environment

- **`main` SHA:** `cb0f3edb8fbdbe71c2d55922dda3182f43ab1701`
- **Browser:** Chromium 140.0.7339.16 (Playwright headless)
- **OS / runtime:** Linux (Cloud Agent VM), Node v22.14.0
- **App URLs:** `http://127.0.0.1:5173` (Vite dev) → `http://127.0.0.1:3000` (API)
- **Database:** D-071 disposable DB (`hireme_test_20260926230544_78eaa6b1728b`), synthetic credentials only
- **Synthetic users:** `bootstrap-admin@test-db.hireme.test` (full nav); `issue95-limited@test-db.hireme.test` (GUEST / `records:view` only, seeded for this audit)

### Evidence bundle

16 PNGs + `summary.json` + `supplemental.json` under `/opt/cursor/artifacts/issue95-evidence/`.

Key captures: Overview EN/FR @ 1440 & 390 (`001`–`004`), responsive matrix @ 1024/800/430 (`005`–`010`), mobile drawer @ 430 EN/FR (`011`–`012`), permission-limited nav + denied admin (`013`), deferred `/clients` under FR shell (`014`), bilingual `/reporting` under FR shell (`015`), authenticated locale switch (`016`).

### Classification legend

- **KEEP** — intentional v1 behaviour, no change required for rollout
- **CORRECT** — already aligned with #52 / #54 / deferred-route policy
- **DEFER** — follow-up outside this audit (separate bounded issue)
- **NO DRIFT** — observed behaviour matches merged architecture/tests

---

### 1. Locale selection / persistence — **NO DRIFT** (deterministic) + **KEEP** (browser spot checks)

| Check | Source | Result |
| --- | --- | --- |
| Stored `en` / `fr` | `locale.test.ts`, `localization.integration.test.tsx` | **PASS** |
| Browser French fallback (`fr`, `fr-FR`, `FR-ca`) | `locale.test.ts` | **PASS** |
| Non-French browser → English | `locale.test.ts` | **PASS** |
| Invalid/tampered `localStorage` ignored | `locale.test.ts`; Chromium unauthenticated (`supplemental.json` `invalidStored`) | **PASS** |
| Runtime EN ↔ FR switch (shell labels, `<html lang>`) | `localization.integration.test.tsx`; screenshot `016-locale-switch-en-fr.png` | **PASS** |
| Preference written to `hireme.locale` on switch | `localization.integration.test.tsx` | **PASS** |
| Route unchanged on locale switch | `localization.integration.test.tsx`; Playwright switch on `/` | **PASS** |
| Permissions/session unchanged on switch | Mocked integration tests; limited-user nav unchanged by design | **PASS** |
| No unnecessary API GET refetch on switch | Playwright: **0** extra `GET /v1/*` after language `<select>` change (`summary.json` `localeSwitch`) | **PASS** |

**Not re-run in browser this session:** authenticated full-page reload immediately after locale switch (extended audit session hit `/auth/refresh` HTTP 429 rate-limit on cold load). Persistence of `hireme.locale` after switch is covered by integration tests above.

---

### 2. Language semantics — **CORRECT** / **NO DRIFT**

| Check | Source | Result |
| --- | --- | --- |
| `<html lang>` follows UI locale | All overview matrix cells in `summary.json`; `content-language.test.tsx` | **PASS** |
| AppShell chrome, login, overview, permission-denied in UI language | Vitest suite; limited denied screenshot `013` | **PASS** |
| Deferred modules wrapped once in `.legacy-english-content` | `App.tsx` + `content-language.test.tsx`; `/clients` FR: `legacy: 1`, `htmlLang: fr` (`014`) | **PASS** |
| Bilingual routes **not** wrapped (Reporting, Tasks, Candidates, Public Opportunity) | `deferredEnglishRoutes` inventory test; `/reporting` FR: `legacy: 0`, heading `Rapports de recrutement` (`015`) | **PASS** |
| Shell French does not override deferred English module copy | Playwright `014-deferred-clients-fr.png` + RTL tests | **PASS** |
| Record/business values not machine-translated | Architecture + existing module tests (out of scope to re-translate here) | **NO DRIFT** |

---

### 3. AppShell navigation / permissions — **CORRECT**

| Persona | Visible nav (Playwright) | `/admin` behaviour | Result |
| --- | --- | --- | --- |
| Bootstrap admin | Full permission-filtered set (all matrix runs) | Authorized (not captured; admin deferred English) | **PASS** |
| GUEST (`records:view`) | Nav links: `['/']` only (`summary.json` `limited`) | Client-side route → `Permission denied.` alert, no admin UI leak (`013`) | **PASS** |

| Check | Source | Result |
| --- | --- | --- |
| `aria-current` on active destination | `AppShell.test.tsx`, `AppShell.integration.test.tsx` | **PASS** |
| History / in-app navigation | `AppShell.integration.test.tsx` | **PASS** |
| Locale switch does not alter visible destinations | Architecture + integration tests | **PASS** |
| No raw implementation IDs in shell chrome | Overview screenshots + nav label keys only | **PASS** |

**Audit note (DEFER, not a foundation defect):** Full document navigation (`page.goto`) to authenticated deep routes after login was **not** used as the primary gate signal because Vite dev + React StrictMode issues paired `/auth/refresh` calls and this marathon session occasionally returned HTTP **429** on refresh. In-app routing (`history.pushState` + `popstate`) matches production SPA navigation and **passed** for permission denial and deferred/bilingual routes.

---

### 4. Responsive matrix (real Chromium)

Widths **1440 / 1024 / 800 / 430 / 390** × **EN / FR** on authenticated Overview (`/`):

| Viewport | EN overflow | FR overflow | `html lang` | Result |
| --- | --- | --- | --- | --- |
| 1440 | 1440 ≤ 1440 | 1440 ≤ 1440 | en / fr | **PASS** |
| 1024 | 1024 ≤ 1024 | 1024 ≤ 1024 | en / fr | **PASS** |
| 800 | 800 ≤ 800 | 800 ≤ 800 | en / fr | **PASS** |
| 430 | 430 ≤ 430 | 430 ≤ 430 | en / fr | **PASS** |
| 390 | 390 ≤ 390 | 390 ≤ 390 | en / fr | **PASS** |

Language selector reachable in shell (desktop sidebar / mobile drawer). Mobile menu trigger present at 390/430 in overview captures.

---

### 5. Mobile drawer @ 430 / 390 — **KEEP**

| Check | Evidence | Result |
| --- | --- | --- |
| Opens; dialog semantics | `011`/`012`; `AppShell.test.tsx` | **PASS** |
| Main `#main-content` **inert** while open | Playwright `inert: true` (`summary.json`) | **PASS** |
| Escape closes (focus on dialog first) | Evidence script + `AppShell.test.tsx` | **PASS** |
| Initial focus inside drawer; Tab stays in drawer @ 390 | `supplemental.json` `drawer390` EN/FR | **PASS** |
| Scrim / close button | `AppShell.test.tsx` | **PASS** |
| Language selector in drawer | Screenshots `011`/`012` | **PASS** |

Route navigation closing drawer + main focus: **PASS** via `AppShell.test.tsx` (not re-filmed in PNG this run).

---

### 6. Accessibility — **NO DRIFT**

Covered by `AppShell.test.tsx` + `localization.integration.test.tsx`: skip link first meaningful stop → `#main-content`; visible focus; translated nav region names; modal focus trap; locale-aware control labels; meaningful `h1` on Overview.

---

### 7. Shared translated surfaces — **CORRECT**

Login, Overview, permission denied, API health label, refresh profile, logout, navigation groups/destinations, language selector: message-key driven, exercised in integration tests and/or overview/denied/locale-switch screenshots. Development AppShell preview entry remains dev-only (**KEEP**, unchanged).

---

### 8. I18n / formatter correctness — **NO DRIFT**

`format.test.ts`, `translate.test.ts`, typed message keys (no silent runtime fallback), `Intl` number/date/currency (MAD/EUR explicit, no FX), plural rules — **71/71** targeted Vitest tests **PASS** (7 files). Tests not weakened.

---

### 9. Deferred-module inventory (audit only — **do not translate here**)

| Module | Actually English UI today | `LegacyEnglishContent` boundary correct | Obvious mixed-language drift | V1 rollout blocker | Recommended order |
| --- | --- | --- | --- | --- | --- |
| **Clients** | YES | YES | None observed | NO | **1** |
| **Missions** | YES | YES | None observed | NO | **2** |
| **Training** | YES | YES | None observed | NO | **3** |
| **Commercial** | YES | YES | None observed | NO | **4** |
| **Documents** | YES | YES | None observed | NO | **5** |
| **Accounting** | YES | YES | None observed | NO | **6** |
| **Admin** | YES | YES | None observed | NO | **7** (last: highest privilege density) |

No deferred route is substantially bilingual today; removing boundaries early would be **drift** — **KEEP** current list until each module’s scoped rollout issue lands.

---

### Defects requiring CORRECT issues

**None** identified in application code during this audit.

---

### Out of scope (explicit)

D-068 production proxy verification, D-070 production migration, Issue #93 seeded RolePermission cleanup, whole-product UI-DNA v1.1, translating deferred modules.

---

**APPSHELL / I18N FOUNDATION GATE: PASS**

**Ready for ChatGPT evidence review: YES**

<!-- END GITHUB COMMENT -->

## Issue #66 update (factual)

On `main` at `cb0f3edb8fbdbe71c2d55922dda3182f43ab1701`, Issue #95 completed the AppShell / shared EN/FR foundation audit with real Chromium evidence (Overview responsive matrix, mobile drawer, permission-limited nav, deferred vs bilingual language boundaries, locale switch refetch observation) plus **71** targeted Vitest tests unchanged. **APPSHELL / I18N FOUNDATION GATE: PASS.** Recommended module rollout order: **Clients → Missions → Training → Commercial → Documents → Accounting → Admin** (each via its own bounded issue; do not remove `LegacyEnglishContent` until that module’s bilingual rollout merges).
