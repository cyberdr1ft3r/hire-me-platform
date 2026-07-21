# Delivery Roadmap

Last updated: 2026-07-21

This roadmap records sequencing and dependencies. It does not replace individual GitHub issues or their acceptance criteria.

## Phase 0 â€” Discovery

**State:** Complete

- Initial business questionnaire.
- Clarification questionnaire.
- Client workflows, modules, roles, migration expectations, dashboard indicators, language requirements, and integration priorities collected.

## Phase 1 â€” Product and architecture foundation

**State:** In progress

- Issue #1: product scope, architecture, domain model, workflows, and permissions.
- PR #4: documentation implementation and corrections.
- Establish repository memory, goals, status, roadmap, decisions, risks, and agent handoff protocol.

**Exit criteria:**

- Confirmed requirements are represented without contradiction.
- Domain entities and relationships support multiple recruiters, mission-specific candidate history, client access, training enrollment, messaging, documents, dashboards, and migration needs.
- Workflows match client-confirmed stages.
- Permissions use least-privilege defaults.
- PR #4 is reviewed and merged.

## Phase 2 â€” Repository and local development bootstrap

**State:** Blocked by Phase 1

- Issue #2.
- pnpm and Turborepo monorepo.
- React + Vite web app.
- NestJS API.
- Shared contracts and configuration.
- PostgreSQL local service through Docker Compose.
- Prisma wiring without the complete business schema.
- CI quality gates.

## Phase 3 â€” Persistence foundation

**State:** Blocked by Phases 1 and 2

- Issue #3.
- Foundational Prisma schema.
- Migrations, development seed, indexes, constraints, archival approach, and relational tests.

## Phase 4 â€” Identity, authorization, and audit foundation

**State:** Planned; issue not yet created

- Authentication implementation.
- Roles, permissions, and record scopes.
- User administration.
- Audit logging.
- Protected-session and secret-handling rules.

## Phase 5 â€” Core recruitment CRM

**State:** Planned; issues not yet created

- Clients and contacts.
- Candidates and CV metadata.
- Recruitment missions and multiple recruiter assignments.
- MissionCandidate pipeline.
- Interviews and evaluations.
- Search and filtering.

## Phase 6 â€” Collaboration and operational support

**State:** Planned; issues not yet created

- Tasks, reminders, notifications, comments, and mentions.
- Private messages and discussion groups.
- Client portal.
- Protected document access and sharing.

## Phase 7 â€” Training, commercial documents, and reporting

**State:** Planned; issues not yet created

- Training programs, sessions, enrollment, attendance, assessment, certificates, and follow-up.
- Document templates and generation for confirmed commercial and HR documents.
- Dashboard indicators and exports.

## Phase 8 â€” Integrations and migration

**State:** Planned; issues not yet created

- Microsoft 365 authentication and approved email/contact capabilities.
- Outlook and Google calendar adapters.
- Automated email and WhatsApp Business reminders.
- Excel import/export and PDF generation.
- Controlled migration tooling with duplicate detection, validation, and reporting.

## Phase 9 â€” UAT and production readiness

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
