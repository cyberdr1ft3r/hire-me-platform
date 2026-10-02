import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  CommercialContractDetailResponseSchema,
  CommercialPlacementOptionsResponseSchema,
  InvoiceDetailResponseSchema,
  InvoiceListResponseSchema,
  PurchaseOrderDetailResponseSchema,
  PurchaseOrderListResponseSchema,
  QuotationDetailResponseSchema,
  QuotationListResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  CandidateStatus,
  MissionCandidateState,
  OfferStatus,
  PermissionScopeType,
  PlacementStatus,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';
import { ensurePermissionForTest } from './support/permission-fixtures.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-127!';
const emailDomain = '@commercial127.test';
const missionMarker = 'Issue127';
const referencePrefixes = { quotation: 'Q127-', contract: 'C127-', po: 'PO127-', invoice: 'I127-' };

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
  'placement_commercial_eligibility:view',
  'quotations:view',
  'quotations:manage',
  'contracts:view',
  'contracts:manage',
  'purchase_orders:view',
  'purchase_orders:manage',
  'invoices:view',
  'invoices:manage',
];

async function cleanRecords(): Promise<void> {
  const ownMission = { title: { contains: missionMarker } };
  const ownUser = { normalizedEmail: { endsWith: emailDomain } };
  const [quotations, contracts, pos, invoices] = await Promise.all([
    prisma.commercialQuotation.findMany({
      where: { reference: { startsWith: referencePrefixes.quotation } },
      select: { id: true },
    }),
    prisma.commercialContract.findMany({
      where: { reference: { startsWith: referencePrefixes.contract } },
      select: { id: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { reference: { startsWith: referencePrefixes.po } },
      select: { id: true },
    }),
    prisma.invoice.findMany({
      where: { reference: { startsWith: referencePrefixes.invoice } },
      select: { id: true },
    }),
  ]);
  const entityIds = [...quotations, ...contracts, ...pos, ...invoices].map((row) => row.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: entityIds } }, { targetUser: ownUser }, { actor: ownUser }] },
  });
  const invoiceWhere = { reference: { startsWith: referencePrefixes.invoice } };
  await prisma.invoiceEvent.deleteMany({ where: { invoice: invoiceWhere } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: invoiceWhere } });
  await prisma.invoice.updateMany({ where: invoiceWhere, data: { correctionOfInvoiceId: null } });
  await prisma.invoice.deleteMany({ where: invoiceWhere });
  const poWhere = { reference: { startsWith: referencePrefixes.po } };
  await prisma.purchaseOrderEvent.deleteMany({ where: { purchaseOrder: poWhere } });
  await prisma.purchaseOrder.deleteMany({ where: poWhere });
  const contractWhere = { reference: { startsWith: referencePrefixes.contract } };
  await prisma.commercialContractEvent.deleteMany({ where: { contract: contractWhere } });
  await prisma.commercialContract.deleteMany({ where: contractWhere });
  const quotationWhere = { reference: { startsWith: referencePrefixes.quotation } };
  await prisma.commercialQuotationEvent.deleteMany({ where: { quotation: quotationWhere } });
  await prisma.commercialQuotationLine.deleteMany({ where: { quotation: quotationWhere } });
  await prisma.commercialQuotation.deleteMany({ where: quotationWhere });
  await prisma.placementEvent.deleteMany({ where: { placement: { mission: ownMission } } });
  await prisma.missionPlacement.deleteMany({ where: { mission: ownMission } });
  await prisma.offerEvent.deleteMany({ where: { offer: { mission: ownMission } } });
  await prisma.recruitmentOfferVersion.deleteMany({ where: { mission: ownMission } });
  await prisma.recruitmentOffer.deleteMany({ where: { mission: ownMission } });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: ownMission } },
  });
  await prisma.missionCandidate.deleteMany({ where: { mission: ownMission } });
  await prisma.missionRecruiter.deleteMany({ where: { mission: ownMission } });
  await prisma.recruitmentMission.deleteMany({ where: ownMission });
  await prisma.client.deleteMany({ where: { normalizedName: { contains: 'issue127' } } });
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
    permissions: role.permissions.map((rolePermission) => ({
      permissionId: rolePermission.permissionId,
      grantedAt: rolePermission.grantedAt,
      archivedAt: rolePermission.archivedAt,
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

/** Narrows a seeded role by archival and in-place reactivation (Issue #93). */
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
      description: `Synthetic ${code} permission for commercial presentation tests.`,
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

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

async function createClient(name: string) {
  return prisma.client.create({ data: { name, normalizedName: name.toLowerCase() } });
}

async function createMission(clientId: string, title: string, recruiterUserId?: string) {
  const mission = await prisma.recruitmentMission.create({
    data: { clientId, title: `${missionMarker} ${title}`, numberOfPositions: 1 },
  });
  if (recruiterUserId) {
    await prisma.missionRecruiter.create({
      data: { missionId: mission.id, userId: recruiterUserId },
    });
  }
  return mission;
}

let placementSequence = 0;

async function createPlacement(
  missionId: string,
  responsibleUserId: string,
  input: { status?: PlacementStatus; eligibleForInvoicing?: boolean; archived?: boolean } = {},
) {
  placementSequence += 1;
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `Hidden Candidate ${placementSequence}`,
      email: `candidate-${placementSequence}${emailDomain}`,
      normalizedEmail: `candidate-${placementSequence}${emailDomain}`,
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
      status: input.status ?? PlacementStatus.CONFIRMED,
      integrationStartDate: new Date('2026-10-05T00:00:00.000Z'),
      eligibleForInvoicing: input.eligibleForInvoicing ?? true,
      invoicingEligibleAt: input.eligibleForInvoicing === false ? null : new Date(),
      archivedAt: input.archived ? new Date() : null,
    },
  });
}

describe('Issue #127 commercial presentation labels and placement options', () => {
  let app: INestApplication;
  let baseUrl: string;
  let operatorUserId: string;
  let scopedUserId: string;
  let operatorToken: string;
  let scopedToken: string;
  let financeToken: string;
  let limitedToken: string;
  const snapshots = new Map<RoleName, RolePermissionSnapshot>();
  const narrowedRoles = [RoleName.TEAM_LEADER, RoleName.HR_MANAGER, RoleName.GUEST];

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
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  }

  async function get(token: string, path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { headers: authHeaders(token) });
  }

  async function placementOptions(token: string, query: Record<string, string>) {
    return get(token, `/v1/commercial/placement-options?${new URLSearchParams(query).toString()}`);
  }

  /** Builds an accepted quotation, active contract, received PO, and draft invoice. */
  async function createChain(clientId: string, suffix: string, recruitmentMissionId?: string) {
    const quotationResponse = await post(operatorToken, '/v1/commercial/quotations', {
      reference: `${referencePrefixes.quotation}${suffix}`,
      clientId,
      recruitmentMissionId,
      currency: 'MAD',
      lines: [{ description: 'Success fee', quantity: 1, unitPriceCents: 100000, taxRateBps: 0 }],
    });
    expect(quotationResponse.status).toBe(201);
    const quotation = QuotationDetailResponseSchema.parse(await quotationResponse.json()).quotation;
    for (const status of ['ISSUED', 'ACCEPTED']) {
      const transition = await post(
        operatorToken,
        `/v1/commercial/quotations/${quotation.id}/status`,
        { status },
      );
      expect(transition.status).toBe(200);
    }
    const contractResponse = await post(operatorToken, '/v1/commercial/contracts', {
      reference: `${referencePrefixes.contract}${suffix}`,
      businessType: 'RECRUITMENT',
      clientId,
      recruitmentMissionId,
      sourceQuotationId: quotation.id,
      currency: 'MAD',
      contractValueCents: 100000,
    });
    expect(contractResponse.status).toBe(201);
    const contract = CommercialContractDetailResponseSchema.parse(
      await contractResponse.json(),
    ).contract;
    expect(
      (
        await post(operatorToken, `/v1/commercial/contracts/${contract.id}/status`, {
          status: 'ACTIVE',
        })
      ).status,
    ).toBe(200);
    const poResponse = await post(operatorToken, '/v1/commercial/purchase-orders', {
      reference: `${referencePrefixes.po}${suffix}`,
      clientId,
      recruitmentMissionId,
      quotationId: quotation.id,
      contractId: contract.id,
      currency: 'MAD',
      amountCents: 100000,
    });
    expect(poResponse.status).toBe(201);
    const purchaseOrder = PurchaseOrderDetailResponseSchema.parse(
      await poResponse.json(),
    ).purchaseOrder;
    expect(
      (
        await post(operatorToken, `/v1/commercial/purchase-orders/${purchaseOrder.id}/status`, {
          status: 'RECEIVED',
        })
      ).status,
    ).toBe(200);
    const invoiceResponse = await post(operatorToken, '/v1/commercial/invoices', {
      reference: `${referencePrefixes.invoice}${suffix}`,
      clientId,
      recruitmentMissionId,
      quotationId: quotation.id,
      contractId: contract.id,
      purchaseOrderId: purchaseOrder.id,
      currency: 'MAD',
    });
    expect(invoiceResponse.status).toBe(201);
    const invoice = InvoiceDetailResponseSchema.parse(await invoiceResponse.json()).invoice;
    return { quotation, contract, purchaseOrder, invoice };
  }

  beforeAll(async () => {
    await cleanRecords();
    for (const role of narrowedRoles) {
      snapshots.set(role, await snapshotRolePermissions(role));
    }
    await ensureRoleWithOnlyPermissions(RoleName.TEAM_LEADER, operatorPermissions);
    await ensureRoleWithOnlyPermissions(
      RoleName.HR_MANAGER,
      operatorPermissions.filter((code) => code !== 'mission_candidates:transfer'),
    );
    await ensureRoleWithOnlyPermissions(RoleName.GUEST, ['clients:view', 'invoices:view']);
    operatorUserId = await createUser('operator', RoleName.TEAM_LEADER);
    scopedUserId = await createUser('scoped', RoleName.HR_MANAGER);
    await createUser('finance', RoleName.FINANCE_MANAGER);
    await createUser('limited', RoleName.GUEST);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    operatorToken = await login('operator');
    scopedToken = await login('scoped');
    financeToken = await login('finance');
    limitedToken = await login('limited');
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

  it('labels the linked devis, contract, commande, and facture chain by human reference', async () => {
    const client = await createClient('Issue127 Chain Client');
    const chain = await createChain(client.id, 'CHAIN');

    const quotation = QuotationDetailResponseSchema.parse(
      await (await get(operatorToken, `/v1/commercial/quotations/${chain.quotation.id}`)).json(),
    ).quotation;
    expect(quotation.display).toEqual({
      clientName: 'Issue127 Chain Client',
      missionTitle: null,
      linkedQuotationReference: null,
      linkedContractReference: null,
      linkedPurchaseOrderReference: null,
      correctionOfInvoiceReference: null,
      placement: null,
    });
    const contract = CommercialContractDetailResponseSchema.parse(
      await (await get(operatorToken, `/v1/commercial/contracts/${chain.contract.id}`)).json(),
    ).contract;
    expect(contract.display.linkedQuotationReference).toBe('Q127-CHAIN');
    const po = PurchaseOrderListResponseSchema.parse(
      await (
        await get(operatorToken, `/v1/commercial/purchase-orders?clientId=${client.id}`)
      ).json(),
    ).purchaseOrders[0];
    expect(po?.display).toMatchObject({
      clientName: 'Issue127 Chain Client',
      linkedQuotationReference: 'Q127-CHAIN',
      linkedContractReference: 'C127-CHAIN',
    });
    const invoice = InvoiceDetailResponseSchema.parse(
      await (await get(operatorToken, `/v1/commercial/invoices/${chain.invoice.id}`)).json(),
    ).invoice;
    expect(invoice.display).toMatchObject({
      clientName: 'Issue127 Chain Client',
      missionTitle: null,
      linkedQuotationReference: 'Q127-CHAIN',
      linkedContractReference: 'C127-CHAIN',
      linkedPurchaseOrderReference: 'PO127-CHAIN',
      placement: null,
    });
  });

  it('withholds linked references the actor cannot view and keeps amounts redacted', async () => {
    const client = await createClient('Issue127 Limited Client');
    const chain = await createChain(client.id, 'LIMITED');

    const response = await get(limitedToken, `/v1/commercial/invoices/${chain.invoice.id}`);
    expect(response.status).toBe(200);
    const invoice = InvoiceDetailResponseSchema.parse(await response.json()).invoice;
    expect(invoice.display).toEqual({
      clientName: 'Issue127 Limited Client',
      missionTitle: null,
      linkedQuotationReference: null,
      linkedContractReference: null,
      linkedPurchaseOrderReference: null,
      correctionOfInvoiceReference: null,
      placement: null,
    });
    expect(invoice.amounts).toBeNull();
    expect(invoice.lines).toBeNull();

    const quotationList = await get(limitedToken, '/v1/commercial/quotations');
    expect(quotationList.status).toBe(403);
  });

  it('gives the Finance Manager labelled client-scoped records without recruitment visibility', async () => {
    const client = await createClient('Issue127 Finance Client');
    const mission = await createMission(client.id, 'Finance Hidden Mission', operatorUserId);
    const plain = await createChain(client.id, 'FIN-PLAIN');
    const missionLinked = await createChain(client.id, 'FIN-MISSION', mission.id);

    const list = InvoiceListResponseSchema.parse(
      await (await get(financeToken, `/v1/commercial/invoices?clientId=${client.id}`)).json(),
    );
    expect(list.invoices.map((row) => row.reference)).toEqual(['I127-FIN-PLAIN']);
    expect(list.invoices[0]?.display).toMatchObject({
      clientName: 'Issue127 Finance Client',
      missionTitle: null,
      linkedPurchaseOrderReference: 'PO127-FIN-PLAIN',
    });
    expect(list.invoices[0]?.amounts?.totalCents).toBe(100000);

    const hidden = await get(financeToken, `/v1/commercial/invoices/${missionLinked.invoice.id}`);
    expect(hidden.status).toBe(404);
    expect(JSON.stringify(list)).not.toContain('Finance Hidden Mission');

    const quotations = QuotationListResponseSchema.parse(
      await (await get(financeToken, `/v1/commercial/quotations?clientId=${client.id}`)).json(),
    );
    expect(quotations.quotations.map((row) => row.id)).toEqual([plain.quotation.id]);

    const options = await placementOptions(financeToken, { clientId: client.id });
    expect(options.status).toBe(403);
    expect(await readErrorCode(options)).toBe('PLACEMENT_COMMERCIAL_ELIGIBILITY_REQUIRED');
  });

  it('labels mission context and placements only by mission title and dates', async () => {
    const client = await createClient('Issue127 Placement Label Client');
    const mission = await createMission(client.id, 'Placement Label Mission', operatorUserId);
    const placement = await createPlacement(mission.id, operatorUserId);
    const created = await post(operatorToken, '/v1/commercial/invoices', {
      reference: 'I127-PLACEMENT-LABEL',
      clientId: client.id,
      recruitmentMissionId: mission.id,
      missionPlacementId: placement.id,
      currency: 'MAD',
      lines: [{ description: 'Placement fee', quantity: 1, unitPriceCents: 5000, taxRateBps: 0 }],
    });
    expect(created.status).toBe(201);
    const invoice = InvoiceDetailResponseSchema.parse(await created.json()).invoice;
    expect(invoice.display.missionTitle).toBe('Issue127 Placement Label Mission');
    expect(invoice.display.placement).toEqual({
      integrationStartDate: '2026-10-05T00:00:00.000Z',
      confirmedAt: placement.confirmedAt.toISOString(),
    });
    expect(JSON.stringify(invoice)).not.toContain('Hidden Candidate');
  });

  it('lists only actionable, scoped, eligible placements without candidate identity', async () => {
    const client = await createClient('Issue127 Options Client');
    const otherClient = await createClient('Issue127 Options Other Client');
    const assignedMission = await createMission(client.id, 'Options Assigned', scopedUserId);
    const unassignedMission = await createMission(client.id, 'Options Unassigned', operatorUserId);
    const closedMission = await createMission(client.id, 'Options Closed', operatorUserId);
    const canceledMission = await createMission(client.id, 'Options Canceled', operatorUserId);
    const otherMission = await createMission(otherClient.id, 'Options Other', operatorUserId);

    const assigned = await createPlacement(assignedMission.id, scopedUserId);
    const unassigned = await createPlacement(unassignedMission.id, operatorUserId);
    const closed = await createPlacement(closedMission.id, operatorUserId);
    await prisma.recruitmentMission.update({
      where: { id: closedMission.id },
      data: { state: 'CLOSED_WITH_RECRUITMENT', closedAt: new Date() },
    });
    await createPlacement(canceledMission.id, operatorUserId);
    await prisma.recruitmentMission.update({
      where: { id: canceledMission.id },
      data: { state: 'CANCELED' },
    });
    await createPlacement(assignedMission.id, scopedUserId, { eligibleForInvoicing: false });
    await createPlacement(assignedMission.id, scopedUserId, { status: PlacementStatus.CORRECTED });
    await createPlacement(assignedMission.id, scopedUserId, { archived: true });
    await createPlacement(otherMission.id, operatorUserId);

    const operatorResponse = await placementOptions(operatorToken, { clientId: client.id });
    expect(operatorResponse.status).toBe(200);
    const operatorBody = CommercialPlacementOptionsResponseSchema.parse(
      await operatorResponse.json(),
    );
    expect(operatorBody.options.map((option) => option.id).sort()).toEqual(
      [assigned.id, unassigned.id, closed.id].sort(),
    );
    expect(Object.keys(operatorBody.options[0] ?? {}).sort()).toEqual([
      'confirmedAt',
      'id',
      'integrationStartDate',
      'missionTitle',
      'recruitmentMissionId',
    ]);
    expect(JSON.stringify(operatorBody)).not.toMatch(/Hidden Candidate|candidate-\d+@/);

    const scopedBody = CommercialPlacementOptionsResponseSchema.parse(
      await (await placementOptions(scopedToken, { clientId: client.id })).json(),
    );
    expect(scopedBody.options.map((option) => option.id)).toEqual([assigned.id]);

    const filtered = CommercialPlacementOptionsResponseSchema.parse(
      await (
        await placementOptions(operatorToken, {
          clientId: client.id,
          recruitmentMissionId: closedMission.id,
        })
      ).json(),
    );
    expect(filtered.options.map((option) => option.id)).toEqual([closed.id]);

    const searched = CommercialPlacementOptionsResponseSchema.parse(
      await (
        await placementOptions(operatorToken, { clientId: client.id, search: 'unassigned' })
      ).json(),
    );
    expect(searched.options.map((option) => option.id)).toEqual([unassigned.id]);

    const invoiced = await post(operatorToken, '/v1/commercial/invoices', {
      reference: 'I127-OPTIONS-USED',
      clientId: client.id,
      recruitmentMissionId: unassignedMission.id,
      missionPlacementId: unassigned.id,
      currency: 'MAD',
      lines: [{ description: 'Placement fee', quantity: 1, unitPriceCents: 5000, taxRateBps: 0 }],
    });
    expect(invoiced.status).toBe(201);
    const afterInvoice = CommercialPlacementOptionsResponseSchema.parse(
      await (await placementOptions(operatorToken, { clientId: client.id })).json(),
    );
    expect(afterInvoice.options.map((option) => option.id)).not.toContain(unassigned.id);

    await prisma.client.update({ where: { id: client.id }, data: { archivedAt: new Date() } });
    const archivedClient = CommercialPlacementOptionsResponseSchema.parse(
      await (await placementOptions(operatorToken, { clientId: client.id })).json(),
    );
    expect(archivedClient.options).toEqual([]);
  });

  it('bounds placement options to 20 rows and rejects unauthorized or malformed requests', async () => {
    const client = await createClient('Issue127 Bounded Client');
    const mission = await createMission(client.id, 'Bounded Mission', operatorUserId);
    for (let index = 0; index < 21; index += 1) {
      await createPlacement(mission.id, operatorUserId);
    }
    const bounded = CommercialPlacementOptionsResponseSchema.parse(
      await (await placementOptions(operatorToken, { clientId: client.id })).json(),
    );
    expect(bounded.options).toHaveLength(20);
    expect(bounded).not.toHaveProperty('pagination');

    const missing = CommercialPlacementOptionsResponseSchema.parse(
      await (
        await placementOptions(operatorToken, { clientId: '00000000-0000-4000-8000-000000000127' })
      ).json(),
    );
    expect(missing.options).toEqual([]);

    const limited = await placementOptions(limitedToken, { clientId: client.id });
    expect(limited.status).toBe(403);
    expect(await readErrorCode(limited)).toBe('PERMISSION_DENIED');

    const malformed = await placementOptions(operatorToken, { clientId: 'not-a-uuid' });
    expect(malformed.status).toBe(400);
    expect(await readErrorCode(malformed)).toBe('INVALID_COMMERCIAL_PLACEMENT_OPTIONS_QUERY');
  });
});
