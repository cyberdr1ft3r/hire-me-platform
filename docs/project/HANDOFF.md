# Current Agent Handoff

Last updated: 2026-10-24

## Current situation

- PRs #239 and #240 are merged in base `main` at
  `4c3d85aec7b89b80322889a539b7857b9a58250e`. Their terminology and invoice decisions remain intact;
  Login Page v2 changes no invoice code, schema, permission, lifecycle, numbering, calculation, or PDF
  template.
- The active work is `feat/login-page-v2`. It refines only the public login presentation and safe
  client-side failure classification. Existing authentication endpoints, request bodies, memory-only
  access tokens, HTTP-only refresh-cookie flow, refresh single-flight, session restoration, cross-tab
  coordination, logout, permission filtering, and backend authorization are unchanged.
- Login is bilingual and responsive, with explicit field labels, browser autofill hints, visible focus,
  a labelled pressed-state password visibility button, pending state, synchronous duplicate-submit
  prevention, safe credential/network errors, and a discreet localized health state. It introduces no
  password-reset link, registration path, or nonfunctional authentication control.
- Local verification passes for focused authentication/localization tests, the 44-case App regression,
  formatting, architecture/style/contrast, lint (one pre-existing warning), typecheck, and production
  build. Installed Chrome evidence covers 1440 × 900 EN desktop, 800 × 1000 EN tablet, and 390 × 844
  FR mobile, keyboard order, visibility toggling, Enter submission, and horizontal overflow. The full
  Windows web run retains the known literal-LF stylesheet failure; exact-head Linux CI remains the
  authoritative full-suite gate.

## Next concrete action

1. Review the draft PR titled `feat: refine HireMe login experience` and its desktop/mobile evidence.
2. Require all four exact-head CI jobs to remain green before any merge approval.
3. Keep the PR draft, unmerged, and undeployed until explicit approval.

## Completion conditions

- Successful, invalid-credential, unavailable-service, pending/duplicate, restored-session, cross-tab,
  password visibility, keyboard, EN/FR, and responsive cases are covered without changing auth
  contracts or authorization.
- Desktop and mobile evidence is attached, and all four exact-head CI jobs are green on the reported
  final SHA.
- The focused PR remains draft; no merge or deployment occurs.
