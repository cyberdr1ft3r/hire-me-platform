# Product Scope

## Purpose

Hire Me Platform is an internal recruitment operations platform for managing candidates, CVs, clients, recruitment missions, interviews, evaluations, training, documents, notifications, reporting, and private collaboration.

The first implementation phase should provide a single-developer MVP foundation for the confirmed recruitment business scope. It should keep the architecture simple, protect confidential HR and commercial data, and avoid speculative modules that are not confirmed by issue #1.

## Target Users

- Super administrator: owns the whole platform, including sensitive configuration, roles, permissions, and user administration.
- Administrator: manages operational configuration, users, reference data, and support tasks.
- HR manager: manages candidates, CVs, recruitment missions, interviews, evaluations, and reporting.
- Manager: supervises recruitment activity, commercial delivery, teams, and operational reporting.
- Team leader: coordinates assigned team work, recruitment follow-up, interviews, and tasks.
- Employee: performs day-to-day recruitment, candidate updates, client follow-up, document handling, training activity, and task completion.
- Guest: receives temporary or limited internal read-only access.
- Client user: accesses approved client portal information for their client account.

## Core Modules

- Users, roles, and permissions
- Candidate and CV management
- Client CRM
- Recruitment missions and recruitment pipelines
- Interviews and candidate evaluations
- Client portal
- Tasks and notifications
- Document storage and generated documents
- Training and coaching
- Dashboard and reporting
- Internal private messaging and groups
- Future external integrations

## In-Scope Capabilities

- Authenticate users and authorize actions through explicit roles and permissions.
- Manage candidates, profile information, CVs, and candidate documents.
- Manage clients, client contacts, and commercial relationship data.
- Create and track recruitment missions for clients.
- Link candidates to missions through `MissionCandidate` and track mission-specific candidate pipeline state.
- Schedule interviews and capture candidate feedback through `CandidateEvaluation`.
- Share approved mission, candidate, interview, and document information with client users through the client portal.
- Create tasks and notifications for recruitment, training, document, and user workflows.
- Store candidate documents and generated documents through a protected file storage abstraction.
- Manage training programs and training sessions.
- Provide dashboards and reports for operational visibility.
- Record audit logs for sensitive or business-critical actions.
- Preserve extension points for internal private messaging, groups, and future external integrations.

## First-Phase Non-Goals

- No application, database, Docker, or infrastructure implementation in this documentation task.
- No public candidate self-service portal.
- No production integration with job boards, HRIS, email, calendar, accounting, payroll, or external CRM systems.
- No AI matching, CV parsing, candidate ranking, or generated recommendation engine.
- No advanced workflow automation engine beyond future background job support.
- No native mobile application.
- No billing, invoicing, subscription, or accounting module.
- No custom BI warehouse or advanced report builder.
- No real-time messaging implementation decision in this phase.
- No speculative product modules outside the confirmed scope in issue #1.

## Main Recruitment Workflow

1. An authorized internal user creates or updates a `Client` and its `ClientContact` records.
2. An HR manager, manager, or authorized team member creates a `RecruitmentMission` for the client.
3. Candidates are created or updated in candidate management.
4. CVs and supporting candidate files are stored as protected `CandidateDocument` records.
5. Candidates are associated with the mission through `MissionCandidate`.
6. `MissionCandidate` records move through the candidate pipeline.
7. Interviews are scheduled and recorded as `Interview` records.
8. Interview feedback and scoring are captured as `CandidateEvaluation` records.
9. Approved candidate, interview, and document information is shared with client users through the client portal.
10. Tasks and notifications coordinate follow-up work.
11. The mission reaches a terminal state such as `filled`, `closed`, `canceled`, or `archived`.
12. Dashboards and reports summarize mission outcomes, candidate progress, activity, and commercial performance according to permissions.

## Confidential Data

Candidate data, HR notes, salary expectations, CVs, client records, commercial terms, documents, exports, and audit metadata must be treated as confidential. Access should be least-privilege, server-enforced, scoped by assignment or client relationship where applicable, and auditable for sensitive actions.

## Assumptions

- The MVP serves one internal organization.
- Client users only access data explicitly shared with their client account.
- Candidate pipeline state belongs to `MissionCandidate`, not directly to `Candidate`.
- Generated documents use `Document`; candidate-specific uploaded files use `CandidateDocument`.
- External integrations are future adapters and should not drive the first implementation structure.

## Unresolved Decisions

- Whether client users can upload documents or only view and download approved documents.
- Whether internal private messaging should be included in the MVP or deferred after core recruitment workflows.
- Which dashboard and reporting metrics are required for the first usable release.
- Whether candidate consent and data-retention preferences need dedicated first-phase entities.

## Risks

- Overbroad permissions could expose candidate, HR, salary, CV, client, or commercial data.
- Implementing integrations too early could distract from the core recruitment workflow.
- Mixing global candidate state with mission-specific state could corrupt candidate history across multiple missions.
- Treating document downloads as ordinary reads could miss audit and access-control requirements.
