---
name: prisma-postgresql
description: Design and verify PostgreSQL schemas, Prisma models, migrations, seeds, indexes, constraints, and relational tests.
---

# Prisma PostgreSQL Skill

## Workflow

1. Read the approved domain model and workflow documentation.
2. Translate domain rules into relational constraints instead of relying only on application code.
3. Review every relation for cardinality, ownership, deletion behavior, and history preservation.
4. Generate migrations intentionally and inspect their SQL.
5. Test migrations against a fresh database and a reset database.

## Modeling standards

- Use UUID primary keys consistently.
- Add `createdAt` and `updatedAt` to mutable business entities.
- Use explicit join models when relationships carry metadata.
- Use enums only for stable states; avoid premature enums for frequently changing labels.
- Normalize case-insensitive identifiers such as email addresses.
- Add indexes for foreign keys and expected search/filter paths.
- Add unique constraints for real invariants.
- Prefer archival or soft deletion for business records that require history.
- Define `onDelete` behavior explicitly.
- Preserve candidate history across missions and interviews.
- Keep audit logs append-only at the application level.

## Migration safety

- Never edit an already-applied migration unless the task explicitly concerns unreleased local migrations.
- Do not use destructive resets against non-development databases.
- Do not place production or personal data in seeds.
- Document any potentially destructive migration.

## Verification

- Apply migrations to a fresh PostgreSQL instance.
- Run reset and seed commands.
- Test key uniqueness, cardinality, and deletion constraints.
- Run Prisma validation and formatting.
- Report deviations from the approved domain model.
