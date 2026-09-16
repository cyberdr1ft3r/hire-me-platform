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
| Does `Candidate.source = 'public_application'` prove the unit? | **No** | It does not even prove the record's origin (see below), let alone the unit the caller used, and it says nothing about a caller who used the documented cents field correctly. |
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

## Why the review cannot say whether a Candidate was new or reused

There is a second thing the database cannot answer, and it is worth stating
separately because an earlier draft of this review overstated it.

The submission creates a `Candidate` only when no row exists for the normalized
email. Everything else it writes is **identical in both branches**: the same
`MissionCandidate` (`source = 'public_application'`, `sourceContext` = the
opportunity slug), the same `MissionCandidateEvent` (`CREATED`, reason
`Public application submitted.`, no actor), the same `PublicCandidateApplication`
shape, the same candidate document versions, and the same single value-free
`public_applications.application.submitted` audit entry. On the reuse branch the
existing `Candidate` is locked and **no column on it is written at all**.

| Possible marker | Does it prove create-versus-reuse? | Why not |
| --- | --- | --- |
| A column on `PublicCandidateApplication` | **No** | The snapshot stores `candidateId` and `missionCandidateId` identically in both branches; there is no creation flag. |
| `Candidate.source` / `Candidate.sourceDetail` | **No** | Written only on the create branch, but both are editable, and nullable, through `PATCH /v1/candidates/:candidateId`. A created Candidate can be edited so the marker disappears, and a reused Candidate can be edited so the marker appears. |
| `PublicOpportunity.publicSlug` matching `Candidate.sourceDetail` | **No** | The slug itself is editable through the internal opportunity update (`PATCH /v1/missions/:missionId/public-opportunity`), so the comparison breaks for historical rows whenever an opportunity is renamed. |
| `MissionCandidate.source` / `sourceContext` | **No** | Write-once in practice, but written on **both** branches with the same values. They record where the mission process came from, not whether the Candidate row was new. |
| `MissionCandidateEvent` | **No** | The `MissionCandidateEventAction` enum has no candidate-creation action, and the public path emits the same `CREATED` event in both branches. |
| `AuditLog` | **No** | The public path writes no `candidates.candidate.created` entry; that action exists only on the manual candidate-create path. |
| `Candidate.createdAt` versus `PublicCandidateApplication.submittedAt` | **No** | An inference across two rows, not a recorded fact. A Candidate created moments earlier through another path is indistinguishable, and nothing defines how close is close enough. |
| `Candidate.updatedAt` | **No** | Unchanged by reuse, but bumped by any later ordinary edit. |
| A `createdBy` / `origin` / `provenance` column on `Candidate` | **No** | No such column exists in the schema. |

**Therefore the review reports no new-versus-existing classification.** It
groups rows only by facts the database can establish, and it names the one
current-metadata hint it exposes so that it cannot be mistaken for history.

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
- It is a single `SELECT` with no CTE-based write, no row-level locking clause,
  and no DDL. A test asserts each of those properties against the file itself.
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
| `applicationRecordedCurrency` | Whether the submission recorded a currency at all. Immutable: the application snapshot is insert-only. |
| `currentCandidateCurrencyMatchesSnapshot` | Whether the Candidate's **current** currency equals the snapshot's. Compensation can be maintained at any time, so this is present state, not history. |
| `currentCandidateSourceMatchesApplicationOrigin` | Whether the Candidate's **current** `source` is `public_application` and its **current** `sourceDetail` equals the opportunity's **current** `publicSlug`. A triage hint over present metadata on both sides. It is **not** provenance: see the section above. |
| `currentCandidateArchived` | Whether the Candidate is currently archived. |
| `classification` | See below. |

| `classification` | Meaning |
| --- | --- |
| `CANDIDATE_EXPECTATION_MATCHES_SNAPSHOT` | The Candidate's current expectation equals the amount this application recorded. Highest-value review group: whatever was submitted is still the stored figure. |
| `CANDIDATE_EXPECTATION_DIFFERS_FROM_SNAPSHOT` | The two amounts differ. That happens both when an operator has since maintained the Candidate and when an already-existing Candidate applied and deliberately kept its own compensation. The review cannot tell those apart, and does not try. |
| `CANDIDATE_HAS_NO_RECORDED_EXPECTATION` | The application recorded an expectation; the Candidate currently has none. |

A match or a difference **does not identify the unit the original request
carried**, and **does not establish whether the Candidate was new or reused**.
These labels group records for a person to decide about, one record at a time.

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

1. Review candidates individually with the recruiter who owns the record. Begin
   from the `PublicCandidateApplication` snapshot, which is insert-only, rather
   than from any current Candidate metadata.
2. Apply any confirmed correction through the authorized Candidate compensation
   editor, so it is permission-gated and audited.
3. Do not script a bulk correction from this output. If a bulk correction is ever
   justified, it needs its own approved issue, its own evidence, and its own
   reversibility plan.
