import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema, MAX_ACCOUNTING_DATE_RANGE_DAYS } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  InvoiceStatus,
  MissionCandidateState,
  OfferStatus,
  PaymentAllocationStatus,
  PermissionScopeType,
  PlacementStatus,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

/**
 * Issue #39 accounting integration coverage.
 *
 * Everything runs against real PostgreSQL so allocation arithmetic, settlement
 * derivation, row locking, unique constraints, check constraints, scope, redaction,
 * and audit atomicity are verified against the database rather than mocks.
 */

/** Full accounting operator: every accounting capability plus commercial data access. */
const operatorPermissions = [
  'commercial_data:access',
  'clients:view',
  'missions:view',
  'mission_candidates:transfer',
  'placements:view',
  'training_programs:view',
  'training_programs:view_all',
  'invoices:view',
  'invoices:manage',
  'payments:view',
  'payments:manage',
  'payments:correct',
  'expenses:view',
  'expenses:manage',
  'client_balances:view',
  'profitability:view',
] as const;

/** Can read accounting records but must never see amounts. */
const noAmountsPermissions = [
  'clients:view',
  'missions:view',
  'invoices:view',
  'payments:view',
  'expenses:view',
  'client_balances:view',
  'profitability:view',
] as const;

/**
 * Holds accounting capability and broad training oversight but no client read scope.
 * `training_programs:view_all` must still respect client scope for a client-linked
 * program, exactly as the merged training rule does.
 */
const noClientScopePermissions = [
  'commercial_data:access',
  'training_programs:view_all',
  'invoices:view',
  'payments:view',
  'payments:manage',
  'expenses:view',
  'expenses:manage',
] as const;

/** No accounting capability at all. */
const noAccountingPermissions = ['clients:view', 'missions:view'] as const;

/**
 * Full accounting capability and client scope, but no broad mission oversight and no
 * mission assignment. Deliberately not one of the seeded role shapes: the accounting
 * source-scope rule must hold for any custom permission combination.
 */
const limitedMissionScopePermissions = [
  'commercial_data:access',
  'clients:view',
  'missions:view',
  'placements:view',
  'invoices:view',
  'payments:view',
  'expenses:view',
  'expenses:manage',
  'client_balances:view',
  'profitability:view',
] as const;

/**
 * Training and placement source scope, deliberately narrow: `training_programs:view`
 * without `training_programs:view_all`, and no `placements:view` at all. Client and
 * mission scope are broad, so only the training and placement rules can hide a record.
 */
const narrowSourceScopePermissions = [
  'commercial_data:access',
  'clients:view',
  'missions:view',
  'mission_candidates:transfer',
  'training_programs:view',
  'invoices:view',
  'payments:view',
  'expenses:view',
  'expenses:manage',
  'client_balances:view',
  'profitability:view',
] as const;

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: { permissionId: string; grantedAt: Date; archivedAt: Date | null }[];
};

async function cleanAccountingTestRecords(): Promise<void> {
  await prisma.paymentAllocation.deleteMany({
    where: { payment: { reference: { startsWith: 'PAY39-' } } },
  });
  await prisma.paymentEvent.deleteMany({
    where: { payment: { reference: { startsWith: 'PAY39-' } } },
  });
  await prisma.payment.deleteMany({ where: { reference: { startsWith: 'PAY39-' } } });
  await prisma.expenseEvent.deleteMany({
    where: { expense: { reference: { startsWith: 'EXP39-' } } },
  });
  await prisma.expense.deleteMany({ where: { reference: { startsWith: 'EXP39-' } } });
  await prisma.auditLog.deleteMany({
    where: { entityType: { in: ['Payment', 'PaymentAllocation', 'Expense'] } },
  });
  await prisma.invoiceEvent.deleteMany({
    where: { invoice: { reference: { startsWith: 'INV39-' } } },
  });
  await prisma.invoiceLine.deleteMany({
    where: { invoice: { reference: { startsWith: 'INV39-' } } },
  });
  await prisma.invoice.deleteMany({ where: { reference: { startsWith: 'INV39-' } } });
  await prisma.missionPlacement.deleteMany({
    where: { mission: { title: { startsWith: 'Issue39' } } },
  });
  await prisma.recruitmentOfferVersion.deleteMany({
    where: { mission: { title: { startsWith: 'Issue39' } } },
  });
  await prisma.recruitmentOffer.deleteMany({
    where: { mission: { title: { startsWith: 'Issue39' } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: { mission: { title: { startsWith: 'Issue39' } } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@candidate.accounting.test' } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: { mission: { title: { startsWith: 'Issue39' } } },
  });
  await prisma.recruitmentMission.deleteMany({ where: { title: { startsWith: 'Issue39' } } });
  await prisma.trainingSession.deleteMany({
    where: { program: { normalizedReference: { startsWith: 'issue39' } } },
  });
  await prisma.trainingProgram.deleteMany({
    where: { normalizedReference: { startsWith: 'issue39' } },
  });
  await prisma.client.deleteMany({ where: { normalizedName: { startsWith: 'issue39' } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@accounting.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@accounting.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@accounting.test' } } },
  });
  await prisma.user.deleteMany({ where: { normalizedEmail: { endsWith: '@accounting.test' } } });
}

async function setRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for accounting tests.`,
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id },
    data: { archivedAt: new Date() },
  });
  for (const code of codes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { status: 'ACTIVE' },
      create: {
        code,
        description: `Synthetic ${code} permission for accounting tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function snapshotRolePermissions(roleName: RoleName): Promise<RolePermissionSnapshot> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    include: { permissions: true },
  });
  if (!role) {
    return { roleExisted: false, permissions: [] };
  }
  return {
    roleExisted: true,
    permissions: role.permissions.map((rp) => ({
      permissionId: rp.permissionId,
      grantedAt: rp.grantedAt,
      archivedAt: rp.archivedAt,
    })),
  };
}

async function restoreRolePermissions(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    return;
  }
  if (!snapshot.roleExisted) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    return;
  }
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: { notIn: snapshot.permissions.map((rp) => rp.permissionId) },
    },
  });
  for (const rp of snapshot.permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: rp.permissionId } },
      update: { grantedAt: rp.grantedAt, archivedAt: rp.archivedAt },
      create: {
        roleId: role.id,
        permissionId: rp.permissionId,
        grantedAt: rp.grantedAt,
        archivedAt: rp.archivedAt,
      },
    });
  }
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: { userId: user.id, passwordHash: await passwords.hashPassword(testPassword) },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

describe('accounting foundation', { timeout: 40_000 }, () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let operatorUserId: string;
  let operatorToken: string;
  let noAmountsToken: string;
  let noScopeToken: string;
  let noAccountingToken: string;
  let limitedUserId: string;
  let limitedToken: string;
  let narrowUserId: string;
  let narrowToken: string;
  let clientId: string;
  let otherClientId: string;
  let missionId: string;
  let roleSnapshots: Map<RoleName, RolePermissionSnapshot>;

  async function login(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword }),
    });
    return AuthResponseSchema.parse(await response.json()).accessToken;
  }

  async function api(
    token: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}/v1/accounting${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as never) : {} };
  }

  /** Calls the merged Issue #38 commercial API, which owns invoice state changes. */
  async function commercialApi(
    token: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}/v1/commercial${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as never) : {} };
  }

  function errorCode(body: Record<string, unknown>): string | undefined {
    return (body as { error?: { code?: string } }).error?.code;
  }

  /** Builds the full candidate/offer chain a `MissionPlacement` requires. */
  async function createPlacement(mission: string, key: string) {
    const email = `${key}-${randomUUID().slice(0, 8)}@candidate.accounting.test`;
    const candidate = await prisma.candidate.create({
      data: {
        displayName: `Issue39 ${key} Candidate`,
        email,
        normalizedEmail: email,
        status: CandidateStatus.ACTIVE,
      },
    });
    const process = await prisma.missionCandidate.create({
      data: {
        missionId: mission,
        candidateId: candidate.id,
        responsibleRecruiterUserId: operatorUserId,
        state: MissionCandidateState.INTEGRATED,
      },
    });
    const offer = await prisma.recruitmentOffer.create({
      data: { missionId: mission, missionCandidateId: process.id },
    });
    const version = await prisma.recruitmentOfferVersion.create({
      data: {
        offerId: offer.id,
        missionId: mission,
        missionCandidateId: process.id,
        versionNumber: 1,
        status: OfferStatus.ACCEPTED,
        isCurrent: true,
      },
    });
    return prisma.missionPlacement.create({
      data: {
        missionId: mission,
        missionCandidateId: process.id,
        offerVersionId: version.id,
        status: PlacementStatus.CONFIRMED,
        integrationStartDate: new Date(),
        eligibleForInvoicing: true,
        invoicingEligibleAt: new Date(),
      },
    });
  }

  /** Creates a training program, optionally client-linked and optionally owned. */
  async function createProgram(
    key: string,
    options: { client?: string | null; owner?: string } = {},
  ) {
    return prisma.trainingProgram.create({
      data: {
        reference: `ISSUE39-TP-${key.toUpperCase()}`,
        normalizedReference: `issue39-tp-${key}`,
        name: `Issue39 ${key} Program`,
        clientId: options.client === undefined ? null : options.client,
        ownerUserId: options.owner ?? null,
      },
    });
  }

  async function scopedClientFixture(key: string) {
    const localClient = await prisma.client.create({
      data: { name: `Issue39 ${key} Client`, normalizedName: `issue39 ${key} client` },
    });
    const mission = await prisma.recruitmentMission.create({
      data: { clientId: localClient.id, title: `Issue39 ${key} Mission`, numberOfPositions: 1 },
    });
    return { localClient, mission };
  }

  function receivableTotals(body: Record<string, unknown>) {
    return (
      body as {
        receivables: {
          totalsByCurrency: { currency: string; invoicedCents: number }[];
        };
      }
    ).receivables.totalsByCurrency;
  }

  function profitabilityTotals(body: Record<string, unknown>) {
    return (
      body as {
        profitability: {
          totalsByCurrency: { currency: string; revenueCents: number; expenseCents: number }[];
        };
      }
    ).profitability.totalsByCurrency;
  }

  function expenseIds(body: Record<string, unknown>): string[] {
    return (body as { expenses: { id: string }[] }).expenses.map((expense) => expense.id);
  }

  /** Creates an ISSUED invoice directly: Issue #38 owns invoice creation semantics. */
  async function issuedInvoice(options: {
    totalCents: number;
    currency?: string;
    dueInDays?: number;
    client?: string;
    mission?: string | null;
    status?: InvoiceStatus;
  }) {
    return prisma.invoice.create({
      data: {
        reference: `INV39-${randomUUID().slice(0, 12)}`,
        clientId: options.client ?? clientId,
        recruitmentMissionId: options.mission === undefined ? null : options.mission,
        currency: options.currency ?? 'MAD',
        status: options.status ?? InvoiceStatus.ISSUED,
        issueDate: new Date(),
        issuedAt: new Date(),
        dueDate: daysFromNow(options.dueInDays ?? 30),
        subtotalCents: options.totalCents,
        taxCents: 0,
        totalCents: options.totalCents,
      },
    });
  }

  async function createPayment(
    amountCents: number,
    overrides: Record<string, unknown> = {},
    token = operatorToken,
  ) {
    const response = await api(token, '/payments', {
      method: 'POST',
      body: {
        reference: `PAY39-${randomUUID().slice(0, 12)}`,
        clientId,
        receivedDate: new Date().toISOString(),
        currency: 'MAD',
        amountCents,
        method: 'BANK_TRANSFER',
        ...overrides,
      },
    });
    expect(response.status).toBe(201);
    return (response.body as { payment: { id: string } }).payment;
  }

  async function allocate(
    paymentId: string,
    invoiceId: string,
    amountCents: number,
    idempotencyKey?: string,
    token = operatorToken,
  ) {
    return api(token, `/payments/${paymentId}/allocations`, {
      method: 'POST',
      body: { invoiceId, amountCents, ...(idempotencyKey ? { idempotencyKey } : {}) },
    });
  }

  async function settlement(invoiceId: string, token = operatorToken) {
    return api(token, `/invoices/${invoiceId}/settlement`);
  }

  async function createExpense(overrides: Record<string, unknown> = {}, token = operatorToken) {
    return api(token, '/expenses', {
      method: 'POST',
      body: {
        reference: `EXP39-${randomUUID().slice(0, 12)}`,
        expenseDate: new Date().toISOString(),
        category: 'RECRUITMENT_SOURCING',
        currency: 'MAD',
        amountCents: 5_000,
        ...overrides,
      },
    });
  }

  async function auditCount(action: string, entityId?: string): Promise<number> {
    return prisma.auditLog.count({ where: { action, ...(entityId ? { entityId } : {}) } });
  }

  beforeAll(async () => {
    await cleanAccountingTestRecords();
    roleSnapshots = new Map(
      await Promise.all(
        [
          RoleName.HR_MANAGER,
          RoleName.MANAGER,
          RoleName.TEAM_LEADER,
          RoleName.EMPLOYEE,
          RoleName.GUEST,
          RoleName.CLIENT_USER,
        ].map(async (role) => [role, await snapshotRolePermissions(role)] as const),
      ),
    );
    await setRolePermissions(RoleName.HR_MANAGER, operatorPermissions);
    await setRolePermissions(RoleName.MANAGER, noAmountsPermissions);
    await setRolePermissions(RoleName.TEAM_LEADER, noClientScopePermissions);
    await setRolePermissions(RoleName.EMPLOYEE, noAccountingPermissions);
    await setRolePermissions(RoleName.GUEST, limitedMissionScopePermissions);
    await setRolePermissions(RoleName.CLIENT_USER, narrowSourceScopePermissions);

    operatorUserId = await createUser('operator@accounting.test', RoleName.HR_MANAGER);
    await createUser('no-amounts@accounting.test', RoleName.MANAGER);
    await createUser('no-scope@accounting.test', RoleName.TEAM_LEADER);
    await createUser('no-accounting@accounting.test', RoleName.EMPLOYEE);
    limitedUserId = await createUser('limited-scope@accounting.test', RoleName.GUEST);
    narrowUserId = await createUser('narrow-scope@accounting.test', RoleName.CLIENT_USER);

    const client = await prisma.client.create({
      data: { name: 'Issue39 Client', normalizedName: 'issue39 client' },
    });
    clientId = client.id;
    const other = await prisma.client.create({
      data: { name: 'Issue39 Other Client', normalizedName: 'issue39 other client' },
    });
    otherClientId = other.id;
    const mission = await prisma.recruitmentMission.create({
      data: { clientId, title: 'Issue39 Mission', numberOfPositions: 1 },
    });
    missionId = mission.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    operatorToken = await login('operator@accounting.test');
    noAmountsToken = await login('no-amounts@accounting.test');
    noScopeToken = await login('no-scope@accounting.test');
    noAccountingToken = await login('no-accounting@accounting.test');
    limitedToken = await login('limited-scope@accounting.test');
    narrowToken = await login('narrow-scope@accounting.test');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await cleanAccountingTestRecords();
    for (const [role, snapshot] of roleSnapshots) {
      await restoreRolePermissions(role, snapshot);
    }
    await prisma.$disconnect();
  }, 180_000);

  // -------------------------------------------------------------------------
  // Allocation arithmetic and settlement states
  // -------------------------------------------------------------------------

  it('records a partial payment and reports partially paid settlement', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(4_000);

    const allocated = await allocate(payment.id, invoice.id, 4_000);
    expect(allocated.status).toBe(201);

    const result = await settlement(invoice.id);
    const state = (
      result.body as {
        settlement: {
          settlementState: string;
          amounts: { allocatedCents: number; outstandingCents: number };
        };
      }
    ).settlement;
    expect(state.settlementState).toBe('PARTIALLY_PAID');
    expect(state.amounts.allocatedCents).toBe(4_000);
    expect(state.amounts.outstandingCents).toBe(6_000);
  });

  it('reports unpaid before any allocation and paid once fully allocated', async () => {
    const invoice = await issuedInvoice({ totalCents: 7_500 });

    const before = await settlement(invoice.id);
    expect(
      (before.body as { settlement: { settlementState: string } }).settlement.settlementState,
    ).toBe('UNPAID');

    const payment = await createPayment(7_500);
    expect((await allocate(payment.id, invoice.id, 7_500)).status).toBe(201);

    const after = await settlement(invoice.id);
    const state = (
      after.body as {
        settlement: { settlementState: string; amounts: { outstandingCents: number } };
      }
    ).settlement;
    expect(state.settlementState).toBe('PAID');
    expect(state.amounts.outstandingCents).toBe(0);
  });

  it('reports overdue when the due date has passed with a balance outstanding', async () => {
    const invoice = await issuedInvoice({ totalCents: 9_000, dueInDays: -5 });

    const result = await settlement(invoice.id);
    const state = (result.body as { settlement: { settlementState: string; overdue: boolean } })
      .settlement;
    expect(state.settlementState).toBe('OVERDUE');
    expect(state.overdue).toBe(true);

    const payment = await createPayment(9_000);
    await allocate(payment.id, invoice.id, 9_000);
    const settled = await settlement(invoice.id);
    expect(
      (settled.body as { settlement: { settlementState: string } }).settlement.settlementState,
    ).toBe('PAID');
  });

  it('spreads one payment across multiple invoices and tracks the remaining amount', async () => {
    const first = await issuedInvoice({ totalCents: 6_000 });
    const second = await issuedInvoice({ totalCents: 6_000 });
    const payment = await createPayment(10_000);

    expect((await allocate(payment.id, first.id, 6_000)).status).toBe(201);
    expect((await allocate(payment.id, second.id, 4_000)).status).toBe(201);

    const detail = await api(operatorToken, `/payments/${payment.id}`);
    const amounts = (
      detail.body as {
        payment: { amounts: { allocatedCents: number; unallocatedCents: number } };
      }
    ).payment.amounts;
    expect(amounts.allocatedCents).toBe(10_000);
    expect(amounts.unallocatedCents).toBe(0);

    const secondSettlement = await settlement(second.id);
    expect(
      (secondSettlement.body as { settlement: { settlementState: string } }).settlement
        .settlementState,
    ).toBe('PARTIALLY_PAID');
  });

  it('refuses an allocation beyond the payment remaining amount', async () => {
    const invoice = await issuedInvoice({ totalCents: 50_000 });
    const payment = await createPayment(5_000);

    const rejected = await allocate(payment.id, invoice.id, 5_001);
    expect(rejected.status).toBe(409);
    expect(errorCode(rejected.body)).toBe('ALLOCATION_EXCEEDS_PAYMENT_REMAINING');
    expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(0);
    expect(await auditCount('accounting.payment.allocated', payment.id)).toBe(0);
  });

  it('refuses an allocation beyond the invoice remaining receivable', async () => {
    const invoice = await issuedInvoice({ totalCents: 3_000 });
    const payment = await createPayment(20_000);

    const rejected = await allocate(payment.id, invoice.id, 3_001);
    expect(rejected.status).toBe(409);
    expect(errorCode(rejected.body)).toBe('ALLOCATION_EXCEEDS_INVOICE_REMAINING');
    expect(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });

  it('rejects a currency mismatch between payment and invoice', async () => {
    const invoice = await issuedInvoice({ totalCents: 5_000, currency: 'EUR' });
    const payment = await createPayment(5_000);

    const rejected = await allocate(payment.id, invoice.id, 5_000);
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('ALLOCATION_CURRENCY_MISMATCH');
  });

  it('rejects allocating to an invoice belonging to another client', async () => {
    const invoice = await issuedInvoice({ totalCents: 5_000, client: otherClientId });
    const payment = await createPayment(5_000);

    const rejected = await allocate(payment.id, invoice.id, 5_000);
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('ALLOCATION_CLIENT_MISMATCH');
  });

  it('excludes canceled and draft invoices from allocation and receivables', async () => {
    const canceled = await issuedInvoice({ totalCents: 5_000, status: InvoiceStatus.CANCELED });
    const draft = await issuedInvoice({ totalCents: 5_000, status: InvoiceStatus.DRAFT });
    const payment = await createPayment(5_000);

    for (const invoice of [canceled, draft]) {
      const rejected = await allocate(payment.id, invoice.id, 1_000);
      expect(rejected.status).toBe(409);
      expect(errorCode(rejected.body)).toBe('INVOICE_NOT_RECEIVABLE');
    }

    const canceledSettlement = await settlement(canceled.id);
    expect(
      (canceledSettlement.body as { settlement: { settlementState: string } }).settlement
        .settlementState,
    ).toBe('NOT_RECEIVABLE');
  });

  // -------------------------------------------------------------------------
  // Idempotency, reversal, correction
  // -------------------------------------------------------------------------

  it('treats a replayed allocation with the same idempotency key as one allocation', async () => {
    const invoice = await issuedInvoice({ totalCents: 8_000 });
    const payment = await createPayment(8_000);
    const key = `idem-${randomUUID()}`;

    const first = await allocate(payment.id, invoice.id, 3_000, key);
    const replay = await allocate(payment.id, invoice.id, 3_000, key);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);

    const firstId = (first.body as { allocation: { id: string } }).allocation.id;
    const replayId = (replay.body as { allocation: { id: string } }).allocation.id;
    expect(replayId).toBe(firstId);

    expect(
      await prisma.paymentAllocation.count({
        where: { paymentId: payment.id, invoiceId: invoice.id },
      }),
    ).toBe(1);
    // The replay must not write a second history or audit row.
    expect(await auditCount('accounting.payment.allocated', firstId)).toBe(1);
  });

  it('refuses a second active allocation of the same payment to the same invoice', async () => {
    const invoice = await issuedInvoice({ totalCents: 9_000 });
    const payment = await createPayment(9_000);

    expect((await allocate(payment.id, invoice.id, 2_000)).status).toBe(201);
    const duplicate = await allocate(payment.id, invoice.id, 2_000);
    expect(duplicate.status).toBe(409);
    expect(errorCode(duplicate.body)).toBe('ALLOCATION_ALREADY_EXISTS');
  });

  it('reverses an allocation, preserves history, and frees the balance', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);
    const created = await allocate(payment.id, invoice.id, 10_000);
    const allocationId = (created.body as { allocation: { id: string } }).allocation.id;

    const reversed = await api(
      operatorToken,
      `/payments/${payment.id}/allocations/${allocationId}/reverse`,
      { method: 'POST', body: { reversalReason: 'Issue39 bank recall' } },
    );
    expect(reversed.status).toBe(201);

    const stored = await prisma.paymentAllocation.findUniqueOrThrow({
      where: { id: allocationId },
    });
    expect(stored.status).toBe(PaymentAllocationStatus.REVERSED);
    expect(stored.activeAllocationKey).toBeNull();
    expect(stored.reversalReason).toBe('Issue39 bank recall');

    const after = await settlement(invoice.id);
    expect(
      (after.body as { settlement: { settlementState: string } }).settlement.settlementState,
    ).toBe('UNPAID');

    // Reversal releases the slot, so a corrected re-allocation is possible while the
    // reversed row remains as history.
    expect((await allocate(payment.id, invoice.id, 5_000)).status).toBe(201);
    expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(2);
  });

  it('is idempotent when a reversal is retried', async () => {
    const invoice = await issuedInvoice({ totalCents: 4_000 });
    const payment = await createPayment(4_000);
    const created = await allocate(payment.id, invoice.id, 4_000);
    const allocationId = (created.body as { allocation: { id: string } }).allocation.id;
    const path = `/payments/${payment.id}/allocations/${allocationId}/reverse`;

    expect(
      (await api(operatorToken, path, { method: 'POST', body: { reversalReason: 'Issue39 once' } }))
        .status,
    ).toBe(201);
    expect(
      (
        await api(operatorToken, path, {
          method: 'POST',
          body: { reversalReason: 'Issue39 twice' },
        })
      ).status,
    ).toBe(201);

    expect(await auditCount('accounting.payment.allocation_reversed', allocationId)).toBe(1);
    const stored = await prisma.paymentAllocation.findUniqueOrThrow({
      where: { id: allocationId },
    });
    expect(stored.reversalReason).toBe('Issue39 once');
  });

  it('records a payment correction with history and blocks dropping below allocated', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);
    await allocate(payment.id, invoice.id, 8_000);

    const tooLow = await api(operatorToken, `/payments/${payment.id}/correct`, {
      method: 'POST',
      body: { amountCents: 5_000, correctionReason: 'Issue39 should fail' },
    });
    expect(tooLow.status).toBe(409);
    expect(errorCode(tooLow.body)).toBe('PAYMENT_CORRECTION_BELOW_ALLOCATED');
    expect(await auditCount('accounting.payment.corrected', payment.id)).toBe(0);

    const corrected = await api(operatorToken, `/payments/${payment.id}/correct`, {
      method: 'POST',
      body: { amountCents: 9_000, correctionReason: 'Issue39 bank advice amended' },
    });
    expect(corrected.status).toBe(201);
    const detail = (
      corrected.body as {
        payment: {
          status: string;
          amounts: { amountCents: number };
          history: { action: string }[];
        };
      }
    ).payment;
    expect(detail.status).toBe('CORRECTED');
    expect(detail.amounts.amountCents).toBe(9_000);
    expect(detail.history.some((event) => event.action === 'corrected')).toBe(true);
  });

  it('refuses to archive a payment that still has active allocations', async () => {
    const invoice = await issuedInvoice({ totalCents: 6_000 });
    const payment = await createPayment(6_000);
    await allocate(payment.id, invoice.id, 6_000);

    const blocked = await api(operatorToken, `/payments/${payment.id}/archive`, { method: 'POST' });
    expect(blocked.status).toBe(409);
    expect(errorCode(blocked.body)).toBe('PAYMENT_HAS_ACTIVE_ALLOCATIONS');
    expect(await auditCount('accounting.payment.archived', payment.id)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Concurrency
  // -------------------------------------------------------------------------

  it('prevents concurrent allocations from over-allocating one payment', async () => {
    const first = await issuedInvoice({ totalCents: 8_000 });
    const second = await issuedInvoice({ totalCents: 8_000 });
    const payment = await createPayment(10_000);

    const [a, b] = await Promise.all([
      allocate(payment.id, first.id, 8_000),
      allocate(payment.id, second.id, 8_000),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const allocated = await prisma.paymentAllocation.aggregate({
      where: { paymentId: payment.id, status: PaymentAllocationStatus.ACTIVE },
      _sum: { amountCents: true },
    });
    expect(allocated._sum.amountCents).toBe(8_000);
  });

  it('prevents concurrent payments from over-settling one invoice', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const first = await createPayment(8_000);
    const second = await createPayment(8_000);

    const [a, b] = await Promise.all([
      allocate(first.id, invoice.id, 8_000),
      allocate(second.id, invoice.id, 8_000),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const allocated = await prisma.paymentAllocation.aggregate({
      where: { invoiceId: invoice.id, status: PaymentAllocationStatus.ACTIVE },
      _sum: { amountCents: true },
    });
    expect(allocated._sum.amountCents).toBe(8_000);

    const state = await settlement(invoice.id);
    expect(
      (state.body as { settlement: { amounts: { outstandingCents: number } } }).settlement.amounts
        .outstandingCents,
    ).toBe(2_000);
  });

  it('resolves concurrent identical allocation requests to exactly one allocation', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);

    const results = await Promise.all([
      allocate(payment.id, invoice.id, 5_000),
      allocate(payment.id, invoice.id, 5_000),
      allocate(payment.id, invoice.id, 5_000),
    ]);

    expect(results.filter((r) => r.status === 201).length).toBe(1);
    expect(
      await prisma.paymentAllocation.count({
        where: { paymentId: payment.id, status: PaymentAllocationStatus.ACTIVE },
      }),
    ).toBe(1);
  });

  it('serializes a payment correction against a concurrent allocation', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);

    const [allocation, correction] = await Promise.all([
      allocate(payment.id, invoice.id, 9_000),
      api(operatorToken, `/payments/${payment.id}/correct`, {
        method: 'POST',
        body: { amountCents: 6_000, correctionReason: 'Issue39 concurrent correction' },
      }),
    ]);

    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const allocated = await prisma.paymentAllocation.aggregate({
      where: { paymentId: payment.id, status: PaymentAllocationStatus.ACTIVE },
      _sum: { amountCents: true },
    });
    // Whichever order the two writes serialize in, the payment can never end up
    // recorded for less than it has allocated.
    expect(stored.amountCents).toBeGreaterThanOrEqual(allocated._sum.amountCents ?? 0);
    expect(
      [allocation.status, correction.status].filter((s) => s === 201).length,
    ).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Cancellation versus active allocations
  //
  // These exercise the real commercial cancellation endpoint. Mutating the invoice
  // status straight through Prisma would bypass the guard under test.
  // -------------------------------------------------------------------------

  it('refuses to cancel an invoice that still has an active allocation', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);
    expect((await allocate(payment.id, invoice.id, 10_000)).status).toBe(201);

    const canceled = await commercialApi(operatorToken, `/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      body: { reason: 'Issue39 cancellation attempt' },
    });
    expect(canceled.status).toBe(409);
    expect(errorCode(canceled.body)).toBe('INVOICE_HAS_ACTIVE_ALLOCATIONS');

    // The refused cancellation writes no state, no invoice event, and no audit row,
    // and it never reverses or deletes the allocation on the operator's behalf.
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe(InvoiceStatus.ISSUED);
    expect(stored.canceledAt).toBeNull();
    expect(
      await prisma.invoiceEvent.count({ where: { invoiceId: invoice.id, action: 'CANCELED' } }),
    ).toBe(0);
    expect(await auditCount('commercial.invoice.canceled', invoice.id)).toBe(0);
    expect(
      await prisma.paymentAllocation.count({
        where: { invoiceId: invoice.id, status: PaymentAllocationStatus.ACTIVE },
      }),
    ).toBe(1);
  });

  it('cancels an invoice once every allocation has been reversed', async () => {
    const invoice = await issuedInvoice({ totalCents: 8_000 });
    const payment = await createPayment(8_000);
    const created = await allocate(payment.id, invoice.id, 8_000);
    const allocationId = (created.body as { allocation: { id: string } }).allocation.id;

    expect(
      (
        await api(operatorToken, `/payments/${payment.id}/allocations/${allocationId}/reverse`, {
          method: 'POST',
          body: { reversalReason: 'Issue39 reversal before cancellation' },
        })
      ).status,
    ).toBe(201);

    const canceled = await commercialApi(operatorToken, `/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      body: { reason: 'Issue39 cancellation after reversal' },
    });
    expect(canceled.status).toBe(200);

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe(InvoiceStatus.CANCELED);
    // A reversed allocation is preserved as history and never blocks cancellation.
    expect(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id } })).toBe(1);
    expect(
      await prisma.paymentAllocation.count({
        where: { invoiceId: invoice.id, status: PaymentAllocationStatus.ACTIVE },
      }),
    ).toBe(0);
  });

  it('never leaves a canceled invoice holding active cash when the two requests race', async () => {
    const invoice = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);

    const [allocation, canceled] = await Promise.all([
      allocate(payment.id, invoice.id, 10_000),
      commercialApi(operatorToken, `/invoices/${invoice.id}/cancel`, {
        method: 'POST',
        body: { reason: 'Issue39 concurrent cancellation' },
      }),
    ]);

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const active = await prisma.paymentAllocation.count({
      where: { invoiceId: invoice.id, status: PaymentAllocationStatus.ACTIVE },
    });

    // The invariant, whichever request won the lock: canceled and actively allocated
    // is never a reachable state.
    expect(stored.status === InvoiceStatus.CANCELED && active > 0).toBe(false);
    expect([allocation.status === 201, canceled.status === 200].filter(Boolean).length).toBe(1);

    if (stored.status === InvoiceStatus.CANCELED) {
      expect(active).toBe(0);
      // The rejected allocation persists nothing at all.
      expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(0);
      const state = await settlement(invoice.id);
      expect(
        (state.body as { settlement: { settlementState: string } }).settlement.settlementState,
      ).toBe('NOT_RECEIVABLE');
    } else {
      expect(stored.status).toBe(InvoiceStatus.ISSUED);
      expect(errorCode(canceled.body)).toBe('INVOICE_HAS_ACTIVE_ALLOCATIONS');
      expect(active).toBe(1);
      expect(await auditCount('commercial.invoice.canceled', invoice.id)).toBe(0);
      const state = await settlement(invoice.id);
      expect(
        (state.body as { settlement: { settlementState: string } }).settlement.settlementState,
      ).toBe('PAID');
    }
  });

  it('rejects reusing an idempotency key for a different invoice or amount', async () => {
    const first = await issuedInvoice({ totalCents: 10_000 });
    const second = await issuedInvoice({ totalCents: 10_000 });
    const payment = await createPayment(10_000);
    const key = `IDEM39-${randomUUID().slice(0, 12)}`;

    expect((await allocate(payment.id, first.id, 4_000, key)).status).toBe(201);

    const otherInvoice = await allocate(payment.id, second.id, 4_000, key);
    expect(otherInvoice.status).toBe(409);
    expect(errorCode(otherInvoice.body)).toBe('ALLOCATION_IDEMPOTENCY_KEY_CONFLICT');

    const otherAmount = await allocate(payment.id, first.id, 5_000, key);
    expect(otherAmount.status).toBe(409);
    expect(errorCode(otherAmount.body)).toBe('ALLOCATION_IDEMPOTENCY_KEY_CONFLICT');

    // The identical request still replays to the original allocation.
    expect((await allocate(payment.id, first.id, 4_000, key)).status).toBe(201);
    expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Database invariants
  // -------------------------------------------------------------------------

  it('enforces financial invariants in the database', async () => {
    const invoice = await issuedInvoice({ totalCents: 5_000 });
    const payment = await createPayment(5_000);

    await expect(
      prisma.payment.create({
        data: {
          reference: `PAY39-${randomUUID().slice(0, 12)}`,
          clientId,
          receivedDate: new Date(),
          currency: 'MAD',
          amountCents: 0,
          method: 'CASH',
        },
      }),
    ).rejects.toThrow(/Payment_amount_positive/);

    // An ACTIVE allocation can never hold a NULL active key and escape the unique index.
    await expect(
      prisma.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          amountCents: 1_000,
          status: PaymentAllocationStatus.ACTIVE,
          activeAllocationKey: null,
        },
      }),
    ).rejects.toThrow(/PaymentAllocation_active_key_consistent/);
  });

  // -------------------------------------------------------------------------
  // Expenses
  // -------------------------------------------------------------------------

  it('records, corrects, and archives an expense with durable history', async () => {
    const created = await createExpense({ clientId, recruitmentMissionId: missionId });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    const corrected = await api(operatorToken, `/expenses/${expenseId}/correct`, {
      method: 'POST',
      body: { amountCents: 7_500, correctionReason: 'Issue39 invoice from vendor amended' },
    });
    expect(corrected.status).toBe(201);
    expect(
      (corrected.body as { expense: { amounts: { amountCents: number }; status: string } }).expense
        .amounts.amountCents,
    ).toBe(7_500);

    const archived = await api(operatorToken, `/expenses/${expenseId}/archive`, { method: 'POST' });
    expect(archived.status).toBe(201);

    const detail = await api(operatorToken, `/expenses/${expenseId}`);
    const history = (detail.body as { expense: { history: { action: string }[] } }).expense.history;
    expect(history.map((event) => event.action)).toEqual(['created', 'corrected', 'archived']);

    const blocked = await api(operatorToken, `/expenses/${expenseId}/correct`, {
      method: 'POST',
      body: { amountCents: 1_000, correctionReason: 'Issue39 after archive' },
    });
    expect(blocked.status).toBe(409);
    expect(errorCode(blocked.body)).toBe('EXPENSE_ARCHIVED');
  });

  it('rejects an expense whose mission belongs to a different client', async () => {
    const rejected = await createExpense({
      clientId: otherClientId,
      recruitmentMissionId: missionId,
    });
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('EXPENSE_CONTEXT_MISMATCH');
    expect(
      await prisma.expense.count({
        where: { recruitmentMissionId: missionId, clientId: otherClientId },
      }),
    ).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Expense cross-context integrity
  // -------------------------------------------------------------------------

  it('rejects an expense whose placement belongs to a different client', async () => {
    const otherMission = await prisma.recruitmentMission.create({
      data: {
        clientId: otherClientId,
        title: 'Issue39 Cross Client Mission',
        numberOfPositions: 1,
      },
    });
    const placement = await createPlacement(otherMission.id, 'cross-client');

    const expensesBefore = await prisma.expense.count();
    const eventsBefore = await prisma.expenseEvent.count();
    const auditBefore = await auditCount('accounting.expense.created');

    // The recruitment mission is deliberately omitted: the placement alone still
    // resolves to a client, and that chain must be checked.
    const rejected = await createExpense({ clientId, missionPlacementId: placement.id });
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('EXPENSE_CONTEXT_MISMATCH');

    expect(await prisma.expense.count({ where: { missionPlacementId: placement.id } })).toBe(0);
    expect(await prisma.expense.count()).toBe(expensesBefore);
    expect(await prisma.expenseEvent.count()).toBe(eventsBefore);
    expect(await auditCount('accounting.expense.created')).toBe(auditBefore);
  });

  it('rejects an expense whose placement belongs to a different recruitment mission', async () => {
    const placement = await createPlacement(missionId, 'mission-mismatch');
    const secondMission = await prisma.recruitmentMission.create({
      data: { clientId, title: 'Issue39 Second Mission', numberOfPositions: 1 },
    });

    const rejected = await createExpense({
      clientId,
      recruitmentMissionId: secondMission.id,
      missionPlacementId: placement.id,
    });
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('EXPENSE_CONTEXT_MISMATCH');
    expect(await prisma.expense.count({ where: { missionPlacementId: placement.id } })).toBe(0);
  });

  it('rejects an expense whose training program belongs to a different client', async () => {
    const program = await createProgram('cross', { client: otherClientId });

    const rejected = await createExpense({ clientId, trainingProgramId: program.id });
    expect(rejected.status).toBe(400);
    expect(errorCode(rejected.body)).toBe('EXPENSE_CONTEXT_MISMATCH');
    expect(await prisma.expense.count({ where: { trainingProgramId: program.id } })).toBe(0);
  });

  it('records an expense whose whole context chain agrees', async () => {
    const placement = await createPlacement(missionId, 'consistent');
    const created = await createExpense({
      clientId,
      recruitmentMissionId: missionId,
      missionPlacementId: placement.id,
    });
    expect(created.status).toBe(201);
    expect(await prisma.expense.count({ where: { missionPlacementId: placement.id } })).toBe(1);
  });

  it('hides a placement-linked expense outside the actor mission scope', async () => {
    const { mission } = await scopedClientFixture('placement-scope');
    const placement = await createPlacement(mission.id, 'hidden-placement');
    const created = await createExpense({ missionPlacementId: placement.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    // The direct client and mission columns are null, so only the placement chain can
    // hide this row.
    const hidden = await api(limitedToken, `/expenses/${expenseId}`);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
    expect(expenseIds((await api(limitedToken, '/expenses?pageSize=100')).body)).not.toContain(
      expenseId,
    );

    await prisma.missionRecruiter.create({
      data: { missionId: mission.id, userId: limitedUserId, status: AssignmentStatus.ACTIVE },
    });

    expect((await api(limitedToken, `/expenses/${expenseId}`)).status).toBe(200);
    expect(expenseIds((await api(limitedToken, '/expenses?pageSize=100')).body)).toContain(
      expenseId,
    );
  });

  it('hides a training-linked expense without client read scope', async () => {
    const program = await createProgram('scoped', { client: clientId });
    const created = await createExpense({ trainingProgramId: program.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    // `noScopeToken` holds expenses:view and `training_programs:view_all` but no
    // clients:view, and the expense carries a null clientId, so only the client half of
    // the merged training rule can hide it. Broad training oversight does not override
    // client scope.
    const hidden = await api(noScopeToken, `/expenses/${expenseId}`);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
    expect(expenseIds((await api(noScopeToken, '/expenses?pageSize=100')).body)).not.toContain(
      expenseId,
    );

    expect((await api(operatorToken, `/expenses/${expenseId}`)).status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Training source scope
  //
  // Accounting mirrors the merged TrainingService rule: broad oversight needs
  // `training_programs:view_all`, otherwise the actor must own the program or train one
  // of its sessions, and a client-linked program additionally needs client scope.
  // `clients:view` alone is never an alternate path to a hidden program.
  // -------------------------------------------------------------------------

  it('hides a training-linked expense without any training program capability', async () => {
    const program = await createProgram('no-capability');
    const created = await createExpense({ trainingProgramId: program.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    // The limited role holds clients:view and expense capability but neither
    // training_programs:view nor training_programs:view_all.
    const hidden = await api(limitedToken, `/expenses/${expenseId}`);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
    expect(expenseIds((await api(limitedToken, '/expenses?pageSize=100')).body)).not.toContain(
      expenseId,
    );

    const blocked = await createExpense({ trainingProgramId: program.id }, limitedToken);
    expect(blocked.status).toBe(404);
    expect(errorCode(blocked.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
    expect(await prisma.expense.count({ where: { trainingProgramId: program.id } })).toBe(1);
  });

  it('hides a training program from a non-owner non-trainer holding training_programs:view', async () => {
    const program = await createProgram('non-owner');
    const created = await createExpense({ trainingProgramId: program.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    const hidden = await api(narrowToken, `/expenses/${expenseId}`);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
    expect(expenseIds((await api(narrowToken, '/expenses?pageSize=100')).body)).not.toContain(
      expenseId,
    );

    const blocked = await createExpense({ trainingProgramId: program.id }, narrowToken);
    expect(blocked.status).toBe(404);
    // A hidden program is indistinguishable from one that does not exist.
    const missing = await createExpense({ trainingProgramId: randomUUID() }, narrowToken);
    expect(missing.status).toBe(blocked.status);
    expect(errorCode(missing.body)).toBe(errorCode(blocked.body));
  });

  it('shows a training program to its owner holding training_programs:view', async () => {
    const program = await createProgram('owned', { owner: narrowUserId });
    const created = await createExpense({ trainingProgramId: program.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    expect((await api(narrowToken, `/expenses/${expenseId}`)).status).toBe(200);
    expect(expenseIds((await api(narrowToken, '/expenses?pageSize=100')).body)).toContain(
      expenseId,
    );
    expect((await createExpense({ trainingProgramId: program.id }, narrowToken)).status).toBe(201);
  });

  it('shows a training program to a session trainer holding training_programs:view', async () => {
    const program = await createProgram('trained');
    await prisma.trainingSession.create({
      data: {
        trainingProgramId: program.id,
        trainerUserId: narrowUserId,
        title: 'Issue39 Trainer Session',
        scheduledAt: daysFromNow(1),
        scheduledEndAt: daysFromNow(2),
      },
    });
    const created = await createExpense({ trainingProgramId: program.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    expect((await api(narrowToken, `/expenses/${expenseId}`)).status).toBe(200);
    expect(expenseIds((await api(narrowToken, '/expenses?pageSize=100')).body)).toContain(
      expenseId,
    );
  });

  it('keeps client scope in force for training_programs:view_all', async () => {
    const clientLinked = await createProgram('view-all-client', { client: clientId });
    const clientLinkedExpense = await createExpense({ trainingProgramId: clientLinked.id });
    expect(clientLinkedExpense.status).toBe(201);
    const clientLinkedId = (clientLinkedExpense.body as { expense: { id: string } }).expense.id;

    const openProgram = await createProgram('view-all-open');
    const openExpense = await createExpense({ trainingProgramId: openProgram.id });
    expect(openExpense.status).toBe(201);
    const openId = (openExpense.body as { expense: { id: string } }).expense.id;

    // `noScopeToken` holds training_programs:view_all without clients:view.
    expect((await api(noScopeToken, `/expenses/${clientLinkedId}`)).status).toBe(404);
    expect((await api(noScopeToken, `/expenses/${openId}`)).status).toBe(200);

    // The operator holds both, so it sees the client-linked program as well.
    expect((await api(operatorToken, `/expenses/${clientLinkedId}`)).status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Placement source scope
  // -------------------------------------------------------------------------

  it('requires placements:view for placement-linked accounting records', async () => {
    const { mission } = await scopedClientFixture('placement-capability');
    const placement = await createPlacement(mission.id, 'placement-capability');
    const created = await createExpense({ missionPlacementId: placement.id });
    expect(created.status).toBe(201);
    const expenseId = (created.body as { expense: { id: string } }).expense.id;

    // The narrow role holds broad mission oversight but no placements:view.
    const hidden = await api(narrowToken, `/expenses/${expenseId}`);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
    expect(expenseIds((await api(narrowToken, '/expenses?pageSize=100')).body)).not.toContain(
      expenseId,
    );

    const blockedCreate = await createExpense({ missionPlacementId: placement.id }, narrowToken);
    expect(blockedCreate.status).toBe(404);
    expect(errorCode(blockedCreate.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');

    const profitPath = `/profitability?context=PLACEMENT&contextId=${placement.id}`;
    const blockedProfit = await api(narrowToken, profitPath);
    expect(blockedProfit.status).toBe(404);
    const missingProfit = await api(
      narrowToken,
      `/profitability?context=PLACEMENT&contextId=${randomUUID()}`,
    );
    expect(missingProfit.status).toBe(blockedProfit.status);
    expect(errorCode(missingProfit.body)).toBe(errorCode(blockedProfit.body));
    expect(errorCode(blockedProfit.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');

    // Adding placements:view alone, with no other permission change, is sufficient.
    await setRolePermissions(RoleName.CLIENT_USER, [
      ...narrowSourceScopePermissions,
      'placements:view',
    ]);
    try {
      expect((await api(narrowToken, `/expenses/${expenseId}`)).status).toBe(200);
      expect(expenseIds((await api(narrowToken, '/expenses?pageSize=100')).body)).toContain(
        expenseId,
      );
      expect((await createExpense({ missionPlacementId: placement.id }, narrowToken)).status).toBe(
        201,
      );
      expect((await api(narrowToken, profitPath)).status).toBe(200);
    } finally {
      await setRolePermissions(RoleName.CLIENT_USER, narrowSourceScopePermissions);
    }
  });

  // -------------------------------------------------------------------------
  // Bounded accounting list date windows
  // -------------------------------------------------------------------------

  it('requires a complete, ordered, bounded date window on accounting lists', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const within = '2026-06-01T00:00:00.000Z';
    const exactLimit = new Date(
      Date.parse(from) + MAX_ACCOUNTING_DATE_RANGE_DAYS * 86_400_000,
    ).toISOString();
    const overLimit = new Date(
      Date.parse(from) + MAX_ACCOUNTING_DATE_RANGE_DAYS * 86_400_000 + 1,
    ).toISOString();

    const windows: [string, string, string][] = [
      ['/payments', 'receivedFrom', 'receivedTo'],
      ['/expenses', 'expenseFrom', 'expenseTo'],
    ];

    for (const [path, fromKey, toKey] of windows) {
      const code =
        path === '/payments' ? 'INVALID_PAYMENT_LIST_QUERY' : 'INVALID_EXPENSE_LIST_QUERY';
      const query = (search: string) => api(operatorToken, `${path}?${search}`);

      expect((await query('page=1')).status).toBe(200);
      expect((await query(`${fromKey}=${from}&${toKey}=${within}`)).status).toBe(200);
      expect((await query(`${fromKey}=${from}&${toKey}=${exactLimit}`)).status).toBe(200);

      for (const search of [
        `${fromKey}=${from}`,
        `${toKey}=${within}`,
        `${fromKey}=${within}&${toKey}=${from}`,
        `${fromKey}=${from}&${toKey}=${overLimit}`,
      ]) {
        const rejected = await query(search);
        expect(rejected.status).toBe(400);
        expect(errorCode(rejected.body)).toBe(code);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Aggregate source scope
  // -------------------------------------------------------------------------

  it('keeps mission-linked invoices out of accounting totals without mission scope', async () => {
    const { localClient, mission } = await scopedClientFixture('aggregate-scope');
    const hidden = await issuedInvoice({
      totalCents: 30_000,
      client: localClient.id,
      mission: mission.id,
      dueInDays: -5,
    });
    await issuedInvoice({ totalCents: 7_000, client: localClient.id, dueInDays: -5 });

    const balancePath = `/receivables/client?clientId=${localClient.id}`;
    const overduePath = `/receivables/overdue?clientId=${localClient.id}`;
    const profitPath = `/profitability?context=CLIENT&contextId=${localClient.id}`;

    const limitedBalance = await api(limitedToken, balancePath);
    expect(limitedBalance.status).toBe(200);
    expect(receivableTotals(limitedBalance.body)).toEqual([
      expect.objectContaining({ currency: 'MAD', invoicedCents: 7_000 }),
    ]);

    const limitedOverdue = await api(limitedToken, overduePath);
    expect(
      (limitedOverdue.body as { rows: { invoiceId: string }[] }).rows.map((row) => row.invoiceId),
    ).not.toContain(hidden.id);

    const limitedProfit = await api(limitedToken, profitPath);
    expect(profitabilityTotals(limitedProfit.body)).toEqual([
      expect.objectContaining({ currency: 'MAD', revenueCents: 7_000 }),
    ]);

    // The operator holds broad mission oversight and sees the whole client.
    expect(receivableTotals((await api(operatorToken, balancePath)).body)).toEqual([
      expect.objectContaining({ currency: 'MAD', invoicedCents: 37_000 }),
    ]);

    // An active assignment alone makes the mission visible: no permission changes.
    await prisma.missionRecruiter.create({
      data: { missionId: mission.id, userId: limitedUserId, status: AssignmentStatus.ACTIVE },
    });

    expect(receivableTotals((await api(limitedToken, balancePath)).body)).toEqual([
      expect.objectContaining({ currency: 'MAD', invoicedCents: 37_000 }),
    ]);
    expect(
      ((await api(limitedToken, overduePath)).body as { rows: { invoiceId: string }[] }).rows.map(
        (row) => row.invoiceId,
      ),
    ).toContain(hidden.id);
    expect(profitabilityTotals((await api(limitedToken, profitPath)).body)).toEqual([
      expect.objectContaining({ currency: 'MAD', revenueCents: 37_000 }),
    ]);
  });

  it('keeps an out-of-scope aggregate context indistinguishable from a nonexistent one', async () => {
    const { mission } = await scopedClientFixture('indistinguishable');
    const paths = [
      `/profitability?context=RECRUITMENT_MISSION&contextId=`,
      `/profitability?context=PLACEMENT&contextId=`,
    ];

    for (const path of paths) {
      const hidden = await api(limitedToken, `${path}${mission.id}`);
      const missing = await api(limitedToken, `${path}${randomUUID()}`);
      expect(hidden.status).toBe(404);
      expect(missing.status).toBe(hidden.status);
      expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
      expect(errorCode(missing.body)).toBe(errorCode(hidden.body));
    }
  });

  // -------------------------------------------------------------------------
  // Money input range
  // -------------------------------------------------------------------------

  it('accepts the largest storable amount and rejects anything above the column range', async () => {
    const accepted = await createPayment(2_147_483_647);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: accepted.id } })).amountCents,
    ).toBe(2_147_483_647);

    const oversizedReference = `PAY39-${randomUUID().slice(0, 12)}`;
    const rejectedPayment = await api(operatorToken, '/payments', {
      method: 'POST',
      body: {
        reference: oversizedReference,
        clientId,
        receivedDate: new Date().toISOString(),
        currency: 'MAD',
        amountCents: 2_147_483_648,
        method: 'BANK_TRANSFER',
      },
    });
    // Rejected as request validation, before any persistence is attempted.
    expect(rejectedPayment.status).toBe(400);
    expect(errorCode(rejectedPayment.body)).toBe('INVALID_CREATE_PAYMENT_REQUEST');
    expect(await prisma.payment.count({ where: { reference: oversizedReference } })).toBe(0);

    const oversizedExpense = await createExpense({ amountCents: 2_147_483_648 });
    expect(oversizedExpense.status).toBe(400);
    expect(errorCode(oversizedExpense.body)).toBe('INVALID_CREATE_EXPENSE_REQUEST');

    const acceptedExpense = await createExpense({ amountCents: 2_147_483_647 });
    expect(acceptedExpense.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Receivables, balances, profitability
  // -------------------------------------------------------------------------

  it('reports client receivables separated by currency without mixing totals', async () => {
    const localClient = await prisma.client.create({
      data: { name: 'Issue39 Currency Client', normalizedName: 'issue39 currency client' },
    });
    await issuedInvoice({ totalCents: 10_000, currency: 'MAD', client: localClient.id });
    await issuedInvoice({ totalCents: 4_000, currency: 'EUR', client: localClient.id });

    const response = await api(operatorToken, `/receivables/client?clientId=${localClient.id}`);
    expect(response.status).toBe(200);
    const totals = (
      response.body as {
        receivables: {
          totalsByCurrency: {
            currency: string;
            invoicedCents: number;
            outstandingCents: number;
          }[];
        };
      }
    ).receivables.totalsByCurrency;

    expect(totals.map((row) => row.currency)).toEqual(['EUR', 'MAD']);
    expect(totals.find((row) => row.currency === 'MAD')?.invoicedCents).toBe(10_000);
    expect(totals.find((row) => row.currency === 'EUR')?.invoicedCents).toBe(4_000);
    // No row ever sums unlike currencies into a single figure.
    expect(totals.reduce((sum, row) => sum + row.outstandingCents, 0)).toBe(14_000);
    expect(totals.length).toBe(2);
  });

  it('lists overdue receivables with the outstanding balance only', async () => {
    const localClient = await prisma.client.create({
      data: { name: 'Issue39 Overdue Client', normalizedName: 'issue39 overdue client' },
    });
    const overdue = await issuedInvoice({
      totalCents: 12_000,
      dueInDays: -10,
      client: localClient.id,
    });
    await issuedInvoice({ totalCents: 5_000, dueInDays: 30, client: localClient.id });

    const response = await api(operatorToken, `/receivables/overdue?clientId=${localClient.id}`);
    expect(response.status).toBe(200);
    const rows = (
      response.body as {
        rows: { invoiceId: string; daysOverdue: number; amounts: { outstandingCents: number } }[];
      }
    ).rows;
    expect(rows.length).toBe(1);
    expect(rows[0]?.invoiceId).toBe(overdue.id);
    expect(rows[0]?.daysOverdue).toBeGreaterThanOrEqual(9);
    expect(rows[0]?.amounts.outstandingCents).toBe(12_000);
  });

  it('computes profitability from issued invoice revenue minus linked expenses', async () => {
    const localClient = await prisma.client.create({
      data: { name: 'Issue39 Profit Client', normalizedName: 'issue39 profit client' },
    });
    const mission = await prisma.recruitmentMission.create({
      data: { clientId: localClient.id, title: 'Issue39 Profit Mission', numberOfPositions: 1 },
    });
    await issuedInvoice({ totalCents: 30_000, client: localClient.id, mission: mission.id });
    // A canceled invoice must never contribute revenue.
    await issuedInvoice({
      totalCents: 99_000,
      client: localClient.id,
      mission: mission.id,
      status: InvoiceStatus.CANCELED,
    });
    const expense = await createExpense({
      clientId: localClient.id,
      recruitmentMissionId: mission.id,
      amountCents: 12_000,
    });
    expect(expense.status).toBe(201);

    const response = await api(
      operatorToken,
      `/profitability?context=RECRUITMENT_MISSION&contextId=${mission.id}`,
    );
    expect(response.status).toBe(200);
    const summary = (
      response.body as {
        profitability: {
          revenuePolicy: string;
          totalsByCurrency: {
            currency: string;
            revenueCents: number;
            expenseCents: number;
            marginCents: number;
          }[];
        };
      }
    ).profitability;
    expect(summary.revenuePolicy).toBe('ISSUED_INVOICE_REVENUE');
    const mad = summary.totalsByCurrency.find((row) => row.currency === 'MAD');
    expect(mad?.revenueCents).toBe(30_000);
    expect(mad?.expenseCents).toBe(12_000);
    expect(mad?.marginCents).toBe(18_000);
  });

  it('keeps received cash out of the profitability revenue basis', async () => {
    const localClient = await prisma.client.create({
      data: { name: 'Issue39 Cash Client', normalizedName: 'issue39 cash client' },
    });
    const mission = await prisma.recruitmentMission.create({
      data: { clientId: localClient.id, title: 'Issue39 Cash Mission', numberOfPositions: 1 },
    });
    const invoice = await issuedInvoice({
      totalCents: 20_000,
      client: localClient.id,
      mission: mission.id,
    });
    const payment = await createPayment(5_000, { clientId: localClient.id });
    await allocate(payment.id, invoice.id, 5_000);

    const response = await api(
      operatorToken,
      `/profitability?context=RECRUITMENT_MISSION&contextId=${mission.id}`,
    );
    const mad = (
      response.body as {
        profitability: { totalsByCurrency: { currency: string; revenueCents: number }[] };
      }
    ).profitability.totalsByCurrency.find((row) => row.currency === 'MAD');
    // Revenue stays at the issued invoice total, not the 5 000 actually received.
    expect(mad?.revenueCents).toBe(20_000);
  });

  // -------------------------------------------------------------------------
  // Authorization, scope, redaction
  // -------------------------------------------------------------------------

  it('denies every accounting endpoint without the accounting capability', async () => {
    const invoice = await issuedInvoice({ totalCents: 1_000 });
    for (const path of [
      '/payments',
      '/expenses',
      `/receivables/client?clientId=${clientId}`,
      '/receivables/overdue',
      `/profitability?context=CLIENT&contextId=${clientId}`,
      `/invoices/${invoice.id}/settlement`,
    ]) {
      const denied = await api(noAccountingToken, path);
      expect(denied.status).toBe(403);
    }
  });

  it('redacts every financial amount without commercial data access', async () => {
    const invoice = await issuedInvoice({ totalCents: 5_000 });
    const payment = await createPayment(5_000, { note: 'Issue39 confidential note' });
    await allocate(payment.id, invoice.id, 5_000);
    const expense = await createExpense({ clientId, vendorLabel: 'Issue39 vendor' });
    const expenseId = (expense.body as { expense: { id: string } }).expense.id;

    const redactedPayment = await api(noAmountsToken, `/payments/${payment.id}`);
    const paymentBody = (
      redactedPayment.body as {
        payment: { amounts: unknown; allocations: { amountCents: number | null }[] };
      }
    ).payment;
    expect(paymentBody.amounts).toBeNull();
    expect(paymentBody.allocations[0]?.amountCents).toBeNull();

    const redactedExpense = await api(noAmountsToken, `/expenses/${expenseId}`);
    const expenseBody = (
      redactedExpense.body as { expense: { amounts: unknown; vendorLabel: string | null } }
    ).expense;
    expect(expenseBody.amounts).toBeNull();
    expect(expenseBody.vendorLabel).toBeNull();

    const redactedSettlement = await settlement(invoice.id, noAmountsToken);
    expect(
      (redactedSettlement.body as { settlement: { amounts: unknown } }).settlement.amounts,
    ).toBeNull();

    // Aggregates are financial disclosure by definition, so they fail closed instead
    // of returning a redacted shell.
    const balances = await api(noAmountsToken, `/receivables/client?clientId=${clientId}`);
    expect(balances.status).toBe(403);
    expect(errorCode(balances.body)).toBe('COMMERCIAL_DATA_ACCESS_REQUIRED');
  });

  it('makes hidden and nonexistent payments indistinguishable without client scope', async () => {
    const payment = await createPayment(5_000);

    const hidden = await api(noScopeToken, `/payments/${payment.id}`);
    const missing = await api(noScopeToken, `/payments/${randomUUID()}`);
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
    expect(errorCode(hidden.body)).toBe('ACCOUNTING_RECORD_NOT_FOUND');
  });

  it('hides payments from list results without client scope', async () => {
    await createPayment(5_000);
    const listed = await api(noScopeToken, '/payments');
    expect(listed.status).toBe(200);
    expect((listed.body as { payments: unknown[] }).payments.length).toBe(0);
  });

  it('refuses financial writes without commercial data access', async () => {
    const denied = await api(noAmountsToken, '/payments', {
      method: 'POST',
      body: {
        reference: `PAY39-${randomUUID().slice(0, 12)}`,
        clientId,
        receivedDate: new Date().toISOString(),
        currency: 'MAD',
        amountCents: 1_000,
        method: 'CASH',
      },
    });
    expect(denied.status).toBe(403);
  });

  it('parses accounting query booleans explicitly', async () => {
    const payment = await createPayment(3_000);
    await api(operatorToken, `/payments/${payment.id}/archive`, { method: 'POST' });

    const omitted = await api(operatorToken, '/payments?pageSize=100');
    const ids = (omitted.body as { payments: { id: string }[] }).payments.map((p) => p.id);
    expect(ids).not.toContain(payment.id);

    const explicitFalse = await api(operatorToken, '/payments?pageSize=100&includeArchived=false');
    expect(explicitFalse.status).toBe(200);
    expect(
      (explicitFalse.body as { payments: { id: string }[] }).payments.map((p) => p.id),
    ).not.toContain(payment.id);

    const explicitTrue = await api(operatorToken, '/payments?pageSize=100&includeArchived=true');
    expect(
      (explicitTrue.body as { payments: { id: string }[] }).payments.map((p) => p.id),
    ).toContain(payment.id);

    for (const invalid of ['1', 'yes', 'TRUE']) {
      const rejected = await api(operatorToken, `/payments?includeArchived=${invalid}`);
      expect(rejected.status).toBe(400);
    }
  });

  it('records safe audit metadata without financial payloads', async () => {
    const invoice = await issuedInvoice({ totalCents: 5_000 });
    const payment = await createPayment(5_000, { note: 'Issue39 secret bank note' });
    await allocate(payment.id, invoice.id, 5_000);

    const entries = await prisma.auditLog.findMany({
      where: { entityType: { in: ['Payment', 'PaymentAllocation'] }, actorUserId: operatorUserId },
    });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.metadataSummary).not.toContain('Issue39 secret bank note');
      expect(entry.metadataSummary).not.toMatch(/\d{4,}/);
    }
  });
});
