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
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm prisma:validate
```

GitHub Actions runs the same quality checks on pull requests and pushes to `main`.

## Repository Structure

```text
apps/
  api/      NestJS API with GET /health and Prisma wiring
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

## Environment

`.env.example` contains safe development placeholders only. Copy it to `.env` for local development and do not commit `.env` files. The local configuration consistently uses `127.0.0.1` for the web origin, API base URL, API host, and PostgreSQL connection.

The API validates required environment variables at startup. The web app reads `VITE_API_BASE_URL` to reach the API health endpoint.

## Scope Guardrail

This repository foundation does not implement authentication, users, candidates, clients, recruitment missions, interviews, training, messaging, dashboards, integrations, or the complete Prisma business schema. Those belong to later issues.
