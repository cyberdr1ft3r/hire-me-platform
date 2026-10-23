# Current Agent Handoff

Last updated: 2026-10-23

## Current situation

- Issue #237 is the active P0. The invoice workflow now captures an immutable issuance business
  snapshot and template v2 renders it in FR/EN. PostgreSQL integration, concurrency, authorization,
  lifecycle, renderer, frontend, build, and authenticated browser create/issue/reload/generate/
  download checks pass locally. Exact-head CI and the draft PR are the remaining technical delivery
  steps.
- The requested `hireme_devis_facture_prototype_v3.pdf` was unavailable, so exact branding/layout
  comparison is explicitly unverified. Real invoicing remains blocked on Soukaina's approval of
  seller identity and legal identifiers, tax treatment, payment details, numbering policy, and the
  final prototype. Evidence is in `docs/audit/issue-237-invoice/`.

- Issue #234 visual-fidelity refinement is in progress on `feat/issue-234-top-navigation`. Before/
  after installed-Chrome screenshots compare the same synthetic Candidates directory and selected
  quick profile at 1117 × 707. The utility row is 45px (was 56px), workspace strip 33px (was 34px),
  and content inset/padding 12px (was 16px). More-menu clipping by the module-list scrollport was
  confirmed and corrected using viewport positioning. EN/FR desktop/mobile and 200%-equivalent
  viewport smoke checks pass without horizontal overflow or browser errors. Approved corrections
  remove the decorative global-search box and render Recruitment as a plain context label; the
  first row now balances the brand/context group against existing right-aligned utilities. Evidence
  includes same-state Candidates before/after screenshots at 1117 × 707.
- Formatting, architecture/contrast checks, TypeScript, web lint (one pre-existing ClientsPanel test
  warning), 41 focused shell/localization regressions, final AppShell 17/17, and web build pass. The
  existing production large-chunk advisory remains. Native Chrome zoom is not directly exercised;
  the 559 × 354 viewport is an equivalent-width smoke check. Evidence is under
  `docs/audit/issue-234-top-navigation/`.
- Exact-head Actions run #580 passed all four jobs on implementation commit
  `5a5f9c8cd10a5832b8b5eb7959241fc2f53aedec`. Any later PR head must be checked independently.
  PR #238 remains open and draft; keep it unmerged and do not deploy.

- Latest verified `main` after merged PR #233 is `ce4dad61b0c89499b94a8558c1483b09c67f3ea2`; post-merge
  Actions run `39445963478` passed all four required jobs on that exact commit.
- B2 branch `feat/issue-232-b2-console-tabs` is based directly on that main. It adds the visible tab
  UI, mobile workspace dialog, App router/provider integration, and session-local route identity
  while preserving D-089/RV1/RV2, B0′ guards, and existing URLs.
- Route-level Suspense initially retained the previous module in hidden DOM during a lazy import;
  keying the boundary by the active route fixed that active-only rendering violation. The full App
  suite passes 44/44 and the focused B2/navigation set passes 100/100. The latest full Windows web
  suite run with two workers passed 1,110/1,111 tests; the one failure is the existing literal-LF
  stylesheet assertion against CRLF checkout bytes. The default-parallel run also timed out under
  suite load. Do not present local full-suite results as green; exact-head Linux CI is authoritative.
- B2 and the visual refinement are published on `feat/issue-232-b2-console-tabs` in draft PR #235:
  `https://github.com/cyberdr1ft3r/hire-me-platform/pull/235`. Exact head
  `355f9b6d07d8f3e39149a322f9448f683cd2c38e` passed all four required GitHub Actions jobs in run
  `39498835152`; GitHub reports the PR mergeable. The PR remains draft and unmerged. No merge or
  deployment is authorized.
- Installed Chrome refinement evidence passes 28 EN/FR workspace/viewports across Tasks, Clients,
  Documents, Commercial, and Candidates. Native Chrome 200% zoom is still unverified because this
  environment's UI bridge cannot control the headed Chrome window; arrange this manual check before
  review. Evidence and local gate outcomes are in `docs/audit/issue-232-console-tabs-evidence/README.md`.
- Latest verified `main` includes merged PR #229, which
  records the accepted D-089 Phase A architecture with RV1/RV2. RV1 keeps tab identity in existing
  `history.state` with URL-only fallback and one navigation authority; RV2 guards only genuinely
  unsaved values. B2 must render only the active module; hidden Activity trees, response caching and
  sessionStorage restoration are out of scope.
- B0′ merged as PR #230 at `bb4ee927dddb93a13492c74ebe894e8df1d013b2`. Its dirty detection,
  multi-blocker navigation-guard behavior, and form coverage across Tasks, Training, Accounting,
  Commercial, Documents, Messages and Administration are preserved. Evidence:
  [B0′ audit](../audit/issue-228-b0-unsaved-input.md).
- B0′ exact-head Actions passed all four jobs on `d65009249d1084c8cec990d1a31a2752b947be5f`; its
  committed installed-Chrome audit is 20/20 on the hardened implementation. Browser checks could not
  be rerun during reconciliation because credentials and Docker access were unavailable.
- B1 PR #231 is merged in `main` at `0e0ae23cd0909085f1414fddda54588bd737`. B2 is underway only
  after the maintainer-provided authorization and green-main gate. Its PR must remain draft and
  unmerged; do not deploy.

## Next concrete action

1. Open the focused Issue #237 draft PR and verify every required job against its exact head.
2. Obtain the prototype and Soukaina's business/legal approvals before any production invoice is
   issued. Keep the PR draft and unmerged; do not deploy.

## Completion conditions

- Authorized users can create, issue, reload, generate, and download an invoice with server-owned
  totals and an immutable, validated business snapshot; duplicate issue/generation is prevented.
- PostgreSQL integration, concurrency, authorization/lifecycle, PDF content, EN/FR, browser, build,
  and exact-head CI evidence is recorded in the Issue #237 draft PR.
- Missing business/legal inputs and the unavailable prototype remain explicit acceptance blockers.
  No merge, deployment, or unrelated work.
