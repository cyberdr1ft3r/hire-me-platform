# Hire Me Platform - Project Memory

Last updated: 2026-09-04

This file is the fastest context-rehydration entry point for humans and coding agents. It records stable facts, current goals, active work, and the project operating protocol. Detailed product and architecture documents remain under `docs/`.

## Product Purpose

Build a bilingual, responsive internal business platform for Hire Me that centralizes recruitment operations, client relationships, missions, public opportunities and applications, candidates and CVs, interviews and evaluations, training and coaching, task management, commercial operations, documents, notifications, reporting, and selected integrations.

## Current Phase

Training operations foundation (Phase 9) after merged task-management, document-management, and recruitment-reporting foundations.

- Issue #1 is complete; PR #4 merged the approved product scope, architecture, domain model, workflows, and permissions.
- Issue #5 is complete; PR #6 merged the persistent project-memory and agent-handoff system.
- Issue #2 is complete; PR #8 merged the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI checks.
- Issue #3 is complete; PR #9 merged the foundational Prisma schema, initial migration, role and permission seed, API-owned Prisma boundary, and database lifecycle checks.
- Issue #10 is complete; PR #11 merged the local authentication, session security, RBAC resolution, and authentication audit foundation.
- Issue #13 is complete; PR #14 merged secured internal user administration, role assignment, account status management, permission catalog reads, central active-user authorization checks, and administrative session revocation.
- Issue #15 is complete; PR #16 merged the client organization and client-contact CRM module.
- Issue #17 is complete; PR #18 merged the reusable candidate master records and structured candidate profile foundation.
- Issue #19 is complete; PR #20 merged recruitment missions and multiple recruiter/contributor assignments.
- Issue #21 is complete; PR #22 merged mission-specific candidate processes and the approved ATS pipeline.
- Issue #23 is complete; PR #24 merged interviews and structured candidate evaluations.
- Issue #25 is complete; PR #26 merged product realignment around internal operations, public applications, client portal boundaries, training identities, and commercial accounting.
- Issue #27 is complete; PR #28 merged the public opportunity and unauthenticated candidate application foundation.
- Issue #29 is complete; PR #30 merged the internal offer-to-placement lifecycle. Merge commit `249bca8a0fa1a7619dc5f7bbcff44034b5457cc0` includes final blocking-fix commit `440ea9cb3dec204f0e2308eeb7c02cf4dcae4822`; final-head GitHub Actions run `31719561145` passed all jobs.
- Issue #31 is complete; PR #32 merged internal task management, reminders, comments, and notifications into `main` as commit `621976272e7029b8bbca962684c8ad074b5e7ef8`.
- Issue #37 is implemented on branch `feat/training-operations` as a draft PR. It adds the internal training-operations module on the existing training records.
- Issue #36 is complete; PR #43 merged recruitment reporting, KPI dashboards, and safe exports into `main` as commit `6ff19ad2a03f3f6dc6bdbbf00be9db68d6779a2a`.
- Current executable goal: review the Issue #37 draft PR, keep it open and unmerged, and require latest-`main` incorporation plus a clean-database migration and full integration run from whichever remaining Prisma-heavy branch merges after it.

## Confirmed Product Facts

- The main application is an authenticated internal Hire Me platform for super administrators, administrators, HR managers, managers, team leaders, employees, guests, trainers, accounting/commercial users, and other authorized staff.
- Candidates do not have platform accounts or dashboards in the MVP direction. They apply through unauthenticated opportunity/application links.
- Opportunity lifecycle, application-link availability, and website/home-page listing are independent controls supporting listed opportunities, unlisted link-only opportunities, and internal-sourcing-only missions.
- Candidate progress is mission-specific and must preserve history when one candidate participates in multiple recruitment missions.
- A candidate has only one recruitment process ever for the same mission/opportunity; closed or rejected processes are not recreated for that mission.
- Candidate profile and compensation values remain live source-of-truth data rather than frozen mission snapshots by default; access and changes remain permission-controlled and auditable.
- Candidate recruitment uses one standard client-approved pipeline, with only explicitly optional stages skippable through audited authorized transitions.
- A recruitment mission can have multiple recruiters. Each mission-candidate process has one responsible recruiter at a time, while one recruiter may manage many candidate processes. Authorized reassignment is audited.
- Client companies can have multiple contacts. A client portal is optional future scope, not part of the MVP; `clientVisible` means approved for external sharing, not proof that a portal exists.
- Information approved for external client sharing is limited to candidates explicitly presented for the client's mission and only deliberately approved profile data, notes, summaries, and files. Internal notes, confidential scoring, unrelated missions, Hire Me-wide internal history, protected salary or compensation data unless specifically approved, and recruiter-only operational information remain hidden.
- Client feedback is structured but flexible, with a decision, optional scores, recommendation, comment, client-contact attribution, timestamps, final-decision state, and edit history.
- Placement counting occurs only after explicit authorized placement confirmation. Offer acceptance alone does not count as placement; confirmation is idempotent and later corrections require an audited action.
- Reaching the client-approved accepted-candidate target makes a mission eligible for closure but never closes it automatically. Original and final approved position targets are preserved, and the client or authorized Hire Me user controls closure, continuation, pause, or scope revision.
- V1 communication requires private messages and discussion groups, in addition to comments, mentions, and notifications.
- Training and coaching require programs, sessions, enrollments, per-session attendance, evaluation, certification, and follow-up.
- Business objects and structured records are the source of truth. Public opportunities, candidate applications, commercial records, candidate summaries, interview/evaluation records, client feedback, candidate presentation, job-description content, placement confirmation, and mission closure are not documents by default.
- A document exists only when there is an actual uploaded or generated file requiring storage, download, versioning, approval, signature, or archival. Uploaded CVs, certifications, diplomas, certificates, signed contracts, generated quotation/purchase order/invoice files, and client-supplied files are examples. Generated PDF/Word/Excel representations are outputs derived from business data.
- Issue #12 requires `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` to remain distinct document taxonomy values. They must not be collapsed into a generic contract type.
- Public CV submission must preserve file-version and opportunity-submission history rather than silently overwrite older files.
- Trainers and internal training operators require internal accounts. Training participants are records and do not require accounts by default.
- Commercial and operational accounting is in scope for quotations, recruitment contracts, training contracts, purchase orders, invoices, payments, partial payments, overdue balances, expenses, VAT/tax fields, client balances, and mission/training revenue and profitability. Complete Moroccan payroll is a confirmed future requirement. Full legal accounting, general ledger, tax declarations, bank reconciliation, and payroll implementation details remain unresolved.
- Portfolio is normally represented as a professional link such as GitHub, Behance, or a personal website; it becomes a document only when an actual file is uploaded.
- Principal dashboard indicators are active missions, candidates presented to clients, successful placements, upcoming tasks, and revenue.
- The first version must support French and English and work responsively on desktop, tablet, and mobile browsers.
- Expected migration scale includes thousands of candidates and CV files, hundreds of clients or prospects, and existing mission, interview, commercial, HR, training, and user data.
- Confirmed integration priorities include Microsoft 365 authentication and email/contact capabilities, Outlook and Google calendars, automated email, WhatsApp Business reminders, Excel import/export, PDF generation, Word-compatible output, protected document storage, and internal notifications.
- Issue #29 implemented internal offer versions, offer negotiation outcomes, explicit placement confirmation, placement correction, closure eligibility, and bounded commercial eligibility for later invoicing. Accounting, payroll, training, and any future client portal each need their own later issues.
- Issue #37 implemented internal training operations on the existing training records: training programs with a unique reference, optional client context and planned window; sessions with title, ordering, timezone-safe start/end, delivery mode, reschedule and cancellation metadata; enrollment with approved participant identities, lifecycle timestamps, actor history, and audited withdrawal; and per-session attendance with explicit audited corrections. It does not implement an LMS, exam engine, certificate or contract file generation, training billing, calendar delivery, or any learner portal.
- Training operations expose a durable certificate-readiness boundary derived from enrollment completion, withdrawal, archival, and certificate status. A later document-generation feature consumes it; the training module produces no file and creates no `Document` records for programs, sessions, or enrollments.
- Training commercial records remain outside training operations. `TrainingEnrollment.paymentStatus` is a pre-existing column that the training API and contracts deliberately do not expose. The stable training identifiers a later commercial feature can consume are the training program id and reference, the training session id, and the training enrollment id.
- Issue #31 implemented internal task ownership, multiple assignees, lifecycle, comments, explicit mentions, durable in-app reminders, task-generated notifications, filtered list/read/archive notification controls, searchable/filterable task lists, and permission-aware task visibility. It does not implement private messages, external notifications, email, WhatsApp, calendar delivery, accounting, payroll, training, or document generation.
- Issue #36 implements the first authenticated internal recruitment reporting layer (KPI summary, pipeline/status distributions, bounded trends, mission/client/recruiter breakdowns, bounded drilldowns, and safe CSV export) computed from existing authoritative records with no second data source and no schema change. Every metric, drilldown, and export applies server-side record scope: broad reporting requires `mission_candidates:transfer`, otherwise the actor is limited to missions with an active `MissionRecruiter` assignment; filters only narrow scope and never disclose hidden-record existence. Reporting never exposes salary/compensation, commercial, confidential evaluation, internal-note, storage, or secret fields. It does not implement revenue/accounting/profitability, training, or task-productivity analytics. KPI definitions are in `docs/reporting.md`.

## Technical Direction

- TypeScript monorepo.
- Modular monolith for the initial implementation.
- React + Vite frontend.
- NestJS backend API.
- PostgreSQL with Prisma ORM.
- Prisma is owned by `apps/api`; web and contracts packages stay ORM-independent and are checked by `pnpm check:architecture`.
- Local authentication uses normalized email login, Argon2id password credentials, short-lived access tokens, rotating hashed refresh sessions in HTTP-only cookies, refresh-token reuse detection, normalized permission-code resolution, deny-by-default guards, and safe authentication audit logs.
- Internal user administration uses permission-code guarded `/v1/admin` endpoints, shared Prisma-independent contracts, safe response DTOs, transaction-protected last active `SUPER_ADMIN` checks, self-lockout prevention, session revocation on suspension/archive, and safe administration audit logs.
- Client organization and client-contact CRM uses permission-code guarded `/v1/clients` endpoints, shared Prisma-independent contracts, archival lifecycles, transaction-scoped parent-client row locks for archival and dependent writes, nested contact ownership checks, per-client normalized contact email uniqueness, explicit commercial-data gating, and safe CRM audit logs.
- Candidate master/profile CRM uses permission-code guarded `/v1/candidates` endpoints, shared Prisma-independent contracts, archival lifecycles, transaction-scoped parent-candidate row locks for archival and dependent writes, nested profile ownership checks, global normalized candidate email duplicate rejection, structured skills/languages/work-experience/education records, explicit compensation and consent permissions, and safe candidate audit logs.
- Recruitment mission CRM uses permission-code guarded `/v1/missions` endpoints, shared Prisma-independent contracts, documented lifecycle transitions, structured closure reasons, archival lifecycles, transaction-scoped parent-mission row locks for lifecycle and assignment writes, assignee eligibility re-checks for assignment activation and lead selection, effective salary-range validation for partial updates, nested assignment ownership checks, active duplicate assignment protection, single active lead-recruiter protection, explicit mission commercial-data permissions, and safe mission audit logs.
- Mission-candidate process implementation uses permission-code guarded nested `/v1/missions/:missionId/candidates` endpoints, permanent mission/candidate uniqueness, responsible-recruiter ownership, the client-approved standard pipeline, optional skip audit history, a staff-controlled external-sharing boundary, protected live candidate-field redaction, manual idempotent placement confirmation, and client-controlled closure eligibility.
- Interview and structured-evaluation implementation uses permission-code guarded nested `/v1/missions/:missionId/candidates/:processId/interviews` endpoints, explicit interview participants and lifecycle history, presentation-gated client interviews, idempotent completion and evaluation finalization, bounded structured evaluation fields, confidential evaluation redaction, and the established mission-candidate PostgreSQL lock order extended to the interview row.
- Public opportunity and candidate application foundation is merged. It preserves the API-owned Prisma boundary, uses explicit public DTOs, exposes only approved public fields, accepts unauthenticated submissions safely, preserves file-version history, and enforces one candidate process per mission/candidate pair.
- Offer and placement implementation uses permission-code guarded nested `/v1/missions/:missionId/candidates/:processId/offers` and placement endpoints, immutable offer versions, safe audit metadata, explicit offer-backed placement confirmation, idempotent correction, closure eligibility without auto-closure, and the established mission-candidate PostgreSQL lock order. The retired legacy `confirm-integration` route is compatibility-only and returns `PLACEMENT_OFFER_CONFIRMATION_REQUIRED`; historical `MissionCandidate.placementConfirmedAt` rows are not silently backfilled to `MissionPlacement`.
- Task management implementation uses permission-code guarded `/v1/tasks` and `/v1/notifications` endpoints, one accountable owner with a dedicated owner-change action, normalized multiple-assignee history, explicit authorized context foreign keys, comments, mentions, durable in-app reminders, task events, own-notification controls, row-locked task mutations, locked reminder processing, composite task/recipient reminder idempotency, event-scoped task notification idempotency, and safe audit summaries. Internal task visibility requires `tasks:view` or `tasks:view_all` plus record scope; `tasks:view_all` is the separate broad oversight permission. Comment and reminder recipient eligibility is revalidated inside the locked Task transaction before side effects. Moving a task to `IN_PROGRESS` requires at least one active `TaskAssignment`; `Task.assigneeUserId` remains compatibility-only.
- Task document links reuse the centralized document access policy. Task create/update may reference a `Document` only when the actor currently satisfies `documents:view`, document visibility/owner rules, and linked document context scope. Task reads keep visible tasks visible but redact `context.documentId` when the linked document later becomes inaccessible, ownerless-private, archived, or out of scope. Task notification shaping also redacts `documentId` independently of task visibility.
- Issue #35 adds the internal `Document` / `DocumentVersion` foundation for centralized managed files: explicit document taxonomy, protected server-generated storage keys, immutable uploaded versions, authorized version download, safe metadata responses, document lifecycle/archive, exact operation permission checks, and permission plus linked-business-context authorization. List visibility is enforced in the database predicate and detail/version/download/mutation paths re-check access in service code. Mission, mission-candidate process, and interview document scopes follow their linked entity's current scope rules instead of one blended mission override. `PRIVATE` and `ASSIGNED_ONLY` are owner-only until a separate assignment model exists; a null owner does not broaden private access. `CLIENT_SHARED` is internal sharing metadata and does not grant external/client access. Metadata update/archive audit is atomic with the mutation. JSON base64 uploads are strictly validated, capped before decoding, limited to 4 MB raw bytes, validate DOCX/XLSX as bounded OOXML ZIP packages, and keep safe original filename metadata separate from sanitized download filenames. Candidate CV/application uploads continue to use `CandidateDocument` / `CandidateDocumentVersion`.
- Training operations implementation uses permission-code guarded `/v1/training` endpoints with sessions, enrollments, and participation nested under their training program, shared Prisma-independent training contracts, the documented program/session/participation state machines plus an explicit audited enrollment withdrawal, active-enrollment and session-participation uniqueness enforced by PostgreSQL constraints, a fixed program/session/enrollment/participation row-lock order, capability plus record-scope authorization with `training_programs:view_all` as the separate broad oversight capability, `clients:view` required for client-linked programs in both the list predicate and the detail path, a separate attendance-correction capability, trainer-note redaction, and audit entries written inside the mutating transaction.
- Shared contracts and validation.
- Docker Compose for local services.
- Protected file-storage abstraction.
- Explicit roles and permissions with server-side scope enforcement.
- Append-oriented audit logging for sensitive actions.
- GitHub issues, pull requests, documentation, and decision records are the project source of truth.

## Non-Negotiable Engineering Rules

- Never commit secrets, production credentials, personal datasets, CV files, or questionnaire exports.
- Protect candidate, HR, salary, client, document, and commercial information using least privilege.
- Work through scoped GitHub issues and dedicated branches.
- Use draft pull requests and do not merge automatically as part of an agent task.
- Run applicable lint, type-check, test, build, migration, and security checks before completion.
- Do not silently expand product scope.
- Do not model a business record as a document solely because it can be exported to PDF, Word, or Excel.
- Do not implement candidate accounts or dashboards unless a later approved issue reverses the Issue #25 direction.

## Source-Of-Truth Order

When information conflicts, use this order:

1. The currently approved GitHub issue and its review comments.
2. Merged documents under `docs/`.
3. `docs/project/DECISIONS.md`.
4. `PROJECT_MEMORY.md` and `docs/project/STATUS.md`.
5. Older issue descriptions, PR summaries, and chat context.

Record unresolved conflicts instead of guessing.

## Memory Update Protocol

At the end of every meaningful issue or pull request:

1. Update `docs/project/STATUS.md`.
2. Update `docs/project/HANDOFF.md` for the next agent.
3. Add accepted architectural or product decisions to `docs/project/DECISIONS.md`.
4. Update `docs/project/RISKS.md` when a risk changes.
5. Update this file only when stable project facts, goals, or operating rules change.
6. Link the issue or pull request that supports the update.

Do not use these files as unstructured diaries. Keep them factual, compact, and current.
