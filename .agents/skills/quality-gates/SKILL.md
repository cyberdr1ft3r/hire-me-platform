---
name: quality-gates
description: Enforce tests, linting, type checking, builds, acceptance criteria, regression coverage, and honest completion reporting.
---

# Quality Gates Skill

## Workflow

1. Convert the issue acceptance criteria into a verification checklist before coding.
2. Identify the highest-risk behavior and constraints.
3. Add the smallest effective tests at the correct layer.
4. Run checks from the repository root exactly as documented.
5. Fix root causes rather than weakening checks.
6. Report commands and results honestly, including anything not run.

## Test strategy

- Unit tests for isolated business rules and validation.
- Integration tests for database constraints, modules, and adapters.
- API tests for externally observable behavior.
- Frontend tests for meaningful user behavior, not implementation details.
- Avoid excessive snapshots and tests that only assert mocks.
- Make tests deterministic and independent.

## Mandatory checks

Run every applicable command:

- Dependency installation with frozen lockfile
- Formatting check
- Lint
- Type check
- Unit and integration tests
- Production build
- Prisma validation/migration tests when persistence changes
- Docker health verification when environment configuration changes

## Completion rules

- Do not mark a task complete with failing checks.
- Do not delete or skip tests merely to make CI pass.
- Do not reduce strictness without explicit justification.
- Match every issue acceptance criterion to evidence.
- Include untested risks and environment limitations in the PR summary.
