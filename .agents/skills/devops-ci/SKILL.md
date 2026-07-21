---
name: devops-ci
description: Build reproducible local environments, Docker Compose services, health checks, CI workflows, and safe deployment-oriented configuration.
---

# DevOps and CI Skill

## Workflow

1. Read the architecture and issue requirements.
2. Make local setup reproducible from a fresh clone.
3. Keep development and production assumptions separate.
4. Add health checks and deterministic startup dependencies.
5. Make CI run the same quality commands developers run locally.

## Docker Compose standards

- Pin meaningful image versions; avoid floating `latest` tags.
- Use named volumes for persistent development data.
- Add service health checks.
- Use `depends_on` health conditions only where supported and useful.
- Bind databases to localhost for development unless cross-host access is explicitly required.
- Use environment variables with safe development defaults; never embed real credentials.
- Keep containers non-root where practical.
- Document start, stop, reset, logs, and cleanup commands.

## CI standards

- Use least-privilege workflow permissions.
- Pin maintained action major versions.
- Enable dependency caching safely.
- Run install with a frozen lockfile.
- Run lint, typecheck, tests, and build.
- Use a PostgreSQL service only for tests that require it.
- Fail clearly and avoid swallowing command errors.
- Do not expose secrets to pull requests from forks.

## Operational readiness

- Provide structured health endpoints.
- Validate required configuration on startup.
- Keep logs useful but free of secrets and personal data.
- Document backup and restore expectations when persistence is introduced.
- Record infrastructure assumptions and deferred production hardening.
