# Runbook: public application salary expectation unit review

Scope: legacy `PublicCandidateApplication.submittedSalaryExpectationCents` and
`Candidate.salaryExpectationCents` rows written before Issue #73.

Owner: repository maintainer. Nothing here runs automatically, on a schedule, or
as part of the application.

## Why there is no backfill

Issue #73 corrects the public application **form**: the browser used to send the
figure a person typed straight into `salaryExpectationCents`, which the rest of
the platform reads as integer minor units. Future submissions are converted
exactly, on the digit string, before the request is built.

Already-stored rows are a different question, and the honest answer is that the
database cannot answer it.

| Question | Does persistence answer it? | Evidence |
| --- | --- | --- |
| Which client sent this request (HireMe browser form, or another caller)? | **No** | `PublicCandidateApplication` stores `sourceIpHash` and `userAgentHash`, both one-way SHA-256 digests with no recorded client vocabulary; there is no client, form-version, or API-version column. |
| Was the value the caller sent meant as major units? | **No** | The public HTTP field has always been named `salaryExpectationCents`. A direct API caller reading the contract would correctly have sent real minor units under exactly that name. |
| Does `Candidate.source = 'public_application'` prove the unit? | **No** | It proves the record's origin, not the unit the caller used, and says nothing about a caller who used the documented cents field correctly. |
| Does a small stored amount prove the unit? | **No** | A low figure can be a genuine monthly amount, a part-time amount, a different currency, or an amount in a currency with a different minor-unit convention. |
| Does the Candidate value equalling the application snapshot prove the unit? | **No** | New-candidate submissions copy the snapshot by design, whatever unit the caller used. |
| Do the submission date, the currency, or `sourceDetail` prove the unit? | **No** | None of them records a client or a unit; they record when, in which currency, and through which opportunity the application arrived. |

Every candidate marker is origin or shape evidence, never unit evidence.
Multiplying stored rows by 100 on any of them would corrupt every row that was
already correct, silently and irreversibly, in a confidential HR field.

**Decision: no blanket migration, no automatic historical write, no heuristic
inference.** A confirmed individual correction goes through normal authorized
Candidate compensation management (Issue #69 / D-064), which is permission-gated
and audited, or through a separately approved remediation task.

## What the review mechanism is

A single bounded read-only statement:

`apps/api/diagnostics/public-application-salary-unit-review.sql`

It is deliberately not an endpoint, a job, or a service method. Adding a code
path would mean adding a new authorization surface over confidential
compensation data and a new place a future change could turn into a write, to
support an operation that happens once, under human supervision. A reviewed
`SELECT` that an administrator runs explicitly carries less risk and the same
value.

Its classification logic is covered by `apps/api/test/public-applications.integration.test.ts`
against synthetic rows, including the assertion that it mutates nothing.

### Privacy properties

- It returns **no salary amount and no currency value**: only record
  identifiers, a submission timestamp, booleans, and a classification label.
- It is a single `SELECT` with no CTE-based write, no `FOR UPDATE`, and no DDL.
- Running it writes no audit event, because it is a database-administrator
  action outside the application, and the application never invokes it.
- Normal application logs and the `public_applications.application.submitted`
  audit entry already carry no salary value; this changes neither.

### Output

One row per public application that recorded a salary expectation.

| Column | Meaning |
| --- | --- |
| `publicCandidateApplicationId`, `publicOpportunityId`, `missionId`, `candidateId` | The records to review. |
| `submittedAt` | When the application arrived. |
| `applicationRecordedCurrency` | Whether the submission recorded a currency at all. |
| `currencyAgreesWithCandidate` | Whether the Candidate's recorded currency equals the snapshot's. |
| `candidateLooksCreatedByThisApplication` | Review evidence that this submission created the Candidate: the platform writes `source = 'public_application'` with the opportunity slug in `sourceDetail` only for a Candidate it creates, and one email may apply to one opportunity once. |
| `candidateArchived` | Whether the Candidate is archived. |
| `classification` | See below. |

| `classification` | Meaning |
| --- | --- |
| `NEW_CANDIDATE_STILL_MATCHES_SNAPSHOT` | A new-candidate submission whose Candidate expectation still equals the submitted snapshot. Highest-value review group: nothing has overwritten the submitted figure since. |
| `NEW_CANDIDATE_CHANGED_SINCE_SUBMISSION` | A new-candidate submission whose Candidate expectation has since been maintained internally. The stored Candidate value is an operator's, not the applicant's. |
| `EXISTING_CANDIDATE_NOT_OVERWRITTEN` | An existing Candidate applied; the snapshot holds the submitted figure and the Candidate keeps its own. This is the merged product rule, not a defect. |
| `EXISTING_CANDIDATE_EQUALS_SNAPSHOT` | An existing Candidate whose own expectation happens to equal the snapshot. |
| `CANDIDATE_HAS_NO_RECORDED_EXPECTATION` | The application recorded an expectation; the Candidate has none. |

None of these values states a unit. They group records for a person to decide
about, one record at a time.

## How to run it

Run it against a database you are authorized to read, from a workstation that
may see candidate identifiers.

```bash
psql "$DATABASE_URL" --file apps/api/diagnostics/public-application-salary-unit-review.sql
```

For counts only, which disclose nothing beyond group sizes:

```bash
psql "$DATABASE_URL" --command "SELECT classification, count(*) FROM ($(cat apps/api/diagnostics/public-application-salary-unit-review.sql)) AS review GROUP BY classification ORDER BY classification"
```

## After the review

1. Review candidates individually with the recruiter who owns the record.
2. Apply any confirmed correction through the authorized Candidate compensation
   editor, so it is permission-gated and audited.
3. Do not script a bulk correction from this output. If a bulk correction is ever
   justified, it needs its own approved issue, its own evidence, and its own
   reversibility plan.
