import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../src/persistence/prisma/generated-client.js';
import { API_ROOT } from './support/disposable-database.js';
import { createIsolatedSchema, type IsolatedSchema } from './support/isolated-schema.js';

/**
 * Migration safety gate for 20261012170000_messaging_foundation (Issue #171,
 * D-087, R-053). Each case owns a generated `hm_found_*` schema migrated only up
 * to the previous migration, so rows can be placed in the legacy shape before the
 * messaging migration is applied with the real `prisma migrate deploy`.
 */
const PREVIOUS_MIGRATION = '20261007120000_document_signing_phase_b_hardening';
const MESSAGING_MIGRATION = '20261012170000_messaging_foundation';
const MESSAGING_MIGRATION_FILE = join(
  API_ROOT,
  'prisma/migrations',
  MESSAGING_MIGRATION,
  'migration.sql',
);

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

/**
 * Every table, column, type, enum label, index, constraint, function, and
 * trigger in the isolated schema, so a refusal can be shown to leave no
 * partial DDL behind.
 */
async function schemaFingerprint(client: PrismaClient): Promise<Record<string, string[]>> {
  const list = async (sql: string) =>
    (await client.$queryRawUnsafe<{ item: string }[]>(sql)).map((row) => row.item);
  return {
    columns: await list(
      `SELECT concat_ws('|', table_name, column_name, data_type, udt_name, is_nullable, column_default) AS item
       FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY item`,
    ),
    types: await list(
      `SELECT concat_ws('|', t.typname, t.typtype) AS item FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema() ORDER BY item`,
    ),
    enumLabels: await list(
      `SELECT concat_ws('|', t.typname, e.enumsortorder::text, e.enumlabel) AS item FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema() ORDER BY item`,
    ),
    indexes: await list(
      `SELECT indexdef AS item FROM pg_indexes WHERE schemaname = current_schema() ORDER BY item`,
    ),
    constraints: await list(
      `SELECT concat_ws('|', cl.relname, c.conname, pg_get_constraintdef(c.oid)) AS item
       FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = current_schema() ORDER BY item`,
    ),
    functions: await list(
      `SELECT p.proname AS item FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = current_schema() ORDER BY item`,
    ),
    triggers: await list(
      `SELECT concat_ws('|', cl.relname, tg.tgname) AS item FROM pg_trigger tg
       JOIN pg_class cl ON cl.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = current_schema() AND NOT tg.tgisinternal ORDER BY item`,
    ),
  };
}

async function migrationRow(client: PrismaClient) {
  const rows = await client.$queryRawUnsafe<
    { finished: boolean; rolledBack: boolean; appliedSteps: number }[]
  >(
    `SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack",
       applied_steps_count AS "appliedSteps"
     FROM _prisma_migrations WHERE migration_name = $1`,
    MESSAGING_MIGRATION,
  );
  return rows;
}

/** Locks on this schema's relations held by any session other than the caller's. */
async function foreignLocksOnSchema(client: PrismaClient): Promise<number> {
  const rows = await client.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) AS count FROM pg_locks l
     JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND l.pid <> pg_backend_pid()`,
  );
  return Number(rows[0]!.count);
}

const GRANTS_QUERY = `SELECT rp."id", r."name"::text AS role, p."code" AS permission,
    rp."archivedAt" IS NULL AS active
  FROM "RolePermission" rp JOIN "Role" r ON r."id" = rp."roleId"
  JOIN "Permission" p ON p."id" = rp."permissionId" ORDER BY role, permission`;
type GrantRow = { id: string; role: string; permission: string; active: boolean };

/**
 * The pre-correction seeded catalog the migration reconciles: CLIENT_USER and
 * EMPLOYEE hold messaging; FINANCE_MANAGER does not.
 */
async function insertPreCorrectionCatalog(client: PrismaClient): Promise<void> {
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
  for (const role of ['client_user', 'employee']) {
    await grant(role, 'messages:view');
    await grant(role, 'messages:create');
    await grant(role, 'records:view');
  }
  await grant('finance_manager', 'records:view');
}

async function insertLegacyConversation(
  client: PrismaClient,
  author: string,
): Promise<{ conversationId: string }> {
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
  return { conversationId };
}

/**
 * Waits until another backend in this database is blocked by `holderPid` and
 * returns its pid and current query text.
 */
async function waitForBackendBlockedBy(
  client: PrismaClient,
  holderPid: number,
  timeoutMs = 60_000,
): Promise<{ pid: number; query: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await client.$queryRawUnsafe<{ pid: number; query: string }[]>(
      `SELECT pid::int AS pid, query FROM pg_stat_activity
       WHERE datname = current_database() AND $1::int = ANY(pg_blocking_pids(pid))`,
      holderPid,
    );
    if (rows.length > 0) {
      return rows[0]!;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for a backend blocked by PID ${holderPid}.`);
}

/**
 * Holds `statement` in an open transaction on its own connection until the
 * returned `release` is called, then commits.
 */
async function holdInTransaction(
  client: PrismaClient,
  statement: string,
): Promise<{ pid: number; release: () => Promise<void> }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let ready!: (pid: number) => void;
  let failed!: (error: unknown) => void;
  const readyPromise = new Promise<number>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const transaction = client.$transaction(
    async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ pid: number }[]>(
        'SELECT pg_backend_pid()::int AS pid',
      );
      await tx.$executeRawUnsafe(statement);
      ready(rows[0]!.pid);
      await released;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
  transaction.catch(failed);
  const pid = await readyPromise;
  return {
    pid,
    release: async () => {
      release();
      await transaction;
    },
  };
}

/** `relation|mode|granted` for every lock `pid` holds or awaits on this schema's tables. */
async function relationLocksOf(client: PrismaClient, pid: number): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ item: string }[]>(
    `SELECT concat_ws('|', c.relname, l.mode, CASE WHEN l.granted THEN 'granted' ELSE 'waiting' END) AS item
     FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE l.pid = $1 AND n.nspname = current_schema() AND c.relkind IN ('r', 'p')
     ORDER BY item`,
    pid,
  );
  return rows.map((row) => row.item);
}

/** Top-level statements of the migration, with comments and `$$` bodies removed. */
function topLevelStatements(sql: string): string[] {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, () => '$$ $$')
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0);
}

describe('messaging foundation migration safety gate', () => {
  it('runs as one explicit transaction that locks and checks before any change', () => {
    const sql = readFileSync(MESSAGING_MIGRATION_FILE, 'utf8');
    const statements = topLevelStatements(sql);

    expect(statements[0]).toBe('BEGIN');
    expect(statements.at(-1)).toBe('COMMIT');
    const transactionControl =
      /^(BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE TRANSACTION)\b/i;
    expect(
      statements.slice(1, -1).filter((statement) => transactionControl.test(statement)),
    ).toEqual([]);
    // Locks first, then the gate, then everything that changes the database.
    expect(statements[1]).toMatch(
      /^LOCK TABLE "Conversation", "ConversationMember", "Message" IN ACCESS EXCLUSIVE MODE$/,
    );
    expect(statements[2]).toMatch(/^LOCK TABLE "Document" IN SHARE MODE$/);
    expect(statements[3]).toMatch(/^DO \$\$ \$\$$/);
    expect(sql).toMatch(/DO \$\$[\s\S]*?RAISE EXCEPTION\s+'HIREME_MESSAGING_LEGACY_ROWS:/);
    expect(statements.slice(4).some((statement) => /^LOCK\b/i.test(statement))).toBe(false);
    // Statements PostgreSQL refuses inside, or that would split, a transaction block.
    const forbidden =
      /\bCONCURRENTLY\b|^ALTER TYPE\b.*\bADD VALUE\b|^(VACUUM|CREATE DATABASE|ALTER SYSTEM)\b/i;
    expect(statements.filter((statement) => forbidden.test(statement))).toEqual([]);
  });

  it('applies on a dormant zero-row schema and reshapes the tables', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    // Unrelated data is fine; only messaging rows block the gate.
    await insertLegacyUser(client, 'bystander');
    expect(await columnsOf(client, 'Conversation')).toContain('relatedEntityType');

    const result = schema.deployRemaining();
    expect(result.status, result.output).toBe(0);

    expect(await migrationRow(client)).toEqual([
      expect.objectContaining({ finished: true, rolledBack: false, appliedSteps: 1 }),
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
    expect(await foreignLocksOnSchema(client)).toBe(0);
  }, 180_000);

  it('refuses to reshape non-empty legacy tables and changes nothing', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    const author = await insertLegacyUser(client, 'author');
    await insertLegacyConversation(client, author);
    await insertPreCorrectionCatalog(client);
    const before = await legacySnapshot(client);
    const fingerprintBefore = await schemaFingerprint(client);
    const grantsBefore = await client.$queryRawUnsafe<GrantRow[]>(GRANTS_QUERY);

    const result = schema.deployRemaining();

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(MESSAGING_MIGRATION);
    // Prisma reports either the gate text or, because the explicit transaction is
    // still open and aborted when it tries to save the error log, the abort.
    expect(result.output).toMatch(
      /HIREME_MESSAGING_LEGACY_ROWS|current transaction is aborted, commands ignored until end of transaction block/,
    );
    // Every legacy row, column, index, constraint, type, and grant survives
    // exactly; nothing of the reshape or the grant reconciliation landed.
    expect(await legacySnapshot(client)).toEqual(before);
    expect(await schemaFingerprint(client)).toEqual(fingerprintBefore);
    expect(await client.$queryRawUnsafe<GrantRow[]>(GRANTS_QUERY)).toEqual(grantsBefore);
    expect(await columnsOf(client, 'Conversation')).toEqual(
      expect.arrayContaining(['relatedEntityType', 'relatedEntityId']),
    );
    expect(await columnsOf(client, 'Conversation')).not.toContain('directKey');
    expect(await columnsOf(client, 'ConversationMember')).toContain('active');
    expect(await columnsOf(client, 'MessageRevision')).toEqual([]);
    expect(fingerprintBefore.types).not.toContain('ConversationMemberStatus|e');
    // Prisma records the attempt as failed with no applied step, not applied, so
    // later deploys stop until an operator resolves it
    // (docs/runbooks/messaging-legacy-rows.md). No session still holds a lock.
    expect(await migrationRow(client)).toEqual([
      { finished: false, rolledBack: false, appliedSteps: 0 },
    ]);
    expect(await foreignLocksOnSchema(client)).toBe(0);

    // The same file run directly shows the gate is what refuses, with the counts.
    const direct = schema.executeFile(MESSAGING_MIGRATION_FILE);
    expect(direct.status).not.toBe(0);
    expect(direct.output).toContain('HIREME_MESSAGING_LEGACY_ROWS');
    expect(direct.output).toContain(
      'Conversation=1, ConversationMember=1, Message=1, Document.messageId=0',
    );
    expect(await schemaFingerprint(client)).toEqual(fingerprintBefore);
    expect(await client.$queryRawUnsafe<GrantRow[]>(GRANTS_QUERY)).toEqual(grantsBefore);

    // A second deploy refuses again rather than skipping the gate.
    const retry = schema.deployRemaining();
    expect(retry.status).not.toBe(0);
    expect(await legacySnapshot(client)).toEqual(before);
    expect(await schemaFingerprint(client)).toEqual(fingerprintBefore);
  }, 180_000);

  it('counts legacy rows only after its locks are granted, so a concurrent writer cannot slip past the gate', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    const fingerprintBefore = await schemaFingerprint(client);
    // An uncommitted legacy row: the gate must wait for it rather than count zero.
    const writer = await holdInTransaction(
      client,
      `INSERT INTO "Conversation" ("id", "type", "title", "updatedAt")
       VALUES ('${randomUUID()}'::uuid, 'group', 'Concurrent legacy room', CURRENT_TIMESTAMP)`,
    );
    const deploy = schema.deployRemainingAsync();
    let writerReleased = false;
    try {
      // The migration is queued on its first statement's lock, before the gate.
      const migrating = await waitForBackendBlockedBy(client, writer.pid);
      expect(await relationLocksOf(client, migrating.pid)).toEqual([
        'Conversation|AccessExclusiveLock|waiting',
      ]);
      await writer.release();
      writerReleased = true;
    } finally {
      if (!writerReleased) {
        await writer.release();
      }
    }

    const result = await deploy;
    expect(result.status).not.toBe(0);
    expect(await columnsOf(client, 'Conversation')).toContain('relatedEntityType');
    expect(await schemaFingerprint(client)).toEqual(fingerprintBefore);
    expect(await migrationRow(client)).toEqual([
      { finished: false, rolledBack: false, appliedSteps: 0 },
    ]);
    const direct = schema.executeFile(MESSAGING_MIGRATION_FILE);
    expect(direct.output).toContain('Conversation=1, ConversationMember=0, Message=0');
  }, 180_000);

  it('keeps its locks and uncommitted reshape until the final COMMIT', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    // Pause the migration at its last step (the grant reconciliation) by holding
    // a lock that conflicts with the RolePermission UPDATE.
    const catalogHolder = await holdInTransaction(
      client,
      'LOCK TABLE "RolePermission" IN SHARE MODE',
    );
    const deploy = schema.deployRemainingAsync();
    let legacyInsert: Promise<unknown> | undefined;
    let holderReleased = false;
    try {
      const migrating = await waitForBackendBlockedBy(client, catalogHolder.pid);
      // Past the gate and the whole reshape, the migration still holds every
      // table lock it took first and is waiting only on the grant step.
      const held = await relationLocksOf(client, migrating.pid);
      expect(held).toEqual(
        expect.arrayContaining([
          'Conversation|AccessExclusiveLock|granted',
          'ConversationMember|AccessExclusiveLock|granted',
          'Message|AccessExclusiveLock|granted',
          'Document|ShareLock|granted',
          'RolePermission|RowExclusiveLock|waiting',
        ]),
      );
      expect(held.filter((lock) => lock.endsWith('|waiting'))).toEqual([
        'RolePermission|RowExclusiveLock|waiting',
      ]);

      // Mid-migration, the reshape is not visible outside its transaction...
      expect(await columnsOf(client, 'Conversation')).toContain('relatedEntityType');
      expect(await columnsOf(client, 'MessageRevision')).toEqual([]);
      // ...and a legacy-shape write waits on the migration's lock instead of
      // landing between the gate and the reshape.
      legacyInsert = client.$executeRawUnsafe(
        `INSERT INTO "Conversation" ("id", "type", "title", "relatedEntityType", "relatedEntityId", "updatedAt")
         VALUES ($1::uuid, 'group', 'Late legacy room', 'Client', $2::uuid, CURRENT_TIMESTAMP)`,
        randomUUID(),
        randomUUID(),
      );
      legacyInsert.catch(() => undefined);
      const waitingWriter = await waitForBackendBlockedBy(client, migrating.pid);
      expect(waitingWriter.query).toContain('Late legacy room');

      await catalogHolder.release();
      holderReleased = true;
    } finally {
      if (!holderReleased) {
        await catalogHolder.release();
      }
    }

    const result = await deploy;
    expect(result.status, result.output).toBe(0);
    // Once the reshape commits, the legacy-shape write can no longer succeed.
    await expect(legacyInsert).rejects.toThrow(/relatedEntityType|column/);
    const count = await client.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "Conversation"`,
    );
    expect(Number(count[0]!.count)).toBe(0);
    expect(await columnsOf(client, 'Conversation')).toContain('directKey');
    expect(await migrationRow(client)).toEqual([
      expect.objectContaining({ finished: true, rolledBack: false, appliedSteps: 1 }),
    ]);
    expect(await foreignLocksOnSchema(client)).toBe(0);
  }, 180_000);

  it('reconciles only the CLIENT_USER and FINANCE_MANAGER messaging grants', async () => {
    const schema = await atPreviousMigration();
    const { client } = schema;
    await insertPreCorrectionCatalog(client);
    const before = await client.$queryRawUnsafe<GrantRow[]>(GRANTS_QUERY);

    const result = schema.deployRemaining();
    expect(result.status, result.output).toBe(0);

    const after = await client.$queryRawUnsafe<GrantRow[]>(GRANTS_QUERY);
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
