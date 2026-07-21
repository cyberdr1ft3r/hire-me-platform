# Hire Me Platform

Internal recruitment, client relationship, training, task, document, and reporting platform for Hire Me.

## Current Status

The repository now contains the TypeScript monorepo foundation for the Hire Me Platform. Business features are intentionally deferred to later scoped issues.

## Requirements

- Node.js 24 LTS, from `.node-version`
- pnpm `11.9.0`, from `packageManager`
- Docker with Docker Compose

Enable pnpm through Corepack when needed:

```sh
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

## Fresh Clone Setup

```sh
git clone https://github.com/cyberdr1ft3r/hire-me-platform.git
cd hire-me-platform
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm prisma:migrate:deploy
pnpm prisma:seed
pnpm prisma:generate
pnpm dev
```

The development command starts:

- `apps/api` at `http://127.0.0.1:3000`
- `apps/web` at `http://127.0.0.1:5173`

Open `http://127.0.0.1:5173` and the placeholder page should display the API health status.
Both development apps read the repository-root `.env` created from `.env.example`; no manual environment exports are required for the documented local path.

## Health Checks

Check PostgreSQL:

```sh
docker compose ps
```

Check the API:

```sh
curl http://127.0.0.1:3000/health
```

Expected response shape:

```json
{
  "status": "ok",
  "service": "hire-me-api",
  "timestamp": "2026-07-21T10:00:00.000Z",
  "uptimeSeconds": 1
}
```

## Quality Commands

Run these from the repository root:

```sh
pnpm prisma:validate
pnpm check:architecture
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
```

GitHub Actions runs the same quality checks on pull requests and pushes to `main`, plus Docker Compose PostgreSQL health, migration, seed, and database integration checks.

## Repository Structure

```text
apps/
  api/      NestJS API with GET /health and API-owned Prisma wiring
  web/      React + Vite placeholder app
packages/
  config/   Shared TypeScript configuration
  contracts/ Shared health contract and schema
docs/       Product, architecture, workflow, permission, and project memory docs
```

## Local Services

Start PostgreSQL:

```sh
docker compose up -d postgres
```

View logs:

```sh
docker compose logs postgres
```

Stop services:

```sh
docker compose down
```

Reset the local PostgreSQL volume:

```sh
docker compose down -v
```

## Database Lifecycle

Run these commands from the repository root after copying `.env.example` to `.env` and starting PostgreSQL.

Validate and generate the Prisma client:

```sh
pnpm prisma:validate
pnpm prisma:generate
```

The generated Prisma client is written to `apps/api/prisma/generated/client` and is intentionally ignored by Git. API seed scripts, database tests, and future API persistence code must import Prisma through `apps/api/src/persistence/prisma/generated-client.ts`; `apps/web` and `packages/contracts` must remain ORM-independent.

Check the Prisma ownership boundary:

```sh
pnpm check:architecture
```

Apply committed migrations:

```sh
pnpm prisma:migrate:deploy
```

Create or update a development migration:

```sh
pnpm prisma:migrate:dev
```

Reset the local development database and rerun the seed:

```sh
pnpm prisma:migrate:reset
```

Run the development seed without resetting:

```sh
pnpm prisma:seed
```

The development seed is idempotent. It creates the eight approved roles and safe synthetic permissions only; it does not create users, passwords, real emails, candidates, clients, CVs, or confidential data.

Open Prisma Studio:

```sh
pnpm prisma:studio
```

Run database integration tests against the configured PostgreSQL database:

```sh
pnpm test:db
```

## Environment

`.env.example` contains safe development placeholders only. Copy it to `.env` for local development and do not commit `.env` files. The local configuration consistently uses `127.0.0.1` for the web origin, API base URL, API host, and PostgreSQL connection.

The API validates required environment variables at startup. The web app reads `VITE_API_BASE_URL` to reach the API health endpoint.

## Scope Guardrail

This repository foundation does not implement authentication flows, controllers, services, pages, business UI, dashboards, integrations, file storage, or business workflow behavior. The Prisma schema models foundational persistence only; application behavior belongs to later issues.
