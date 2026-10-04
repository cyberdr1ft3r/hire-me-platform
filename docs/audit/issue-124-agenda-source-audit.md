# Issue #124 — Agenda source preflight audit

**Date:** 2026-10-04  
**Base `main`:** `ec6fa2b` (post Accounting V1 prerequisite merge)  
**Issue:** [#124](https://github.com/cyberdr1ft3r/hire-me-platform/issues/124) automatic per-user agenda

## Executive summary

| Source | Entity exists | Dated fields | User involvement today | Authorization today | Agenda-ready without new work? |
| --- | --- | --- | --- | --- | --- |
| Tasks | `Task` | `startAt`, `dueAt`, `timezone` | Owner, creator, active assignees; mission-linked visibility | `tasks:view` / `tasks:view_all` + `visibleTaskWhere` | **Partial** — aggregate with existing visibility predicate |
| Task reminders | `TaskReminder` | `remindAt` | Recipient user | Same as parent task via `canViewTask` | **Partial** — use as `follow_up` only when task not duplicated at same instant |
| Interviews | `Interview` | `scheduledStartAt`, `scheduledEndAt`, `timezone` | Organizer + `InterviewParticipant` (internal user / client contact) | Mission assignment scope + `interviews:view` family; list is mission-scoped | **Partial** — need cross-mission query with mission scope + involvement filter |
| Training sessions | `TrainingSession` | `scheduledAt`, `scheduledEndAt` | Trainer; enrollments/participations for internal users | `training_programs:view` + program/session visibility predicates | **Partial** — trainer + enrolled internal user paths |
| Meetings | **None** | — | — | — | **No** — prerequisite required |
| Generic calendar events | **None** (deferred `Event` in domain model) | — | — | — | **Out of scope** per issue |
| Notifications | `Notification` | `createdAt` only (no obligation date) | Recipient | Own notifications + linked task visibility | **No** — not a dated obligation; do not mirror into agenda |
| Commercial/accounting follow-ups | Business records | Various status dates | Role-specific | Commercial permissions | **No for V1** — not listed as agenda sources in issue acceptance criteria |

## Meetings (critical)

- **No `Meeting` or `MeetingParticipant` model** in `schema.prisma`.
- Domain model maps “events or meetings” to `Interview`, `TrainingSession`, or **deferred `Event` concept** (`docs/domain-model.md`).
- **Decision:** Do **not** represent general meetings as `Task` or `Interview`. Ship a **bounded meetings foundation** (schema + permissions + minimal API) as prerequisite **Issue #124 / PR A**, then agenda aggregation **PR B**.

## Tasks

- **Fields:** `dueAt`, optional `startAt`, `timezone`, `status`, `priority`, archival timestamps.
- **Involvement for agenda:** owner, active assignee (`TaskAssignment`), or visibility via existing mission/recruitment scope (same as task list).
- **Overdue:** `dueAt < now` and status not terminal (`COMPLETED`, `CANCELED`, `ARCHIVED`) — matches existing list `overdue` filter.
- **Reschedule/cancel/complete:** authoritative on `Task`; agenda projection reads live row (no sync table).
- **Dedup:** One agenda row per task per user (`sourceType=task`, `sourceId=task.id`). Pending `TaskReminder` rows become `follow_up` when `remindAt` is in window and differ from task `dueAt` (or task has no `dueAt`).

## Interviews

- **Fields:** `scheduledStartAt`, `scheduledEndAt`, `timezone`, `status`, lifecycle timestamps.
- **Involvement:** `organizerUserId` or active internal participant (`InterviewParticipant.userId`).
- **Authorization:** Must not bypass mission scope — include only when actor is involved **and** mission scope matches `MissionInterviewsService.assertMissionScope` rules (active mission recruiter assignment or archive/evaluation override permissions).
- **Deep link:** `/missions?mission=<missionId>&process=<missionCandidateId>&interview=<interviewId>` (web opens process + interview section).

## Training

- **Fields:** `TrainingSession.scheduledAt` / `scheduledEndAt`, status, cancel/reschedule metadata.
- **Involvement:** `trainerUserId`; internal participant via `TrainingEnrollment.userId` + `TrainingSessionParticipation`.
- **Authorization:** Reuse training program/session visibility (`visibleProgramWhere` and session access checks).
- **Deep link:** `/training?program=<programId>&session=<sessionId>`.

## Reminders / workflow follow-ups

- **TaskReminder** is the only dated workflow reminder with a clear user recipient today.
- **No** separate “follow-up” entity outside tasks.
- **Rule:** Never emit both a task row and a follow-up row for the same `(user, task, timestamp)`.

## Normalized agenda API (post-audit)

- **Endpoint:** `GET /v1/agenda` (authenticated; **no** broadening permission grants).
- **Query:** time window (`from`, `to`), `view` (`today` | `week` | `month` | `upcoming` | `overdue` | `past`), optional `sources[]`.
- **Response:** normalized `AgendaItem[]` per issue sketch; stable `id` = `{sourceType}:{sourceId}` (follow-up uses reminder id).
- **Implementation:** `AgendaService` runs **read-only** Prisma queries reusing the same visibility predicates as Tasks, Mission interviews, Training, and Meetings modules — **no** agenda persistence table.

## Prerequisites before full V1 UI

1. **Meetings foundation PR** — `Meeting`, `MeetingParticipant`, permissions (`meetings:view`, `meetings:create`, `meetings:manage`), list/detail/create/reschedule/cancel/participant status updates.
2. **Agenda aggregation + web PR** — contracts, `AgendaService`, integration tests (D-071), bilingual `apps/web/src/agenda/`, navigation entry for all authenticated users.

## Risks / open product questions

- **R-124-01:** Client-contact interview participants are not internal users — agenda V1 includes **internal user** involvement only (contacts do not log into My Agenda).
- **R-124-02:** Users with `tasks:view` but no mission assignment still see mission-scoped tasks via existing task visibility OR clauses — agenda inherits that behavior unchanged.
