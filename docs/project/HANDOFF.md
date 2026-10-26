# Current Agent Handoff

Last updated: 2026-10-26

## Current situation

- Draft PR #247 integrates Issue #244 invoice business alignment with current `main`
  `d745de9295220c6e9c30116488ed76f783ace18b`, including the merged Issue #245 staging-blocker fixes.
- The reusable empty-by-default billing profile, explicit external-number baseline, serialized
  `PREFIX-YYYY-NNN` issuance, immutable snapshots, individual buyers, and French MAD amount-in-words
  remain intact. Synthetic acceptance produced `HM-2026-042` with HT 991.67, TVA 198.33, and TTC
  1190.00 and verified protected download, reload, and snapshot immutability.
- The final API image retains repository-owned Noto fonts and container-level French invoice checks.
  Protected-Environment auto-deploy evaluation remains fail-closed and exact-lowercase-`true` opt-in;
  manual exact-`DEPLOY` confirmation, strict host verification, and separate restricted deployment
  identity remain unchanged.
- No VPS change or deployment occurred. Invoice issuance remains disabled pending business acceptance.

## Next concrete action

1. Require all CI jobs to pass on PR #247's exact integrated head and complete human review.
2. Keep automatic deployment disabled and the deployment workflow unused.
3. Before any real issuance, have the owner/accounting approver verify the legal identity, tax
   applicability, payment/banking details, and actual highest externally issued number for the year.
4. With separate approval, prepare the audited host prerequisites and perform isolated restore,
   rollback, monitoring, DNS/TLS, and synthetic browser acceptance drills.

## Completion conditions

- PR #247 exact-head CI is green and review confirms the additive migration, immutable snapshot and
  sequence behavior, container fonts, and deployment gates.
- The first staging rollout remains manual, reviewed, digest-pinned, synthetic-only, recoverable, and
  monitored; automatic deployment stays disabled.
- No real invoice issuance, merge, VPS change, deployment, or production-readiness claim occurs without
  the remaining security, recovery, infrastructure, and business approvals.
