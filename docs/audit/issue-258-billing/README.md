# Administration Billing UX · Issue #258

The before captures use PR #279 at `209275e98aaf664b50a833fe70b5a957bd2afbc8`.
The evidence uses installed Chrome, the local Nest API, and a marked disposable PostgreSQL
database with a synthetic company profile.

## Baseline findings

- The same form saved ordinary company details and the automatic numbering toggle.
- Legal identifiers, company contacts and payment details appeared in one flat grid. At
  360 px the fields and advanced operations made one long editable column.
- The annual baseline form submitted directly. The confirmation had no separate review of
  the saved series, year or highest externally issued number.
- Initial load failures had no retry action. Read-only access showed disabled inputs.

## Screenshots

| Viewport | Before | After |
| --- | --- | --- |
| 360 px | [English](before-360.png), [French](before-fr-360.png) | [English](after-360.png), [French](after-fr-360.png) |
| 390 px | [Billing](before-390.png) | [Billing](after-390.png), [Profile editor](after-profile-390.png) |
| 768 px | [Billing](before-768.png) | [Billing](after-768.png) |
| 1024 px | [Billing](before-1024.png) | [Billing](after-1024.png), [Baseline review](after-baseline-review.png) |
| 1440 px | [Billing](before-1440.png) | [Billing](after-1440.png) |

## Reproduce

Provision the database using the [disposable database runbook](../../runbooks/disposable-test-database.md).
Use the provisioned `TEST_DATABASE_URL`, `NODE_ENV=test`, and `HIREME_E2E_CHROMIUM_CHANNEL=chrome`.

```bash
node scripts/functional-qa/run.mjs --test-name-pattern='administration-billing|administration-users|administration-access|record-permissions'
pnpm --filter @hire-me/api test:db -- test/admin.integration.test.ts test/commercial.integration.test.ts
pnpm test:db:check-catalog
```

The browser runner keeps invoice issuance disabled. The isolated Commercial integration suite
uses synthetic issued-invoice fixtures to exercise the existing sequence and snapshot rules.
Set `HIREME_CAPTURE_BILLING=1` to regenerate the versioned after captures.

## Safeguards and limits

- The profile drawer sends only its changed fields into a fresh copy of the existing full
  settings payload. It carries the latest numbering values from the server. Numbering review
  rereads the saved series before sending a mutation and rejects a series change it observes.
  The existing HTTP contract has no conditional write token. A second actor can still write
  between the reread and request, so the server transaction remains authoritative.
- A blank baseline field never converts to zero. The user reviews the series, year, highest
  number, and next-reference preview before confirmation. Automatic numbering is a separate
  decision and the server requires the matching current UTC-year baseline.
- The Administration API regression covers read-only and denied actors, explicit baseline
  confirmation, width overflow, regression behind an already used number, and audited writes.
  The Commercial suite checks concurrent sequence allocation and compares a frozen issued
  reference and complete snapshot after a company profile change.
- Browser checks cover EN/FR at all five widths, keyboard focus and Back protection, profile
  persistence, failed-save recovery, numbering and baseline review, and the Users, access
  catalog, nine-role direct-route matrix and Training Console guard from the existing stack.
  Physical-device, screen-reader and separately authorized staging acceptance remain open.

## Proposed combined acceptance for #261

1. Use the verified combined stack for Billing, Users and Roles and Permissions with a fresh
   synthetic database. Check direct section URLs, one Console tab, Back/Forward, dirty forms
   and retries in all three sections.
2. Exercise Billing as a reader and manager, including separate company edits and numbering
   confirmation. Verify audit history, issued-invoice snapshots, concurrent numbering,
   and the issuance gate. Exercise Users as permitted and restricted actors, including role
   changes, session revocation and last active SUPER_ADMIN protection. Check that the access
   catalog reflects effective permissions through read-only disclosure.
3. Run keyboard, focus and screen-reader checks in both languages at all five widths, plus
   at least one physical narrow device. Attach synthetic captures and prioritize any defects.
4. Require full CI on the combined head. Record authorized staging acceptance and separate
   business-user approval when they occur.
