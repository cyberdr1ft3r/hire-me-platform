# Pre-merge staging deployment

Use this procedure only after Issue #254 and `.github/workflows/deploy-pr-staging.yml` are merged to
`main`. The selected feature PR stays open and unmerged.

## Prerequisites

1. The PR is open, belongs to `cyberdr1ft3r/hire-me-platform`, and targets `main`.
2. The selected 40-character SHA is still the PR's current head.
3. Exact-head CI is successful, including every required job.
4. Review the PR diff, especially Prisma migrations, authorization, storage, environment, and outbound
   network behavior. The workflow rejects changes to `.github/`, `deploy/`, Dockerfiles,
   `.dockerignore`, and the release-gate scripts.
5. Confirm staging is the intended target and production is out of scope.
6. Confirm `INVOICE_ISSUANCE_ENABLED=false` unless a separate business-approved synthetic issuance
   window exists.

The GitHub `staging` Environment must retain its required reviewer and its single custom branch policy
`main`. Dispatching this workflow from a feature ref is refused.

## Dispatch

Set the exact values once. The confirmation contains both the PR and SHA to prevent an accidental
selection mismatch.

```bash
PR_NUMBER=253
RELEASE_SHA=6ff6698791577d337ea05792fdfcf3009eed2142

gh workflow run deploy-pr-staging.yml \
  --ref main \
  -f "pr_number=$PR_NUMBER" \
  -f "release_sha=$RELEASE_SHA" \
  -f "confirmation=DEPLOY PR-$PR_NUMBER $RELEASE_SHA"
```

Open the resulting Actions run. The required Environment reviewer must compare the displayed PR and
SHA with the approved request before approving. Approval authorizes publishing and deploying that one
commit; it does not approve or merge the PR.

## What the workflow enforces

1. The workflow file and verifier come from `main`.
2. GitHub confirms the same-repository PR, base, open state, current head, protected paths, exact CI run,
   and required jobs.
3. API and web images build on GitHub-hosted runners without staging SSH secrets and publish under the
   exact SHA.
4. GitHub OIDC signs build provenance and the PR/SHA/CI binding for each digest.
5. The deploy job resolves and verifies both digests and attestations.
6. The existing pinned host key, restricted deploy account, digest allow-list, paired database/document
   backup, `prisma migrate deploy`, container health, and public health checks remain authoritative.

## Evidence to record

- Workflow run URL and Environment approver.
- PR number, deployed SHA, exact CI run ID, and API/web digests.
- Wrapper output naming the pre-deployment backup and final release SHA.
- Migration outcome and post-deploy `prisma migrate status`.
- API/web/PostgreSQL health and public HTTPS checks.
- Feature-specific synthetic smoke results, with no real client or legally effective invoice data.
- Rollback release SHA/digests and backup checksum result.
- Acceptance state, initially **Pending user validation**.

Post the sanitized evidence on the feature PR. Never post credentials, cookies, environment values,
document contents, database dumps, or customer data.

## Failure and recovery

- **Gate refusal:** fix the PR state or exact CI. Do not weaken the gate.
- **Protected-path refusal:** merge the release-control change through its own reviewed main PR; this
  pre-merge path is intentionally unavailable.
- **Image exists without valid attestations:** stop. Investigate package history. Delete only the exact
  failed package version under separately reviewed package administration, then retry.
- **Backup failure:** deployment stops before migration. Preserve diagnostics.
- **Migration failure:** keep writers stopped, preserve Prisma diagnostics, and follow the existing
  staging runbook. Never use `migrate reset`, edit applied migrations, or mark a partial migration
  applied without verifying exact schema state.
- **Application failure after a successful additive migration:** invoke the existing wrapper's
  `rollback` action with the previously recorded digest-pinned release. Keep the compatible additive
  schema in place.
- **Data damage:** restore the paired recovery set into new isolated volumes first; never overwrite the
  current volumes as the first recovery action.

The full backup, restore, rollback, monitoring, and host-hardening rules remain in
`docs/runbooks/staging-deployment-issue-242.md`.
