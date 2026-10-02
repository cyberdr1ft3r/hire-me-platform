import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AccountingPlacementOptionsResponseSchema,
  AuthResponseSchema,
  ExpenseDetailResponseSchema,
  ExpenseListResponseSchema,
  InvoiceSettlementResponseSchema,
  OverdueReceivableListResponseSchema,
  PaymentAllocationDetailResponseSchema,
  PaymentDetailResponseSchema,
  PaymentListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  CandidateStatus,
  InvoiceStatus,
  MissionCandidateState,
  OfferStatus,
  PermissionScopeType,
  PlacementStatus,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

/**
 * Issue #131 prerequisite (D-081): read-only Accounting presentation labels and the
 * bounded placement option source, against real PostgreSQL.
 */

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-131!';
const emailDomain = '@accounting131.test';
const marker = 'Issue131';
const prefixes = { payment: 'PAY131-', expense: 'EXP131-', invoice: 'INV131-' };

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: { permissionId: string; grantedAt: Date; archivedAt: Date | null }[];
};

const operatorPermissions = [
  'commercial_data:access',
  'clients:view',
  'missions:view',
  'mission_candidates:transfer',
  'placements:view',
  'training_programs:view',
  'training_programs:view_all',
  'invoices:view',
  'payments:view',
  'payments:manage',
  'expenses:view',
  'expenses:manage',
  'client_balances:view',
  'profitability:view',
];

/** Mission scope only through an active assignment, no broad oversight. */
const scopedPermissions = operatorPermissions.filter(
  (code) => code !== 'mission_candidates:transfer' && code !== 'training_programs:view_all',
);

/** Reads payments without invoice visibility or amounts. */
const limitedPermissions = ['clients:view', 'payments:view', 'expenses:view'];

/** Holds the placement capability but neither accounting capability that accepts one. */
const placementOnlyPermissions = [
  'commercial_data:access',
  'clients:view',
  'missions:view',
  'mission_candidates:transfer',
  'placements:view',
  'payments:view',
];

const narrowedRoles = [RoleName.TEAM_LEADER, RoleName.HR_MANAGER, RoleName.GUEST, RoleName.MANAGER];

async function cleanRecords(): Promise<void> {
  const ownUser = { normalizedEmail: { endsWith: emailDomain } };
  const ownMission = { title: { startsWith: marker } };
  const paymentWhere = { reference: { startsWith: prefixes.payment } };
  const expenseWhere = { reference: { startsWith: prefixes.expense } };
  const invoiceWhere = { reference: { startsWith: prefixes.invoice } };
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({ where: paymentWhere, select: { id: true } }),
    prisma.expense.findMany({ where: expenseWhere, select: { id: true } }),
  ]);
  const allocations = await prisma.paymentAllocation.findMany({
    where: { payment: paymentWhere },
    select: { id: true },
  });
  const entityIds = [...payments, ...expenses, ...allocations].map((row) => row.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: entityIds } }, { actor: ownUser }, { targetUser: ownUser }] },
  });
  await prisma.paymentAllocation.deleteMany({ where: { payment: paymentWhere } });
  await prisma.paymentEvent.deleteMany({ where: { payment: paymentWhere } });
  await prisma.payment.deleteMany({ where: paymentWhere });
  await prisma.expenseEvent.deleteMany({ where: { expense: expenseWhere } });
  await prisma.expense.deleteMany({ where: expenseWhere });
  await prisma.invoiceEvent.deleteMany({ where: { invoice: invoiceWhere } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: invoiceWhere } });
  await prisma.invoice.deleteMany({ where: invoiceWhere });
  await prisma.missionPlacement.deleteMany({ where: { mission: ownMission } });
  await prisma.recruitmentOfferVersion.deleteMany({ where: { mission: ownMission } });
  await prisma.recruitmentOffer.deleteMany({ where: { mission: ownMission } });
  await prisma.missionCandidate.deleteMany({ where: { mission: ownMission } });
  await prisma.missionRecruiter.deleteMany({ where: { mission: ownMission } });
  await prisma.recruitmentMission.deleteMany({ where: ownMission });
  await prisma.trainingProgram.deleteMany({
    where: { normalizedReference: { startsWith: 'issue131' } },
  });
  await prisma.client.deleteMany({ where: { normalizedName: { startsWith: 'issue131' } } });
  await prisma.candidate.deleteMany({ where: ownUser });
  await prisma.refreshSession.deleteMany({ where: { user: ownUser } });
  await prisma.passwordCredential.deleteMany({ where: { user: ownUser } });
  await prisma.userRole.deleteMany({ where: { user: ownUser } });
  await prisma.user.deleteMany({ where: ownUser });
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
    permissions: role.permissions.map((row) => ({
      permissionId: row.permissionId,
      grantedAt: row.grantedAt,
      archivedAt: row.archivedAt,
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
      permissionId: { notIn: snapshot.permissions.map((row) => row.permissionId) },
    },
  });
  for (const row of snapshot.permissions) {
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: role.id, permissionId: row.permissionId } },
      data: { grantedAt: row.grantedAt, archivedAt: row.archivedAt },
    });
  }
}

async function ensureRoleWithOnlyPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  for (const code of permissionCodes) {
    const permission = await ensurePermissionForTest(prisma, code, {
      description: `Synthetic ${code} permission for accounting presentation tests.`,
      scopeType: PermissionScopeType.EXPLICIT,
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function createUser(localPart: string, roleName: RoleName): Promise<string> {
  const email = `${localPart}${emailDomain}`;
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${localPart}`,
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

async function createClient(name: string) {
  return prisma.client.create({ data: { name, normalizedName: name.toLowerCase() } });
}

async function createMission(clientId: string, title: string, recruiterUserId?: string) {
  const mission = await prisma.recruitmentMission.create({
    data: { clientId, title: `${marker} ${title}`, numberOfPositions: 1 },
  });
  if (recruiterUserId) {
    await prisma.missionRecruiter.create({
      data: { missionId: mission.id, userId: recruiterUserId },
    });
  }
  return mission;
}

let sequence = 0;

async function createPlacement(
  missionId: string,
  responsibleUserId: string,
  options: { archived?: boolean } = {},
) {
  sequence += 1;
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `Hidden Candidate ${sequence}`,
      email: `candidate-${sequence}${emailDomain}`,
      normalizedEmail: `candidate-${sequence}${emailDomain}`,
      status: CandidateStatus.ACTIVE,
    },
  });
  const process = await prisma.missionCandidate.create({
    data: {
      missionId,
      candidateId: candidate.id,
      responsibleRecruiterUserId: responsibleUserId,
      state: MissionCandidateState.INTEGRATED,
    },
  });
  const offer = await prisma.recruitmentOffer.create({
    data: { missionId, missionCandidateId: process.id },
  });
  const version = await prisma.recruitmentOfferVersion.create({
    data: {
      offerId: offer.id,
      missionId,
      missionCandidateId: process.id,
      versionNumber: 1,
      status: OfferStatus.ACCEPTED,
      isCurrent: true,
    },
  });
  return prisma.missionPlacement.create({
    data: {
      missionId,
      missionCandidateId: process.id,
      offerVersionId: version.id,
      status: PlacementStatus.CONFIRMED,
      integrationStartDate: new Date('2026-10-05T00:00:00.000Z'),
      eligibleForInvoicing: true,
      invoicingEligibleAt: new Date(),
      archivedAt: options.archived ? new Date() : null,
    },
  });
}

async function issuedInvoice(
  suffix: string,
  clientId: string,
  options: { missionId?: string; dueInDays?: number } = {},
) {
  return prisma.invoice.create({
    data: {
      reference: `${prefixes.invoice}${suffix}`,
      clientId,
      recruitmentMissionId: options.missionId ?? null,
      currency: 'MAD',
      status: InvoiceStatus.ISSUED,
      issueDate: new Date(),
      issuedAt: new Date(),
      dueDate: new Date(Date.now() + (options.dueInDays ?? 30) * 86_400_000),
      subtotalCents: 100_000,
      taxCents: 0,
      totalCents: 100_000,
    },
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

describe('Issue #131 accounting presentation labels and placement options', () => {
  let app: INestApplication;
  let baseUrl: string;
  let operatorUserId: string;
  let scopedUserId: string;
  let operatorToken: string;
  let scopedToken: string;
  let financeToken: string;
  let limitedToken: string;
  let placementOnlyToken: string;
  const snapshots = new Map<RoleName, RolePermissionSnapshot>();

  async function login(localPart: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${localPart}${emailDomain}`, password: testPassword }),
    });
    expect(response.status).toBe(201);
    return AuthResponseSchema.parse(await response.json()).accessToken;
  }

  async function post(token: string, path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/v1/accounting${path}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  }

  async function get(token: string, path: string): Promise<Response> {
    return fetch(`${baseUrl}/v1/accounting${path}`, { headers: authHeaders(token) });
  }

  async function createPayment(suffix: string, clientId: string, amountCents = 100_000) {
    const response = await post(operatorToken, '/payments', {
      reference: `${prefixes.payment}${suffix}`,
      clientId,
      receivedDate: '2026-09-20T09:00:00.000Z',
      currency: 'MAD',
      amountCents,
      method: 'BANK_TRANSFER',
    });
    expect(response.status).toBe(201);
    return PaymentDetailResponseSchema.parse(await response.json()).payment;
  }

  async function allocate(paymentId: string, invoiceId: string, amountCents: number) {
    const response = await post(operatorToken, `/payments/${paymentId}/allocations`, {
      invoiceId,
      amountCents,
    });
    expect(response.status).toBe(201);
    return PaymentAllocationDetailResponseSchema.parse(await response.json());
  }

  async function readPayment(token: string, paymentId: string) {
    const response = await get(token, `/payments/${paymentId}`);
    expect(response.status).toBe(200);
    return PaymentDetailResponseSchema.parse(await response.json()).payment;
  }

  beforeAll(async () => {
    await cleanRecords();
    for (const role of narrowedRoles) {
      snapshots.set(role, await snapshotRolePermissions(role));
    }
    await ensureRoleWithOnlyPermissions(RoleName.TEAM_LEADER, operatorPermissions);
    await ensureRoleWithOnlyPermissions(RoleName.HR_MANAGER, scopedPermissions);
    await ensureRoleWithOnlyPermissions(RoleName.GUEST, limitedPermissions);
    await ensureRoleWithOnlyPermissions(RoleName.MANAGER, placementOnlyPermissions);
    operatorUserId = await createUser('operator', RoleName.TEAM_LEADER);
    scopedUserId = await createUser('scoped', RoleName.HR_MANAGER);
    await createUser('finance', RoleName.FINANCE_MANAGER);
    await createUser('limited', RoleName.GUEST);
    await createUser('placement-only', RoleName.MANAGER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    operatorToken = await login('operator');
    scopedToken = await login('scoped');
    financeToken = await login('finance');
    limitedToken = await login('limited');
    placementOnlyToken = await login('placement-only');
  });

  afterAll(async () => {
    await app?.close();
    await cleanRecords();
    for (const role of narrowedRoles) {
      const snapshot = snapshots.get(role);
      if (snapshot) {
        await restoreRolePermissions(role, snapshot);
      }
    }
    await prisma.$disconnect();
  });

  it('labels payments by client name and allocations by invoice and payment reference', async () => {
    const client = await createClient('Issue131 Atlas Client');
    const invoice = await issuedInvoice('ATLAS', client.id);
    const payment = await createPayment('ATLAS', client.id);
    expect(payment.display).toEqual({ clientName: 'Issue131 Atlas Client' });

    const allocated = await allocate(payment.id, invoice.id, 40_000);
    expect(allocated.allocation.display).toEqual({
      invoiceReference: 'INV131-ATLAS',
      paymentReference: 'PAY131-ATLAS',
    });
    expect(allocated.payment.allocations[0]?.display.invoiceReference).toBe('INV131-ATLAS');

    const list = PaymentListResponseSchema.parse(
      await (await get(financeToken, `/payments?clientId=${client.id}`)).json(),
    );
    expect(list.payments.map((row) => row.display.clientName)).toEqual(['Issue131 Atlas Client']);

    const finance = await readPayment(financeToken, payment.id);
    expect(finance.allocations[0]?.display).toEqual({
      invoiceReference: 'INV131-ATLAS',
      paymentReference: 'PAY131-ATLAS',
    });

    const settlementResponse = await get(financeToken, `/invoices/${invoice.id}/settlement`);
    expect(settlementResponse.status).toBe(200);
    const settlement = InvoiceSettlementResponseSchema.parse(
      await settlementResponse.json(),
    ).settlement;
    expect(settlement.allocations.map((row) => row.display)).toEqual([
      { invoiceReference: 'INV131-ATLAS', paymentReference: 'PAY131-ATLAS' },
    ]);
    expect(settlement.amounts?.outstandingCents).toBe(60_000);
  });

  it('never names an allocated invoice outside the reader invoice or mission scope', async () => {
    const client = await createClient('Issue131 Scope Client');
    const assigned = await createMission(client.id, 'Scope Assigned', scopedUserId);
    const unassigned = await createMission(client.id, 'Scope Unassigned', operatorUserId);
    const plainInvoice = await issuedInvoice('SCOPE-PLAIN', client.id);
    const assignedInvoice = await issuedInvoice('SCOPE-ASSIGNED', client.id, {
      missionId: assigned.id,
    });
    const hiddenInvoice = await issuedInvoice('SCOPE-HIDDEN', client.id, {
      missionId: unassigned.id,
    });
    const payment = await createPayment('SCOPE', client.id, 300_000);
    await allocate(payment.id, plainInvoice.id, 10_000);
    await allocate(payment.id, assignedInvoice.id, 20_000);
    await allocate(payment.id, hiddenInvoice.id, 30_000);

    const referencesFor = async (token: string) =>
      Object.fromEntries(
        (await readPayment(token, payment.id)).allocations.map((row) => [
          row.invoiceId,
          row.display.invoiceReference,
        ]),
      );

    expect(await referencesFor(operatorToken)).toEqual({
      [plainInvoice.id]: 'INV131-SCOPE-PLAIN',
      [assignedInvoice.id]: 'INV131-SCOPE-ASSIGNED',
      [hiddenInvoice.id]: 'INV131-SCOPE-HIDDEN',
    });
    expect(await referencesFor(scopedToken)).toEqual({
      [plainInvoice.id]: 'INV131-SCOPE-PLAIN',
      [assignedInvoice.id]: 'INV131-SCOPE-ASSIGNED',
      [hiddenInvoice.id]: null,
    });
    expect(await referencesFor(financeToken)).toEqual({
      [plainInvoice.id]: 'INV131-SCOPE-PLAIN',
      [assignedInvoice.id]: null,
      [hiddenInvoice.id]: null,
    });

    const limited = await readPayment(limitedToken, payment.id);
    expect(limited.display.clientName).toBe('Issue131 Scope Client');
    expect(limited.amounts).toBeNull();
    expect(limited.allocations.map((row) => row.display.invoiceReference)).toEqual([
      null,
      null,
      null,
    ]);
    expect(JSON.stringify(limited)).not.toContain('INV131-');

    const financeBody = JSON.stringify(await readPayment(financeToken, payment.id));
    expect(financeBody).not.toContain('INV131-SCOPE-HIDDEN');
    expect(financeBody).not.toContain('Scope Unassigned');
  });

  it('labels overdue receivables by client name', async () => {
    const client = await createClient('Issue131 Overdue Client');
    await issuedInvoice('OVERDUE', client.id, { dueInDays: -10 });

    const response = await get(financeToken, `/receivables/overdue?clientId=${client.id}`);
    expect(response.status).toBe(200);
    const body = OverdueReceivableListResponseSchema.parse(await response.json());
    expect(body.rows.map((row) => [row.reference, row.display.clientName])).toEqual([
      ['INV131-OVERDUE', 'Issue131 Overdue Client'],
    ]);
  });

  it('labels expense contexts only for contexts the reader can already reach', async () => {
    const client = await createClient('Issue131 Expense Client');
    const mission = await createMission(client.id, 'Expense Mission', operatorUserId);
    const placement = await createPlacement(mission.id, operatorUserId);
    const program = await prisma.trainingProgram.create({
      data: {
        reference: 'ISSUE131-TP-EXPENSE',
        normalizedReference: 'issue131-tp-expense',
        name: 'Issue131 Expense Program',
        clientId: client.id,
      },
    });
    const create = async (suffix: string, context: Record<string, string>) => {
      const response = await post(operatorToken, '/expenses', {
        reference: `${prefixes.expense}${suffix}`,
        expenseDate: '2026-09-21T09:00:00.000Z',
        category: 'TRAVEL',
        currency: 'MAD',
        amountCents: 5_000,
        ...context,
      });
      expect(response.status).toBe(201);
      return ExpenseDetailResponseSchema.parse(await response.json()).expense;
    };

    const clientOnly = await create('CLIENT', { clientId: client.id });
    const missionLinked = await create('MISSION', {
      clientId: client.id,
      recruitmentMissionId: mission.id,
    });
    const placementLinked = await create('PLACEMENT', {
      clientId: client.id,
      missionPlacementId: placement.id,
    });
    const programLinked = await create('PROGRAM', {
      clientId: client.id,
      trainingProgramId: program.id,
    });

    expect(clientOnly.display).toEqual({
      clientName: 'Issue131 Expense Client',
      missionTitle: null,
      placement: null,
      trainingProgramName: null,
    });
    expect(missionLinked.display.missionTitle).toBe('Issue131 Expense Mission');
    expect(placementLinked.display.placement).toEqual({
      missionTitle: 'Issue131 Expense Mission',
      integrationStartDate: '2026-10-05T00:00:00.000Z',
      confirmedAt: placement.confirmedAt.toISOString(),
    });
    expect(programLinked.display.trainingProgramName).toBe('Issue131 Expense Program');
    expect(JSON.stringify(placementLinked)).not.toMatch(/Hidden Candidate|candidate-\d+@/);

    const financeList = ExpenseListResponseSchema.parse(
      await (await get(financeToken, `/expenses?clientId=${client.id}`)).json(),
    );
    expect(financeList.expenses.map((row) => row.reference)).toEqual(['EXP131-CLIENT']);
    expect(financeList.expenses[0]?.display.clientName).toBe('Issue131 Expense Client');
    const financeBody = JSON.stringify(financeList);
    expect(financeBody).not.toContain('Expense Mission');
    expect(financeBody).not.toContain('Expense Program');

    const scopedList = ExpenseListResponseSchema.parse(
      await (await get(scopedToken, `/expenses?clientId=${client.id}`)).json(),
    );
    expect(scopedList.expenses.map((row) => row.reference)).toEqual(['EXP131-CLIENT']);
  });

  it('lists a bounded, scoped set of placements for one mission without candidate identity', async () => {
    const client = await createClient('Issue131 Placement Client');
    const mission = await createMission(client.id, 'Placement Mission', scopedUserId);
    const otherMission = await createMission(client.id, 'Placement Other', operatorUserId);
    const kept = await createPlacement(mission.id, scopedUserId);
    await createPlacement(mission.id, scopedUserId, { archived: true });
    await createPlacement(otherMission.id, operatorUserId);

    const operatorResponse = await get(
      operatorToken,
      `/placement-options?recruitmentMissionId=${mission.id}`,
    );
    expect(operatorResponse.status).toBe(200);
    const operatorBody = AccountingPlacementOptionsResponseSchema.parse(
      await operatorResponse.json(),
    );
    expect(operatorBody.options.map((option) => option.id)).toEqual([kept.id]);
    expect(Object.keys(operatorBody.options[0] ?? {}).sort()).toEqual([
      'confirmedAt',
      'id',
      'integrationStartDate',
      'missionTitle',
      'recruitmentMissionId',
    ]);
    expect(operatorBody.options[0]?.missionTitle).toBe('Issue131 Placement Mission');
    expect(JSON.stringify(operatorBody)).not.toMatch(/Hidden Candidate|candidate-\d+@/);
    expect(operatorBody).not.toHaveProperty('pagination');

    const scopedAssigned = AccountingPlacementOptionsResponseSchema.parse(
      await (
        await get(scopedToken, `/placement-options?recruitmentMissionId=${mission.id}`)
      ).json(),
    );
    expect(scopedAssigned.options.map((option) => option.id)).toEqual([kept.id]);
    const scopedHidden = await get(
      scopedToken,
      `/placement-options?recruitmentMissionId=${otherMission.id}`,
    );
    expect(scopedHidden.status).toBe(404);

    for (let index = 0; index < 21; index += 1) {
      await createPlacement(mission.id, scopedUserId);
    }
    const bounded = AccountingPlacementOptionsResponseSchema.parse(
      await (
        await get(operatorToken, `/placement-options?recruitmentMissionId=${mission.id}`)
      ).json(),
    );
    expect(bounded.options).toHaveLength(20);
  });

  it('denies the placement source to actors without the capabilities it serves', async () => {
    const client = await createClient('Issue131 Denied Client');
    const mission = await createMission(client.id, 'Denied Mission', operatorUserId);
    const path = `/placement-options?recruitmentMissionId=${mission.id}`;

    const finance = await get(financeToken, path);
    expect(finance.status).toBe(403);
    expect(await readErrorCode(finance)).toBe('PERMISSION_DENIED');

    const placementOnly = await get(placementOnlyToken, path);
    expect(placementOnly.status).toBe(403);
    expect(await readErrorCode(placementOnly)).toBe('ACCOUNTING_PERMISSION_REQUIRED');

    const missing = await get(
      operatorToken,
      '/placement-options?recruitmentMissionId=00000000-0000-4000-8000-000000000131',
    );
    expect(missing.status).toBe(404);

    const malformed = await get(operatorToken, '/placement-options?recruitmentMissionId=nope');
    expect(malformed.status).toBe(400);
    expect(await readErrorCode(malformed)).toBe('INVALID_ACCOUNTING_PLACEMENT_OPTIONS_QUERY');
  });
});
