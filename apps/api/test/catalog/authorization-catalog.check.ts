import '../setup-env.js';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema, MeResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../../src/app.module.js';
import { PasswordService } from '../../src/auth/password.service.js';
import { PermissionsService } from '../../src/auth/permissions.service.js';
import { PrismaClient } from '../../src/persistence/prisma/generated-client.js';
import {
  CRITICAL_ROLES,
  readCatalogSnapshot,
  TEST_BOOTSTRAP_ADMIN_PASSWORD,
  type CatalogSnapshot,
} from '../support/catalog-snapshot.js';

/**
 * Authorization-catalog survival gate (Issue #90 / A-75-08), run after every
 * full integration pass against the same disposable database with no reseed.
 *
 * It compares the catalog with the snapshot taken right after provisioning,
 * never by counts alone. Roles and permissions must keep their identifier and
 * name/code, so one deleted and recreated fails even when counts match. A
 * grant's identity is its natural key (role name, permission code), the
 * table's unique pair. It proves:
 *
 * - every seeded role and permission row, and every seeded grant pair, exists;
 * - SUPER_ADMIN still actively holds every seeded permission, and its
 *   effective permissions resolve to all of them;
 * - the bootstrap administrator's account, role, and credential survived, and
 *   it can still log in and read its own permissions.
 *
 * Not claimed unchanged, and reported rather than failed:
 * - non-critical seeded grants that suites archive on purpose to test
 *   restricted access;
 * - seeded grant rows that suites delete and re-insert with the same pair when
 *   they narrow a role and restore it afterwards (a new row identifier).
 * Both are a pre-existing coupling between suites and the shared seeded roles,
 * tracked separately from this gate.
 */
const snapshotPath = process.env.HIREME_TEST_CATALOG_SNAPSHOT;
const prisma = new PrismaClient();
let snapshot: CatalogSnapshot;

describe('seeded authorization catalog survives the integration suite', () => {
  beforeAll(() => {
    if (!snapshotPath) {
      throw new Error('HIREME_TEST_CATALOG_SNAPSHOT is not set; run pnpm test:db:check-catalog.');
    }
    snapshot = readCatalogSnapshot(snapshotPath);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps every seeded role and permission, by identifier and name', async () => {
    const roles = await prisma.role.findMany({ select: { id: true, name: true } });
    const byRoleId = new Map(roles.map((role) => [role.id, role.name as string]));
    const missingRoles = snapshot.roles.filter((role) => byRoleId.get(role.id) !== role.name);
    expect(missingRoles, 'seeded roles deleted or replaced').toEqual([]);
    expect(snapshot.roles.map((role) => role.name)).toEqual(
      expect.arrayContaining(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'CLIENT_USER']),
    );

    const permissions = await prisma.permission.findMany({ select: { id: true, code: true } });
    const byPermissionId = new Map(
      permissions.map((permission) => [permission.id, permission.code]),
    );
    const missingPermissions = snapshot.permissions.filter(
      (permission) => byPermissionId.get(permission.id) !== permission.code,
    );
    expect(missingPermissions, 'seeded permissions deleted or replaced').toEqual([]);
    expect(snapshot.permissions.length).toBeGreaterThan(0);
  });

  it('keeps every seeded grant pair and every critical grant active', async () => {
    const grants = await prisma.rolePermission.findMany({
      select: {
        id: true,
        archivedAt: true,
        role: { select: { name: true } },
        permission: { select: { code: true } },
      },
    });
    const pair = (role: string, permission: string) => `${role}:${permission}`;
    const byPair = new Map(
      grants.map((grant) => [pair(grant.role.name, grant.permission.code), grant]),
    );

    const missing = snapshot.grants
      .filter((grant) => !byPair.has(pair(grant.role, grant.permission)))
      .map((grant) => pair(grant.role, grant.permission));
    expect(missing, 'seeded grants missing').toEqual([]);

    const critical = new Set<string>(CRITICAL_ROLES);
    const criticalArchived = snapshot.grants
      .filter(
        (grant) =>
          critical.has(grant.role) &&
          grant.active &&
          byPair.get(pair(grant.role, grant.permission))?.archivedAt !== null,
      )
      .map((grant) => pair(grant.role, grant.permission));
    expect(criticalArchived, 'critical grants archived').toEqual([]);

    // Seeded SUPER_ADMIN holds every seeded permission.
    const superAdminCodes = new Set(
      snapshot.grants
        .filter((grant) => grant.role === 'SUPER_ADMIN' && grant.active)
        .map((grant) => grant.permission),
    );
    expect(
      snapshot.permissions.filter((permission) => !superAdminCodes.has(permission.code)),
    ).toEqual([]);

    // Reported by name only: non-critical grants archived on purpose, and grant
    // rows re-inserted with the same pair by a suite's narrow-and-restore helper.
    const changed = snapshot.grants
      .filter((grant) => !critical.has(grant.role))
      .filter(
        (grant) =>
          (byPair.get(pair(grant.role, grant.permission))?.archivedAt === null) !== grant.active,
      )
      .map((grant) => pair(grant.role, grant.permission));
    const reinsertedByRole = new Map<string, number>();
    for (const grant of snapshot.grants) {
      if (byPair.get(pair(grant.role, grant.permission))?.id !== grant.id) {
        reinsertedByRole.set(grant.role, (reinsertedByRole.get(grant.role) ?? 0) + 1);
      }
    }
    console.info(
      `[catalog] ${changed.length} non-critical seeded grants differ in active state${
        changed.length > 0 ? `: ${changed.join(', ')}` : ''
      }`,
    );
    console.info(
      `[catalog] seeded grant rows re-inserted with the same pair: ${
        [...reinsertedByRole].map(([role, count]) => `${role}=${count}`).join(', ') || 'none'
      }`,
    );
  });

  it('keeps the bootstrap administrator account, role, and credential', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: snapshot.bootstrapAdmin.id },
      include: {
        passwordCredential: true,
        roles: { where: { archivedAt: null }, include: { role: true } },
      },
    });
    expect(admin.normalizedEmail).toBe(snapshot.bootstrapAdmin.normalizedEmail);
    expect(admin.status).toBe('ACTIVE');
    expect(admin.archivedAt).toBeNull();
    expect(admin.passwordCredential?.id).toBe(snapshot.bootstrapAdmin.credentialId);
    await expect(
      new PasswordService().verifyPassword(
        admin.passwordCredential!.passwordHash,
        TEST_BOOTSTRAP_ADMIN_PASSWORD,
      ),
    ).resolves.toBe(true);
    expect(admin.roles.map((entry) => entry.role.name)).toContain('SUPER_ADMIN');
  });

  describe('bootstrap administrator authentication', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, '127.0.0.1');
      baseUrl = await app.getUrl();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('logs in and resolves every seeded permission for SUPER_ADMIN', async () => {
      const login = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: snapshot.bootstrapAdmin.normalizedEmail,
          password: TEST_BOOTSTRAP_ADMIN_PASSWORD,
        }),
      });
      expect(login.status).toBe(201);
      const session = AuthResponseSchema.parse(await login.json());

      const me = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      expect(me.status).toBe(200);
      const { user } = MeResponseSchema.parse(await me.json());
      expect(user.id).toBe(snapshot.bootstrapAdmin.id);

      const seededCodes = snapshot.permissions.map((permission) => permission.code);
      expect(user.permissions).toEqual(expect.arrayContaining(seededCodes));
      const effective = await app
        .get(PermissionsService)
        .getEffectivePermissionCodes(snapshot.bootstrapAdmin.id);
      expect(effective).toEqual(expect.arrayContaining(seededCodes));
    });
  });
});
