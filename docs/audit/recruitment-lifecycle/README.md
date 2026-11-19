# Recruitment lifecycle and external portal readiness

Base: PR #267 at `a66c585a744c7c3db8643b44a746599030cc1e20`. Run permanent browser coverage with `pnpm test:e2e` using the [disposable database runbook](../../runbooks/disposable-test-database.md). For a focused local run use `node scripts/functional-qa/run.mjs --test-name-pattern=recruitment-lifecycle` with the same environment. The runner starts separate API processes for smoke, role acceptance and lifecycle so all three can use the real per-IP authentication limiter. Screenshots are written to the run directory reported by the harness.

## Acceptance coverage

| Area | Regression | Remaining browser coverage |
| --- | --- | --- |
| Interview | HR phone interview scheduled and completed through the UI; valid late cancellation denied with 409; completion verified in API history. | Rescheduling, postponed and client interviews in the browser; these have existing API tests. |
| Evaluation | Create a draft and finalize it through the UI; finalized status still shown after reload. | Other evaluator personas, draft editing and confidential field redaction in the UI. |
| Offer | Keyboard submission of an invalid salary, draft creation, refusal to accept before sending, mark sent, and record acceptance. Check API history and reload. The API integration covers rejection after negotiation and requires a rejection reason. | Record rejection in the browser; offer revisions, placement confirmation and later stages in the browser. |
| Mission closure | Cancellation through the mission lifecycle form at 390 px; verify outcome after reload through the UI and API. | Successful closure after offer-backed placement and all positions filled. |
| Related tasks and notifications | The existing QA suite covers a mission-linked task. No interview-generated task or notification assertion is made here. | Confirm whether stage-driven follow-up is needed before adding workflow behavior. |

### Seeded role matrix

Each row checks two internal clients, each with a separate mission, candidate, and linked process. These are distinct CRM clients; no external tenant account is fabricated. All attempts use ordinary authorized test fixtures against loopback. Mutations cover the client, mission and standalone candidate record.

| Role | Client detail | Mission, candidate and process detail | Client, mission and candidate mutation |
| --- | --- | --- | --- |
| SUPER_ADMIN | 200 | 200 | 200 |
| ADMIN | 200 | 200 | 200 |
| HR_MANAGER | 200 | 200 | 200 |
| MANAGER | 403 | 403 | 403 |
| TEAM_LEADER | 403 | 403 | 403 |
| EMPLOYEE | 403 | 403 | 403 |
| FINANCE_MANAGER | 200 | 403 | 403 |
| GUEST | 403 | 403 | 403 |
| CLIENT_USER | 403 | 403 | 403 |

The existing candidate-process, interview, and offer integration tests cover selected assigned scope, protected field redaction, and parent-child record checks. The seeded role matrix does not establish per-operation coverage for all associated records or an external organization boundary. No role contract changed.

## Portal discovery

| Workflow | Classification | Evidence at the audited base |
| --- | --- | --- |
| Anonymous opportunity list, detail and application | Functional | `PublicSite`, `PublicApplicationForm`, and `PublicApplicationsController` provide list/detail and application submission with validated file uploads. The public site is reachable without a session. |
| Opportunity design prototype | Mock-only | `apps/web/public-opportunity.html` and `public-opportunity-preview-data.ts` use preview data; the real public route lives separately in `public-opportunities`. |
| Staff publishing and application triage | Functional internal flow | `MissionPublicOpportunity` and the internal mission application APIs handle publishing and recruiter review. This is the existing entry point into the pipeline. |
| Client authentication | Partial foundation | Staff authentication and a seeded `CLIENT_USER` role exist; contact creation defaults portal access to disabled. No verified external client login, membership onboarding, or client portal navigation. |
| Client recruitment demand | Missing in the audited runtime | CRM and mission creation are internal. No client demand submission, approval queue, or demand-to-mission link found. |
| Candidate login and profile updates | Missing in the audited runtime | Anonymous application requires no account. General candidate pool profiles are staff-managed. No candidate-owned profile endpoint or session workflow found. |
| Authenticated candidate browsing and application history | Missing in the audited runtime | Anonymous listing is functional; authenticated ownership and status views were not found. |

Reviewed local and remote refs, repository history matching portal terms, project scope, permission docs, route entry points, controllers, tests, and the checked-in public opportunity preview. Relevant public branches were `feat/public-applications` and `design/public-opportunity-v1`. Portal material outside these discoverable repository surfaces remains unverified. Product scope explicitly defers external client access and excludes candidate accounts from the existing MVP.

## Proposed integration sequence

1. Approve external identity, invitation/recovery, and organization membership rules. Define a narrow client-facing read model and a separate candidate-owned profile contract. Confirm privacy, retention, and consent with the responsible teams.
2. Introduce a client-owned demand record with submission and review states. Give staff a review queue and an explicit, auditable conversion to one linked recruitment mission. Approve mandatory fields, who may submit/review, and whether clients may edit or withdraw submitted demands.
3. Reuse staff approval and the existing public publication and application routes. Define how a verified candidate account may claim a prior anonymous application, including duplicate identity handling. Keep private candidate records and evaluation notes internal.
4. Expose only approved client-facing milestones and candidate-facing application status through explicitly scoped read models. Approve who may see offers, respond, and see rejection reasons before exposing those actions. Add organization A/B and candidate A/B acceptance before enabling external access.

## Separate reviews

[#264 Administration](../functional-ui-qa/PR-264-review.md): denied Overview tab selection and residual narrow French section clipping remain open. [#265 invoice](../functional-ui-qa/PR-265-review.md): synthetic draft preview verified; buyer address and service-date approval remain open. Neither branch is changed here.

## Local validation

- Focused web unit run: 115/115 across mission rules, closure, placement, read-only workspace and public opportunities.
- Focused PostgreSQL run: 77/77 across interviews, offers, missions, candidate processes and public applications. Fresh migrations and a separate database from the browser tests.
- Format, architecture and design tokens, lint, typecheck, and production build passed. Existing lint and bundle-size warnings remain.
- Playwright MCP rendered the anonymous opportunities page. Chrome DevTools showed healthy API responses and the expected anonymous session refresh rejection. The list remained accessible without authentication.
- No recruitment application defect requiring a product patch was verified in this batch. The browser harness isolates the groups without changing application behavior.
