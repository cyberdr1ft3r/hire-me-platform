import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DisposableDatabaseRefusal,
  generateDatabaseName,
  generateIsolatedSchemaName,
  generateRunId,
  ISOLATED_SCHEMA_PATTERN,
  markerFor,
  quoteGeneratedIdentifier,
  receiptPath,
  resolveDisposableTarget,
  TEST_DATABASE_NAME_PATTERN,
  verifyConnectedIdentity,
  withSchema,
  writePrivateFile,
  type OwnershipReceipt,
  type RawQueryRunner,
} from './disposable-database.js';

/**
 * The guard's rules without a database (Issue #90). The connected identity
 * check is exercised with a fake single connection; the real refusals against
 * real PostgreSQL targets are proven by `pnpm test:db:verify-refusal` in CI.
 */
const saved = { ...process.env };
const created: string[] = [];

function urlFor(database: string, host = '127.0.0.1', port = '55432'): string {
  return `postgresql://user:secret-password@${host}:${port}/${database}?schema=public`;
}

function writeReceipt(database: string, overrides: Partial<OwnershipReceipt> = {}) {
  const receipt: OwnershipReceipt = {
    version: 1,
    database,
    host: '127.0.0.1',
    port: '55432',
    runId: generateRunId(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  writePrivateFile(receiptPath(database), JSON.stringify(receipt));
  created.push(database);
  return receipt;
}

function refusal(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DisposableDatabaseRefusal);
    return (error as Error).message;
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.TEST_DATABASE_ALLOW_HOST;
  delete process.env.TEST_DATABASE_URL;
});

afterEach(() => {
  process.env = { ...saved };
  for (const database of created.splice(0)) {
    rmSync(receiptPath(database), { force: true });
  }
});

describe('disposable test database guard', () => {
  it('requires NODE_ENV=test and an explicit TEST_DATABASE_URL, never DATABASE_URL', () => {
    process.env.DATABASE_URL = urlFor(generateDatabaseName());
    expect(refusal(() => resolveDisposableTarget())).toContain('TEST_DATABASE_URL is not set');

    process.env.TEST_DATABASE_URL = urlFor(generateDatabaseName());
    for (const value of ['production', 'development', '']) {
      process.env.NODE_ENV = value;
      expect(refusal(() => resolveDisposableTarget())).toContain('NODE_ENV must be exactly "test"');
    }
  });

  it('accepts only loopback hosts or the exact allowed host', () => {
    const database = generateDatabaseName();
    writeReceipt(database, { host: 'db.internal' });
    process.env.TEST_DATABASE_URL = urlFor(database, 'db.internal');
    expect(refusal(() => resolveDisposableTarget())).toContain('host is not loopback');

    process.env.TEST_DATABASE_ALLOW_HOST = 'db.internal.example';
    expect(refusal(() => resolveDisposableTarget())).toContain('host is not loopback');

    process.env.TEST_DATABASE_ALLOW_HOST = 'db.internal';
    expect(resolveDisposableTarget().host).toBe('db.internal');
  });

  it('refuses development, shared, and hand-named databases', () => {
    for (const database of [
      'hire_me_dev',
      'hire_me',
      'postgres',
      'hireme_test',
      'hireme_test_probe',
      'hireme_test_2026092514_abc',
      'HIREME_TEST_20260925141534_66995d022fbe',
    ]) {
      process.env.TEST_DATABASE_URL = urlFor(database);
      expect(
        refusal(() => resolveDisposableTarget()),
        database,
      ).toContain('does not name a generated');
    }
  });

  it('requires the public schema in TEST_DATABASE_URL', () => {
    const database = generateDatabaseName();
    writeReceipt(database);
    process.env.TEST_DATABASE_URL = urlFor(database).replace('schema=public', 'schema=other');
    expect(refusal(() => resolveDisposableTarget())).toContain('public schema');
  });

  it('requires this checkout’s receipt for exactly that database and server', () => {
    const database = generateDatabaseName();
    process.env.TEST_DATABASE_URL = urlFor(database);
    expect(refusal(() => resolveDisposableTarget())).toContain('no local ownership receipt');

    writeReceipt(database, { port: '55433' });
    expect(refusal(() => resolveDisposableTarget())).toContain('different server');

    writeReceipt(database, { runId: 'not-a-run-id' });
    expect(refusal(() => resolveDisposableTarget())).toContain('invalid');

    const receipt = writeReceipt(database);
    const target = resolveDisposableTarget();
    expect(target.database).toBe(database);
    expect(target.receipt.runId).toBe(receipt.runId);
  });

  it('never prints the connection string', () => {
    const database = generateDatabaseName();
    process.env.TEST_DATABASE_URL = urlFor(database);
    const message = refusal(() => resolveDisposableTarget());
    expect(message).not.toContain('secret-password');
    expect(message).not.toContain('postgresql://');
  });

  it('checks the connected database and marker on the connection itself', async () => {
    const database = generateDatabaseName();
    const receipt = writeReceipt(database);
    process.env.TEST_DATABASE_URL = urlFor(database);
    const target = resolveDisposableTarget();
    const connection = (row: { database: string; marker: string | null } | undefined) =>
      ({
        $queryRawUnsafe: () => Promise.resolve(row ? [row] : []),
      }) as unknown as RawQueryRunner;

    await expect(
      verifyConnectedIdentity(connection({ database, marker: markerFor(receipt.runId) }), target),
    ).resolves.toBeUndefined();
    await expect(
      verifyConnectedIdentity(
        connection({ database: 'hire_me_dev', marker: markerFor(receipt.runId) }),
        target,
      ),
    ).rejects.toThrow('connected database differs');
    await expect(
      verifyConnectedIdentity(connection({ database, marker: null }), target),
    ).rejects.toThrow('does not carry this run');
    await expect(
      verifyConnectedIdentity(connection({ database, marker: markerFor(generateRunId()) }), target),
    ).rejects.toThrow('does not carry this run');
    await expect(verifyConnectedIdentity(connection(undefined), target)).rejects.toThrow(
      'connected database differs',
    );
  });

  it('generates unique, pattern-conforming names and quotes only generated identifiers', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateDatabaseName()));
    expect(names.size).toBe(50);
    for (const name of names) {
      expect(name).toMatch(TEST_DATABASE_NAME_PATTERN);
    }
    expect(generateIsolatedSchemaName()).toMatch(ISOLATED_SCHEMA_PATTERN);
    for (const hostile of ['public', 'x"; DROP SCHEMA public CASCADE; --', 'hm_found_ZZ']) {
      expect(() => quoteGeneratedIdentifier(hostile, ISOLATED_SCHEMA_PATTERN)).toThrow(
        DisposableDatabaseRefusal,
      );
    }
    expect(() => withSchema(urlFor(generateDatabaseName()), 'other')).toThrow(
      DisposableDatabaseRefusal,
    );
    expect(() => markerFor("x' OR 1=1")).toThrow(DisposableDatabaseRefusal);
  });
});
