---
name: typescript-monorepo
description: Build and maintain the Hire Me TypeScript monorepo with pnpm, Turborepo, React/Vite, NestJS, and shared packages.
---

# TypeScript Monorepo Skill

## Workflow

1. Read `AGENTS.md`, approved architecture docs, and the issue.
2. Inspect current workspace files before generating scaffolding.
3. Keep root scripts consistent across all packages.
4. Prefer strict TypeScript and shared configuration over duplicated settings.
5. Keep web, API, shared contracts, and config packages independently buildable.

## Standards

- Use pnpm workspaces and a committed lockfile.
- Use Turborepo only for orchestration and caching; avoid unnecessary complexity.
- Use strict TypeScript settings.
- Keep API contracts and validation schemas in a shared package without importing server-only code into the frontend.
- Validate environment variables at startup.
- Provide safe `.env.example` values only.
- Avoid broad `any`, unsafe casts, circular dependencies, and hidden path aliases.
- Keep business modules out of bootstrap tasks unless explicitly requested.

## Frontend

- React + Vite + TypeScript.
- Accessible semantic HTML and keyboard-friendly behavior.
- Central API configuration; no hard-coded URLs.
- Add tests for rendered behavior and API-health integration.

## API

- NestJS with clear modules and dependency injection.
- Structured health response and predictable error handling.
- No business endpoints during infrastructure-only tasks.

## Verification

Run and report all available root commands for install, lint, typecheck, test, and build.
