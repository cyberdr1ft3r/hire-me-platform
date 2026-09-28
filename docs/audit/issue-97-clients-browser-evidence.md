# Issue #97 — Clients CRM browser evidence

**Gate:** `CLIENTS BROWSER GATE: PASS` (matrix); permission-limited **keyboard** spot checks deferred to unit/integration coverage.

### Environment

- **Branch head SHA:** `b13993645e75f4f2f1969b83b63b8c5f4c4b3ddd`
- **Browser:** Chromium (Playwright headless)
- **App URLs:** `http://127.0.0.1:5173` → `http://127.0.0.1:3000`
- **Database:** D-071 disposable DB `hireme_test_20260928123926_27040db73696`
- **User:** `bootstrap-admin@test-db.hireme.test` (full client/contact permissions)

### Evidence bundle

21 PNGs + `summary.json` under `/opt/cursor/artifacts/issue97-evidence/`.

Matrix: viewports **1440 / 1024 / 800 / 430 / 390** × **EN / FR** — list + selected-client detail (includes contacts panel, create client/contact forms, lifecycle actions). Locale switch @ 430 EN→FR: **0** extra `GET /v1/clients?` after language change. Detail captures: `document.scrollWidth <= document.clientWidth` (**PASS** on sampled detail shots).

### Gaps (explicit)

- No dedicated seeded `clients:view`-only browser persona on D-071 for a read-only banner screenshot (covered by `client-access.test.ts` + `ClientsPanel.test.tsx`).
- Keyboard/focus traversal not re-recorded in this bundle (Candidates/AppShell patterns unchanged; no Clients-specific focus regressions added).
