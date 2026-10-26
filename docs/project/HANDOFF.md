# Current Agent Handoff

Last updated: 2026-10-26

## Current situation

- `main` is `af348bb96b489d76df79c334349aaecc1377e9ff`. Its main CI run failed four
  attempts in different timing-sensitive tests, so the SHA-tagged API and web images were not published.
- A focused branch stabilizes Commercial focus and Clients/Missions edit resets before paint and caps
  the web Vitest project at two workers while root CI runs API and web tests concurrently.
- Existing assertions, authentication/session guards, permissions, invoice behavior, and deployment
  safeguards are unchanged. No VPS change or deployment occurred; automatic deployment and real invoice
  issuance remain disabled.

## Next concrete action

1. Require all four exact-head CI jobs to pass on the focused draft PR.
2. Review and merge only with explicit approval.
3. After merge, use the new verified `main` SHA to publish both immutable GHCR images and resume the
   protected manual staging deployment through its normal Environment approval.

## Completion conditions

- The focused PR remains open and unmerged until review and exact-head CI are green.
- Both SHA-tagged GHCR images exist before any deployment workflow is triggered.
- No environment gate is bypassed, automatic deployment remains disabled, and real invoice issuance
  remains disabled.
