# Product Scope

## Purpose

Hire Me Platform is primarily an authenticated internal recruitment and operations platform for Hire Me staff. It manages candidates, CVs, clients, recruitment missions, public opportunities and applications, interviews, evaluations, training, commercial operations, documents, notifications, reporting, and private collaboration.

Candidates do not have platform accounts or dashboards in the approved MVP direction. They interact through unauthenticated public opportunity/application links controlled by Hire Me.

The first implementation phase should provide a single-developer MVP foundation for the confirmed business scope. The documents separate confirmed product requirements from implementation sequence and unresolved technical choices so later tasks do not shrink the approved scope merely because delivery is staged.

## Confirmed Product Requirements

### Target Users

- Super administrator: owns the whole platform, including sensitive configuration, roles, permissions, and user administration.
- Administrator: manages all operational data and configuration except protected super-administrator controls.
- HR manager: manages all normal operational data, including candidates, CVs, missions, interviews, evaluations, training, tasks, and reporting.
- Manager: supervises team-scoped recruitment activity, operational delivery, and approved reporting.
- Team leader: coordinates team-scoped work, recruitment follow-up, interviews, training activity, and tasks.
- Employee: performs day-to-day recruitment, candidate updates, client follow-up, document handling, training activity, and task completion on assigned records.
- Guest: receives temporary internal access only to individually shared read-only records.
- Future client user: optional future portal actor, not part of the MVP. Client access requires a later approved issue.
- Public candidate applicant: unauthenticated person applying through an opportunity link. This is not a `User` account.

### Core Modules

- Users, roles, and permissions
- Candidate and CV management
- Client CRM
- Recruitment missions and recruitment pipelines
- Public opportunities and unauthenticated candidate applications
- Interviews and candidate evaluations
- Tasks and notifications
- Centralized document storage, versioning, and generated documents
- Training and coaching
- Commercial and operational accounting
- Dashboard and exportable reporting
- Internal private messaging and discussion groups
- Confirmed external integration adapters
- Data migration and import validation

### In-Scope Capabilities

- Authenticate users and authorize actions through explicit roles, permissions, and record scopes.
- Manage candidates, profile information, CVs, candidate documents, HR notes, salary expectations where authorized, and candidate history.
- Manage clients, prospects, client contacts, and commercial relationship data.
- Create and track recruitment missions for clients.
- Publish public opportunity/application surfaces for approved recruitment missions.
- Independently control opportunity lifecycle, public website/home-page listing, and application-link availability.
- Support listed opportunities, unlisted link-only opportunities, and internal-sourcing-only missions.
- Collect unauthenticated candidate applications with approved structured fields, CVs, certifications, optional diplomas, professional links, salary expectations, availability, and consent.
- Reuse an existing candidate safely when matching rules identify one, while preserving the permanent one-candidate-per-mission rule.
- Preserve CV version history and opportunity-submission history instead of silently overwriting older files.
- Assign multiple recruiters or contributors to one `RecruitmentMission` through `MissionAssignment`.
- Link candidates to missions through `MissionCandidate` and track mission-specific candidate pipeline state.
- Preserve the confirmed candidate workflow stages from new candidate intake through probation monitoring and closure.
- Preserve the confirmed recruitment mission workflow stages from internal validation and job-description approval through candidate integration, probation monitoring, and closure.
- Schedule interviews and capture candidate feedback through `Interview` and `CandidateEvaluation`.
- Record client feedback and decisions internally in the MVP. A future client portal may later expose approved client-facing information if separately approved.
- Create tasks and automatic reminders or notifications for recruitment, training, document, and user workflows.
- Store and generate candidate, HR, commercial, client, interview, and training documents through a protected storage abstraction.
- Manage training programs, training sessions, registrations, participant approval, attendance, evaluations, certificates, satisfaction assessments, individual coaching, closure, and post-training follow-up.
- Support training participation for candidates, employees or users, client contacts, and external participants through `TrainingEnrollment`.
- Require authenticated internal accounts for trainers and internal training operators.
- Treat training participants as business records that do not require accounts by default.
- Manage commercial operational records including quotations, recruitment contracts, training contracts, purchase orders, invoices, payments, partial payments, overdue balances, expenses, VAT or tax fields, client balances, and mission or training revenue/profitability.
- Provide customizable dashboards with confirmed first metrics: active missions, candidates presented to clients, successful placements, upcoming tasks, and revenue.
- Provide advanced multi-criteria search, customizable reporting views, and exportable reports.
- Support French and English interface requirements.
- Support responsive web usage.
- Record audit logs for sensitive or business-critical actions.
- Support internal private messages and discussion groups through `Conversation`, `ConversationMember`, `Message`, and message attachment concepts.
- Support module-by-module validation and UAT before broader rollout.
- Prepare for backups, confidential-data protection, and import integrity controls.

### Document Scope

Centralized and versioned storage and generation are in scope for:

- quotation files generated from structured quotation records
- purchase order files generated from structured purchase order records
- contract files generated from structured recruitment or training contract records
- invoice files generated from structured invoice records
- HR documents
- candidate summaries
- interview reports
- training documents
- candidate CVs and candidate attachments
- related client, mission, and operational files

Commercial records such as quotations, contracts, purchase orders, invoices, payments, partial payments, overdue balances, expenses, VAT or tax fields, client balances, and profitability records are structured business data first. They become documents only when there is an uploaded, signed, archived, or generated file representation requiring storage, download, versioning, approval, signature, or archival.

Invoice document generation and operational payment tracking are in scope. Full legal accounting, general ledger, chart of accounts, statutory journal entries, tax declarations, bank reconciliation, balance sheet, payroll-calculation engine, and subscription billing engine are unresolved and must not be assumed.

Confirmed output families are PDF, Word-compatible document output, and Excel-compatible tabular or report output where applicable.

Generated document types include quotations, purchase orders, contracts, invoice documents, HR document templates, candidate summaries, interview reports, training documents, PDF exports, Word-compatible documents, and Excel-compatible reports. Uploaded or stored-only document types include candidate CV files, candidate attachments, external HR files, client-provided documents, signed documents, and imported legacy files; these may later receive generated summaries or converted export copies.

### Confirmed Integration Requirements

The product scope includes integration requirements, but implementation can be sequenced after core domain modules and security boundaries are stable:

- Microsoft 365 authentication
- Outlook or Microsoft email synchronization
- Microsoft contact synchronization
- Outlook Calendar
- Google Calendar
- SMTP or Outlook email sending
- WhatsApp Business reminders
- LinkedIn-assisted candidate creation and profile links
- Excel import and export
- PDF generation
- Word-compatible document generation and export
- protected document storage
- real-time internal notifications

These are confirmed requirements or roadmap requirements, not speculative features. Exact providers, API contracts, sync direction, retry behavior, and delivery sequence remain technical choices for later tasks.

## Implementation Sequence

The recommended sequence is:

1. Product documentation, domain model, workflows, and permissions.
2. Monorepo, API, frontend, shared contracts, local services, and quality tooling.
3. Authentication, authorization, audit logging, file storage abstraction, and confidential-data protections.
4. Core users, roles, clients, candidates, CVs, recruitment missions, `MissionAssignment`, `MissionCandidate`, interviews, and evaluations.
5. Public opportunity and candidate application foundation.
6. Offers and placements.
7. Task management, reminders, notifications, dashboard metrics, search, reports, and exports.
8. Document generation and versioned storage for commercial, HR, candidate, interview, and training files.
9. Commercial and operational accounting.
10. Training and coaching workflows with `TrainingProgram`, `TrainingSession`, `TrainingEnrollment`, and `TrainingSessionParticipation`.
11. Optional future client portal and controlled external sharing, only after a separate approved issue.
12. Internal messaging and discussion groups.
13. Data migration, import validation, duplicate detection, and administrator approval flows.
14. Confirmed external integrations, sequenced by business priority and implementation risk.

## Main Recruitment Workflow

1. An authorized internal user creates or updates a `Client` and its `ClientContact` records.
2. An authorized user creates a `RecruitmentMission`.
3. The mission moves through internal validation, active state, job-description approval, candidate sourcing, HR preselection, HR interviews, technical tests, candidate presentation, client interviews, final selection, offer, candidate integration, probation monitoring, and closure.
4. Multiple recruiters or contributors are assigned through `MissionAssignment`.
5. Candidates are created or updated in candidate management, by internal sourcing, or by unauthenticated public opportunity applications.
6. CVs and supporting candidate files are stored as protected `CandidateDocument` records.
7. Candidates are associated with the mission through `MissionCandidate`.
8. `MissionCandidate` records move through the confirmed candidate pipeline: new, CV to review, HR preselection, HR interview scheduled and completed, technical test when required, internal validation, client presentation, client interviews, client offer, acceptance, integration, probation completed, and process completed, with waiting, postponed, rejection, withdrawal, and talent-pool outcomes handled as structured states.
9. Interviews are scheduled and recorded as `Interview` records.
10. Interview feedback and scoring are captured as `CandidateEvaluation` records.
11. Approved candidate, interview, and document information may be marked approved for external sharing. In the MVP, Hire Me staff records client feedback internally; a client portal remains optional future scope.
12. Tasks and notifications coordinate follow-up work.
13. The mission reaches a terminal state such as closed with recruitment, closed without recruitment, canceled, or archived. `closureReason`, `numberOfPositions`, and filled-placement count must support the closure decision.
14. Customizable dashboards and reports summarize active missions, candidates presented to clients, successful placements, upcoming tasks, and revenue according to permissions.

## Data Migration and Initial Scale

The first implementation must account for migration from existing operational data:

- approximately 3,000 to 5,000 candidates
- approximately 3,000 to 5,000 CV files
- approximately 200 to 500 clients and prospects
- approximately 200 recruitment missions
- existing interviews
- existing candidate evaluations
- existing commercial and HR documents
- existing training data
- existing users and roles

Migration requirements include duplicate detection, error reporting, integrity checks, administrator validation, and import summaries. These requirements affect storage design, indexing, import jobs, validation rules, reporting, and tests.

## Confidential Data

Candidate data, HR notes, salary expectations, CVs, client records, commercial terms, documents, exports, notifications, messages, and audit metadata must be treated as confidential. Access should be least-privilege, server-enforced, scoped by assignment or client relationship where applicable, and auditable for sensitive actions.

## First-Phase Non-Goals

- No application, database, Docker, CI, or infrastructure implementation in this documentation task.
- No candidate accounts, candidate dashboards, or public candidate self-service portal unless later approved.
- No MVP client portal implementation; client portal remains optional future scope.
- No AI matching, CV parsing, candidate ranking, or generated recommendation engine unless later approved.
- No advanced workflow automation engine beyond reminders, notifications, background jobs, and explicit workflow transitions.
- No native mobile application.
- No full legal accounting, general ledger, tax declaration, bank reconciliation, payroll-calculation, or subscription billing engine.
- No custom BI warehouse or arbitrary report builder.
- No external integration implementation in this task.
- No speculative modules outside the confirmed product scope.

## Assumptions

- The MVP serves one internal organization.
- Candidate applicants do not authenticate and can submit only through enabled opportunity links.
- Public opportunity fields must be explicitly approved before exposure.
- `clientVisible` and similar terms mean approved for external sharing, not proof that a client portal exists.
- Candidate pipeline state belongs to `MissionCandidate`, not directly to `Candidate`.
- Recruitment mission staffing belongs to `MissionAssignment`, not a single owner field.
- Generated and centralized documents use `Document`; candidate-specific uploaded files use `CandidateDocument`.
- Logical document history uses `DocumentVersion`; candidate-specific CV or attachment history uses `CandidateDocumentVersion`.
- Training participant-specific registration, approval, payment, certificate, satisfaction, coaching, and follow-up data belongs to `TrainingEnrollment`; participants do not require accounts by default.
- Per-session attendance and session-level participant outcome data belongs to `TrainingSessionParticipation`.
- External integrations are confirmed requirements but can be implemented after core data, security, and workflow foundations.

## Unresolved Technical Choices

- Microsoft 365 authentication provider strategy, account linking, MFA, password reset, production secret rotation, and emergency session invalidation playbooks. Issue #10 resolves the first local email/password model, Argon2id policy, access-token lifetime, refresh-token rotation, and reuse-detection foundation.
- Exact sync direction and conflict rules for Microsoft, Outlook, Google, WhatsApp Business, LinkedIn, Excel, PDF, and email integrations.
- Whether internal messaging requires real-time delivery, read receipts, moderation, or attachment limits in the first release.
- Exact formulas and authorization rules for dashboard metrics, especially revenue.
- Exact dashboard customization model, saved view ownership, and widget configuration rules.
- Candidate duplicate detection rules and administrator merge workflow.
- Backup provider, retention policy, and restore testing cadence.
- Whether candidate consent, privacy preferences, and data-retention deadlines need dedicated first-phase entities.
- Exact enum values for `closureReason`; the existence of structured mission closure reasons is confirmed.
- Production public opportunity URL/token strategy beyond opaque slugs, CAPTCHA provider, malware scanner, retention schedule, and applicant duplicate-review workflow.
- Whether future client portal access maps one `ClientContact` to one `User`, supports multiple clients per user, or uses a separate identity model.
- Commercial accounting entity granularity, numbering rules, VAT/tax handling, partial-payment allocation, correction workflows, and export formats.

## Risks

- Overbroad permissions could expose candidate, HR, salary, CV, client, message, document, or commercial data.
- Treating confirmed integrations as immediate implementation work could distract from core recruitment workflows.
- Treating confirmed integrations as speculative could omit required product boundaries.
- Mixing global candidate state with mission-specific state could corrupt candidate history across multiple missions.
- Publishing confidential mission, salary, client, recruiter, pipeline, or commercial data through public opportunities could create a serious confidentiality incident.
- Overwriting CV files from public submissions could destroy version and opportunity-submission history.
- Omitting `MissionAssignment` could block missions with multiple recruiters.
- Omitting `TrainingEnrollment` could make participant-specific training outcomes impossible to model.
- Treating document downloads as ordinary reads could miss audit and access-control requirements.
