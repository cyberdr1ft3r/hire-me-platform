# Current Agent Handoff

Last updated: 2026-10-28

## Current situation

- `hotfix/client-address-optional` is based on protected `main`
  `5919c8a2ee230afd3dac062b13bd314e9c90b686` and includes the unmerged Client libre implementation so
  the requested PR can target `main` without changing PR #253.
- Draft manual-client input requires the billed client name and accepts an omitted, empty, or whitespace-only
  address. Authorized operators can edit the manual-client snapshot while the invoice is `DRAFT`, clear the
  address back to null, and reload it; the change is audited and no CRM `Client` is created. Registered-client
  invoices cannot use this path.
- Final issuance still requires a non-blank buyer address. Existing numbering, calculation, permission,
  lifecycle, registered-client, and generated-document rules are unchanged.
- The invoice renderer now omits the buyer-address row if an explicitly authorized view supplies no address,
  but the current generator remains issued-only and still rejects incomplete historical issued snapshots.
  A draft preview or historical no-address document remains a separate product/legal workflow.
- Focused tests, lint, typecheck, architecture/style checks, Prisma validation, and builds pass locally.
  Docker Desktop was unavailable, so exact-head CI must supply the PostgreSQL migration/integration evidence.
- No deployment, merge, production change, or invoice issuance occurred.

## Next concrete action

1. Review the dedicated hotfix PR and its exact-head CI, especially the PostgreSQL integration job.
2. Confirm the branch relationship with PR #253 before merging; do not merge either PR automatically.
3. Keep deployment and business acceptance behind the protected staging workflow and Environment approval.

## Completion conditions

- Exact-head CI passes every required check, including database migration and integration tests.
- Human review confirms blank draft addresses are accepted while issuance still rejects them.
- The PR remains open and unmerged until an authorized maintainer decides otherwise.
