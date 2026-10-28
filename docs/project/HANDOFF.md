# Current Agent Handoff

Last updated: 2026-10-28

## Current situation

- Issue #254 implements the separately reviewed D-097 pre-merge staging path on `feat/secure-premerge-staging`, based on `main` `a46458b852aa4a8ad275100e47a9a2a1057a270a`.
- The workflow is manual, main-defined, same-repository-only, exact-head-CI-gated, Environment-reviewed, protected-path-restricted, digest-pinned, and doubly attested. The feature build never receives staging SSH secrets.
- Existing staging deployment, backup, migration, health, rollback, and isolation controls are reused without server or Environment-policy changes. Production is unreachable from this workflow.
- PR #253 remains draft, unmerged, and undeployed. Its target SHA can be released only after Issue #254 merges with green exact-head CI and the protected Environment reviewer approves the explicit PR/SHA dispatch.

## Next concrete action

1. Complete security/engineering review and exact-head CI for the Issue #254 PR.
2. Merge Issue #254 only with explicit approval; keep the staging Environment branch policy `main`.
3. Dispatch `deploy-pr-staging.yml` from `main` for PR #253 and exact SHA `6ff6698791577d337ea05792fdfcf3009eed2142`; approve the protected Environment only after comparing both values.
4. Record backup, migration, health, smoke, rollback, and pending-Soukaina evidence on PR #253. Do not merge it or enable invoice issuance.

## Completion conditions

- Issue #254 exact-head CI and review are green before merge.
- The selected feature SHA has successful exact-head CI and verified provenance plus PR-binding attestations before deployment.
- The existing Environment review, backup, migration, health, and rollback gates all succeed.
- PR #253 stays open and unmerged; production and real invoice issuance remain untouched.
