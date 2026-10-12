import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../src/persistence/prisma/generated-client.js';
import { createIsolatedSchema, type IsolatedSchema } from './support/isolated-schema.js';

/**
 * Migration safety gate for 20261012170000_messaging_foundation (Issue #171,
 * D-087, R-053). Each case owns a generated `hm_found_*` schema migrated only up
 * to the previous migration, so rows can be placed in the legacy shape before the
 * messaging migration is applied with the real `prisma migrate deploy`.
 */
const PREVIOUS_MIGRATION = '20261007120000_document_signing_phase_b_hardening';
const MESSAGING_MIGRATION = '20261012170000_messaging_foundation';

let isolated: IsolatedSchema | undefined;

afterEach(async () => {
  await isolated?.dispose();
  isolated = undefined;
}, 60_000);

async function atPreviousMigration(): Promise<IsolatedSchema> {
  isolated = await createIsolatedSchema({ throughMigration: PREVIOUS_MIGRATION });
  return isolated;
}

async function insertLegacyUser(client: PrismaClient, label: string): Promise<string> {
  const id = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "displayName", "email", "normalizedEmail", "updatedAt")
     VALUES ($1::uuid, $2, $3, $3, CURRENT_TIMESTAMP)`,
    id,
    `Legacy ${label}`,
    `legacy-${label}-${id.slice(0, 8)}@issue171.test`,
  );
  return id;
}

async function columnsOf(client: PrismaClient, table: string): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`,
    table,
  );
  return rows.map((row) => row.column_name);
}

async function legacySnapshot(client: PrismaClient): Promise<unknown> {
  const [conversations, members, messages] = await Promise.all([
    client.$queryRawUnsafe(`SELECT row_to_json(c)::text AS row FROM "Conversation" c ORDER BY id`),
    client.$queryRawUnsafe(
      `SELECT row_to_json(m)::text AS row FROM "ConversationMember" m ORDER BY id`,
    ),
    client.$queryRawUnsafe(`SELECT row_to_json(m)::text AS row FROM "Message" m ORDER BY id`),
  ]);
  return { conversations, members, messages };
}

async function migrationRow(client: PrismaClient) {
  const rows = await client.$queryRawUnsafe<
    { finished: boolean; rolledBack: boolean; logs: string | null }[]
  >(
    `SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack", logs
     FROM _prisma_migrations WHERE migration_name = $1`,
    MESSAGING_MIGRATION,
  );
  return rows;
}

describe('messaging foundation migration safety gate', () => {
  it('applies on a dormant zero-row schema and reshapes the tables', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    // Unrelated data is fine; only messaging rows block the gate.
    await insertLegacyUser(client, 'bystander');
    expect(await columnsOf(client, 'Conversation')).toContain('relatedEntityType');

    const result = schema.deployRemaining();
    expect(result.status, result.output).toBe(0);

    expect(await migrationRow(client)).toEqual([
      expect.objectContaining({ finished: true, rolledBack: false }),
    ]);
    const conversationColumns = await columnsOf(client, 'Conversation');
    expect(conversationColumns).toEqual(
      expect.arrayContaining(['directKey', 'createdByUserId', 'lastMessageSequence']),
    );
    expect(conversationColumns).not.toContain('relatedEntityType');
    expect(conversationColumns).not.toContain('relatedEntityId');
    const memberColumns = await columnsOf(client, 'ConversationMember');
    expect(memberColumns).toEqual(
      expect.arrayContaining(['status', 'historyAfterSequence', 'lastReadSequence', 'hiddenAt']),
    );
    expect(memberColumns).not.toContain('active');
    expect(await columnsOf(client, 'Message')).toEqual(
      expect.arrayContaining(['sequence', 'clientMessageId', 'editCount']),
    );
    expect(await columnsOf(client, 'MessageRevision')).toEqual(
      expect.arrayContaining(['messageId', 'revisionNumber', 'previousBody', 'editedByUserId']),
    );
  }, 180_000);

  it('refuses to reshape non-empty legacy tables and changes nothing', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    const author = await insertLegacyUser(client, 'author');
    const conversationId = randomUUID();
    await client.$executeRawUnsafe(
      `INSERT INTO "Conversation" ("id", "type", "title", "relatedEntityType", "relatedEntityId", "updatedAt")
       VALUES ($1::uuid, 'group', 'Legacy room', 'Client', $2::uuid, CURRENT_TIMESTAMP)`,
      conversationId,
      randomUUID(),
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "ConversationMember" ("id", "conversationId", "userId", "role", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'owner', CURRENT_TIMESTAMP)`,
      randomUUID(),
      conversationId,
      author,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Message" ("id", "conversationId", "authorUserId", "body", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Legacy synthetic body', CURRENT_TIMESTAMP)`,
      randomUUID(),
      conversationId,
      author,
    );
    const before = await legacySnapshot(client);

    const result = schema.deployRemaining();

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('HIREME_MESSAGING_LEGACY_ROWS');
    expect(result.output).toContain(
      'Conversation=1, ConversationMember=1, Message=1, Document.messageId=0',
    );
    // Every legacy row and column survives exactly; nothing of the reshape landed.
    expect(await legacySnapshot(client)).toEqual(before);
    expect(await columnsOf(client, 'Conversation')).toEqual(
      expect.arrayContaining(['relatedEntityType', 'relatedEntityId']),
    );
    expect(await columnsOf(client, 'Conversation')).not.toContain('directKey');
    expect(await columnsOf(client, 'ConversationMember')).toContain('active');
    expect(await columnsOf(client, 'MessageRevision')).toEqual([]);
    const enumRows = await client.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema() AND t.typname = 'ConversationMemberStatus'`,
    );
    expect(Number(enumRows[0]!.count)).toBe(0);
    // Prisma records the attempt as failed, not applied, so later deploys stop
    // until an operator resolves it (docs/runbooks/messaging-legacy-rows.md).
    expect(await migrationRow(client)).toEqual([
      expect.objectContaining({ finished: false, rolledBack: false }),
    ]);

    // A second deploy refuses again rather than skipping the gate.
    const retry = schema.deployRemaining();
    expect(retry.status).not.toBe(0);
    expect(await legacySnapshot(client)).toEqual(before);
  }, 180_000);

  it('reconciles only the CLIENT_USER and FINANCE_MANAGER messaging grants', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    const roleIds = new Map<string, string>();
    for (const name of ['client_user', 'finance_manager', 'employee']) {
      const id = randomUUID();
      roleIds.set(name, id);
      await client.$executeRawUnsafe(
        `INSERT INTO "Role" ("id", "name", "description", "updatedAt")
         VALUES ($1::uuid, $2::"RoleName", 'Synthetic', CURRENT_TIMESTAMP)`,
        id,
        name,
      );
    }
    const permissionIds = new Map<string, string>();
    for (const code of ['messages:view', 'messages:create', 'records:view']) {
      const id = randomUUID();
      permissionIds.set(code, id);
      await client.$executeRawUnsafe(
        `INSERT INTO "Permission" ("id", "code", "description", "scopeType", "updatedAt")
         VALUES ($1::uuid, $2, 'Synthetic', 'assigned', CURRENT_TIMESTAMP)`,
        id,
        code,
      );
    }
    const grant = async (role: string, code: string) =>
      client.$executeRawUnsafe(
        `INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_TIMESTAMP)`,
        randomUUID(),
        roleIds.get(role),
        permissionIds.get(code),
      );
    // The pre-correction seed: CLIENT_USER and EMPLOYEE hold messaging; FINANCE_MANAGER does not.
    for (const role of ['client_user', 'employee']) {
      await grant(role, 'messages:view');
      await grant(role, 'messages:create');
      await grant(role, 'records:view');
    }
    await grant('finance_manager', 'records:view');
    const grantsQuery = `SELECT rp."id", r."name"::text AS role, p."code" AS permission,
        rp."archivedAt" IS NULL AS active
      FROM "RolePermission" rp JOIN "Role" r ON r."id" = rp."roleId"
      JOIN "Permission" p ON p."id" = rp."permissionId" ORDER BY role, permission`;
    type GrantRow = { id: string; role: string; permission: string; active: boolean };
    const before = await client.$queryRawUnsafe<GrantRow[]>(grantsQuery);

    const result = schema.deployRemaining();
    expect(result.status, result.output).toBe(0);

    const after = await client.$queryRawUnsafe<GrantRow[]>(grantsQuery);
    const key = (row: GrantRow) => `${row.role}:${row.permission}`;
    const afterByKey = new Map(after.map((row) => [key(row), row]));
    for (const row of before) {
      const now = afterByKey.get(key(row))!;
      expect(now.id, key(row)).toBe(row.id);
      const revoked = row.role === 'client_user' && row.permission.startsWith('messages:');
      expect(now.active, key(row)).toBe(revoked ? false : row.active);
    }
    const added = after.filter((row) => !before.some((old) => old.id === row.id));
    expect(added.map(key).sort()).toEqual([
      'finance_manager:messages:create',
      'finance_manager:messages:view',
    ]);
    expect(added.every((row) => row.active)).toBe(true);
  }, 180_000);
});
