# Current Agent Handoff

Last updated: 2026-10-02

## Current situation

- Issue #132 preflight/design only: [report](../design/issue-132-electronic-signature-preflight.md). Audited main `696a539361f0455c843fd79c80c83c76ebaa842d` contains Commercial PR #130 and Finance Manager. No open PRs were returned at initial overlap check.
- Proposed schema, role defaults, local/server boundary, PDF binding protocol, threat model and PR split are documented, not implemented or accepted.
- Provider-neutral implementation planning is ready. Barid adapter/native-agent implementation remains gated on written interface confirmation and a sanitized token/PDF proof.
- No migrations, runtime code, dependencies, provider transactions or production actions in this task. Keep the design PR draft/unmerged and Issue #132 open.

## Next concrete action and completion conditions

1. Review #132 proposal: internal issuer identity, sign/seal/approve/admin defaults, self-approval V1, signing eligibility, stale rejection, trusted timestamp policy and one-operation boundary. Record accepted decisions only after review.
2. Obtain Barid integration documentation/test setup and confirm exact token/SAC/API, certificate kinds, PDF/CMS binding and qualified timestamp onboarding. No support message has been sent.
3. Split future foundation, validation/publication, feasibility, adapter/native agent and EN/FR UX PRs per the report. Do not start provider implementation from generic SafeNet capability alone.
4. Foundation acceptance requires exact-version/hash and source-scope tests, immutable evidence/lineage, concurrency/replay rejection and permission/grant checks. Provider enablement additionally requires actual supported token and independently validated PDF evidence.

## Preserved unrelated follow-ups

- R-050 finance access to mission-linked commercial records remains unresolved; do not grant missions:view as a signing workaround.
- Deferred Accounting/Admin rollout and Issues #109/#110 remain separate. Issues #117/#118 and whole-product UI-DNA v1.1 remain deferred.
- Documents R-048 broader filters/limits remain separate; the ability to upload a manual version on a generated Document is explicitly considered in #132's unsigned/stale policy.
- D-068 production env/proxy body limits remain unverified; D-070 migration is not claimed deployed.

## D-071 integration requirements for future implementation

Use a marked disposable database with C.UTF-8 collation. Preserve seeded Permission metadata and RolePermission row identities/grants across both suite passes without reseed. Test-created permissions must be cleaned up; never use the development or production database.
