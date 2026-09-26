import { resolveDisposableTarget } from './support/disposable-database.js';

/**
 * Worker setup for the database suites. The only database a suite may reach is
 * the validated `TEST_DATABASE_URL`: it overrides `DATABASE_URL` for the
 * application, every `new PrismaClient()` in a suite, and every child process a
 * suite spawns. Nothing falls back to `.env` or a development database.
 */
const target = resolveDisposableTarget();
process.env.DATABASE_URL = target.url;
