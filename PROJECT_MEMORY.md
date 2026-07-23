# Hire Me Platform - Project Memory

Last updated: 2026-07-23

This file is the fastest context-rehydration entry point for humans and coding agents. It records stable facts, current goals, active work, and the project operating protocol. Detailed product and architecture documents remain under `docs/`.

## Product Purpose

Build a bilingual, responsive business platform for Hire Me that centralizes recruitment operations, client relationships, missions, candidates and CVs, interviews and evaluations, client collaboration, training and coaching, tasks, documents, notifications, reporting, and selected integrations.

## Current Phase

ATS recruitment workflow foundation.

- Issue #1 is complete; PR #4 merged the approved product scope, architecture, domain model, workflows, and permissions.
- Issue #5 is complete; PR #6 merged the persistent project-memory and agent-handoff system.
- Issue #2 is complete; PR #8 merged the TypeScript monorepo, local PostgreSQL service, Prisma wiring, and CI checks.
- Issue #3 is complete; PR #9 merged the foundational Prisma schema, initial migration, role and permission seed, API-owned Prisma boundary, and database lifecycle checks.
- Issue #10 is complete; PR #11 merged the local authentication, session security, RBAC resolution, and authentication audit foundation.
- Issue #13 is complete; PR #14 merged secured internal user administration, role assignment, account status management, permission catalog reads, central active-user authorization checks, and administrative session revocation.
- Issue #15 is complete; PR #16 merged the client organization and client-contact CRM module.
- Issue #17 is complete; PR #18 merged the reusable candidate master records and structured candidate profile foundation.
- Issue #19 is complete; PR #20 merged recruitment missions and multiple recruiter/contributor assignments.
- Current executable goal: Issue #23 interviews and structured evaluations on branch `feat/interviews-evaluations`, using decisions D-004 and D-023 through D-034.

## Confirmed Product Facts

- Main users include super administrators, administrators, HR managers, managers, team leaders, employees, guests, and client users.
- Candidate progress is mission-specific and must preserve history when one candidate participates in multiple recruitment missions.
- A candidate has only one recruitment process ever for the same mission/opportunity; closed or rejected processes are not recreated for that mission.
- Candidate profile and compensation values remain live source-of-truth data rather than frozen mission snapshots by default; access and changes remain permission-controlled and auditable.
- Candidate recruitment uses one standard client-approved pipeline, with only explicitly optional stages skippable through audited authorized transitions.
- A recruitment mission can have multiple recruiters. Each mission-candidate process has one responsible recruiter at a time, while one recruiter may manage many candidate processes. Authorized reassignment is audited.
- Client companies can have multiple contacts and a restricted client portal.
- Clients see only candidates explicitly presented for their mission and only deliberately approved profile data, notes, summaries, and files. Internal notes, confidential scoring, other missions, and Hire Me-wide history remain hidden.
- Client feedback is structured but flexible, with a decision, optional scores, recommendation, comment, client-contact attribution, timestamps, final-decision state, and edit history.
- Placement counting occurs only after manual integration confirmation by an authorized user; counting is idempotent and later corrections require an audited action.
- Reaching the client-approved accepted-candidate target makes a mission eligible for closure but never closes it automatically. Original and final approved position targets are preserved, and the client or authorized Hire Me user controls closure, continuation, pause, or scope revision.
- V1 communication requires private messages and discussion groups, in addition to comments, mentions, and notifications.
- Training and coaching require programs, sessions, enrollments, per-session attendance, evaluation, certification, and follow-up.
- Business objects and structured records are the source of truth. Candidate summaries, interview/evaluation records, client feedback, candidate presentation, job-description content, placement confirmation, and mission closure are not documents by default.
- A document exists only when there is an actual uploaded or generated file requiring storage, download, versioning, approval, signature, or archival. Uploaded CVs, contracts, quotations, purchase orders, invoices, diplomas, certificates, and client-supplied files are examples. Generated PDF/Word/Excel representations are outputs derived from business data.
- Portfolio is normally represented as a professional link such as GitHub, Behance, or a personal website; it becomes a document only when an actual file is uploaded.
- Principal dashboard indicators are active missions, candidates presented to clients, successful placements, upcoming tasks, and revenue.
- The first version must support French and English and work responsively on desktop, tablet, and mobile browsers.
- Expected migration scale includes thousands of candidates and CV files, hundreds of clients or prospects, and existing mission, interview, commercial, HR, training, and user data.
- Confirmed integration priorities include Microsoft 365 authentication and email/contact capabilities, Outlook and Google calendars, automated email, WhatsApp Business reminders, Excel import/export, PDF generation, Word-compatible output, protected document storage, and internal notifications.

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
- Mission-candidate process implementation uses permission-code guarded nested `/v1/missions/:missionId/candidates` endpoints, permanent mission/candidate uniqueness, responsible-recruiter ownership, the client-approved standard pipeline, optional skip audit history, explicit presentation visibility boundary, protected live candidate-field redaction, manual idempotent placement confirmation, and client-controlled closure eligibility.
- Interview and structured-evaluation implementation uses permission-code guarded nested `/v1/missions/:missionId/candidates/:processId/interviews` endpoints, explicit interview participants and lifecycle history, presentation-gated client interviews, idempotent completion and evaluation finalization, bounded structured evaluation fields, confidential evaluation redaction, and the established mission-candidate PostgreSQL lock order extended to the interview row.
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
