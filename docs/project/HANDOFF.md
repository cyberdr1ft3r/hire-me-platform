# Current Agent Handoff

Last updated: 2026-10-25

## Current situation

- Issue #245 is isolated on `fix/issue-245-staging-blockers`, based on merged Issue #242 / PR #243
  `main` `c1bfcaea9511efa9393554471c4f7a088374d8be`.
- The final API runtime now carries the repository-owned Noto fonts and CI proves a synthetic French
  invoice from the actual image, including accents, totals, multi-line wrapping, embedded faces, and
  passive-PDF constraints.
- The protected Environment auto-deploy variable is evaluated after job admission and defaults closed;
  automatic deployment still requires exact lowercase `true`. Manual exact-`DEPLOY` confirmation and
  Environment review are unchanged.
- The runbook requires an explicit administrative `IdentityFile`, strict pinned host verification,
  and no password fallback. CI still uses a separate restricted non-root identity.
- No VPS change or deployment occurred. Invoice issuance remains disabled pending business acceptance.

## Next concrete action

1. Review the focused draft PR and require all checks to pass on its exact final head.
2. Keep automatic deployment disabled and the deployment workflow unused.
3. With separate approval, prepare the audited host prerequisites: restricted deploy account and
   wrapper, firewall/reboot decision, directories and isolated network, existing-proxy route, off-host
   paired backups, monitoring, DNS/TLS, restore/rollback drill, and synthetic browser acceptance.

## Completion conditions

- Issue #245 exact-head CI and review are green; no merge is implied by this handoff.
- The first staging rollout remains manual, reviewed, digest-pinned, synthetic-only, recoverable, and
  monitored.
- No real invoice issuance, automatic deployment, or production-readiness claim occurs without the
  remaining security, recovery, infrastructure, and business approvals.
