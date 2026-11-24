# Candidate Portal development

The maintainer approved the candidate account and application workflow for isolated development on [PR #285](https://github.com/cyberdr1ft3r/hire-me-platform/pull/285#issuecomment-7134325337). Use a disposable database and synthetic applicant data. The API defaults to the existing anonymous flow and rejects portal enablement in production.

## Enable in an isolated workspace

1. Follow the [disposable database runbook](disposable-test-database.md) to provision PostgreSQL and apply the migration chain. Keep the generated connection details outside tracked files.
2. Set `CANDIDATE_PORTAL_ENABLED=true` and set `API_CORS_ORIGIN` to the exact browser origin. Use the same hostname and scheme for web and API so browsers can send the candidate cookies. For example, serve web at `http://localhost:5173` and API at `http://localhost:3000`. Use HTTPS for any approved non-loopback development setup.
3. Set `CANDIDATE_MAIL_OUTBOX` to an empty private path outside tracked files. The outbox stores verification and password reset links in local JSON messages. Treat the links as credentials and remove the outbox after testing. To exercise real delivery to approved test inboxes, omit the outbox and set `CANDIDATE_RESEND_API_KEY` and `CANDIDATE_MAIL_FROM` for a verified sender. Store the key in your environment. [Resend email API](https://resend.com/docs/api-reference/emails/send-email)
4. For Google, create or use an approved Google OAuth web client and add the exact frontend origin to its authorized JavaScript origins. Set `CANDIDATE_GOOGLE_CLIENT_ID` to that client ID and sign in with an approved test account. The browser sends a Google ID token and the API validates it against this client ID. If the ID is absent, the Google option is hidden. [Google Identity Services configuration](https://developers.google.com/identity/gsi/web/reference/js-reference) · [Google server verification](https://developers.google.com/identity/sign-in/web/backend-auth)
5. Open a listed or unlisted job link, select Apply, complete candidate registration or sign-in, and confirm the browser returns to the job. Submit with a synthetic CV and open My applications to verify the receipt. Use a second candidate and a private browser session to check isolation.

## Repeatable acceptance

With a disposable database provisioned and ClamAV configured as described below, set `NODE_ENV=test`, `TEST_DATABASE_URL` to the database from its ownership receipt and `HIREME_E2E_CHROMIUM_CHANNEL=chrome`. Run from the repository root.

```sh
node scripts/issue-283-public-application-evidence.mjs --candidate-portal
pnpm --filter @hire-me/api test:db -- test/candidate-portal.integration.test.ts test/public-applications.integration.test.ts
pnpm test:db:check-catalog
```

The browser runner starts local API and web services, enables the portal, and reads the verification email from an isolated outbox. The API test injects synthetic Google responses to exercise the service boundary. Neither test contacts Google or a live mail provider. Run the browser runner without the flag to verify the unchanged anonymous flow. Drop the database using `pnpm test:db:drop`.

## Ownership and rollback

Candidate sessions and Google subjects are separate from staff. Email verification is required before password setup. Google requires a valid token with a verified email and a one-use challenge bound to the browser. Google accounts with an email outside Gmail or verified Workspace must also prove mailbox access. A verified address does not grant ownership of an existing CRM profile or prior applications. Only a new application created in a candidate session gets a portal owner. Candidate views expose the public job title, submission date and a coarse status.

To disable the portal, unset `CANDIDATE_PORTAL_ENABLED` or set it to `false` and restart the isolated API. This restores the previous anonymous submission behavior and makes candidate session and application routes unavailable. Before re-enabling an environment after a security incident, revoke its candidate sessions and pending email and Google challenges. The migration is additive. Preserve owned submission links and staff application records when disabling. Production enablement and any retention or cleanup policy require separate approval.

## Candidate profile and CV library

Use **My Profile** to update reusable contact and professional information. **My CVs** supports scanned PDF uploads, a preferred CV, new versions and removal. New applications prefill the fields supported by the application form and allow candidate edits. **My Applications → View submitted details** shows the saved submission and CV version. Removing a library CV hides its versions from use and download in the library. Prior applications retain their separately stored attachment. Authorized staff can download it from the **Public** tab on the mission. Staff downloads require a fresh clean scan. External client accounts receive only explicitly published profile cards.

For isolated scanning, run ClamAV with current signatures and configure `CANDIDATE_CLAMAV_PORT` for a loopback TCP listener or `CANDIDATE_CLAMAV_SOCKET` for a private local socket. Bind the Docker port to loopback and obtain the host port with `docker port <container> 3310/tcp`. Configure stream and scan limits above the allowed file size and enable alerts for encrypted content and scan limits. Keep the scanner socket private. A failed, unavailable or ambiguous scan rejects the upload and keeps the prior version intact. [ClamAV streaming protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)

With a disposable database configured as above and ClamAV reachable, run the browser journey and API regressions.

```sh
node scripts/issue-283-public-application-evidence.mjs --candidate-workspace --client-portal
pnpm --filter @hire-me/api test:db -- test/candidate-workspace.integration.test.ts test/candidate-portal.integration.test.ts test/client-portal.integration.test.ts test/public-applications.integration.test.ts
```

The application creates or reuses a dedicated CRM intake record provisioned by the identity's own submissions. Existing email matches never confer ownership or cause the portal to update a CRM profile. Capacity is 20 active CVs, 20 versions per CV, and 100 versions or 100 MiB retained per identity. Library removal is logical. Retention and deletion policy for historical data remain release decisions.
