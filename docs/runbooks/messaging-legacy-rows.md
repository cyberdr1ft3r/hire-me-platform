# Messaging foundation migration: legacy-row gate

Applies to migration `20261012170000_messaging_foundation` (Issue #171, D-087, R-053).

## Why the gate exists

The foundational migration created `Conversation`, `ConversationMember`, and `Message` in July 2026, but no
application code ever wrote them. That is not proof that every deployed database holds zero rows: an operator, a
script, or an import could have inserted rows directly.

The messaging foundation migration reshapes those tables destructively:

- It drops `Conversation.relatedEntityType`/`relatedEntityId` and `ConversationMember.active`/`archivedAt`.
- It adds `NOT NULL` columns (`Conversation.createdByUserId`, `Message.sequence`, `Message.clientMessageId`) that have
  no truthful value for a legacy row.

No lossless mapping has been reviewed for those rows, so the migration **fails closed**.

## Behavior

| Database state | What `prisma migrate deploy` does |
| --- | --- |
| All four counts are 0 (every database created by this repository) | Locks the messaging tables, checks the counts, reshapes the tables, adds the constraints and the `MessageRevision` table, and reconciles the `CLIENT_USER` / `FINANCE_MANAGER` messaging grants. The migration is recorded as applied. |
| Any count is non-zero | Raises `HIREME_MESSAGING_LEGACY_ROWS` with the four counts **before any DDL**. Prisma runs the migration file as one transaction, so nothing is changed: every legacy row, column, index, and grant stays exactly as it was. Prisma records the migration as **failed**, and later migrations do not run until it is resolved. |

The table locks are taken before the check (`ACCESS EXCLUSIVE` on the three messaging tables, `SHARE` on `Document`),
so no row can appear between the check and the reshape.

## Operator procedure when the gate refuses

1. **Do not** run `prisma migrate reset`, `prisma db push`, `prisma migrate dev`, or any manual `DELETE`/`TRUNCATE` to get
   past the gate.
2. Run the read-only diagnostic and keep its output (counts only, no content):

   ```bash
   psql "$DATABASE_URL" -f apps/api/diagnostics/messaging-legacy-rows.sql
   ```

3. Take a full logical backup of the database (`pg_dump`) before anything else, and store it under the normal
   confidential-backup controls. Message bodies are confidential data.
4. Open an issue that records the counts and asks the maintainer for a decision. There are two acceptable outcomes:
   - **Reviewed lossless mapping.** A separate, reviewed migration placed **before** `20261012170000` transforms the
     legacy rows into the new shape (creator, per-conversation sequence, generated `clientMessageId`, membership status,
     handling of legacy context links). The gate then sees transformed data and is updated in that same reviewed change.
   - **Approved archival export.** The maintainer approves exporting the legacy rows to protected storage and removing
     them through an audited, reviewed script. Only then can the gate pass.
5. After the chosen change is applied, mark the failed attempt as rolled back and deploy again:

   ```bash
   pnpm --filter @hire-me/api exec prisma migrate resolve --rolled-back 20261012170000_messaging_foundation
   pnpm prisma:migrate:deploy
   ```

## Evidence

`apps/api/test/messaging-migration.integration.test.ts` applies every earlier migration to an isolated schema, then:

- With zero legacy rows, it applies the migration and checks the reshaped tables and the grant reconciliation.
- With a legacy conversation, membership, and message present, it proves the deploy fails with
  `HIREME_MESSAGING_LEGACY_ROWS`, every legacy row and column survives byte-for-byte, and the migration is recorded as
  failed, not applied.
