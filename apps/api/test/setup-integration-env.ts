import { afterAll } from 'vitest';

import { resolveDisposableTarget } from './support/disposable-database.js';
import {
  hasTestCreatedPermissions,
  removeTestCreatedPermissions,
} from './support/permission-fixtures.js';
import { PrismaClient } from '../src/persistence/prisma/generated-client.js';

/**
 * Worker setup for the database suites. The only database a suite may reach is
 * the validated `TEST_DATABASE_URL`: it overrides `DATABASE_URL` for the
 * application, every `new PrismaClient()` in a suite, and every child process a
 * suite spawns. Nothing falls back to `.env` or a development database.
 */
const target = resolveDisposableTarget();
process.env.DATABASE_URL = target.url;

// After each test file (after its own afterAll hooks), remove any permission a
// test in it had to create, so no test-owned permission outlives its file
// (Issue #105). Existing permissions are never touched.
afterAll(async () => {
  if (!hasTestCreatedPermissions()) {
    return;
  }
  const prisma = new PrismaClient({ datasourceUrl: target.url });
  try {
    await removeTestCreatedPermissions(prisma);
  } finally {
    await prisma.$disconnect();
  }
});
