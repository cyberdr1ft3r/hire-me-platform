import { runPrisma } from './child-commands.js';
import {
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
  /** Disconnects the client, then drops the schema. Safe to call once, in `finally`. */
  dispose(): Promise<void>;
}

async function onVerifiedConnection(
  target: DisposableTarget,
  statement: (quotedSchema: string) => string,
  schema: string,
): Promise<void> {
  const admin = new PrismaClient({ datasourceUrl: singleConnection(target.url) });
  try {
    await admin.$transaction(async (transaction) => {
      await verifyConnectedIdentity(transaction, target);
      await transaction.$executeRawUnsafe(
        statement(quoteGeneratedIdentifier(schema, ISOLATED_SCHEMA_PATTERN)),
      );
    });
  } finally {
    await admin.$disconnect();
  }
}

export async function createIsolatedSchema(): Promise<IsolatedSchema> {
  const target = resolveDisposableTarget();
  const schema = generateIsolatedSchemaName();
  const schemaUrl = withSchema(target.url, schema);

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
      await onVerifiedConnection(target, (quoted) => `DROP SCHEMA ${quoted} CASCADE`, schema);
    }
  };

  try {
    runPrisma(['migrate', 'deploy'], childEnvironment(schemaUrl));
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

  return { client, schema, dispose };
}
