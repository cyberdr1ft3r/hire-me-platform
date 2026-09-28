# Issue #97 — Clients CRM browser evidence

**Gate:** `CLIENTS BROWSER GATE: PASS`

### Environment

- **Application head SHA:** `871490010010e45893e4683a728828f46fef2746` (PR #98)
- **Exact application-head GitHub Actions:** run `36438714586` — success (all three jobs)
- **Browser:** Chromium (Playwright headless)
- **App URLs:** `http://127.0.0.1:5173` → `http://127.0.0.1:3000`
- **Database:** D-071 disposable DB `hireme_test_20260928123926_27040db73696` (checkout-owned audit provisioning; full D-071 receipt/marker guard applied for that run)

### Synthetic audit personas (disposable DB only)

Personas were created and used **only** inside the checkout-owned D-071 disposable database above for this evidence capture. They are not part of merged seed data and are not documented with reusable credentials.

| Email | Permission set (effective) | Role in evidence |
| --- | --- | --- |
| `bootstrap-admin@test-db.hireme.test` | Full admin (existing D-071 bootstrap) | Responsive matrix + keyboard |
| `issue97-clients-view@test-db.hireme.test` | `records:view`, `clients:view`, `client_contacts:view` | Read-only Clients workspace |
| `issue97-contact-editor@test-db.hireme.test` | `records:view`, `clients:view`, `client_contacts:view`, `client_contacts:update` | Contact edit without client mutations |

### Evidence bundle

27 PNGs + `summary.json` under `/opt/cursor/artifacts/issue97-evidence/` (audit runner artifacts; not committed to the repository).

### Responsive matrix (1440 / 1024 / 800 / 430 / 390 × EN / FR)

List + selected-client detail for each cell. All detail captures: `document.scrollWidth <= document.clientWidth` (**PASS**). List row contrast uses semantic tokens (`--color-text`, `--color-text-muted`, `--color-table-selected`) after CSS correction.

### Permission-limited (430 EN/FR)

| Persona | Read-only notice | Client mutations | Contact mutations | Result |
| --- | --- | --- | --- | --- |
| View-only | Visible | Create absent; save/archive/lifecycle disabled | Create absent; save disabled | **PASS** |
| Contact editor | Absent | Create absent; save client disabled | Save contact enabled | **PASS** |

Screenshots: `perm-viewonly-en.png`, `perm-viewonly-fr.png`, `perm-contact-editor-en.png`, `perm-contact-editor-fr.png`.

### Keyboard / focus (430 EN/FR)

Tab traversal from Clients workspace through filters, list row, detail fields/actions, and contact controls. No keyboard trap detected; focus ring visible on interactive controls. Logged first 20 stops in `summary.json` → `results.keyboard`. Screenshots: `keyboard-focus-en-end.png`, `keyboard-focus-fr-end.png`. **PASS**

### Locale switch

EN → FR @ 430 on `/clients`: **0** extra `GET /v1/clients?` after language change (`summary.json` → `results.localeSwitch`). **PASS**

### Contrast regression (CI)

`scripts/check-web-contrast.mjs` includes client-list pairings (primary/secondary on selected row, muted meta on canvas).
