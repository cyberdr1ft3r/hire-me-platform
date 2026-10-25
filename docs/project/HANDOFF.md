# Current Agent Handoff

Last updated: 2026-10-25

## Current situation

- Active work is Issue #242 on `feat/issue-242-cicd`, based on `main`
  `51759edb82c0646f43f8e4582b224dbbc5b0f4a4`. It introduces GitHub-hosted image builds, immutable
  SHA-tagged GHCR publication, a secure staging Compose bundle, a conditional shared-Caddy reference,
  protected manual deployment, and backup/restore/rollback procedures.
- The deployment workflow refuses a SHA that is not current `main`, resolves both images to registry
  digests, verifies the exact approved ED25519 fingerprint from a host-specific known_hosts secret,
  and calls only a root-owned restricted wrapper through a non-root account. Automatic deployment is
  inert unless the protected environment variable is explicitly set to `true`.
- The VPS has not been contacted or modified. Its OS, capacity, Docker/Compose, reverse proxy, port
  owners, workloads, firewall, deploy account, DNS, backups, and monitoring are unverified. The proxy
  bundle must not be started if another proxy owns 80/443.
- Staging uses synthetic data only. Invoice issuance is explicitly disabled in the example production
  environment until business acceptance; the existing invoice implementation is otherwise untouched.

## Next concrete action

1. Open the focused draft PR referencing #242 and require all exact-head jobs, including both image
   matrix legs, to pass.
2. Keep the PR unmerged and the deployment workflow unused. After a separately approved read-only VPS
   audit, provision the documented prerequisites and demonstrate manual deploy, paired backup/restore,
   rollback, and synthetic browser acceptance before considering automatic staging rollout.

## Completion conditions

- Exact-head CI is green and records immutable SHA tags/digests after merge to main; PR CI performs
  build-only validation and cannot publish or deploy.
- GitHub Environment secrets/variables, dedicated SSH access, GHCR pull identity, shared proxy route,
  private storage, recovery, monitoring, and DNS are independently reviewed and provisioned.
- No production-readiness claim, real invoice issuance, merge, VPS change, or automatic deployment
  occurs without the remaining technical, security, recovery, and business approvals.
