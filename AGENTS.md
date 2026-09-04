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

## Concurrent multi-agent development

Assume another agent may be modifying this repository concurrently unless the task explicitly says otherwise.

### Branch ownership

- One issue or independently reviewable task per branch.
- Never develop directly on `main`.
- Never commit to, rewrite, force-push, delete, or otherwise modify another agent's branch.
- Never use another agent's unmerged branch as an implementation dependency unless the user explicitly approves that dependency.
- Do not copy partially implemented code from another open PR merely to avoid waiting for merge order.

### Scope isolation

- Stay within the files and domain surface required by the assigned issue.
- Before editing high-conflict shared files such as `schema.prisma`, seeds, shared contracts, app navigation, or project-memory/docs, inspect current `origin/main` and keep the delta as narrow as possible.
- Do not make opportunistic cleanups in shared files while parallel work is active.
- If another open feature appears to overlap materially with the assigned issue, document the overlap instead of silently absorbing that feature.

### Main can move while you work

Your branch may become stale while another reviewed feature is merged.

Before declaring the task ready for final review:

1. fetch the latest `origin/main`;
2. determine whether `main` advanced since the branch base;
3. incorporate latest `main` when needed;
4. resolve conflicts semantically, preserving both already-merged behavior and the assigned issue's intended behavior;
5. never resolve a conflict by dropping unfamiliar code just to make Git clean;
6. rerun the complete applicable validation suite after integration;
7. push the new exact head and wait for exact-head GitHub Actions again.

For Prisma/schema-heavy work, latest-main integration and a clean PostgreSQL migration/test run are mandatory before final review whenever `main` changed during implementation.

### Migrations under parallel development

- Additive migrations only.
- Never edit or rename a migration already present on `main`.
- A migration created on an older branch base must be revalidated after newer migrations land on `main`.
- Resolve migration ordering/name collisions explicitly; never delete another feature's migration to make your branch pass.
- Validate the full migration chain from a clean database before final review.

### Pull requests and merge authority

- Open a draft PR for the assigned issue and keep it open/unmerged for review.
- Never merge your own PR, another agent's PR, or `main` automatically.
- Never deploy from an implementation task.
- Do not mark the PR ready merely because local tests pass; exact-head CI and human/ChatGPT review are still required.
- Treat review comments as part of the task source of truth and resolve blockers on the same branch/PR unless explicitly told otherwise.

### Completion report for parallel work

In addition to the normal completion report, state:

- original base `main` SHA;
- whether `main` advanced while the task was in progress;
- latest `main` SHA incorporated before final review, if applicable;
- conflicts encountered and how they were resolved;
- shared/high-conflict files changed;
- final exact head SHA after latest-main integration;
- confirmation that the PR remains open and unmerged.

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
