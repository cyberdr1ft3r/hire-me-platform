# Recruitment Reporting

Issue #36 adds the first authenticated internal recruitment reporting layer. It is
read-only, permission-aware, and computed directly from the already-merged
authoritative recruitment records (clients, missions, mission recruiters,
mission-candidate processes, interviews, offers, placements, and public
applications). It introduces no second reporting database, no duplicated business
state, and no schema migration.

Reporting deliberately excludes revenue/accounting/profitability metrics, training
analytics, and task-productivity analytics. Those remain future scoped work and
must not reuse the KPI names below with different semantics.

## Endpoints

All endpoints are under `GET /v1/reporting/recruitment` and require authentication.

| Endpoint | Purpose | Reporting capability |
| --- | --- | --- |
| `/summary` | KPI summary (missions, pipeline, applications, interviews, offers, placements, aging) | `reporting:recruitment:view` |
| `/pipeline` | Status/distribution datasets for charts | `reporting:recruitment:view` |
| `/trends` | Bounded time-series buckets over the window | `reporting:recruitment:view` |
| `/breakdowns` | Top-N mission/client/recruiter breakdowns | `reporting:recruitment:view` |
| `/drilldown` | Bounded, paginated mission-candidate rows | `reporting:recruitment:view` |
| `/export.csv` | Safe CSV export of the drilldown rows | `reporting:recruitment:export` |

Responses are Prisma-independent shared contracts (`packages/contracts/src/reporting.ts`);
Prisma models are never exposed.

## Underlying operational read capabilities

Reporting must never become a side channel around the operational recruitment APIs.
In addition to the reporting capability above, every reporting endpoint requires the
exact underlying operational read capabilities that guard the aggregated data:

`missions:view`, `mission_candidates:view`, `public_applications:view`,
`interviews:view`, `offers:view`, and `placements:view`.

These are enforced by the route permission guard alongside the reporting capability,
so an actor holding only `reporting:recruitment:view` (or only the operational reads
without the reporting capability) is denied with the repository's generic
`PERMISSION_DENIED` error, which does not reveal which specific capability was
missing. This is authorization in addition to — not a replacement for — the record
scope below.

## Record scope and side-channel protection

Reporting authorization is **not** "has `reporting:recruitment:view`" alone. Every
count, distribution, trend, breakdown, drilldown row, and exported row is
constrained to the actor's authorized recruitment missions:

- **Broad scope** is granted to actors holding `mission_candidates:transfer` — the
  same cross-mission oversight signal the mission-candidate process module enforces
  (`MissionCandidatesService.assertMissionProcessScope`). Broad actors report on all
  missions.
- **Assigned scope** applies to everyone else: only missions where the actor holds an
  active (`ACTIVE`, non-archived) `MissionRecruiter` assignment are in scope.

Filters (`clientId`, `missionId`, `recruiterUserId`, `pipelineState`, `offerStatus`,
`placementStatus`, `source`) can only **narrow** the authorized set; they can never
broaden it. A well-formed but out-of-scope or non-existent `clientId`, `missionId`,
or `recruiterUserId` returns the same empty/zero result as any other empty filter and
never returns a different status code, so it cannot reveal that a hidden record
exists or shift a total as a side channel. Malformed identifiers are rejected with a
generic `400` before scoping.

## Filter applicability

Filters compose (all supplied filters apply together; none broadens scope). They fall
into two groups:

- **Identity/scope filters** — `clientId`, `missionId`, `recruiterUserId`, and the
  date window — constrain both mission-level and process-level datasets.
  `recruiterUserId` matches active `MissionRecruiter` assignment at the mission level
  and the responsible recruiter at the process level.
- **Process-scope filters** — `pipelineState`, `offerStatus`, `placementStatus`, and
  `source` — constrain process-derived datasets (pipeline distribution,
  presented-to-client, total processes, interviews, offers, placements, public
  applications, trends, breakdown process/placement counts, drilldown, and CSV
  export). `offerStatus` matches the process's authoritative **current** offer
  version (`isCurrent = true`); `placementStatus` matches the process's
  `MissionPlacement`. They do not narrow the mission-lifecycle snapshot counts
  (`missions.*` and `missionsByState`), which are mission-level metrics.

Interactive `/drilldown` and `/export.csv` apply exactly the same scope and filters,
so an export always contains the same rows the drilldown shows for the same query.
Every trend series applies the process-scope filters relevant to its dataset (for
example `offersCreated` includes only offers whose current version satisfies
`offerStatus`), so the echoed applied-filters never claim a filter that a dataset
ignored.

## Protected fields never exposed

Reporting responses and CSV exports never include candidate salary expectations or
compensation, client pricing/commercial values, placement commercial values,
confidential evaluation bodies, internal notes, document storage metadata, secrets,
or tokens. Issue #36 does not add those fields to any reporting payload.

## Date window and filters

- `start`/`end` are ISO-8601 timestamps. When omitted, the window defaults to the
  last 90 days ending now.
- The window is validated: `start` must not be after `end`
  (`INVALID_REPORTING_RANGE`), and the window must not exceed 366 days
  (`REPORTING_RANGE_TOO_LARGE`).
- The window applies to **flow** metrics counted by an event timestamp:
  `applications.newInWindow` (by `submittedAt`) and all `trends` series. All other
  summary metrics are **stock** (current-state) snapshots and are not date-filtered.

## KPI definitions

Every KPI is computed over the actor's authorized-and-filtered mission scope.

### Missions (stock)

- `missions.total` — count of missions in scope (all lifecycle states).
- `missions.open` — missions whose state is neither `DRAFT` nor a terminal state
  (`CLOSED_WITH_RECRUITMENT`, `CLOSED_WITHOUT_RECRUITMENT`,
  `DEADLINE_EXPIRED_WITHOUT_RENEWAL`, `CANCELED`, `ARCHIVED`).
- `missions.closed` — missions in a closure state (`CLOSED_WITH_RECRUITMENT`,
  `CLOSED_WITHOUT_RECRUITMENT`, `DEADLINE_EXPIRED_WITHOUT_RENEWAL`, `CANCELED`).
  `ARCHIVED` is reported separately through `missions.byState`.
- `missions.closureEligible` — non-terminal missions where
  `filledPlacementCount >= numberOfPositions`. Per D-030, reaching the target makes a
  mission eligible for closure but never closes it automatically; this KPI is the
  count of missions eligible-but-not-yet-closed.
- `missions.requestedPositions` — `SUM(numberOfPositions)` across missions in scope.
- `missions.byState` — count of missions grouped by lifecycle state.

### Pipeline (stock)

- `pipeline.totalProcesses` — count of mission-candidate processes in scope.
- `pipeline.presentedToClient` — processes with a non-null `presentedAt` (candidates
  explicitly presented to the client).
- `pipeline.byState` — processes grouped by pipeline state.

### Public applications (flow)

- `applications.newInWindow` — `PublicCandidateApplication` records whose
  `submittedAt` is within `[start, end]`, in scope.

### Interviews (stock)

- `interviews.scheduled` / `completed` / `canceled` — interviews whose current status
  is `SCHEDULED` / `COMPLETED` / `CANCELED`, in scope.
- `interviews.byStatus` / `byType` — interviews grouped by status and by type.

### Offers (stock)

- Computed from each offer's current (`isCurrent`) version status, in scope.
- `offers.total` — count of offers (current versions).
- `offers.accepted` / `rejected` / `withdrawn` — offers whose current version status
  is `ACCEPTED` / `REJECTED` / `WITHDRAWN`.
- `offers.byCurrentStatus` — offers grouped by current version status.

### Placements (stock)

- `placements.confirmed` — `MissionPlacement` rows with status `CONFIRMED`, in scope.
  Per D-029/D-044, placements are counted only through offer-backed confirmation.
- `placements.corrected` — placements with status `CORRECTED`.
- `placements.requestedPositions` — mirrors `missions.requestedPositions` so
  requested positions can be compared against confirmed placements.
- `placements.byStatus` — placements grouped by status.

### Aging (stock)

- `aging.overdueMissions` — non-terminal missions whose `applicationDeadline` is in
  the past.
- `aging.stalePipelineProcesses` — non-terminal processes not updated within the last
  30 days.

### Trends (flow, bounded)

Time-series bucketed by `day` (default) or `week`, capped at 366 buckets:
`processesCreated` (`MissionCandidate.createdAt`), `publicApplications`
(`submittedAt`), `interviewsScheduled` (`Interview.scheduledStartAt`),
`offersCreated` (`RecruitmentOffer.createdAt`), and `placementsConfirmed`
(`MissionPlacement.confirmedAt`).

### Breakdowns (bounded top-N)

`byClient`, `byMission`, and `byRecruiter` return at most 50 entries each with counts
of open missions, processes, confirmed placements, and requested positions as
applicable. They use the same scope and filters as the aggregates.

## Drilldown and CSV export

`/drilldown` returns bounded, deterministically ordered (`createdAt desc, id asc`)
mission-candidate rows created within the window, paginated (max page size 200). Rows
expose only operational fields: process/mission/client/candidate identifiers and
display names, pipeline state, responsible recruiter, source, client-visibility flag,
presentation and timestamps.

`/export.csv` (permission `reporting:recruitment:export`) exports the same scoped,
filtered rows with:

- deterministic column order and row order;
- UTF-8 output with RFC 4180 quoting (commas, quotes, and newlines are quoted, inner
  quotes doubled);
- spreadsheet-formula-injection neutralization: cells whose first character is `=`,
  `+`, `-`, `@`, an actual tab (U+0009), or an actual carriage return (U+000D) are
  prefixed with a single quote (matched by code point to avoid escape-text ambiguity);
- a server-generated safe filename and `Content-Disposition: attachment`.

The export never silently truncates. It is bounded to 5000 rows: the query fetches
one row beyond the bound, and when more rows match, the request is rejected with a
stable `REPORTING_EXPORT_TOO_LARGE` error instructing the caller to narrow the
filters. No CSV is produced and no audit record is written in that case.

Successful exports are audited with safe metadata only (actor, report type, and a
bounded filter summary). Interactive dashboard reads are not audited.

## Interface

Issue #56 redesigned the authenticated reporting dashboard on the approved HireMe
visual system. That work is presentation only: it changed no endpoint, no KPI
definition, no authorization rule, no record scope, no filter semantic, no
pagination contract, and no CSV behavior described above.

The dashboard performs the same five reads as one logical load (`/summary`,
`/pipeline`, `/breakdowns`, `/trends` at `interval=week`, and `/drilldown` at
page size 25) and exposes the same five filters it always exposed: start, end,
client, mission, and recruiter. `pipelineState`, `offerStatus`,
`placementStatus`, and `source` remain server-supported but deliberately
unexposed. Changing the drilldown page requests that page alone; applying
filters restarts the report at page 1. A page response commits only while it is
still the latest page request of the report that is still showing: a response
that arrives after the filters, the session, or the page request itself was
superseded is discarded, success and failure alike, so it can never pair one
filter set's rows with another's aggregates.

CSV export keeps the behavior of the surface it replaced: it sends the values
currently in the filter controls, whether or not they have been applied to the
displayed report, and it does not reload the dashboard first.

The navigation entry is gated by `reporting:recruitment:view`. The CSV export
action is not rendered at all without `reporting:recruitment:export` — it is
never shown disabled, which would still disclose it — and the client only hands
the server-generated filename and bytes to the browser.

Presentation labels for language-neutral values (pipeline states, trend metric
names, and the actor scope) are a UI-boundary mapping. The stored value is
unchanged, is what any filter sends back, and no business logic reads a label.
A distribution key the interface does not recognise keeps its raw value rather
than being guessed at.

## Performance and schema

Aggregates use set-based PostgreSQL queries (`groupBy`, `count`, and scoped
`findMany`) with no N+1 loops and no row locking. Every scoped predicate resolves
through existing indexes (`RecruitmentMission.clientId`/`state`,
`MissionRecruiter.missionId`/`userId`/`status`, `MissionCandidate.missionId`/`state`/
`responsibleRecruiterUserId`, `Interview`/offer/placement/public-application
`missionId` and status/date indexes). No schema change or new index was required for
Issue #36.
