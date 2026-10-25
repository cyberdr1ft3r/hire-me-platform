# Current Agent Handoff

Last updated: 2026-10-25

## Current situation

- Active work is Issue #244 on `feat/issue-244-invoice-business`. It adds a reusable empty-by-default
  billing profile, explicit external-number baseline confirmation, transactionally serialized
  `HM-YYYY-NNN` issuance, individual buyers, and optional French MAD amount-in-words while preserving
  the existing lifecycle, calculation engine, permissions, branded PDF, and historical invoices.
- Synthetic Chrome acceptance produced `HM-2026-042` from baseline 41 with one Accompagnement line:
  HT 991.67, TVA 198.33, TTC 1190.00. It verified protected PDF download, reload, individual buyer
  without ICE/IF, and an unchanged issued snapshot after the Administration profile was edited.
- Issue #242 remains a parallel delivery concern: staging invoice issuance stays disabled until
  business acceptance. This branch does not change deployment files, contact the VPS, or activate
  automation.

## Next concrete action

1. Review the focused draft PR for #244 and require every exact-head CI job to pass.
2. Before any real issuance, have the owner/accounting approver enter and verify the legal identity,
   tax applicability, payment/banking details, and actual highest externally issued number for the year.
3. Keep the PR unmerged and undeployed until review; preserve Issue #242's staging issuance gate.

## Completion conditions

- Exact-head CI is green on the draft PR head and review confirms the additive migration and immutable
  snapshot/sequence behavior.
- Business/legal approval supplies the production billing profile and per-year numbering baseline;
  no real personal data is committed as fixture or evidence.
- No production-readiness claim, real invoice issuance, merge, VPS change, or deployment occurs without
  the remaining approvals.
