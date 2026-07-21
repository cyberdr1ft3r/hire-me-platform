# Project Goals

Last updated: 2026-07-21

## Product goals

1. Centralize candidates, CVs, clients, contacts, recruitment missions, interviews, evaluations, placements, training, tasks, documents, and operational communication.
2. Provide a reliable end-to-end recruitment workflow from client creation and mission intake through candidate integration and probation follow-up.
3. Give internal teams clear ownership, deadlines, status visibility, notifications, and auditable actions.
4. Provide client users with a restricted portal for approved missions, candidates, documents, and feedback.
5. Support French and English through a responsive web interface.
6. Provide operational visibility through the confirmed dashboard indicators: active missions, candidates presented to clients, successful placements, upcoming tasks, and revenue.
7. Support controlled import of existing business data and files, including duplicate detection, validation, and import reporting.
8. Keep integrations behind adapters so external providers can evolve without contaminating core business logic.

## Engineering goals

1. Keep the initial system maintainable by a single developer through a modular monolith and explicit module boundaries.
2. Make local setup reproducible with documented commands and containerized local services.
3. Enforce server-side authorization and record scoping for confidential data.
4. Preserve recruitment and audit history instead of overwriting meaningful business events.
5. Make quality checks repeatable in local development and CI.
6. Treat repository documentation, issues, decisions, and status files as persistent agent-readable memory.
7. Prefer stable, maintained libraries and reversible architecture choices.

## Delivery goals

1. Validate work module by module through draft pull requests and demonstrations.
2. Keep each Codex task small, independently reviewable, and linked to acceptance criteria.
3. Record decisions, assumptions, risks, and intentionally deferred scope in the repository.
4. Avoid beginning dependent tasks before prerequisite documentation or infrastructure is approved.

## Current milestone

Approve and merge the corrected foundation documentation in PR #4, then begin issue #2 for repository and local-environment bootstrap.

## Not yet quantified

The client has not yet approved numerical targets for adoption, response time, availability, report generation time, import completion time, or workflow throughput. Do not invent these metrics; define them in later operational and non-functional requirement issues.