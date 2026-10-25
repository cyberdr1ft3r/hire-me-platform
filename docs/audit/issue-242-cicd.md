# Issue #242 — CI/CD implementation evidence

## Baseline audit

| Area | Existing main | Issue #242 result |
| --- | --- | --- |
| CI | Four exact-head quality, PostgreSQL, signing-lab, and integration jobs | Preserved; image build/publish waits for all four |
| Images | None | Multi-stage API and static-web images, Linux AMD64, non-root runtime |
| Registry | None | GHCR commit-SHA tag only; deployment resolves and records digest |
| VPS build | Not defined | Prohibited; reviewed digest pull only |
| Compose | Local development PostgreSQL only | Separate staging stack; DB private; durable DB/doc volumes; health/resource/security controls |
| HTTPS | No repository-owned production topology | Conditional shared Caddy plan; existing proxy must be preserved if found |
| Migrations | Local scripts and CI integration | One-shot `prisma migrate deploy` before API rollout |
| Backup/rollback | No staging procedure | Quiesced predeploy database/doc recovery set; forward-only migration rollback rule |
| Invoice acceptance | Business/legal blocker documented | Explicit production issuance switch, disabled in staging example |

Issue #242 made no VPS connection or mutation. The separately approved 2026-10-25 read-only audit is
now complete; Issue #245 records its repository remediations and the remaining host provisioning,
firewall/reboot, proxy, backup/recovery, and monitoring gates. No deployment was performed.

## Verification record

Local verification on 2026-10-25:

- architecture/style/contrast, lint (one pre-existing unused-disable warning), typecheck, production
  API/web builds, compiled generation assets, formatting, and diff checks pass;
- environment/issuance policy tests pass 6/6 after the final configuration assertions;
- PDF rendering passes 25/25 in isolation; the aggregate Windows run retains the known CRLF stylesheet
  assertion and lacks the optional native PKCS#11 module, while one PDF case exceeded five seconds only
  under that parallel run;
- all 26 migrations apply from empty; Commercial/invoice plus generated-document PostgreSQL integration
  passes 68/68 and authorization catalog checks pass 5/5;
- staging and proxy Compose validation, both Caddy validations, deployment shell syntax, and the new
  deployment workflow actionlint pass;
- API and web Docker builds pass from the repository context. The runtime images are non-root and
  approximately 196 MB and 23 MB respectively; the API bundle contains the compiled app, Prisma CLI,
  schema, all migrations, generated client, and working native Argon2 runtime.

Exact-head GitHub PR CI remains required. PR builds prove both image definitions but intentionally do
not publish packages or deploy. After an approved merge, the `main` run must additionally show both
SHA tags and registry digests.

## Acceptance boundaries

- The application lifecycle, invoice numbering, calculations, immutable snapshots, permissions, and
  PDF template are unchanged.
- Production startup now requires an explicit invoice-issuance decision. Staging defaults to disabled.
- Automatic deployment code exists but the undefined/false environment variable keeps it disabled.
- The supplied proxy stack is a reference implementation, not authority to replace a live proxy.
- No claim of production readiness is made before infrastructure, security, recovery, and business
  acceptance gates are complete.
