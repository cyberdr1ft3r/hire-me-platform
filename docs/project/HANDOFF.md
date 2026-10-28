# Current Agent Handoff

Last updated: 2026-10-28

## Current situation

- Issue #254 implements the separately reviewed D-097 pre-merge staging path on `feat/secure-premerge-staging`, based on `main` `a46458b852aa4a8ad275100e47a9a2a1057a270a`.
- The workflow is manual, main-defined, same-repository-only, exact-head-CI-gated, Environment-reviewed, protected-path-restricted, digest-pinned, and doubly attested. The feature build never receives staging SSH secrets.
- Existing staging deployment, backup, migration, health, rollback, and isolation controls are reused without server or Environment-policy changes. Production is unreachable from this workflow.
- PR #253 remains draft, unmerged, and undeployed. Its target SHA can be released only after Issue #254 merges with green exact-head CI and the protected Environment reviewer approves the explicit PR/SHA dispatch.

## Next concrete action

1. Require green exact-head CI and maintainer review for PR #255; merge only with explicit approval.
2. Before first use, disable administrator bypass on the `staging` Environment and protect `main` with an explicitly reviewed ruleset while retaining the exact `main` deployment branch policy. Add a second trusted reviewer before enabling prevent-self-review.
3. Dispatch `deploy-pr-staging.yml` from `main` for PR #253 and exact SHA `6ff6698791577d337ea05792fdfcf3009eed2142`; approve only after comparing both values.
4. Record backup, migration, health, smoke, rollback, and pending-Soukaina evidence on PR #253. Do not merge it or enable invoice issuance. After a null-client invoice exists, use roll-forward or isolated paired restore rather than relying on the previous API image alone.

## Completion conditions

- PR #255 exact-head CI and maintainer review are green before merge.
- Administrator bypass is disabled for `staging`, and `main` is protected as the workflow trust anchor.
- The selected feature SHA has successful exact-head CI and verified provenance plus PR-binding attestations before deployment.
- The existing Environment review, backup, migration, health, and rollback gates all succeed.
- PR #253 stays open and unmerged; production and real invoice issuance remain untouched.

## Client libre hotfix context

- `hotfix/client-address-optional` carries the reviewed Client libre implementation on top of current protected `main` so the address-only correction can target `main` without modifying PR #253.
- Draft manual-client creation already accepts a required name with an optional address; the hotfix must close remaining regression gaps while preserving issuance-time buyer-address validation.
- No deployment, production data change, or invoice issuance is part of this branch.
