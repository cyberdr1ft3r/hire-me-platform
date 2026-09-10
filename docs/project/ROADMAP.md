# Delivery Roadmap

Last updated: 2026-09-09

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

Issue #29 completed the internal offer-to-placement lifecycle. Issue #31 completed task management. Issue #35 completed the centralized document foundation, which also completed Issue #12's distinct recruitment/training contract taxonomy. Issues #38 and #39 completed the commercial and operational accounting foundations. Broader search, payroll, and document generation remain separate scoped work.

## Phase 6 - Offers and placements

**State:** Complete through Issue #29 / merged PR #30

- Versioned internal recruitment offers.
- Staff-recorded negotiation, acceptance, rejection, expiry, and withdrawal.
- Explicit placement confirmation, placement correction, mission closure eligibility, and bounded commercial eligibility for later invoicing.

## Phase 6a - Task management

**State:** Complete through Issue #31 / merged PR #32

- Task management with ownership, assignees, priority, due dates, status, context links, reminders, and audit history.
- Notifications, comments, and mentions.

## Phase 7 - Documents, reporting, and collaboration

**State:** Document foundation complete through Issue #35 / merged PR #40

- Protected centralized `Document` / `DocumentVersion` foundation, distinct recruitment/training contract taxonomy, immutable uploaded versions, internal-only visibility semantics, database-level list visibility, and authorized downloads.
- Issue #49 implements template-driven generation for commercial quotations, purchase orders, recruitment and training contracts, issued invoices, and training certificates, as PDF and Word-compatible DOCX in French or English. Generated files attach to the existing `Document` aggregate as normal immutable `DocumentVersion` records with `DocumentVersionSource.GENERATED`, never as a second source of truth.
- Still future generation work requiring its own issues: candidate summaries, interview reports, generic HR templates, an arbitrary template editor, e-signature, delivery by email or WhatsApp, Excel generation, payment receipts, accounting exports, payroll documents, and OCR or AI extraction.
- Issue #36 / merged PR #43 adds the first authenticated internal recruitment reporting layer: scoped KPI summary, pipeline/status distributions, bounded trends, mission/client/recruiter breakdowns, bounded drilldowns, and safe CSV export, all record-scope enforced and computed from existing data with no schema change. Accounting/revenue, training, and task-productivity analytics remain out of scope.
- Customizable dashboard indicators, reports, and exports (broader dashboards beyond Issue #36 recruitment reporting).
- Private messages and discussion groups.
- Protected document access and sharing.

## Phase 7a - HireMe UI/UX v1

**State:** Foundations merged; Recruitment/Reporting representative surface implemented under Issue #56 and awaiting its final validation and visual gate

- Canonical HireMe UI-DNA, semantic CSS tokens, typography, spacing, radius, elevation, motion, density, responsive, interaction, composition, data-visualization, accessibility, and raw-value rules.
- Development-only, synthetic, API-free preview and the minimum primitives needed to review the visual language.
- Internal compact, internal standard, and public spacious expressions share one brand and semantic system.
- Authenticated internal AppShell and PageHeader checkpoint: permission-aware grouped navigation, safe session chrome, responsive off-canvas behavior, and development-only synthetic review entry without changing module business logic.
- The bilingual Recruitment/Reporting dashboard is the first representative production surface. It preserves reporting calculations, contracts, authorization, record scope, filters, pagination, CSV behavior, and persistence while proving the approved KPI, visualization, filter, dense-table, responsive, accessibility, and state patterns.
- Hard stop before the Candidate workspace, Public Opportunity experience, or broader production migration.
- After explicit Reporting approval, continue Issue #52 with the Candidate workspace representative surface; broader module rollout remains follow-up work.

## Phase 8 - Commercial and operational accounting

**State:** Complete through Issue #38 / merged PR #46 and Issue #39 / merged PR #47

- Issue #38 implements structured quotations, recruitment and training commercial contracts, purchase orders, invoices, server-calculated VAT/tax totals, lifecycle/history records, permission-aware minimal UI, source-scope authorization with hidden-ID masking, relationship context/currency/status validation, historical read preservation after parent archival, exact contract/PO invoice snapshots, archive filtering, atomic audit, and placement-backed invoice eligibility.
- Issue #39 implements payments, payment allocations, derived invoice settlement with partial, paid, and overdue behavior, operational expenses, client receivables, overdue receivables, and D-053 issued-invoice profitability. Every aggregate is separated per currency and there is no FX conversion.

Remaining accounting scope requires its own approved issues and is not assumed here: Moroccan payroll (Phase 8a), statutory and general-ledger and tax accounting, bank reconciliation, balance-sheet behavior, credit notes and refunds, aging buckets beyond the current overdue outstanding figure, accounting exports, and training-program profitability, which first needs an authoritative link from commercial revenue to a training program.

## Phase 8a - Complete Moroccan payroll

**State:** Confirmed future requirement; issue not yet created

- Complete Moroccan payroll is confirmed as future product scope.
- Payroll implementation requires its own requirements, security, legal/accounting boundary, and validation issue.
- Issue #29 records the requirement only and does not implement payroll.

## Phase 9 - Training and coaching

**State:** Training operations foundation complete through Issue #37 / merged PR #45

- Implemented: training programs, sessions, enrollment, per-session attendance, deterministic
  lifecycles, client-linked record scope, and the durable certificate-readiness boundary.
- Trainers and internal training operators use authenticated internal accounts.
- Training participants are records by default and do not require accounts.
- Remaining future work: detailed assessment and exam content, certificate and training-contract
  file generation, satisfaction and follow-up workflows beyond their lifecycle states, coaching
  program specifics, calendar delivery, and any learner-facing portal.
- Training commercial records (pricing, quotations, invoicing, payments, revenue, profitability)
  belong to Phase 8 and are not part of Issue #37.

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
