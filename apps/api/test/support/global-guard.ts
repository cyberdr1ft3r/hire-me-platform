import {
  resolveDisposableTarget,
  singleConnection,
  verifyConnectedIdentity,
} from './disposable-database.js';
import { PrismaClient } from '../../src/persistence/prisma/generated-client.js';

/**
 * Vitest global setup for every database suite. It runs once, in the main
 * process, before any test module is loaded, and refuses the whole run unless
 * `TEST_DATABASE_URL` is the provisioned disposable database of this checkout.
 *
 * This is the in-process second layer. The `test:db` command validates the same
 * target before it starts Vitest at all, and every destructive helper checks
 * again on its own connection.
 */
export default async function verifyDisposableDatabase(): Promise<void> {
  const target = resolveDisposableTarget();
  const client = new PrismaClient({ datasourceUrl: singleConnection(target.url) });
  try {
    await verifyConnectedIdentity(client, target);
  } finally {
    await client.$disconnect();
  }
}
