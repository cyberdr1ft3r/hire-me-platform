# Delivery Roadmap

Last updated: 2026-08-28

This roadmap records sequencing and dependencies. It does not replace individual GitHub issues or their acceptance criteria.

## Phase 0 - Discovery

**State:** Complete

- Initial business questionnaire.
- Clarification questionnaire.
- Client workflows, modules, roles, migration expectations, dashboard indicators, language requirements, and integration priorities collected.

## Phase 1 - Product and architecture foundation

**State:** Complete

- Issue #1 completed through merged PR #4.
- Product scope, architecture, domain model, workflows, and permissions approved.
- Repository memory, goals, status, roadmap, decisions, risks, and agent handoff protocol established through issue #5 and merged PR #6.

**Exit criteria met:**

- Confirmed requirements are represented without contradiction.
- Domain entities and relationships support multiple recruiters, mission-specific candidate history, public applications, optional future client access, multi-session training attendance, messaging, document versioning, dashboards, commercial operations, outputs, and migration needs.
- Workflows match client-confirmed stages.
- Permissions use confirmed operational scopes with explicit commercial-data controls and public-application confidentiality boundaries.
- PR #4 and PR #6 are merged.

## Phase 2 - Repository and local development bootstrap

**State:** Complete

- Issue #2.
- pnpm and Turborepo monorepo.
- React + Vite web app.
- NestJS API.
- Shared contracts and configuration.
- PostgreSQL local service through Docker Compose.
- Prisma wiring without the complete business schema.
- CI quality gates.

**Exit criteria:**

- A fresh clone can be started from the README.
- PostgreSQL is healthy through Docker Compose.
- The API exposes a tested structured health endpoint.
- The web app reaches the API through environment-based configuration.
- Lint, type-check, tests, build, and formatting checks pass locally and in CI.
- No business modules or complete domain schema are implemented in this phase.

## Phase 3 - Persistence foundation

**State:** Complete

- Issue #3.
- Foundational Prisma schema.
- Migrations, development seed, indexes, constraints, archival approach, and relational tests.

## Phase 4 - Identity, authorization, and audit foundation

**State:** Complete

- Authentication implementation.
- Roles, permissions, and record scopes.
- User administration.
- Audit logging.
- Protected-session and secret-handling rules.

## Phase 5 - Core recruitment CRM

**State:** In progress

- Clients and contacts.
- Candidates and CV metadata.
- Recruitment missions and multiple recruiter assignments.
- MissionCandidate pipeline.
- Interviews and evaluations.
- Search and filtering.

Issue #15 completed clients and contacts. Issue #17 completed candidate master/profile records without CV uploads. Issue #19 completed recruitment missions and multiple recruiter/contributor assignments. Issue #21 completed the `MissionCandidate` process pipeline. Issue #23 completed interviews and evaluations.

Issue #27 completed the public opportunity and candidate application foundation with public listed/unlisted opportunity controls, unauthenticated candidate submissions, approved public fields, upload requirements, CV/file version preservation, safe candidate reuse, and permanent one-process-per-mission/candidate enforcement.

Issue #29 completed the internal offer-to-placement lifecycle. Issue #31 implements task management, reminders, comments, mentions, and in-app notifications in draft PR #32; latest follow-up review fixes require final PR review/CI. Broader search, accounting, payroll, training, and document generation remain separate scoped work.

## Phase 6 - Offers and placements

**State:** Complete through Issue #29 / merged PR #30

- Versioned internal recruitment offers.
- Staff-recorded negotiation, acceptance, rejection, expiry, and withdrawal.
- Explicit placement confirmation, placement correction, mission closure eligibility, and bounded commercial eligibility for later invoicing.

## Phase 6a - Task management

**State:** In progress through Issue #31

- Task management with ownership, owner transfer, assignees, priority, due dates, status, authorized context links, searchable/filterable lists, reminders, own-notification controls, and audit history.
- Notifications, comments, and mentions.

## Phase 7 - Documents, reporting, and collaboration

**State:** Planned; issues not yet created

- Document templates, versions, and generation for confirmed commercial and HR files.
- Customizable dashboard indicators, reports, and exports.
- Private messages and discussion groups.
- Protected document access and sharing.

## Phase 8 - Commercial and operational accounting

**State:** Planned; issues not yet created

- Quotations.
- Recruitment contracts.
- Training contracts.
- Purchase orders.
- Invoices.
- Payments and partial payments.
- Overdue balances.
- Expenses.
- VAT/tax fields.
- Client balances.
- Mission and training revenue and profitability.

Full legal accounting, general ledger, statutory tax declarations, bank reconciliation, and balance-sheet behavior require separate approval and are not assumed.

## Phase 8a - Complete Moroccan payroll

**State:** Confirmed future requirement; issue not yet created

- Complete Moroccan payroll is confirmed as future product scope.
- Payroll implementation requires its own requirements, security, legal/accounting boundary, and validation issue.
- Issue #29 records the requirement only and does not implement payroll.

## Phase 9 - Training and coaching

**State:** Planned; issues not yet created

- Training programs, sessions, enrollment, per-session attendance, assessment, certificates, and follow-up.
- Trainers and internal training operators use authenticated internal accounts.
- Training participants are records by default and do not require accounts.

## Phase 10 - Optional future client portal

**State:** Optional future scope; issue not yet approved

- Any client portal or client account experience requires a separate product and security issue.
- Existing `clientVisible` terms mean approved for external sharing, not current portal visibility.

## Phase 11 - Integrations and migration

**State:** Planned; issues not yet created

- Microsoft 365 authentication and approved email/contact capabilities.
- Outlook and Google calendar adapters.
- Automated email and WhatsApp Business reminders.
- Excel-compatible import/export, PDF generation, and Word-compatible outputs.
- Controlled migration tooling with duplicate detection, validation, and reporting.

## Phase 12 - UAT and production readiness

**State:** Planned; issues not yet created

- User acceptance environment.
- Backup and recovery validation.
- Security review.
- Operational monitoring and logging.
- Deployment documentation.
- Client validation and launch checklist.

## Roadmap rules

- Create separate issues before starting any planned phase or module.
- Do not combine unrelated phases into one Codex task.
- Update this roadmap when sequencing or dependencies change.
- Keep feature detail in product documentation and issue acceptance criteria, not in this overview.
