# Client Portal V1 development

This workflow is approved for isolated development on [PR #285](https://github.com/cyberdr1ft3r/hire-me-platform/pull/285#issuecomment-7135744378). Use synthetic organizations, candidates and addresses and a disposable database.

## Enable and test

1. Provision and migrate PostgreSQL using the [disposable database runbook](disposable-test-database.md). Use the test database from the provisioning receipt.
2. Set `CLIENT_PORTAL_ENABLED=true` on the isolated API and set `API_CORS_ORIGIN` to the exact browser origin. Web and API must use the same hostname and scheme with their own loopback ports. The API rejects production enablement.
3. Set `CLIENT_PORTAL_MAIL_OUTBOX` to a private untracked directory. It stores invitation and reset links, which grant access to synthetic accounts. Delete it after testing. For approved live test delivery, omit the outbox and set `CLIENT_PORTAL_RESEND_API_KEY` and `CLIENT_PORTAL_MAIL_FROM` for a verified sender.
4. In the staff console, open **Clients → an active company → Client portal**. Invite an active named contact, or resend or revoke access. Redeem the email link in a separate browser context and set a password. Return to `/client` to sign in or use password recovery.
5. Create and submit a request, then review it in the company’s staff tab. A staff member can return it for changes, reject it with a client-facing reason, or approve and separately convert it to an internal draft mission. Repeat conversion returns the existing mission.
6. Search for a consented candidate in the company’s staff tab. Choose the available-candidate list or the request shortlist for an already-presented mission candidate. Preview the profile, confirm consent for that company, and publish. The optional download is a plain-text summary of the approved card fields. Use the company tab to revoke the publication.

With `NODE_ENV=test`, `TEST_DATABASE_URL` from the receipt, and Chrome installed, run the following commands from the repository root.

```sh
node scripts/issue-283-public-application-evidence.mjs --client-portal --candidate-portal
pnpm --filter @hire-me/api test:db -- test/client-portal.integration.test.ts test/candidate-portal.integration.test.ts test/public-applications.integration.test.ts
pnpm test:db:check-catalog
pnpm test:db:drop
```

The browser runner enables both portals against loopback services. It reads email from disposable outboxes, uses role-separated browser contexts and captures synthetic screenshots in `.tmp-runtime`.

## Authority and privacy

- Staff portal actions require the existing grants for company management and the relevant contact, candidate, or mission operation. External client identity is tied to one active CRM contact and one active organization. The server derives organization from the current client session. A changed CRM email does not transfer the seat.
- Invitations expire after 24 hours and recovery links after 30 minutes. Both are single-use proofs delivered to the named mailbox. Reset revokes all sessions for that account. Client sessions are separate from staff and Candidate Portal sessions.
- A draft is visible only to its creator. Active members can see submitted requests in their own organization. While the creator revises a request, other members and staff see the previous submitted fields until resubmission.
- Publications allow only the approved role title, city and country. The generated summary contains the same fields. Candidate names, contact details, CVs, notes, evaluations and internal pipeline details are outside the released projection. Access requires current consent and an active publication. A consent change invalidates prior publications, and a shortlist requires a current presentation on the linked mission.
- Disable the portal by setting `CLIENT_PORTAL_ENABLED=false` and restarting the API. Preserve its additive schema, audit records and converted missions. Production release, retention, support and additional document types require separate approval.
