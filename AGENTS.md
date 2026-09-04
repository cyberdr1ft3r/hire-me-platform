# Codex Repository Instructions

This file is the entry point for every Codex task in this repository.

## Before changing anything

1. Read the full GitHub issue or user task and every relevant comment.
2. Inspect the repository and all relevant files before proposing changes.
3. Read the persistent project context:
   - `PROJECT_MEMORY.md`
   - `docs/project/STATUS.md`
   - `docs/project/DECISIONS.md`
   - `docs/project/HANDOFF.md`
4. Load every required project skill from `.agents/skills/<skill-name>/SKILL.md`.
5. Always load `.agents/skills/project-memory/SKILL.md` for meaningful repository tasks.
6. State which skills are active and summarize the current source-of-truth understanding in the initial work summary.
7. Treat merged documents under `docs/` as the detailed product and architecture source of truth.
8. Identify conflicts or unresolved decisions instead of guessing.

## Mandatory skill routing

- Persistent goals, status, decisions, risks, roadmap, or agent handoffs: use `project-memory`.
- Product scope, architecture, domain modeling, workflows, permissions, or Mermaid diagrams: use `product-architecture`.
- Monorepo setup, React/Vite, NestJS, pnpm, Turborepo, shared packages, or environment configuration: use `typescript-monorepo`.
- PostgreSQL, Prisma, migrations, constraints, indexes, seeds, or relational tests: use `prisma-postgresql`.
- Authentication, authorization, audit logs, confidential HR data, file access, secrets, or threat-sensitive design: use `application-security`.
- Docker Compose, local services, CI, reproducible setup, health checks, or deployment-oriented configuration: use `devops-ci`.
- Tests, linting, type checking, build verification, acceptance criteria, or regression prevention: use `quality-gates`.

Use every skill that materially applies. Do not claim to have used a skill unless its `SKILL.md` was read.

## Source-of-truth order

When information conflicts, use this order:

1. The current approved issue and its review comments.
2. Merged detailed documentation under `docs/`.
3. `docs/project/DECISIONS.md`.
4. `PROJECT_MEMORY.md` and `docs/project/STATUS.md`.
5. Older issues, pull-request summaries, and external conversation context.

Record unresolved conflicts instead of silently choosing a convenient interpretation.

## Engineering rules

- Work on a dedicated branch for each issue.
- Keep changes limited to the issue scope.
- Do not silently add features or dependencies.
- Never commit secrets, tokens, credentials, personal data, CVs, questionnaire exports, or production datasets.
- Use sanitized fixtures and synthetic development data only.
- Prefer maintained, non-experimental dependencies and explain meaningful choices.
- Add or update tests whenever behavior changes.
- Run all applicable quality checks before completion.
- Record assumptions, unresolved decisions, and deviations from approved documentation.
- Open a draft pull request linked to the issue; do not merge automatically.

## Persistent memory updates

At the end of every meaningful task:

- Update `docs/project/STATUS.md` if task state, blockers, milestone, or next action changed.
- Replace `docs/project/HANDOFF.md` with the next concrete action and completion conditions.
- Update `docs/project/DECISIONS.md` for accepted decisions.
- Update `docs/project/RISKS.md` when risks change or are discovered.
- Update `docs/project/ROADMAP.md` when sequencing or dependencies change.
- Update `PROJECT_MEMORY.md` only when stable facts, goals, or operating rules change.

Keep these files factual and compact. Do not turn them into chat transcripts or raw activity logs.

## Completion report

Every task summary must include:

- Skills used
- Project memory files reviewed and updated
- Files changed
- Commands run and results
- Tests and checks performed
- Assumptions and unresolved decisions
- Scope intentionally not implemented
- Current blockers and the next recommended action

## Cursor Cloud specific instructions

The Cloud Agent VM provisions Node.js 24 (NodeSource, at `/usr/bin/node`) and a native PostgreSQL 16 cluster. Two environment facts are non-obvious:

- The cloud daemon injects its own Node (v22.14) first on `PATH`, so a bare `node`/`pnpm` resolves to Node 22 and the `apps/web` Vitest suite fails on a leaked `fetch` (`ECONNREFUSED 127.0.0.1:3000`). Prepend Node 24 for repository commands: `export PATH=/usr/bin:$PATH`. Under Node 24 the full suite passes (`pnpm test`, `pnpm test:db`).
- PostgreSQL runs as the system cluster, not via Docker Compose. Start it with `sudo pg_ctlcluster 16 main start` and confirm readiness with `pg_isready -h 127.0.0.1 -p 5432`. The `hire_me` role, `hire_me_dev` database, and the `.env` file (copied from `.env.example`) already match `DATABASE_URL`.

The saved environment encodes this: `install` refreshes dependencies and the Prisma client under Node 24, and `start` brings up PostgreSQL, applies migrations, runs the idempotent seed, and launches `pnpm dev` (API on `127.0.0.1:3000`, web on `127.0.0.1:5173`). Everything else follows the root `README.md`.
