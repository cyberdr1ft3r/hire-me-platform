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

| Endpoint | Purpose | Permission |
| --- | --- | --- |
| `/summary` | KPI summary (missions, pipeline, applications, interviews, offers, placements, aging) | `reporting:recruitment:view` |
| `/pipeline` | Status/distribution datasets for charts | `reporting:recruitment:view` |
| `/trends` | Bounded time-series buckets over the window | `reporting:recruitment:view` |
| `/breakdowns` | Top-N mission/client/recruiter breakdowns | `reporting:recruitment:view` |
| `/drilldown` | Bounded, paginated mission-candidate rows | `reporting:recruitment:view` |
| `/export.csv` | Safe CSV export of the drilldown rows | `reporting:recruitment:export` |

Responses are Prisma-independent shared contracts (`packages/contracts/src/reporting.ts`);
Prisma models are never exposed.

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
- spreadsheet-formula-injection neutralization: cells beginning with `=`, `+`, `-`,
  `@`, tab, or carriage return are prefixed with a single quote;
- a bounded maximum of 5000 rows;
- a server-generated safe filename and `Content-Disposition: attachment`.

Exports are audited with safe metadata only (actor, report type, and a bounded filter
summary). Interactive dashboard reads are not audited.

## Performance and schema

Aggregates use set-based PostgreSQL queries (`groupBy`, `count`, and scoped
`findMany`) with no N+1 loops and no row locking. Every scoped predicate resolves
through existing indexes (`RecruitmentMission.clientId`/`state`,
`MissionRecruiter.missionId`/`userId`/`status`, `MissionCandidate.missionId`/`state`/
`responsibleRecruiterUserId`, `Interview`/offer/placement/public-application
`missionId` and status/date indexes). No schema change or new index was required for
Issue #36.
