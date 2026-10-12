import { cpSync, copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  PRISMA_SCHEMA,
  runPrisma,
  runPrismaCaptured,
  runPrismaCapturedAsync,
} from './child-commands.js';
import {
  API_ROOT,
  RECEIPT_DIRECTORY,
  childEnvironment,
  DisposableDatabaseRefusal,
  generateIsolatedSchemaName,
  ISOLATED_SCHEMA_PATTERN,
  quoteGeneratedIdentifier,
  resolveDisposableTarget,
  singleConnection,
  verifyConnectedIdentity,
  withSchema,
  type DisposableTarget,
} from './disposable-database.js';
import { PrismaClient } from '../../src/persistence/prisma/generated-client.js';

/**
 * A freshly migrated, unseeded PostgreSQL schema inside the verified disposable
 * test database, for tests that must own every row they see (Issue #90).
 *
 * The schema name is generated here and never taken from input. It is created
 * and dropped only on a connection that has just proved, in the same
 * transaction, that it is the provisioned database carrying this run's marker.
 * The client handed to tests is bound to that schema alone, so it never reads
 * or writes the seeded authorization catalog in `public`.
 */
export interface IsolatedSchema {
  client: PrismaClient;
  schema: string;
  /** Connection URL bound to this schema, for child commands such as the seed. */
  schemaUrl: string;
  /**
   * Runs `prisma migrate deploy` with every repository migration against this
   * schema and returns its exit status and output instead of throwing, so a test
   * can assert that a migration refuses. Meaningful after `throughMigration`.
   */
  deployRemaining(): { status: number; output: string };
  /** `deployRemaining` without blocking the event loop, for lock-ordering tests. */
  deployRemainingAsync(): Promise<{ status: number; output: string }>;
  /**
   * Runs one SQL file through `prisma db execute` against this schema, which
   * reports the script's own error instead of Prisma's migration bookkeeping.
   */
  executeFile(path: string): { status: number; output: string };
  /** Disconnects the client, then drops the schema. Safe to call once, in `finally`. */
  dispose(): Promise<void>;
}

export interface IsolatedSchemaOptions {
  /**
   * Apply migrations only up to and including this directory name, so a test can
   * place rows in the pre-migration shape before applying the next migration.
   */
  throughMigration?: string;
}

const MIGRATIONS_DIRECTORY = join(API_ROOT, 'prisma/migrations');

/**
 * A private copy of the Prisma schema whose migrations directory stops at
 * `throughMigration`. Prisma reads migrations next to the schema file it is
 * given, so the copy is the only way to deploy a prefix of the chain.
 */
function partialMigrationSchema(schema: string, throughMigration: string): string {
  const migrations = readdirSync(MIGRATIONS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!migrations.includes(throughMigration)) {
    throw new Error(`Unknown migration ${throughMigration}.`);
  }
  const root = join(RECEIPT_DIRECTORY, `partial-${schema}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'migrations'), { recursive: true });
  copyFileSync(PRISMA_SCHEMA, join(root, 'schema.prisma'));
  copyFileSync(
    join(MIGRATIONS_DIRECTORY, 'migration_lock.toml'),
    join(root, 'migrations/migration_lock.toml'),
  );
  for (const name of migrations.filter((migration) => migration <= throughMigration)) {
    cpSync(join(MIGRATIONS_DIRECTORY, name), join(root, 'migrations', name), { recursive: true });
  }
  return join(root, 'schema.prisma');
}

async function onVerifiedConnection(
  target: DisposableTarget,
  statement: (quotedSchema: string) => string,
  schema: string,
): Promise<void> {
  const admin = new PrismaClient({ datasourceUrl: singleConnection(target.url) });
  try {
    // Dropping a fully migrated schema (hundreds of objects) can outlast Prisma's
    // default 5 s interactive-transaction timeout on slower hosts.
    await admin.$transaction(
      async (transaction) => {
        await verifyConnectedIdentity(transaction, target);
        await transaction.$executeRawUnsafe(
          statement(quoteGeneratedIdentifier(schema, ISOLATED_SCHEMA_PATTERN)),
        );
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
  } finally {
    await admin.$disconnect();
  }
}

export async function createIsolatedSchema(
  options: IsolatedSchemaOptions = {},
): Promise<IsolatedSchema> {
  const target = resolveDisposableTarget();
  const schema = generateIsolatedSchemaName();
  const schemaUrl = withSchema(target.url, schema);
  const partialSchemaPath = options.throughMigration
    ? partialMigrationSchema(schema, options.throughMigration)
    : undefined;

  await onVerifiedConnection(target, (quoted) => `CREATE SCHEMA ${quoted}`, schema);

  let client: PrismaClient | undefined;
  let disposed = false;
  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    disposed = true;
    try {
      await client?.$disconnect();
    } finally {
      if (partialSchemaPath) {
        rmSync(join(partialSchemaPath, '..'), { recursive: true, force: true });
      }
      await onVerifiedConnection(target, (quoted) => `DROP SCHEMA ${quoted} CASCADE`, schema);
    }
  };

  try {
    if (partialSchemaPath) {
      const partial = runPrismaCaptured(
        ['migrate', 'deploy'],
        childEnvironment(schemaUrl),
        partialSchemaPath,
      );
      if (partial.status !== 0) {
        throw new Error(`prisma migrate deploy (partial) failed:
${partial.output}`);
      }
    } else {
      runPrisma(['migrate', 'deploy'], childEnvironment(schemaUrl));
    }
    client = new PrismaClient({ datasourceUrl: schemaUrl });
    const [bound] = await client.$queryRawUnsafe<{ schema: string; searchPath: string }[]>(
      `SELECT current_schema() AS schema, current_setting('search_path') AS "searchPath"`,
    );
    if (bound?.schema !== schema || /\bpublic\b/.test(bound.searchPath)) {
      throw new DisposableDatabaseRefusal('the isolated client is not bound to its own schema.');
    }
  } catch (error) {
    await dispose();
    throw error;
  }

  const deployRemaining = () =>
    runPrismaCaptured(['migrate', 'deploy'], childEnvironment(schemaUrl));
  const deployRemainingAsync = () =>
    runPrismaCapturedAsync(['migrate', 'deploy'], childEnvironment(schemaUrl));
  const executeFile = (path: string) =>
    runPrismaCaptured(['db', 'execute', '--file', path], childEnvironment(schemaUrl));

  return { client, schema, schemaUrl, deployRemaining, deployRemainingAsync, executeFile, dispose };
}
