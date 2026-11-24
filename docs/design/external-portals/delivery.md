# Portal implementation sequence and acceptance

The identifiers below are backlog entries for approved follow-up issues. The Client Portal is the priority. Candidate work advances separately against its own approvals and depends on the shared boundary, not on Client UI rollout. Product and security signoff on [applicable choices](README.md) precedes starting either lane.

## UI navigation and pages

Start with EN/FR and use Hire Me tokens and accessible form patterns. Use native links for navigation, page headings for focus after route changes, visible focus, and keyboard-operable dialogs. A dirty draft must warn before leaving. A failed request keeps input and offers retry. A stale revision explains the conflict and offers reload without silently dropping edits. Limit navigation to effective capabilities and recheck server access on every direct route. A revoked session clears private in-memory state and returns to sign-in. Keep private fields out of analytics, session replay, URLs and local browser storage.

| Audience and entry | Page inventory and actions | Primary states |
| --- | --- | --- |
| Client onboarding `/client/invitation`, `/client/sign-in`, `/client/recovery` | Invite accept and verification handoff, ordinary sign-in, recovery request and neutral help. | Valid/expired/replaced invitation, identity checks, provider unavailability, already enrolled, session ended. |
| Client `/client` | Overview with own organization's request counts and recent submitted history or own drafts. Navigation is Overview, Organization and Recruitment requests. | No activity, loading, ready, failed read/retry, expired or revoked membership. |
| Client `/client/organization` | Read-only organization overview. Direct contact changes go through the approved Hire Me support channel. | Current, unavailable, revoked. |
| Client `/client/requests`, `/client/requests/new`, `/client/requests/:id` | Bounded status-filtered list, create/save draft, explicit submission review, submitted and decision timeline. | Empty, filtered empty, edit, invalid, unsaved, conflict, submitted, review, approved, rejected. Client sees Approved after internal conversion. |
| Staff Console Recruitment | Recruitment demand queue and review page, decision confirmation, conversion, linked draft mission. Separate invitation and membership actions within the scoped client record. | Queue empty, review, approved, rejected, stale, conversion failed/retry, converted or revoked. A requester never sees staff evaluation, notes or mission links. |
| Candidate `/candidate/sign-up`, `/candidate/sign-in`, `/candidate/recovery` | Provider handoff, identity verification, account/recovery state. Route verified users to their own home. | Verification pending, authenticated, generic failure, provider outage, invalid session. |
| Candidate `/candidate`, `/candidate/profile`, `/candidate/claims` | Own overview, profile and revision editor, claim submission and case status. An empty account offers a claim request without listing possible matches. | Draft, submitted, under review, approved, changes requested, no records, rejected or claim pending. |
| Candidate `/candidate/documents`, `/candidate/applications`, `/candidate/applications/:id` | Own upload/download/withdrawal and application timeline, with explicit approved milestones. | Pending scan, rejected file, clean; no applications, received, in review or closed. |
| Staff Console Candidates | Restricted claim and duplicate-resolution queue, revision diff, clean-document review, explicit application visibility and milestone publishing. | Needs evidence, contested ownership, approval, refusal, revoked, publication conflict. |

V1 French labels should include **Demandes de recrutement**, **Nouvelle demande**, **En cours d’examen** and **Créer la mission de recrutement** on the authorized staff screen. Verify localized dates, error recovery, document states and responsive rendering. Decide final status copy with product before user-facing implementation.

## Client Portal V1 issue backlog

| ID | Scope and dependencies | Definition of done |
| --- | --- | --- |
| EP-01 | External authority boundary and test harness. Requires signed E01–E04 and E07 for Client. | Separate typed staff/external principals, deny-by-default guards, capability and projection contracts, disabled flags, synthetic provider fixture and contract tests. Existing staff and anonymous public contracts pass unchanged. No interactive login, mail delivery, role seed or migration in this PR. |
| CL-02 | Organization membership and staff-approved invitation schema and commands. Depends on EP-01. | Additive migrations, scoped staff invitation and revocation endpoints, exact contact binding, expiry/reissue, transactional audit, and concurrency tests. Delivery uses synthetic sink until approved. |
| CL-03 | Verified external login, session and recovery. Depends on CL-02 and reviewed provider configuration. | Client OIDC and MFA assurance, atomic invite redemption, online session and membership checks, revocation, operator recovery, inactive/archived clients rejected. Prove staff/external cross-denial with synthetic identities. Feature remains disabled for live accounts. |
| CL-04 | Read-only organization and Client home. Depends on CL-03. | Scoped dashboard and organization DTOs from allowlisted fields, portal navigation, loading/empty/retry states, locale and accessibility checks. Start with zero-demand dashboard until the demand slice lands. |
| CL-05 | Recruitment demand forms, submit and organization history. Depends on CL-04. | Draft ownership, strict validation, scope-bound paging, expected revisions, idempotency, organization-only submitted history, EN/FR responsive forms, API failure recovery and A/B tests. |
| CL-06 | Staff queue and review decisions. Depends on CL-05. | Scoped queue, staff-only notes, audit transitions, explicit approve/reject, safe public reason and status projection, keyboard and permission tests. |
| CL-07 | Atomic conversion and pilot acceptance. Depends on CL-06. | Existing mission policy applied in transaction, same-client FKs, idempotent conversion and failure rollback tests, end-to-end and revocation drill. Release pilot is a separate review decision. |

**Recommended first implementation PR after signoff: EP-01.** Start from then-current approved `main`. Submit a single draft with portal auth/actor interfaces, strict response contracts, flag-off route behavior, synthetic authority/scoping fixtures and negative contract tests. Keep it independent from #281 and UI work. Acceptance is a runnable proof that mixed principals and unknown scope fail closed, staff and public anonymous paths still work, and no login route is exposed. Add schema and provider integration only in the dependent, approved slices. If actual interfaces require a database authority adapter, define its contract and prove denial without relying on one in EP-01.

## Separately prioritized Candidate backlog

| Priority and ID | Scope and dependencies | Definition of done |
| --- | --- | --- |
| 1. CA-01 | Candidate registration, verification and independent session policy. EP-01 and E01/E02/E05/E07. | Verified registration creates an empty candidate account profile, candidate/client/staff principals are isolated, and recovery cannot claim a historical record. |
| 2. CA-02 | Ownership adjudication, duplicate review and grant revocation. CA-01 and approved proof. | Private claim case, explicit staff decision, one active mapping, no email-only attach, contested A/B claims tested, existing links remain revocable. |
| 3. CA-03 | Profile revisions and staff review. CA-01 for self-service and CA-02 for vetted propagation, plus E06. | Candidate can draft and submit editable fields. Staff review diff and concurrency checks are in place. Approved propagation never changes internal evaluations or opens application access. |
| 4. CA-04 | CV and document management. CA-01, E06/E07 and approved concrete scanner. | Private quarantine, scoped versioned upload and streamed download, scan/withdrawal states, retention and negative A/B checks across both API and storage. |
| 5. CA-05 | Application history and approved milestones. CA-02 and E06/E07. | Explicit per-application ownership, allowlisted milestones, emergency visibility revocation and anonymous application regression. Test application linking independently from candidate master ownership. |

## End-to-end acceptance to automate before either pilot

Run contract/unit tests, real Nest API integration on disposable PostgreSQL, real-browser acceptance, and separately approved human usability/security review. Build isolated fixtures for two clients A/B, with two named contacts in A, two candidates A/B using distinct external identities, and staff users with and without applicable permission and record scope. Use fake provider, mail and storage adapters where exercising failure and repeat with approved staging integrations before release.

| ID | Scenario and expected result | Layers |
| --- | --- | --- |
| AT-01 | A scoped staff user invites contact A. Wrong verified email, missing assurance, an expired/replaced invite and an unauthorized invitation are refused. Two simultaneous valid callbacks yield one membership. Refreshing or reloading a callback grants no extra authority. | API, PostgreSQL, browser, provider staging |
| AT-02 | A sees only A's organization and requests. A's second member sees submitted A history and cannot see the first creator’s draft. B cannot read/change A via direct route, known IDs, cursor/count or input containing a foreign tenant or status. Compare absent and hidden responses. | Contract, API, browser |
| AT-03 | A saves and reloads a draft, recovers from a failed request, submits once, and sees bounded status updates. Reject incomplete fields and stale drafts. In another tab, a concurrent update must not overwrite the saved request. Check EN/FR, keyboard, narrow layout and unsaved navigation. | API, browser, human usability |
| AT-04 | Authorized staff starts review and approves or rejects. Missing staff capability or client scope denies. No private reason or internal mission ID appears in client output or alerts. | API, browser |
| AT-05 | Convert one approved A request, replay the command and submit concurrent conversions. One same-client draft mission, one link and one transition audit result. Force a failure before audit commit, then retry. A still sees Approved, and linked mission route remains staff-only. | API, PostgreSQL, browser |
| AT-06 | Revoke membership or suspend the external identity while signed in. New reads, writes, navigation recovery and downloads fail immediately after commit. Archive the contact/client and repeat. Verify logout-all, token/session separation, stale authority during writes and ignored auth on the disabled ingress. | API, PostgreSQL, browser, operations |
| AT-07 | Register candidate A with an address also present on an internal record. Profile and history start empty. Explicit and authorized verification can grant only the reviewed link. Reject ambiguous evidence and conflicting claims. Candidate B cannot access A's profile revisions, cases, documents or applications. | API, PostgreSQL, browser, provider staging |
| AT-08 | Candidate edits and uploads a CV. Timeout, scan failure and oversized or wrong type files are rejected or quarantined. A clean download still requires current ownership. Staff review preserves internal evaluations and raw application data. Withdraw the document and verify no further portal download. | API, storage, PostgreSQL, browser |
| AT-09 | Publish an approved milestone for one A application. Another A application is hidden without an explicit grant; B never sees it. Removing A's grant removes its detail, list and counts. Verify internal fields remain absent and anonymous intake still works. | Contract, API, browser |
| AT-10 | Inject provider, mail, database and scanner failures. Confirm sensitive values stay out of the allowed log sample and audit; exercise flag-off rollback, recovery and backup rehearsal. Get product/security approval on go/no-go, and record screen-reader and physical-device results separately. | Integration, operations, human accessibility |
