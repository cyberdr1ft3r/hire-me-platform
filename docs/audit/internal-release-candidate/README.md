# Internal release candidate

The candidate contains the existing internal toolchain, workflows, recruitment acceptance and Executive Dashboard correction. It is a review candidate, not a deployment approval.

## Exact inputs

| PR | Head | Integration |
| --- | --- | --- |
| #266 | 47c5218 | Included: base toolchain |
| #267 | a66c585 | Included: session restore and functional QA |
| #268 | 5b6dd49 | Included: recruitment and scoped acceptance |
| #269 | d9ca1c5 | Included: placement, closure and audit acceptance |
| #270 | 4298035 | Included: Executive Dashboard |
| #271 | cfe58a1 | Included: distinct bilingual activity links |
| #264 | See its latest draft | Separate Administration candidate; require exact-head green results, reconcile project notes, then retest the combined tree |
| #265 | 8080bd7 | Excluded pending accounting/legal approval and approved integration scope |

No branch is rewritten. The proposed target is main solely to show the cumulative review diff. Simulations of the sibling combinations identified overlap in STATUS and HANDOFF (and between the siblings, PROJECT_MEMORY). When authorized to include a sibling, preserve both sides' factual release and audit decisions. Do not resolve by overwriting a document wholesale. Re-review the auto-resolved shell and translation overlap for #264, and contract exports for #265 if it is later considered.

## Regression and permission matrix

| Area | Baseline checks in CI / reproducible evidence | Sign-off condition |
| --- | --- | --- |
| Authentication and shell | Browser: valid session, reload, logout, anonymous denial, navigation, unsaved candidate changes; app/shell unit coverage | Desktop/mobile acceptance on exact integrated head |
| Dashboard / Reporting | Browser: safe Overview, genuine data, EN/FR, 390 px, failure/retry, drilldown, CSV and repeated activity links; assigned scope in reporting integration | Compare counts on approved synthetic dataset; no personnel/financial data disclosure |
| Roles and record access | Isolated nine-role browser cases test candidate and Administration reads/writes, separate client/mission records; DB tests cover assigned/rejected writes and stable catalog | Compare deployment grants with approved role matrix; no role catalog changes here |
| Clients / Missions / Candidates | Browser CRUD and linking, recruiter assignment, scoped process transitions, persistence | Check shared mission ownership, role-specific visibility and negative responses |
| Interview / Evaluation / Offer / Placement / Closure | Browser create/finalize and accept, invalid transitions, one placement on retry, mobile closure and reload; DB audit/history and race checks | Accept existing closure policy as-is or approve a separately reviewed change |
| Tasks / Agenda / Messaging | Browser linked task, agenda and message navigation; DB task/reminder, meeting and membership integration | Confirm scheduler operation, messaging retention and combined communication smoke |
| Administration / RBAC | Browser seeded role denials, DB account/role tests; French navigation work separately on #264 | Preserve denied routes/section feedback; include #264 only after its exact head is green |
| Documents and signing | Browser route smoke; DB upload/ownership, document generation, signing, Linux SoftHSM | Confirm private storage and download permissions; do not infer legal assurance from the lab |
| Commercial / Accounting | Browser route smoke; existing draft, scope and financial transaction integration; invoice issuance flag off in browser | Approved permitted-draft workflows only, preserve accounting/issuance restrictions |
| Training / Coaching and public application intake | Inherited unit, DB, and production-build coverage | Run combined permissions/smoke before enabling new production use |

Evidence level is stated per row. Navigation smoke is not full browser workflow acceptance. Use the exact-head run to distinguish tests that passed from those queued, skipped or failed.

## Reproduction

1. Use the [disposable database runbook](../../runbooks/disposable-test-database.md) and an isolated server, set NODE_ENV=test and TEST_DATABASE_URL to the URL from the generated receipt. Keep financial issuance disabled in synthetic QA.
2. Install with pnpm install --frozen-lockfile; generate the Prisma client and build shared contracts. Run pnpm test:e2e. Keep browser and database integration writers on separate marked databases. Run pnpm --filter @hire-me/api test:db and test:db:check-catalog on the isolated integration database.
3. Verify exact CI SHA, quality, migrations/seed/authorization, browser screenshots, SoftHSM, and both runtime container builds. Preserve before/after evidence and report any non-blocking lint/build warnings.
4. Drop marked test databases via the guard, then stop the disposable server.

## Deployment prerequisites and recovery plan

- Approval: maintainer and internal acceptance owner approve the exact SHA, CI run and immutable API/web digests. Confirm the trusted deployment workflow, protected Environment, no administrator bypass, health checks, TLS, monitoring and the change window. Do not deploy from this audit.
- Configuration: use production mode, approved HTTPS/CORS origins, secure refresh cookies and independent random access-token and refresh secrets from approved secret storage. Use restricted database credentials and a backed up private upload root. Keep INVOICE_ISSUANCE_ENABLED=false; example development values are not deployable. Do not log credentials, token material, audit PII or protected storage paths.
- Migration assessment: this release stack introduces no migration edits compared with main. Review the target migration history and run migrate status on a recovery rehearsal; repository parity does not imply the target is current. Deploy only supported backward-compatible migrations through the approved wrapper. Never use migrate reset on a shared or production database.
- Backup: quiesce writers, record previous release SHA/digests, take a consistent paired PostgreSQL custom-format dump and private-document snapshot. Generate hashes and a manifest, store a verified encrypted off-host copy, protect recovery access, and record recovery objectives and backup age.
- Restore rehearsal: use new isolated database and storage volumes. Verify manifest/hashes, inspect the archive, restore with pg_restore --clean --if-exists --no-owner --no-acl into the isolated target, restore private-document files from the same set, and verify counts, checksums, scoped downloads and login against the rehearsal API. Retain results before approval.
- Rollback: stop rollout on failed migration, health, access control or smoke. If schema/storage are still compatible, use the approved wrapper with previous SHA and digests; its rollback does not run migrations. For incompatible state, stop writers and rehearse a paired restore into new volumes; review post-backup writes and data loss with the owner before cutover, or prefer an approved roll-forward. Never silently discard new data.
- Operational checklists: [staging deployment and restore](../../runbooks/staging-deployment-issue-242.md), [trusted premerge staging](../../runbooks/premerge-staging-deployment.md), [production transport checks](../../runbooks/production-readiness-d068-d070.md), and [reminder scheduler](../../runbooks/task-reminder-scheduler.md).

## Approval register

| Priority/status | Owner decision or release gate |
| --- | --- |
| Release gate | Exact integrated CI and immutable container evidence; internal user acceptance; paired backup/restore and rollback rehearsal on the intended environment. |
| P2 / branch gate | Include Administration only after corrected direct-denial, French navigation and catalog checks are green and the combined tree is revalidated. |
| Business decision | The closure endpoint still accepts a manual filled count under existing rules. The verified placement path used the canonical placement count. Decide separately whether historical/manual exceptions remain permissible. |
| Accounting/legal hold | Invoice #265 and official issuance remain outside the candidate; approve buyer address, service-date handling, numbering/control and integration scope before considering them. |
| Operational/privacy | Approve messaging retention, production upload scanner/proxy settings, reminder delivery monitoring, and legal signing prerequisites before enabling those operational promises. External portals are out of scope. |

No new feature, privileged grant, production data mutation or official invoice issuance is part of this candidate.
