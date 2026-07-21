# Codex Repository Instructions

This file is the entry point for every Codex task in this repository.

## Before changing anything

1. Read the full GitHub issue or user task.
2. Inspect the repository and all relevant files before proposing changes.
3. Load every required project skill from `.agents/skills/<skill-name>/SKILL.md`.
4. State which skills are active in the initial work summary.
5. Treat `docs/` as the product and architecture source of truth once those documents exist.

## Mandatory skill routing

- Product scope, architecture, domain modeling, workflows, permissions, or Mermaid diagrams: use `product-architecture`.
- Monorepo setup, React/Vite, NestJS, pnpm, Turborepo, shared packages, or environment configuration: use `typescript-monorepo`.
- PostgreSQL, Prisma, migrations, constraints, indexes, seeds, or relational tests: use `prisma-postgresql`.
- Authentication, authorization, audit logs, confidential HR data, file access, secrets, or threat-sensitive design: use `application-security`.
- Docker Compose, local services, CI, reproducible setup, health checks, or deployment-oriented configuration: use `devops-ci`.
- Tests, linting, type checking, build verification, acceptance criteria, or regression prevention: use `quality-gates`.

Use every skill that materially applies. Do not claim to have used a skill unless its `SKILL.md` was read.

## Engineering rules

- Work on a dedicated branch for each issue.
- Keep changes limited to the issue scope.
- Do not silently add features or dependencies.
- Never commit secrets, tokens, credentials, personal data, CVs, or production datasets.
- Prefer maintained, non-experimental dependencies and explain meaningful choices.
- Add or update tests whenever behavior changes.
- Run all applicable quality checks before completion.
- Record assumptions, unresolved decisions, and deviations from approved documentation.
- Open a draft pull request linked to the issue; do not merge automatically.

## Completion report

Every task summary must include:

- Skills used
- Files changed
- Commands run and results
- Tests and checks performed
- Assumptions and unresolved decisions
- Scope intentionally not implemented
