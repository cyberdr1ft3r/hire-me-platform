# Anonymous public applications · Issue #283

## Baseline

Installed Chrome reproduced the listing and a direct, unlisted application on `main` at `5919c8a2ee230afd3dac062b13bd314e9c90b686`. Nest returned `200 RECEIVED`, and the authorized test query found exactly one synthetic application with the two configured documents. At 360 px the measured unlisted fixture form exposed 18 controls and took 2,508 px before validation. The Apply action followed the job facts. Optional uploads could be replaced, but there was no way to clear one. Transport failure copy asserted that the application was unsent even if the server had accepted it and the response had been lost. Public page loads also triggered four staff session-restore calls over the baseline test journey.

## Contract and scope

- Full name, email and privacy consent remain required. File categories, accepted MIME types, per-file and total limits, and required state come from the opportunity. CV stays visible when optional. Enabled required certification and diploma controls stay in the primary flow. All enabled optional controls remain available under a disclosure and their values remain in the current form when it is closed.
- The Apply link works as a native named fragment. Local validation focuses the first problem in reading order and expands optional details when needed. Correcting or removing a file updates its inline feedback. Anonymous confirmation follows the backend's generic `RECEIVED` only. A lost or ambiguous response preserves input and offers a same-details retry. The duplicate result uses the same generic confirmation without revealing candidate status or previous application data.
- The public list and detail mount directly under the shared locale provider. The public browser journey calls no staff authentication or health setup. Staff routes retain their existing shell and session behavior.
- D-036, D-039, D-040, D-041, D-043, D-066, D-068 and D-069 remain the authority for publication, privacy, uploads, duplicate handling and salary values. There is no applicant account, claiming, new endpoint or API change. [Project decisions](../../project/DECISIONS.md)

## Chrome acceptance and screenshots

The revised 360 px fixture exposes five initial controls and measures 826 px before validation. The real browser suite exercises EN/FR at 360, 390, 768 and 1440 px; listing and Back; direct unlisted, disabled and expired links; required input, required CV and certificate, optional CV and attachments; invalid MIME and a PDF rejected by the server; consent; keyboard focus; and confirmation. It also drops a successful response after Nest commits, retries with the retained values and files, and verifies the same generic receipt and exactly one stored application. A reload returns to the normal empty form. The installed Chrome suite passed and the disposable database API suite passed all 43 integration cases.

| Evidence | Baseline | Revised |
| --- | --- | --- |
| Direct job, 360 px | [Job](before-job-360.png) | [Job with earlier Apply action](after-job-360.png) |
| Initial form, 360 px | [Form](before-form-360.png) | [Form with optional details collapsed](after-form-360.png) |
| Successful receipt, 360 px | [Confirmation](before-confirmation-360.png) | [Anonymous confirmation](after-confirmation-360.png) |
| French, 390 px | | [Form](after-form-fr-390.png) · [Ambiguous receipt and retry](after-retry-fr-390.png) |

## Reproduce

Use Chrome and a fresh marked PostgreSQL database from the [disposable database runbook](../../runbooks/disposable-test-database.md). Set `NODE_ENV=test` and the provisioned `TEST_DATABASE_URL`. Leave `DATABASE_URL` and `DIRECT_URL` unset. The evidence runner verifies the ownership receipt and seeded catalog, launches a loopback Nest API and Vite app, and exercises the public UI with synthetic data. It writes screenshots and metrics to an ignored `run-*` directory printed at launch and closes the services. Drop the marked database with the runbook command after the checks.

```bash
node scripts/issue-283-public-application-evidence.mjs
pnpm --filter @hire-me/web exec vitest run src/public-opportunities
pnpm --filter @hire-me/api test:db -- test/public-applications.integration.test.ts
pnpm test:db:check-catalog
```

## Remaining limits

An application draft and file picks live in the current page. Reloading or closing it does not persist sensitive answers, files or the confirmation locally. A real-device mobile or screen-reader run and live proxy/upload-limit verification require separate evidence. Status tracking and identity ownership are separate portal decisions.
