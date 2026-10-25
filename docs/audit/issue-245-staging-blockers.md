# Issue #245 — staging blocker verification

## Scope and invariants

This change follows the 2026-10-25 read-only VPS audit. It makes no VPS, DNS, firewall, account,
permission, package, service, or deployment change. The Issue #242 architecture remains intact:
GitHub-hosted builds, exact-SHA GHCR tags, digest deployment, protected manual approval, restricted
non-root SSH, private PostgreSQL, separate durable document storage, and disabled invoice issuance.

## Runtime invoice proof

The API package allowlist now includes `assets/fonts`, so `pnpm --prod deploy` copies the
repository-owned Noto faces into the final image. CI then:

1. builds the final `apps/api/Dockerfile` runtime stage;
2. runs it without network, with a read-only root filesystem, all capabilities dropped, and
   `no-new-privileges`;
3. renders a synthetic French invoice using the production renderer; and
4. independently inspects the artifact outside the image.

The verifier requires a valid bounded PDF, embedded Noto Sans Regular and Bold faces, exact French
accents and totals, a long description spanning at least three drawn lines, one or two pages, and no
JavaScript, launch, attachment, open-action, or remote-URI constructs. Local final-image evidence:
13,717 bytes, one page, two embedded font faces, and nine wrapped description lines.

## Protected deployment gate

GitHub Environment variables are unavailable to a job-level `if`. The workflow now starts the
protected `staging` job for an eligible event and evaluates `STAGING_AUTO_DEPLOY_ENABLED` in its first
step. Every registry, SSH, and deployment step depends on that result. Automatic deployment requires
all of: `workflow_run`, successful conclusion, `main` head branch, and the exact lowercase value
`true`. Missing, empty, false, padded, or mixed-case values fail closed. Manual deployment still
requires exact `DEPLOY` and the Environment review. A successful `main` run can wait for a reviewer
before the Environment-scoped gate reports a no-deploy result; no SSH or deployment step runs first.

The deterministic gate suite covers the manual confirmation, absent/default-false and malformed
values, successful-main constraints, and unsupported events.

## SSH administration and remaining gates

The runbook now requires the `hireme-vps-root` alias to name its dedicated `IdentityFile`, combine it
with `IdentitiesOnly yes`, pin the ED25519 host identity, and disable password and
keyboard-interactive fallback. This operator identity must never be reused by GitHub Actions.

The repository is not authorization to deploy. Remaining operations require explicit approval:
replace root-oriented administration with the dedicated restricted deploy path; review the pending
host reboot and inactive UFW posture; create and validate the root-owned wrapper, paths, isolated
network, proxy route, secrets, and resource controls; configure off-host paired database/document
backups; prove isolated restore and rollback; add monitoring; validate DNS/TLS; and complete
synthetic-only browser acceptance. Real invoice issuance remains blocked on business/legal approval.
