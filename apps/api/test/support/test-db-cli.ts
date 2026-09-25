/**
 * Lifecycle for the disposable PostgreSQL database the integration suites use
 * (Issue #90 / A-75-08). Every command refuses before writing unless its target
 * passes the checks in `disposable-database.ts`.
 *
 *   provision        create, mark, migrate, seed twice, bootstrap twice, snapshot
 *   run [files]      run the integration suites against TEST_DATABASE_URL
 *   check-catalog    verify the seeded authorization catalog and admin login survived
 *   drop             drop this checkout's own provisioned database
 *   verify-refusal   prove the guard refuses unmarked or foreign targets without writing
 *
 * `provision`, `drop`, and `verify-refusal` also need TEST_DATABASE_ADMIN_URL: a
 * maintenance connection (for example `/postgres`) on a disposable server.
 * Connection strings are never printed.
 */
import { appendFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  catalogSnapshotPath,
  childEnvironment,
  DisposableDatabaseRefusal,
  generateDatabaseName,
  generateRunId,
  markerFor,
  parsePostgresUrl,
  quoteGeneratedIdentifier,
  receiptPath,
  resolveDisposableTarget,
  singleConnection,
  TEST_DATABASE_NAME_PATTERN,
  urlFilePath,
  verifyConnectedIdentity,
  writePrivateFile,
  type DisposableTarget,
  type OwnershipReceipt,
  type ParsedDatabaseUrl,
  removeOwnershipFiles,
} from './disposable-database.js';
import {
  takeCatalogSnapshot,
  TEST_BOOTSTRAP_ADMIN_EMAIL,
  TEST_BOOTSTRAP_ADMIN_PASSWORD,
} from './catalog-snapshot.js';
import { runNodeCaptured, runPrisma, runTsx, runVitest, TSX_CLI } from './child-commands.js';
import { PrismaClient } from '../../src/persistence/prisma/generated-client.js';

const CLI_PATH = fileURLToPath(import.meta.url);

function log(message: string): void {
  console.log(`[test-db] ${message}`);
}

function requireTestEnvironment(): void {
  // Treat an unset NODE_ENV as a test run, but never override an explicit value:
  // `production` or `development` in the calling shell refuses the command.
  process.env.NODE_ENV ??= 'test';
  if (process.env.NODE_ENV !== 'test') {
    throw new DisposableDatabaseRefusal('NODE_ENV must be exactly "test".');
  }
}

function adminConnection(): ParsedDatabaseUrl {
  return parsePostgresUrl(process.env.TEST_DATABASE_ADMIN_URL, 'TEST_DATABASE_ADMIN_URL');
}

function urlForDatabase(admin: ParsedDatabaseUrl, database: string): string {
  const url = new URL(admin.url);
  url.pathname = `/${database}`;
  url.search = '';
  url.searchParams.set('schema', 'public');
  return url.toString();
}

async function verifyTarget(target: DisposableTarget): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: singleConnection(target.url) });
  try {
    await verifyConnectedIdentity(client, target);
  } finally {
    await client.$disconnect();
  }
}

function exportForGitHubActions(url: string): void {
  const githubEnv = process.env.GITHUB_ENV;
  if (!process.argv.includes('--github-env') || !githubEnv) {
    return;
  }
  const password = decodeURIComponent(new URL(url).password);
  if (password) {
    // A workflow command, consumed by the runner and not shown in the log.
    console.log(`::add-mask::${password}`);
  }
  appendFileSync(githubEnv, `TEST_DATABASE_URL=${url}\n`);
  log('Exported TEST_DATABASE_URL to the GitHub Actions environment.');
}

async function provision(): Promise<void> {
  requireTestEnvironment();
  const admin = adminConnection();
  const database = generateDatabaseName();
  const runId = generateRunId();
  const quoted = quoteGeneratedIdentifier(database, TEST_DATABASE_NAME_PATTERN);

  const client = new PrismaClient({ datasourceUrl: singleConnection(admin.url) });
  try {
    const existing = await client.$queryRawUnsafe<{ exists: boolean }[]>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
      database,
    );
    if (existing[0]?.exists) {
      throw new DisposableDatabaseRefusal(`"${database}" already exists; it is never reused.`);
    }
    await client.$executeRawUnsafe(`CREATE DATABASE ${quoted}`);
    // The marker is generated hex behind a fixed prefix; no input reaches it.
    await client.$executeRawUnsafe(`COMMENT ON DATABASE ${quoted} IS '${markerFor(runId)}'`);
  } finally {
    await client.$disconnect();
  }

  const url = urlForDatabase(admin, database);
  const receipt: OwnershipReceipt = {
    version: 1,
    database,
    host: admin.host,
    port: admin.port,
    runId,
    createdAt: new Date().toISOString(),
  };
  writePrivateFile(receiptPath(database), `${JSON.stringify(receipt, null, 2)}\n`);
  writePrivateFile(urlFilePath(database), `${url}\n`);
  log(`Created disposable database "${database}".`);
  log(`Ownership receipt: ${receiptPath(database)}`);
  log(`Connection string (creator-only file): ${urlFilePath(database)}`);
  exportForGitHubActions(url);

  process.env.TEST_DATABASE_URL = url;
  const target = resolveDisposableTarget();
  const env = childEnvironment(url, { TEST_DATABASE_URL: url });

  await verifyTarget(target);
  runPrisma(['migrate', 'deploy'], env);
  for (const pass of [1, 2]) {
    await verifyTarget(target);
    log(`Seed pass ${pass}.`);
    runTsx('prisma/seed.ts', env);
  }
  for (const pass of [1, 2]) {
    await verifyTarget(target);
    log(`Administrator bootstrap pass ${pass}.`);
    runTsx('src/auth/bootstrap-admin.ts', {
      ...env,
      AUTH_BOOTSTRAP_ADMIN_EMAIL: TEST_BOOTSTRAP_ADMIN_EMAIL,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: TEST_BOOTSTRAP_ADMIN_PASSWORD,
    });
  }

  const reader = new PrismaClient({ datasourceUrl: singleConnection(url) });
  try {
    await verifyConnectedIdentity(reader, target);
    const snapshot = await takeCatalogSnapshot(reader, database);
    writePrivateFile(catalogSnapshotPath(database), `${JSON.stringify(snapshot, null, 2)}\n`);
    log(
      `Catalog snapshot: ${snapshot.roles.length} roles, ${snapshot.permissions.length} permissions, ${snapshot.grants.length} grants.`,
    );
  } finally {
    await reader.$disconnect();
  }
  log('Provisioning complete. Set TEST_DATABASE_URL from the connection-string file to run tests.');
}

function passthroughArgs(): string[] {
  const args = process.argv.slice(3).filter((arg) => arg !== '--github-env');
  return args[0] === '--' ? args.slice(1) : args;
}

async function runSuites(config: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<number> {
  requireTestEnvironment();
  const target = resolveDisposableTarget();
  await verifyTarget(target);
  log(`Running ${config} against "${target.database}".`);
  return runVitest(
    ['--config', config, ...passthroughArgs()],
    childEnvironment(target.url, { TEST_DATABASE_URL: target.url, ...extraEnv }),
  );
}

async function checkCatalog(): Promise<number> {
  requireTestEnvironment();
  const target = resolveDisposableTarget();
  const snapshot = catalogSnapshotPath(target.database);
  if (!existsSync(snapshot)) {
    throw new DisposableDatabaseRefusal(`no catalog snapshot for "${target.database}".`);
  }
  return runSuites('vitest.catalog.config.ts', { HIREME_TEST_CATALOG_SNAPSHOT: snapshot });
}

async function drop(): Promise<void> {
  requireTestEnvironment();
  if (process.argv.includes('--if-present') && !process.env.TEST_DATABASE_URL) {
    log('No TEST_DATABASE_URL; nothing of this run to drop.');
    return;
  }
  const target = resolveDisposableTarget();
  const admin = adminConnection();
  if (admin.host !== target.host || admin.port !== target.port) {
    throw new DisposableDatabaseRefusal('the admin connection is on a different server.');
  }
  const quoted = quoteGeneratedIdentifier(target.database, TEST_DATABASE_NAME_PATTERN);
  // One connection: the ownership check and the DROP run in the same session.
  const client = new PrismaClient({ datasourceUrl: singleConnection(admin.url) });
  try {
    const rows = await client.$queryRawUnsafe<{ marker: string | null }[]>(
      `SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = $1`,
      target.database,
    );
    if (rows.length === 0) {
      log(`"${target.database}" no longer exists.`);
    } else if (rows[0]?.marker !== markerFor(target.receipt.runId)) {
      throw new DisposableDatabaseRefusal(
        `"${target.database}" does not carry this receipt's marker; it is not dropped.`,
      );
    } else {
      // No FORCE: another session on it means something is still running.
      await client.$executeRawUnsafe(`DROP DATABASE ${quoted}`);
      log(`Dropped "${target.database}".`);
    }
  } finally {
    await client.$disconnect();
  }
  removeOwnershipFiles(target.database);
}

interface Fingerprint {
  schemas: string[];
  tables: string[];
  sentinel: unknown[];
}

async function fingerprint(url: string, withSentinel: boolean): Promise<Fingerprint> {
  const client = new PrismaClient({ datasourceUrl: singleConnection(url) });
  try {
    const schemas = await client.$queryRawUnsafe<{ name: string }[]>(
      `SELECT nspname AS name FROM pg_namespace
        WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`,
    );
    const tables = await client.$queryRawUnsafe<{ name: string }[]>(
      `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,
    );
    const sentinel = withSentinel
      ? await client.$queryRawUnsafe<unknown[]>(
          'SELECT id, note FROM public.refusal_sentinel ORDER BY id',
        )
      : [];
    return {
      schemas: schemas.map((row) => row.name),
      tables: tables.map((row) => row.name),
      sentinel,
    };
  } finally {
    await client.$disconnect();
  }
}

function expectRefusal(label: string, args: string[], env: NodeJS.ProcessEnv): void {
  const { status, output } = runNodeCaptured(TSX_CLI, [CLI_PATH, ...args], env);
  // A crash is not a refusal: the guard's own message must be the reason.
  if (status === 0 || !output.includes('Refusing to use the test database')) {
    throw new Error(`verify-refusal: "${label}" was not refused by the guard.`);
  }
  if (env.TEST_DATABASE_URL && output.includes(env.TEST_DATABASE_URL)) {
    throw new Error(`verify-refusal: "${label}" printed a connection string.`);
  }
  log(`Refused as expected: ${label}.`);
}

function sameFingerprint(label: string, before: Fingerprint, after: Fingerprint): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`verify-refusal: "${label}" changed the refused database.`);
  }
}

/**
 * Creates an unmarked control database that looks generated, gives it a
 * sentinel row, and proves every database command refuses it, with and without
 * a forged local receipt, without changing it. Optionally also proves refusal
 * of TEST_DATABASE_REFUSAL_EXTRA_URL (for example a development database) by
 * read-only fingerprint only. The control database is created and dropped by
 * this process alone.
 */
async function verifyRefusal(): Promise<void> {
  requireTestEnvironment();
  const admin = adminConnection();
  const control = generateDatabaseName();
  const quoted = quoteGeneratedIdentifier(control, TEST_DATABASE_NAME_PATTERN);
  const controlUrl = urlForDatabase(admin, control);
  const adminClient = new PrismaClient({ datasourceUrl: singleConnection(admin.url) });
  let created = false;
  try {
    await adminClient.$executeRawUnsafe(`CREATE DATABASE ${quoted}`);
    created = true;
    const setup = new PrismaClient({ datasourceUrl: singleConnection(controlUrl) });
    try {
      await setup.$executeRawUnsafe(
        'CREATE TABLE public.refusal_sentinel (id integer PRIMARY KEY, note text NOT NULL)',
      );
      await setup.$executeRawUnsafe(
        "INSERT INTO public.refusal_sentinel (id, note) VALUES (1, 'must survive refusal')",
      );
    } finally {
      await setup.$disconnect();
    }
    const before = await fingerprint(controlUrl, true);

    const base: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };
    const commands: [string, string[]][] = [
      ['run', ['run']],
      ['foundational run', ['run', 'test/database.integration.test.ts']],
      ['check-catalog', ['check-catalog']],
    ];

    // 1. A generated-looking, unmarked database with no receipt.
    for (const [label, args] of commands) {
      expectRefusal(`${label} without a receipt`, args, { ...base, TEST_DATABASE_URL: controlUrl });
    }
    sameFingerprint('no receipt', before, await fingerprint(controlUrl, true));

    // 2. The same database with a forged receipt: refused by the connected marker check.
    const forged: OwnershipReceipt = {
      version: 1,
      database: control,
      host: admin.host,
      port: admin.port,
      runId: generateRunId(),
      createdAt: new Date().toISOString(),
    };
    writePrivateFile(receiptPath(control), `${JSON.stringify(forged)}\n`);
    try {
      for (const [label, args] of commands) {
        expectRefusal(`${label} with a forged receipt`, args, {
          ...base,
          TEST_DATABASE_URL: controlUrl,
        });
      }
      expectRefusal('drop with a forged receipt', ['drop'], {
        ...base,
        TEST_DATABASE_URL: controlUrl,
      });
    } finally {
      rmSync(receiptPath(control), { force: true });
    }
    sameFingerprint('forged receipt', before, await fingerprint(controlUrl, true));

    // 3. Environment refusals against the same database.
    expectRefusal('NODE_ENV=production', ['run'], {
      ...base,
      NODE_ENV: 'production',
      TEST_DATABASE_URL: controlUrl,
    });
    const withoutTestUrl: NodeJS.ProcessEnv = { ...base, DATABASE_URL: controlUrl };
    delete withoutTestUrl.TEST_DATABASE_URL;
    expectRefusal('DATABASE_URL only, no TEST_DATABASE_URL', ['run'], withoutTestUrl);
    sameFingerprint('environment refusals', before, await fingerprint(controlUrl, true));

    // 4. Optional extra target, observed read-only.
    const extra = process.env.TEST_DATABASE_REFUSAL_EXTRA_URL;
    if (extra) {
      parsePostgresUrl(extra, 'TEST_DATABASE_REFUSAL_EXTRA_URL');
      const extraBefore = await fingerprint(extra, false);
      for (const [label, args] of commands) {
        expectRefusal(`${label} against the extra target`, args, {
          ...base,
          TEST_DATABASE_URL: extra,
        });
      }
      sameFingerprint('extra target', extraBefore, await fingerprint(extra, false));
    }
    log('Every refusal left its target unchanged.');
  } finally {
    if (created) {
      await adminClient.$executeRawUnsafe(`DROP DATABASE ${quoted}`);
    }
    await adminClient.$disconnect();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'provision':
      await provision();
      return;
    case 'run':
      process.exitCode = await runSuites('vitest.integration.config.ts');
      return;
    case 'check-catalog':
      process.exitCode = await checkCatalog();
      return;
    case 'drop':
      await drop();
      return;
    case 'verify-refusal':
      await verifyRefusal();
      return;
    default:
      throw new Error(
        `Unknown command "${command ?? ''}". Use provision, run, check-catalog, drop, or verify-refusal.`,
      );
  }
}

main().catch((error: unknown) => {
  // Only the message: a connection error must never echo a connection string.
  console.error(`[test-db] ${error instanceof Error ? error.message : 'failed'}`);
  process.exitCode = 1;
});
