# HireMe staging deployment runbook (Issue #242)

This runbook prepares `hire-me.dr1ft3r.dev` for a manual-first staging deployment. It does not
authorize access to `194.195.87.238`, installation, DNS changes, deployment, or automatic rollout.
Staging contains synthetic data only.

## 1. Release architecture

GitHub-hosted runners execute all tests and build the API and web images. A successful `main` CI run
publishes only the exact commit-SHA tags:

- `ghcr.io/cyberdr1ft3r/hire-me-platform-api:<40-character-sha>`
- `ghcr.io/cyberdr1ft3r/hire-me-platform-web:<40-character-sha>`

The deployment workflow resolves those tags to registry digests before SSH. The VPS receives only
the SHA and two digest-pinned image references; it never receives source and never builds an image.
The API image contains the compiled NestJS application, generated Prisma client, migration history,
and production dependencies. The web image contains static Vite output served by an unprivileged
Caddy process.

The application stack uses an internal-only PostgreSQL network, an external `shared-edge` network,
a named PostgreSQL volume, and a separate named private-document volume. PostgreSQL publishes no
host port. Only the shared reverse proxy publishes 80/443. Resource ceilings total roughly 2.9 GiB
RAM and 2.75 CPUs across HireMe plus the optional shared Caddy proxy; they are limits, not reservations.

`deploy/proxy` is a proposed shared Caddy owner only for a host with no existing reverse proxy. If
the audit finds Caddy, Traefik, Nginx, or another port-80/443 owner, preserve it and translate only
the site routing from `sites/hire-me-staging.caddy`. Never start a second proxy or replace unrelated
site configuration.

## 2. Gates before any server access

1. Verify the live ED25519 host key out of band against Contabo. The currently approved fingerprint
   is `SHA256:9iMx/5YGJSoHOywFcbUqc+57p3tepSDGgOZ7axCj7lw`. Stop on any mismatch.
2. Obtain explicit approval for read-only SSH access. Use `StrictHostKeyChecking=yes`; never accept a
   newly presented key interactively.
3. Audit OS/version, CPU/RAM/disk, updates, Docker/Compose, port owners, proxy, networks, containers,
   services, firewall, SSH settings, storage paths, and existing backups. Preserve all workloads.
4. Obtain separate approval before installing packages, creating users, changing firewall/SSH/DNS,
   starting a proxy, or deploying HireMe.

## 3. VPS prerequisites (not assumed)

- Supported Ubuntu host with security updates reviewed and adequate free disk/inodes.
- Docker Engine, the Compose v2 plugin, and `curl` from approved sources.
- A key-only, non-root `hireme-deploy` account that is **not** a Docker-group member.
- A root-owned application directory `/opt/hireme/staging`, root-owned secrets under `/etc/hireme`,
  and root-owned backups under `/var/backups/hireme-staging`.
- External Docker network `shared-edge`, created once after checking for a naming collision.
- An existing compatible HTTPS reverse proxy, or approved installation of the supplied shared Caddy
  stack. DNS must resolve only `hire-me.dr1ft3r.dev` to `194.195.87.238` before ACME validation.
- Outbound access to GHCR and an approved GHCR pull credential limited to `read:packages`.
- An encrypted off-host backup destination and an owner-tested retention/restore policy.

Install the reviewed files from the approved commit, not from an untrusted working tree:

```text
/opt/hireme/staging/compose.yml                         root:root 0644
/usr/local/sbin/hireme-staging-deploy                  root:root 0755
/etc/hireme/staging.env                                root:root 0600
/etc/hireme/ghcr.env                                   root:root 0600
/etc/hireme/ghcr-token                                 root:root 0600
```

`/etc/hireme/ghcr.env` contains only `GHCR_USERNAME=<machine-account>`. The token is stored separately
in `/etc/hireme/ghcr-token` and is never passed on a command line. Generate independent random values
for the database password, access-token secret, and refresh-token pepper. URL-encode the password in
`DATABASE_URL`. Keep `INVOICE_ISSUANCE_ENABLED=false` until business acceptance explicitly authorizes
synthetic issuance testing and later real use.

The only sudo permission for `hireme-deploy` should be the root-owned wrapper:

```sudoers
hireme-deploy ALL=(root) NOPASSWD: /usr/local/sbin/hireme-staging-deploy *
```

The wrapper rejects non-HireMe repositories, non-digest images, malformed SHAs, and concurrent runs.
Do not grant shell-wide sudo or Docker-socket access. Validate this rule with `visudo -cf` and confirm
that unrelated sudo commands and direct Docker access are denied.

## 4. GitHub `staging` environment

Create a protected GitHub Environment named `staging`, require reviewers, prevent self-review where
available, and restrict deployments to `main`. Configure:

| Kind | Name | Value/purpose |
| --- | --- | --- |
| Secret | `STAGING_SSH_PRIVATE_KEY` | Dedicated unencrypted CI deploy key; no root key |
| Secret | `STAGING_SSH_HOST_KEY` | Exact host-specific known_hosts ED25519 line for `194.195.87.238` |
| Variable | `STAGING_SSH_USER` | `hireme-deploy` after independent login verification |
| Variable | `STAGING_SSH_PORT` | Audited SSH port, normally `22` |
| Variable | `STAGING_AUTO_DEPLOY_ENABLED` | Keep absent or exactly `false` initially |

`GITHUB_TOKEN` supplies package write/read inside Actions; no long-lived GitHub token is needed there.
The VPS pull token is independent and never stored in GitHub Actions. The workflow checks the pinned
known_hosts line yields the approved ED25519 fingerprint and keeps strict host-key checking enabled.

## 5. Initial manual deployment

1. Review and merge #242 only after exact-head CI and approval. The present task does neither.
2. Audit the VPS and perform the prerequisite setup under separately approved change control.
3. Confirm both SHA tags exist in GHCR and record their registry digests from the CI run.
4. Confirm the selected SHA is still the exact head of `main`.
5. If no proxy exists and its installation is approved, create `shared-edge`, install `deploy/proxy`,
   provide `ACME_EMAIL`, validate with `caddy validate`, then start it. Otherwise add the equivalent
   host rule to the audited shared proxy without disturbing existing sites.
6. In Actions, run **Deploy staging** manually with the 40-character SHA and confirmation `DEPLOY`.
   Approve the protected environment only after checking SHA and digests.
7. The wrapper pulls both digests, makes a pre-deployment database/document backup when replacing a
   release, runs `prisma migrate deploy` as a one-shot service, starts the stack, waits for container
   health, and checks the public web and API health endpoints.
8. Verify TLS, browser login/session restore/logout, permission denial, and private document access.
   With an approved synthetic account and `INVOICE_ISSUANCE_ENABLED=true`, run the complete synthetic
   draft → issue → reload → PDF generate → authorized download flow, then return the flag to `false`
   unless business acceptance explicitly allows issuance. Never use real customer data.
9. Copy the backup off-host using an approved encrypted channel and record the restore drill evidence.

Automatic staging deployment remains inert unless a maintainer explicitly changes
`STAGING_AUTO_DEPLOY_ENABLED` to `true`. Enable it only after a successful manual deployment, backup
and restore exercise, rollback exercise, browser acceptance, and security review.

## 6. Backup and restore

Before a replacement release, the wrapper stops the API to quiesce writes, creates a custom-format
`pg_dump`, archives the private-document volume, and writes SHA-256 checksums. A database dump and its
document archive are one recovery set. Backups stay mode-restricted and must be copied encrypted to a
separate system. Monitor backup age, size, checksum, capacity, and off-host copy success.

Restore is deliberately manual and must first target new, isolated volumes:

1. Stop application writers and copy the selected recovery set to a protected restore workspace.
2. Verify `sha256sum -c SHA256SUMS`.
3. Create a new PostgreSQL database/volume and new private-document volume; do not overwrite current
   volumes during the first attempt.
4. Restore with `pg_restore --clean --if-exists --no-owner --no-acl` into the isolated database and
   extract documents into the isolated document volume with ownership `1000:1000` and mode `0700`.
5. Start an isolated API against the restored pair, run integrity and synthetic authorization/download
   checks, and record counts/checksums. Promote the restored pair only after approval.

Test this procedure before enabling automatic deployment. A backup that has not passed a restore drill
is not accepted recovery evidence.

## 7. Rollback

Every successful deployment records its SHA and image digests under `/opt/hireme/staging/releases`.
To roll application code back, obtain the previous release file, verify its SHA/digests and CI, then
invoke the protected wrapper with `rollback` and those three values. The same lock, pull, backup,
health, and smoke gates apply. Rollback deliberately skips `migrate deploy`; it never attempts a
down-migration or asks an older image to reconcile a newer migration history.

Prisma migrations are forward-only: rolling back images does **not** reverse schema migrations. Every
migration deployed through this process must therefore be backward-compatible with the previous API.
If it is not, stop deployment. On migration failure, preserve diagnostics, keep writers stopped, and
restore the pre-deployment recovery set into new volumes; never edit an applied migration or use
`prisma migrate reset` on staging.

## 8. Monitoring and unresolved blockers

At minimum, alert on public HTTPS/API health, container restart/health, disk and inode usage, PostgreSQL
health, TLS expiry, backup freshness/checksum/off-host copy, and failed Actions deployments. Logs must
exclude tokens, cookies, passwords, document bodies, and customer data.

Deployment remains blocked until the VPS audit confirms its real state, dedicated access is verified,
root credentials are rotated interactively, Docker/proxy/firewall changes are approved, DNS is set,
GitHub/VPS secrets are provisioned, off-host recovery is tested, a production bootstrap-admin process
is approved, proxy IP semantics (R-055) are resolved, and invoice legal/business data is accepted
(R-061). Do not enable real issuance merely to make a smoke test pass.
