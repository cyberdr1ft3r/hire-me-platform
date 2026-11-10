# 2026-10-29 — Contabo staging VPS emergency hotfix record

> **Documentation-only record.** This file does not deploy, merge, reissue invoices, or change application logic. It is stored on `fix/invoice-pdf-layout` because that was the GitHub branch used as the recovery baseline. The **actual VPS hotfix commit is local-only**, not part of this GitHub branch.

## Scope and provenance

| Item | Recorded state |
| --- | --- |
| Environment | HIRE ME staging — `hire-me.dr1ft3r.dev` |
| Host (shell prompt) | `th3lvb` |
| Deployment workspace | `/opt/hireme/staging` |
| Recovery worktree | `/opt/hireme/hotfix/source` |
| GitHub baseline branch | `fix/invoice-pdf-layout` |
| Baseline commit | `54500b554234bc80d3b8d6650ba3799a129a4668` (PR #263) |
| Additional Client libre fix | `4622314a27945d47e705a3963e4de81128cb77b1` (PR #262) |
| VPS recovery branch | `hotfix/staging-client-libre-recovery` |
| VPS local recovery commit | `da77e547c962d84a7882c5199dd8c72d9ba77974` |
| Temporary Compose override | `/opt/hireme/hotfix/local-images.override.yml` |
| Recorded recovery date | 2026-10-29 |

The emergency recovery combined the invoice PDF-layout branch with the standalone **Client libre** / optional manual-client address fix in a local VPS worktree. It was **not** a release of GitHub `main`, nor proof that PR #262 or PR #263 was merged.

## Local image build and deployment

Two local images were successfully built:

| Service | Local image tag | Recorded image ID |
| --- | --- | --- |
| API | `hireme-api:staging-client-libre-recovery` | `sha256:bec82f9dd5b46836a909ed8bc63e595e0306e661967c13d000799422b4fbdd80` |
| Web | `hireme-web:staging-client-libre-recovery` | `sha256:e04c94aa476dabf3eb61317e8bc32d0c177025b65ce6f33533098e03096971fe` |

The override selected these two tags with `pull_policy: never`. The recorded Compose validation succeeded (`COMPOSE_VALIDATION_STATUS=0`) using project `hireme-staging`, the existing `release.env`, `compose.yml`, and that override.

The recovery was then applied locally to the staging API/Web services. The session's post-recovery checks recorded healthy API, Web and PostgreSQL containers, HTTP 200 for the public frontend and API, and no observed Prisma runtime errors. PostgreSQL data and persistent volumes were preserved. No historical invoice records were directly changed as part of the recovery.

**Important:** `/opt/hireme/staging/release.env` still recorded the prior GHCR-pinned release (`RELEASE_SHA=54500b554234bc80d3b8d6650ba3799a129a4668`) rather than the local-image override. Therefore `release.env` alone is **not** reliable evidence of the running code; a normal deployment or Compose invocation without the override could replace the emergency recovery images. Re-check container image IDs and full Compose invocation before any future staging rollout.

## Invoice/PDF validation boundaries

- Local focused invoice-PDF tests were reported passing (25/25).
- Nine existing staging invoices, `FAC-2026-0002` through `FAC-2026-0010`, were reconciled against their expected references, clients and monetary amounts; recorded aggregate: **13,020 MAD TTC**.
- Their recorded issuance dates remained **2026-10-29**, even where the line descriptions referred to service dates in July–September. This is an **accounting/display discrepancy to resolve**, not authorization to change persisted issuance dates.
- Historical records, invoice numbers, previously generated PDF versions and underlying monetary amounts were not silently rewritten or reissued.
- Subsequent *offline validation copies* used a clearer distinction between **Date de prestation** and **Date d’émission : 29/10/2026**. These copies were not a staging database migration or an automatic replacement of original invoices.
- The PDF's handling of service date vs legal issuance date remains subject to explicit business/accounting approval before official regeneration, merge, or rollout.

## GitHub synchronization and unresolved risk

- The VPS local `hotfix/staging-client-libre-recovery` branch was at `da77e547...`.
- HTTPS `git push --dry-run` could not authenticate (interactive credentials unavailable).
- GitHub SSH authentication failed (`Permission denied (publickey)`).
- Thus there was **no verified remote push** of `da77e547...` from this recovery session. At the time of this documentation, the exact commit and branch were not found on GitHub.
- PR #262 (`hotfix/client-address-optional`) and PR #263 (`fix/invoice-pdf-layout`) remain the separately reviewable source branches. Do **not** merge both without resolving their overlap and the explicit invoice-date approval gate.

## Next reconciliation gate (read-only until approved)

1. Inspect the VPS worktree HEAD and uncommitted changes at `/opt/hireme/hotfix/source`.
2. Inspect running container image IDs and Compose configuration, including the override; avoid exposing environment secrets or private invoice data.
3. Compare local `da77e547...` with PR #262 and PR #263, identify unique hotfix changes, then preserve them in a reviewed GitHub branch through an authenticated, controlled workflow.
4. Verify a reproducible, immutable-image staging release with backup, migration and rollback safeguards **before** replacing the local recovery.
5. Require the owner/accountant's explicit decision about service dates and issuance dates before official invoice PDF regeneration.

No additional code change, deployment, merge, DB modification, or invoice issuance is authorized by this note.
