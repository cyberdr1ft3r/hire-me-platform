# Hire Me Platform - Project Memory

Last updated: 2026-07-21

This file is the fastest context-rehydration entry point for humans and coding agents. It records stable facts, current goals, active work, and the project operating protocol. Detailed product and architecture documents remain under `docs/`.

## Product Purpose

Build a bilingual, responsive business platform for Hire Me that centralizes recruitment operations, client relationships, missions, candidates and CVs, interviews and evaluations, client collaboration, training and coaching, tasks, documents, notifications, reporting, and selected integrations.

## Current Phase

First CRM business module foundation.

- Issue #1 is complete; PR #4 merged the approved product scope, architecture, domain model, workflows, and permissions.
- Issue #5 is complete; PR #6 merged the persistent project-memory and agent-handoff system.
- Issue #2 is complete; PR #8 merged the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI checks.
- Issue #3 is complete; PR #9 merged the foundational Prisma schema, initial migration, role and permission seed, API-owned Prisma boundary, and database lifecycle checks.
- Issue #10 is complete; PR #11 merged the local authentication, session security, RBAC resolution, and authentication audit foundation.
- Issue #13 is complete; PR #14 merged secured internal user administration, role assignment, account status management, permission catalog reads, central active-user authorization checks, and administrative session revocation.
- Active issue: #15 - draft PR pending for the client organization and client-contact CRM module.

## Confirmed Product Facts

- Main users include super administrators, administrators, HR managers, managers, team leaders, employees, guests, and client users.
- Candidate progress is mission-specific and must preserve history when one candidate participates in multiple recruitment missions.
- A recruitment mission can have multiple recruiters.
- Client companies can have multiple contacts and a restricted client portal.
- V1 communication requires private messages and discussion groups, in addition to comments, mentions, and notifications.
- Training and coaching require programs, sessions, enrollments, per-session attendance, evaluation, certification, and follow-up.
- Documents include CVs, job descriptions, interview reports, candidate summaries, quotations, purchase orders, contracts, invoices, HR documents, technical-test reports, and training material with explicit version history.
- Principal dashboard indicators are active missions, candidates presented to clients, successful placements, upcoming tasks, and revenue.
- The first version must support French and English and work responsively on desktop, tablet, and mobile browsers.
- Expected migration scale includes thousands of candidates and CV files, hundreds of clients or prospects, and existing mission, interview, commercial, HR, training, and user data.
- Confirmed integration priorities include Microsoft 365 authentication and email/contact capabilities, Outlook and Google calendars, automated email, WhatsApp Business reminders, Excel import/export, PDF generation, Word-compatible output, document storage, and internal notifications.

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
