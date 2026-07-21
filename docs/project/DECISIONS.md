# Decision Log

Last updated: 2026-07-21

Use this log for accepted project-level decisions. Detailed architectural decisions may later be promoted into individual ADR files. Do not record unresolved ideas as accepted decisions.

| ID | Date | Status | Decision | Rationale / source |
| --- | --- | --- | --- | --- |
| D-001 | 2026-07-21 | Accepted | GitHub is the project source of truth for issues, pull requests, documentation, goals, status, decisions, risks, and agent handoffs. | Enables persistent human- and agent-readable context across sessions. |
| D-002 | 2026-07-21 | Accepted | Use a TypeScript monorepo with a modular-monolith backend for the initial implementation. | Keeps the MVP manageable for a single developer while preserving module boundaries; issues #1 and #2. |
| D-003 | 2026-07-21 | Accepted | Use React + Vite for the web app, NestJS for the API, PostgreSQL for persistence, and Prisma for ORM and migrations. | Required technical direction in issues #1â€“#3. |
| D-004 | 2026-07-21 | Accepted | Candidate pipeline state belongs to the candidate-to-mission relationship, not the global candidate record. | A candidate can participate in multiple missions and requires independent history. |
| D-005 | 2026-07-21 | Accepted | Recruitment missions support multiple assigned recruiters. | Confirmed client requirement. |
| D-006 | 2026-07-21 | Accepted | Confidential files are accessed through a protected storage abstraction; repository and public paths must not contain real CVs or HR documents. | Candidate, HR, client, and commercial data require least-privilege access and auditability. |
| D-007 | 2026-07-21 | Accepted | Code identifiers and repository engineering documentation use English; the product UI must support French and English. | Consistent development vocabulary while meeting the client language requirement. |
| D-008 | 2026-07-21 | Accepted | Work is performed through scoped issues, dedicated branches, and draft pull requests; agents do not merge automatically. | Preserves review control and prevents silent scope expansion. |
| D-009 | 2026-07-21 | Accepted | Dependent tasks do not start before prerequisite issues and pull requests are approved and merged. | Avoids implementing against unstable architecture and requirements. |
| D-010 | 2026-07-21 | Accepted | Project memory files are living summaries, not append-only diaries; Git history provides chronology. | Keeps agent context compact and prevents stale contradictory memory. |
| D-011 | 2026-07-21 | Accepted | Prisma is owned by `apps/api`, with one explicit generated client output imported through an API persistence boundary; `apps/web` and `packages/contracts` remain ORM-independent. | Required by blocking review on PR #9 for deterministic pnpm monorepo behavior and clean package boundaries. |
| D-012 | 2026-07-21 | Accepted | Local authentication uses Argon2id password credentials, short-lived access tokens, rotating hashed refresh sessions in HTTP-only cookies, reuse detection, normalized permission-code resolution, deny-by-default guards, and safe audit logs. | Required by issue #10 and the approved security architecture. |
| D-013 | 2026-07-21 | Accepted | Internal user administration is authorized by permission codes, protects the last active `SUPER_ADMIN` transactionally, blocks unsafe self-lockout actions, and revokes active refresh sessions when a user is suspended or archived. | Required by issue #13 and the approved authentication/authorization architecture. |
| D-014 | 2026-07-21 | Accepted | Client CRM records use archival lifecycles, explicit client/contact permission codes, per-client normalized contact email uniqueness, nested contact ownership checks, and separate `commercial_data:access` gating for commercial client fields. | Required by issue #15 and the approved client/contact domain model. |

## Decision protocol

When making a project-level decision:

1. Confirm that the decision is approved by the repository maintainer or accepted through a reviewed pull request.
2. Add a row with a unique ID, date, status, decision, and supporting source.
3. Update affected product, architecture, workflow, or implementation documents in the same change.
4. If a decision supersedes another, mark the old decision `Superseded` and link the replacement ID.
5. Do not store secrets, personal information, or confidential client content in this log.
