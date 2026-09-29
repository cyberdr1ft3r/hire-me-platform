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
 * never by counts alone. Roles, permissions, and grants must keep their row
 * identifier as well as their name/code or (role, permission) pair, so a row
 * deleted and recreated fails even when counts match. It proves:
 *
 * - every seeded role and permission row, and every seeded grant pair, exists;
 * - SUPER_ADMIN still actively holds every seeded permission, and its
 *   effective permissions resolve to all of them;
 * - the bootstrap administrator's account, role, and credential survived, and
 *   it can still log in and read its own permissions.
 *
 * - every seeded grant keeps its baseline active state and its baseline row
 *   identifier: suites narrow seeded roles only by archiving and restore the
 *   exact rows in place (Issue #93), so zero replaced rows is enforced.
 *
 * Reported rather than failed: seeded permission description and scope-type
 * drift from suites' permission upserts, a separate coupling. A deactivated
 * seeded permission fails.
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

    // Issue #93: every seeded grant keeps its baseline active state and its
    // baseline row identifier. Counted and printed first, then enforced.
    const changed = snapshot.grants
      .filter(
        (grant) =>
          (byPair.get(pair(grant.role, grant.permission))?.archivedAt === null) !== grant.active,
      )
      .map((grant) => pair(grant.role, grant.permission));
    const replaced = snapshot.grants.filter(
      (grant) => byPair.get(pair(grant.role, grant.permission))?.id !== grant.id,
    );
    const replacedByRole = new Map<string, number>();
    for (const grant of replaced) {
      replacedByRole.set(grant.role, (replacedByRole.get(grant.role) ?? 0) + 1);
    }
    console.info(
      `[catalog] seeded grants that differ in active state: ${changed.length}${
        changed.length > 0 ? ` (${changed.join(', ')})` : ''
      }`,
    );
    console.info(
      `[catalog] seeded grant rows replaced (new row identifier): ${replaced.length}${
        replaced.length > 0
          ? ` (${[...replacedByRole].map(([role, count]) => `${role}=${count}`).join(', ')})`
          : ''
      }`,
    );
    expect(changed, 'seeded grants whose active state changed').toEqual([]);
    expect(
      replaced.map((grant) => pair(grant.role, grant.permission)),
      'seeded grant rows replaced',
    ).toEqual([]);
  });

  it('reports seeded permission field drift and fails on deactivation', async () => {
    // Several suites' permission upserts rewrite seeded permission descriptions
    // and scope types. That coupling is tracked separately from Issue #93:
    // reported here, never waived silently.
    const baseline = snapshot.permissions.filter((permission) => permission.scopeType);
    if (baseline.length === 0) {
      console.info('[catalog] seeded permission field drift: snapshot predates field capture');
      return;
    }
    const current = new Map(
      (
        await prisma.permission.findMany({
          select: { id: true, description: true, scopeType: true, status: true },
        })
      ).map((permission) => [permission.id, permission]),
    );
    const drift = { description: 0, scopeType: 0, status: 0 };
    for (const permission of baseline) {
      const now = current.get(permission.id);
      if (now?.description !== permission.description) drift.description += 1;
      if (now?.scopeType !== permission.scopeType) drift.scopeType += 1;
      if (now?.status !== permission.status) drift.status += 1;
    }
    console.info(
      `[catalog] seeded permission field drift: description=${drift.description}, scopeType=${drift.scopeType}, status=${drift.status}`,
    );
    expect(drift.status, 'seeded permissions whose status changed').toBe(0);
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
