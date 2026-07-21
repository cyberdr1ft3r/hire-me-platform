# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current situation

- Issue #5 is complete through merged PR #6; the persistent project-memory system is active on `main`.
- Issue #1 is complete through merged PR #4; the approved product and architecture documents are active on `main`.
- Issue #2 is the next executable task.
- Issue #3 must not start until issue #2 is reviewed and merged.

## Next action

Implement GitHub issue #2: bootstrap the TypeScript monorepo and local development environment.

Before changing anything, read:

1. `AGENTS.md`.
2. `PROJECT_MEMORY.md`.
3. `docs/project/STATUS.md`.
4. `docs/project/DECISIONS.md`.
5. This handoff.
6. Issue #2 and all comments.
7. The merged architecture and product documentation relevant to repository structure and security.

Load and follow these skills:

- `.agents/skills/project-memory/SKILL.md`
- `.agents/skills/typescript-monorepo/SKILL.md`
- `.agents/skills/devops-ci/SKILL.md`
- `.agents/skills/application-security/SKILL.md`
- `.agents/skills/quality-gates/SKILL.md`
- `.agents/skills/prisma-postgresql/SKILL.md` only for safe Prisma/PostgreSQL wiring, not the business schema

## Issue #2 scope guardrails

Implement only the approved foundation:

- pnpm workspaces and Turborepo;
- `apps/web` with React, TypeScript, and Vite;
- `apps/api` with NestJS and a structured `GET /health` endpoint;
- shared configuration and contracts packages;
- PostgreSQL through Docker Compose with a health check;
- Prisma configuration and connectivity without the complete domain schema;
- strict TypeScript, ESLint, Prettier, environment validation, tests, and GitHub Actions CI;
- exact local setup instructions in the README.

Do not implement authentication, users, candidates, clients, missions, workflows, messaging, training, dashboards, integrations, or other business modules in issue #2.

## Completion conditions

Issue #2 may move toward merge only when:

- a fresh clone can be started by following the README;
- one documented command starts the local apps and required services;
- PostgreSQL becomes healthy through Docker Compose;
- the API health endpoint returns a structured success response;
- the web app can reach and display the API health status using environment-based configuration;
- environment variables are validated and no secrets are committed;
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm format:check` pass;
- GitHub Actions runs equivalent checks;
- the PR contains no business-domain implementation;
- project status and handoff files are updated before completion.

## Mandatory rehydration checklist for every new agent

Before working:

- Read `AGENTS.md`.
- Read `PROJECT_MEMORY.md`.
- Read `docs/project/STATUS.md`.
- Read `docs/project/DECISIONS.md`.
- Read this handoff.
- Read the full assigned issue and all comments.
- Inspect relevant merged documentation and active pull requests.
- Load all materially applicable project skills, including `project-memory`.
- State the active skills and current source-of-truth understanding.

Before finishing:

- Update `STATUS.md`.
- Replace this handoff with the next concrete action.
- Update the decision and risk logs when applicable.
- Link the issue and pull request that support changes.
- Report checks performed and remaining blockers.
