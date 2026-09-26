/**
 * Fail-closed identity checks for the disposable PostgreSQL database the
 * integration suites write to (Issue #90 / A-75-08).
 *
 * A test run may only ever write to a database that this repository's
 * provisioning command created for the current operator. Before any write, the
 * target must pass every check below; any failure throws before a write-capable
 * statement is issued:
 *
 * 1. `NODE_ENV` is exactly `test`.
 * 2. `TEST_DATABASE_URL` is set. There is deliberately no fallback to
 *    `DATABASE_URL`, `.env`, `.env.example`, `hire_me_dev`, or a default port.
 * 3. Its host is loopback, or exactly `TEST_DATABASE_ALLOW_HOST`. A permitted
 *    host is never proof of disposability on its own; checks 4–7 still apply.
 * 4. Its database name has the generated `hireme_test_<utc>_<hex>` shape.
 * 5. A local, git-ignored ownership receipt for exactly that database, host, and
 *    port exists. It carries an unpredictable run ID that only the provisioning
 *    process knew, so knowing a URL is not enough to act on someone else's run.
 * 6. On the connection that will issue the writes, `current_database()` is that
 *    name.
 * 7. On the same connection, the database comment equals the provisioning
 *    marker for that receipt's run ID. Only the provisioning command sets it,
 *    and setting it needs ownership of the database, so a development, shared,
 *    or production database cannot carry it by accident.
 *
 * Messages name the database only. Connection strings, which carry
 * credentials, are never printed.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_DATABASE_NAME_PATTERN = /^hireme_test_\d{14}_[0-9a-f]{12}$/;
export const ISOLATED_SCHEMA_PATTERN = /^hm_found_[0-9a-f]{16}$/;
const RUN_ID_PATTERN = /^[0-9a-f]{32}$/;
const MARKER_PREFIX = 'hireme-disposable-test:v1:';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const API_ROOT = join(REPO_ROOT, 'apps/api');
export const RECEIPT_DIRECTORY = join(REPO_ROOT, '.tmp-runtime/test-db');

export class DisposableDatabaseRefusal extends Error {
  constructor(message: string) {
    super(`Refusing to use the test database: ${message}`);
    this.name = 'DisposableDatabaseRefusal';
  }
}

export interface OwnershipReceipt {
  version: 1;
  database: string;
  host: string;
  port: string;
  runId: string;
  createdAt: string;
}

export interface DisposableTarget {
  /** The validated connection string. Never print it. */
  url: string;
  database: string;
  host: string;
  port: string;
  receipt: OwnershipReceipt;
}

/** Anything that can run one raw query on one fixed connection. */
export interface RawQueryRunner {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new DisposableDatabaseRefusal('NODE_ENV must be exactly "test".');
  }
}

function allowedHost(host: string): boolean {
  const extra = process.env.TEST_DATABASE_ALLOW_HOST;
  return LOOPBACK_HOSTS.has(host) || (extra !== undefined && extra !== '' && host === extra);
}

export interface ParsedDatabaseUrl {
  url: string;
  host: string;
  port: string;
  database: string;
}

/** Parses a PostgreSQL URL and checks the host rule. It does not connect. */
export function parsePostgresUrl(raw: string | undefined, variable: string): ParsedDatabaseUrl {
  if (!raw) {
    throw new DisposableDatabaseRefusal(`${variable} is not set.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DisposableDatabaseRefusal(`${variable} is not a valid URL.`);
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new DisposableDatabaseRefusal(`${variable} is not a PostgreSQL URL.`);
  }
  if (!allowedHost(parsed.hostname)) {
    throw new DisposableDatabaseRefusal(
      `${variable} host is not loopback and does not exactly match TEST_DATABASE_ALLOW_HOST.`,
    );
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return { url: raw, host: parsed.hostname, port: parsed.port || '5432', database };
}

export function receiptPath(database: string): string {
  return join(RECEIPT_DIRECTORY, `${database}.receipt.json`);
}

export function urlFilePath(database: string): string {
  return join(RECEIPT_DIRECTORY, `${database}.url`);
}

export function catalogSnapshotPath(database: string): string {
  return join(RECEIPT_DIRECTORY, `${database}.catalog.json`);
}

export function markerFor(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new DisposableDatabaseRefusal('the ownership run ID is malformed.');
  }
  return `${MARKER_PREFIX}${runId}`;
}

export function readReceipt(database: string): OwnershipReceipt {
  const path = receiptPath(database);
  if (!existsSync(path)) {
    throw new DisposableDatabaseRefusal(
      `no local ownership receipt for "${database}". Only a database provisioned by this checkout can be used.`,
    );
  }
  let receipt: OwnershipReceipt;
  try {
    receipt = JSON.parse(readFileSync(path, 'utf8')) as OwnershipReceipt;
  } catch {
    throw new DisposableDatabaseRefusal(`the ownership receipt for "${database}" is unreadable.`);
  }
  if (
    receipt.version !== 1 ||
    receipt.database !== database ||
    typeof receipt.runId !== 'string' ||
    !RUN_ID_PATTERN.test(receipt.runId)
  ) {
    throw new DisposableDatabaseRefusal(`the ownership receipt for "${database}" is invalid.`);
  }
  return receipt;
}

/**
 * Validates `TEST_DATABASE_URL` without connecting: environment, host, name,
 * and the local receipt. `verifyConnectedIdentity` must still run on the
 * connection that will write.
 */
export function resolveDisposableTarget(): DisposableTarget {
  assertTestEnvironment();
  const parsed = parsePostgresUrl(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL');
  if (!TEST_DATABASE_NAME_PATTERN.test(parsed.database)) {
    throw new DisposableDatabaseRefusal(
      'TEST_DATABASE_URL does not name a generated hireme_test_<utc>_<hex> database.',
    );
  }
  const schema = new URL(parsed.url).searchParams.get('schema');
  if (schema !== null && schema !== 'public') {
    throw new DisposableDatabaseRefusal('TEST_DATABASE_URL must target the public schema.');
  }
  const receipt = readReceipt(parsed.database);
  if (receipt.host !== parsed.host || receipt.port !== parsed.port) {
    throw new DisposableDatabaseRefusal(
      `the ownership receipt for "${parsed.database}" was issued for a different server.`,
    );
  }
  return { ...parsed, receipt };
}

/**
 * Proves, on this exact connection, that it is connected to the provisioned
 * database and that the database carries this run's marker. Read-only.
 */
export async function verifyConnectedIdentity(
  connection: RawQueryRunner,
  target: DisposableTarget,
): Promise<void> {
  const rows = await connection.$queryRawUnsafe<{ database: string; marker: string | null }[]>(
    `SELECT current_database() AS database,
            shobj_description(d.oid, 'pg_database') AS marker
       FROM pg_database d
      WHERE d.datname = current_database()`,
  );
  const identity = rows[0];
  if (!identity || identity.database !== target.database) {
    throw new DisposableDatabaseRefusal(
      `the connection is not to "${target.database}" (connected database differs).`,
    );
  }
  if (identity.marker !== markerFor(target.receipt.runId)) {
    throw new DisposableDatabaseRefusal(
      `"${target.database}" does not carry this run's disposable-test marker.`,
    );
  }
}

/** The same database, addressed through a different schema. */
export function withSchema(url: string, schema: string): string {
  if (!ISOLATED_SCHEMA_PATTERN.test(schema) && schema !== 'public') {
    throw new DisposableDatabaseRefusal('the schema name is not a generated isolated schema.');
  }
  const parsed = new URL(url);
  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

/** A single-connection variant, so a check and the statement after it share one session. */
export function singleConnection(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('connection_limit', '1');
  return parsed.toString();
}

export function generateDatabaseName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').replace(/\..*$/, '');
  return `hireme_test_${stamp}_${randomBytes(6).toString('hex')}`;
}

export function generateRunId(): string {
  return randomBytes(16).toString('hex');
}

export function generateIsolatedSchemaName(): string {
  return `hm_found_${randomBytes(8).toString('hex')}`;
}

/** Double-quotes an identifier after checking it against a generated pattern. */
export function quoteGeneratedIdentifier(name: string, pattern: RegExp): string {
  if (!pattern.test(name)) {
    throw new DisposableDatabaseRefusal('refusing to quote a non-generated identifier.');
  }
  return `"${name}"`;
}

/** Writes a creator-only file (mode 0600 where the platform supports it). */
export function writePrivateFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 });
}

export function removeOwnershipFiles(database: string): void {
  for (const path of [
    receiptPath(database),
    urlFilePath(database),
    catalogSnapshotPath(database),
  ]) {
    rmSync(path, { force: true });
  }
}

/** Environment for a child process that must reach exactly the validated target. */
export function childEnvironment(url: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    DATABASE_URL: url,
    NODE_ENV: 'test',
  };
}
