# Project Status

Last updated: 2026-07-21
Status owner: repository maintainer

## Overall state

**Phase:** Repository and local development bootstrap  
**Health:** Ready to start  
**Current blocker:** None for issue #2  
**Next executable development task:** Issue #2 — bootstrap the TypeScript monorepo and local development environment.

## Active work

| Item | State | Purpose | Next action |
| --- | --- | --- | --- |
| Issue #2 | Ready | Bootstrap the monorepo, web app, API, PostgreSQL, Prisma wiring, local environment, and CI | Assign to Codex and open a draft implementation PR |
| Issue #3 | Blocked | Implement the foundational Prisma schema and database lifecycle | Start only after issue #2 is reviewed and merged |

## Completed foundation work

- Private GitHub repository created.
- Initial README added.
- Codex repository instructions and project-local skills added.
- Discovery and clarification questionnaires completed and analyzed.
- Issue #5 completed through merged PR #6, establishing persistent repository memory, goals, status, roadmap, decisions, risks, and agent handoffs.
- Issue #1 completed through merged PR #4, establishing the approved product scope, architecture, domain model, workflows, and permissions.
- Confirmed requirements now include detailed recruitment workflows, multiple recruiters per mission, client access, multi-session training attendance, document versioning, messaging, dashboards, outputs, integrations, migration scale, and scoped permissions.

## Current open technical questions

These are not blockers for issue #2:

- Authentication provider and session model.
- Background-job technology.
- Production file-storage provider.
- Advanced-search implementation.
- Real-time messaging and notification transport.
- Detailed per-module permission names.
- Dashboard formulas and revenue authorization rules.
- Integration synchronization and retry policies.

## Immediate next actions

1. Launch issue #2 with the required repository-memory, monorepo, DevOps/CI, security, and quality-gate skills.
2. Keep issue #2 limited to scaffolding and local infrastructure; do not add business modules or the full Prisma domain schema.
3. Review the resulting draft PR for reproducibility, safe environment handling, Docker health checks, API/web connectivity, tests, and CI parity.
4. Merge issue #2 only when a fresh clone can follow the README and all quality commands pass.
5. Begin issue #3 only after issue #2 is complete.

## Status update rules

Update this file whenever:

- a task starts, becomes blocked, or completes;
- a PR is opened, approved, merged, or rejected;
- the next executable issue changes;
- a major risk or dependency changes;
- the current phase or milestone changes.

Keep this page current rather than appending a chronological diary. Git history provides the chronology.
