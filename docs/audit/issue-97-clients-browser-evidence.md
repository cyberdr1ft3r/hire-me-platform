# Issue #97 — Clients CRM browser evidence

**Gate:** `CLIENTS BROWSER GATE: PASS`

### Environment

- **Branch head SHA:** (see PR #98 exact-head CI)
- **Browser:** Chromium (Playwright headless)
- **App URLs:** `http://127.0.0.1:5173` → `http://127.0.0.1:3000`
- **Database:** D-071 disposable DB `hireme_test_20260928123926_27040db73696`
- **Users (synthetic):**
  - `bootstrap-admin@test-db.hireme.test` — full Clients workspace (matrix + keyboard)
  - `issue97-clients-view@test-db.hireme.test` — `clients:view` + `client_contacts:view` (read-only)
  - `issue97-contact-editor@test-db.hireme.test` — `clients:view` + `client_contacts:view` + `client_contacts:update`
  - Password (audit personas): `CiSyntheticAuditPassphrase123!`

Provisioning (disposable DB only): `TEST_DATABASE_URL=… pnpm --filter @hire-me/api exec tsx ../../scripts/issue97-audit-db-setup.ts`

### Evidence bundle

27 PNGs + `summary.json` under `/opt/cursor/artifacts/issue97-evidence/`.

Capture driver: `/opt/cursor/playwright-runner/capture.mjs` (Chromium).

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
