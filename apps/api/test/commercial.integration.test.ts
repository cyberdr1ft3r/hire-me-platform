import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  InvoiceDetailResponseSchema,
  QuotationDetailResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  CandidateStatus,
  CommercialContractBusinessType,
  MissionCandidateState,
  OfferStatus,
  PlacementStatus,
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: {
    permissionId: string;
    grantedAt: Date;
    archivedAt: Date | null;
  }[];
};

const commercialPermissions = [
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

async function cleanCommercialTestRecords(): Promise<void> {
  await prisma.invoiceEvent.deleteMany({
    where: { invoice: { reference: { startsWith: 'I38-' } } },
  });
  await prisma.invoiceLine.deleteMany({
    where: { invoice: { reference: { startsWith: 'I38-' } } },
  });
  await prisma.invoice.deleteMany({ where: { reference: { startsWith: 'I38-' } } });
  await prisma.purchaseOrderEvent.deleteMany({
    where: { purchaseOrder: { reference: { startsWith: 'PO38-' } } },
  });
  await prisma.purchaseOrder.deleteMany({ where: { reference: { startsWith: 'PO38-' } } });
  await prisma.commercialContractEvent.deleteMany({
    where: { contract: { reference: { startsWith: 'C38-' } } },
  });
  await prisma.commercialContract.deleteMany({ where: { reference: { startsWith: 'C38-' } } });
  await prisma.commercialQuotationEvent.deleteMany({
    where: { quotation: { reference: { startsWith: 'Q38-' } } },
  });
  await prisma.commercialQuotationLine.deleteMany({
    where: { quotation: { reference: { startsWith: 'Q38-' } } },
  });
  await prisma.commercialQuotation.deleteMany({ where: { reference: { startsWith: 'Q38-' } } });
  await prisma.placementEvent.deleteMany({
    where: { placement: { mission: { title: { contains: 'Issue38' } } } },
  });
  await prisma.missionPlacement.deleteMany({
    where: { mission: { title: { contains: 'Issue38' } } },
  });
  await prisma.offerEvent.deleteMany({
    where: { offer: { mission: { title: { contains: 'Issue38' } } } },
  });
  await prisma.recruitmentOfferVersion.deleteMany({
    where: { mission: { title: { contains: 'Issue38' } } },
  });
  await prisma.recruitmentOffer.deleteMany({
    where: { mission: { title: { contains: 'Issue38' } } },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue38' } } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: { mission: { title: { contains: 'Issue38' } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: { mission: { title: { contains: 'Issue38' } } },
  });
  await prisma.recruitmentMission.deleteMany({ where: { title: { contains: 'Issue38' } } });
  await prisma.client.deleteMany({ where: { normalizedName: { contains: 'issue38' } } });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@commercial.test' } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          entityType: {
            in: ['CommercialQuotation', 'CommercialContract', 'PurchaseOrder', 'Invoice'],
          },
        },
        { targetUser: { normalizedEmail: { endsWith: '@commercial.test' } } },
      ],
    },
  });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@commercial.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@commercial.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@commercial.test' } } },
  });
  await prisma.user.deleteMany({ where: { normalizedEmail: { endsWith: '@commercial.test' } } });
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

async function ensureRoleWithPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for commercial tests.`,
      status: 'ACTIVE',
    },
  });
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for commercial tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for commercial tests.`,
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

async function ensureRoleWithOnlyPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for commercial tests.`,
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await ensureRoleWithPermissions(roleName, permissionCodes);
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
      permissionId: {
        notIn: snapshot.permissions.map((rolePermission) => rolePermission.permissionId),
      },
    },
  });
  for (const rolePermission of snapshot.permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: rolePermission.permissionId },
      },
      update: {
        grantedAt: rolePermission.grantedAt,
        archivedAt: rolePermission.archivedAt,
      },
      create: {
        roleId: role.id,
        permissionId: rolePermission.permissionId,
        grantedAt: rolePermission.grantedAt,
        archivedAt: rolePermission.archivedAt,
      },
    });
  }
}

async function loginAccessToken(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword }),
  });
  const body = AuthResponseSchema.parse(await response.json());
  return body.accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

async function readErrorBody(response: Response): Promise<unknown> {
  return response.json();
}

async function expectSameNotFoundEnvelope(
  hiddenResponse: Response,
  missingResponse: Response,
): Promise<void> {
  const hiddenBody = await readErrorBody(hiddenResponse);
  const missingBody = await readErrorBody(missingResponse);
  expect(hiddenResponse.status).toBe(404);
  expect(missingResponse.status).toBe(404);
  expect(hiddenBody).toEqual(missingBody);
}

async function createClientAndMission(title: string, recruiterUserId: string) {
  const client = await prisma.client.create({
    data: { name: `${title} Client`, normalizedName: `${title} client`.toLowerCase() },
  });
  const mission = await prisma.recruitmentMission.create({
    data: { clientId: client.id, title, numberOfPositions: 1 },
  });
  await prisma.missionRecruiter.create({
    data: { missionId: mission.id, userId: recruiterUserId },
  });
  return { client, mission };
}

async function createQuotation(
  baseUrl: string,
  token: string,
  clientId: string,
  reference: string,
) {
  const response = await fetch(`${baseUrl}/v1/commercial/quotations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      reference,
      clientId,
      currency: 'MAD',
      subtotalCents: 1,
      totalCents: 1,
      lines: [
        {
          description: 'Recruitment success fee',
          quantity: 2,
          unitPriceCents: 10000,
          taxRateBps: 2000,
        },
      ],
    }),
  });
  return QuotationDetailResponseSchema.parse(await response.json()).quotation;
}

async function createPlacementFixture(
  clientId: string,
  missionId: string,
  userId: string,
  emailPrefix: string,
  input: { status?: PlacementStatus; eligibleForInvoicing?: boolean } = {},
) {
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `Issue38 ${emailPrefix} Candidate`,
      email: `${emailPrefix}@commercial.test`,
      normalizedEmail: `${emailPrefix}@commercial.test`,
      status: CandidateStatus.ACTIVE,
    },
  });
  const process = await prisma.missionCandidate.create({
    data: {
      missionId,
      candidateId: candidate.id,
      responsibleRecruiterUserId: userId,
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
  const placement = await prisma.missionPlacement.create({
    data: {
      missionId,
      missionCandidateId: process.id,
      offerVersionId: version.id,
      status: input.status ?? PlacementStatus.CONFIRMED,
      integrationStartDate: new Date('2026-09-15T00:00:00.000Z'),
      eligibleForInvoicing: input.eligibleForInvoicing ?? true,
      invoicingEligibleAt: input.eligibleForInvoicing === false ? null : new Date(),
    },
  });
  return { candidate, process, offer, version, placement, clientId };
}

describe('commercial workflow foundation', () => {
  let app: INestApplication;
  let baseUrl: string;
  let commercialUserId: string;
  let scopedUserId: string;
  let commercialToken: string;
  let scopedToken: string;
  let noClientScopeToken: string;
  let viewerToken: string;
  let superAdminRoleSnapshot: RolePermissionSnapshot;
  let adminRoleSnapshot: RolePermissionSnapshot;
  let managerRoleSnapshot: RolePermissionSnapshot;
  let employeeRoleSnapshot: RolePermissionSnapshot;

  beforeAll(async () => {
    await cleanCommercialTestRecords();
    superAdminRoleSnapshot = await snapshotRolePermissions(RoleName.SUPER_ADMIN);
    adminRoleSnapshot = await snapshotRolePermissions(RoleName.ADMIN);
    managerRoleSnapshot = await snapshotRolePermissions(RoleName.MANAGER);
    employeeRoleSnapshot = await snapshotRolePermissions(RoleName.EMPLOYEE);
    await ensureRoleWithOnlyPermissions(RoleName.SUPER_ADMIN, commercialPermissions);
    await ensureRoleWithOnlyPermissions(RoleName.ADMIN, [
      'clients:view',
      'missions:view',
      'quotations:view',
      'contracts:view',
      'purchase_orders:view',
      'invoices:view',
    ]);
    await ensureRoleWithOnlyPermissions(
      RoleName.MANAGER,
      commercialPermissions.filter((permission) => permission !== 'mission_candidates:transfer'),
    );
    await ensureRoleWithOnlyPermissions(
      RoleName.EMPLOYEE,
      commercialPermissions.filter((permission) => permission !== 'clients:view'),
    );
    commercialUserId = await createUser('operator@commercial.test', RoleName.SUPER_ADMIN);
    scopedUserId = await createUser('scoped@commercial.test', RoleName.MANAGER);
    await createUser('no-client-scope@commercial.test', RoleName.EMPLOYEE);
    await createUser('viewer@commercial.test', RoleName.ADMIN);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors({ origin: 'http://127.0.0.1:5173', credentials: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    commercialToken = await loginAccessToken(baseUrl, 'operator@commercial.test');
    scopedToken = await loginAccessToken(baseUrl, 'scoped@commercial.test');
    noClientScopeToken = await loginAccessToken(baseUrl, 'no-client-scope@commercial.test');
    viewerToken = await loginAccessToken(baseUrl, 'viewer@commercial.test');
  });

  afterAll(async () => {
    await app?.close();
    await cleanCommercialTestRecords();
    await restoreRolePermissions(RoleName.SUPER_ADMIN, superAdminRoleSnapshot);
    await restoreRolePermissions(RoleName.ADMIN, adminRoleSnapshot);
    await restoreRolePermissions(RoleName.MANAGER, managerRoleSnapshot);
    await restoreRolePermissions(RoleName.EMPLOYEE, employeeRoleSnapshot);
    await prisma.$disconnect();
  });

  it('calculates quotation totals server-side and redacts amounts without commercial_data:access', async () => {
    const { client } = await createClientAndMission('Issue38 Totals', commercialUserId);
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-TOTALS');
    expect(quotation.amounts).toEqual({
      currency: 'MAD',
      subtotalCents: 20000,
      taxCents: 4000,
      totalCents: 24000,
    });

    const redacted = await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}`, {
      headers: authHeaders(viewerToken),
    });
    const redactedBody = QuotationDetailResponseSchema.parse(await redacted.json());
    expect(redactedBody.quotation.amounts).toBeNull();
    expect(redactedBody.quotation.lines).toBeNull();

    const denied = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(viewerToken),
      body: JSON.stringify({
        reference: 'Q38-DENIED',
        clientId: client.id,
        currency: 'MAD',
        lines: [{ description: 'Denied', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(denied.status).toBe(403);
    expect(await readErrorCode(denied)).toBe('PERMISSION_DENIED');
  });

  it('enforces quotation lifecycle transitions and blocks terminal mutation without audit noise', async () => {
    const { client } = await createClientAndMission(
      'Issue38 Quotation Lifecycle',
      commercialUserId,
    );
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-LIFECYCLE');
    await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ status: 'ISSUED', reason: 'Sent to client.' }),
    });
    const accepted = await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ status: 'ACCEPTED', reason: 'Client accepted.' }),
    });
    const blocked = await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}`, {
      method: 'PATCH',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        lines: [{ description: 'Late change', quantity: 1, unitPriceCents: 1, taxRateBps: 0 }],
      }),
    });
    expect(accepted.status).toBe(200);
    expect(blocked.status).toBe(409);
    expect(await readErrorCode(blocked)).toBe('QUOTATION_TERMINAL_MUTATION_BLOCKED');
    expect(
      await prisma.auditLog.count({
        where: { action: 'commercial.quotation.updated', entityId: quotation.id },
      }),
    ).toBe(0);
  });

  it('prevents cross-client quotation, contract, purchase-order, and invoice links', async () => {
    const first = await createClientAndMission('Issue38 Cross A', commercialUserId);
    const second = await createClientAndMission('Issue38 Cross B', commercialUserId);
    const quotation = await createQuotation(baseUrl, commercialToken, first.client.id, 'Q38-CROSS');
    await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ status: 'ISSUED' }),
    });
    await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ status: 'ACCEPTED' }),
    });

    const contractMismatch = await fetch(`${baseUrl}/v1/commercial/contracts`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'C38-CROSS',
        businessType: 'RECRUITMENT',
        clientId: second.client.id,
        sourceQuotationId: quotation.id,
        currency: 'MAD',
        contractValueCents: 20000,
        taxCents: 4000,
      }),
    });
    expect(await readErrorCode(contractMismatch)).toBe('CONTRACT_QUOTATION_CLIENT_MISMATCH');

    const contract = await prisma.commercialContract.create({
      data: {
        reference: 'C38-CROSS-SOURCE',
        businessType: CommercialContractBusinessType.RECRUITMENT,
        clientId: first.client.id,
        currency: 'MAD',
        contractValueCents: 20000,
        totalCents: 24000,
        taxCents: 4000,
      },
    });
    const poMismatch = await fetch(`${baseUrl}/v1/commercial/purchase-orders`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'PO38-CROSS',
        clientId: second.client.id,
        contractId: contract.id,
        currency: 'MAD',
        amountCents: 20000,
        taxCents: 4000,
      }),
    });
    expect(await readErrorCode(poMismatch)).toBe('PURCHASE_ORDER_CONTRACT_CLIENT_MISMATCH');

    const po = await prisma.purchaseOrder.create({
      data: {
        reference: 'PO38-CROSS-SOURCE',
        clientId: first.client.id,
        currency: 'MAD',
        amountCents: 20000,
        taxCents: 4000,
        totalCents: 24000,
        status: 'RECEIVED',
      },
    });
    const invoiceMismatch = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CROSS',
        clientId: second.client.id,
        purchaseOrderId: po.id,
        currency: 'MAD',
      }),
    });
    expect(await readErrorCode(invoiceMismatch)).toBe('INVOICE_PURCHASE_ORDER_CLIENT_MISMATCH');
  });

  it('keeps recruitment and training commercial contract business types distinct', async () => {
    const { client } = await createClientAndMission('Issue38 Contract Types', commercialUserId);
    for (const businessType of ['RECRUITMENT', 'TRAINING']) {
      const response = await fetch(`${baseUrl}/v1/commercial/contracts`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: JSON.stringify({
          reference: `C38-${businessType}`,
          businessType,
          clientId: client.id,
          currency: 'MAD',
          contractValueCents: 10000,
          taxCents: 2000,
        }),
      });
      expect(response.status).toBe(201);
    }
    expect(
      await prisma.commercialContract.count({
        where: { reference: { in: ['C38-RECRUITMENT', 'C38-TRAINING'] } },
      }),
    ).toBe(2);
  });

  it('snapshots issued invoice lines so later source changes do not rewrite history', async () => {
    const { client } = await createClientAndMission('Issue38 Snapshot', commercialUserId);
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-SNAPSHOT');
    await prisma.commercialQuotation.update({
      where: { id: quotation.id },
      data: { status: 'ACCEPTED' },
    });
    const created = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-SNAPSHOT',
        clientId: client.id,
        quotationId: quotation.id,
        currency: 'MAD',
      }),
    });
    const invoice = InvoiceDetailResponseSchema.parse(await created.json()).invoice;
    await fetch(`${baseUrl}/v1/commercial/invoices/${invoice.id}/issue`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ reason: 'Issue snapshot.' }),
    });
    await prisma.commercialQuotationLine.updateMany({
      where: { quotationId: quotation.id },
      data: { unitPriceCents: 999999, lineSubtotalCents: 999999, lineTotalCents: 999999 },
    });
    const reloaded = await fetch(`${baseUrl}/v1/commercial/invoices/${invoice.id}`, {
      headers: authHeaders(commercialToken),
    });
    const reloadedBody = InvoiceDetailResponseSchema.parse(await reloaded.json());
    expect(reloadedBody.invoice.amounts?.totalCents).toBe(24000);
    expect(reloadedBody.invoice.lines?.[0]?.unitPriceCents).toBe(10000);
  });

  it('requires authoritative eligible placements and rejects accepted-offer-only invoice attempts', async () => {
    const { client, mission } = await createClientAndMission('Issue38 Placement', commercialUserId);
    const candidate = await prisma.candidate.create({
      data: {
        displayName: 'Issue38 Placement Candidate',
        email: 'placement@commercial.test',
        normalizedEmail: 'placement@commercial.test',
        status: CandidateStatus.ACTIVE,
      },
    });
    const process = await prisma.missionCandidate.create({
      data: {
        missionId: mission.id,
        candidateId: candidate.id,
        responsibleRecruiterUserId: commercialUserId,
        state: MissionCandidateState.ACCEPTED,
      },
    });
    const offer = await prisma.recruitmentOffer.create({
      data: { missionId: mission.id, missionCandidateId: process.id },
    });
    await prisma.recruitmentOfferVersion.create({
      data: {
        offerId: offer.id,
        missionId: mission.id,
        missionCandidateId: process.id,
        versionNumber: 1,
        status: OfferStatus.ACCEPTED,
        isCurrent: true,
      },
    });
    const acceptedOnly = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ reference: 'I38-OFFER-ONLY', clientId: client.id, currency: 'MAD' }),
    });
    expect(await readErrorCode(acceptedOnly)).toBe('INVOICE_SOURCE_OR_LINES_REQUIRED');

    const version = await prisma.recruitmentOfferVersion.findFirstOrThrow({
      where: { offerId: offer.id },
    });
    const placement = await prisma.missionPlacement.create({
      data: {
        missionId: mission.id,
        missionCandidateId: process.id,
        offerVersionId: version.id,
        status: PlacementStatus.CONFIRMED,
        integrationStartDate: new Date('2026-09-15T00:00:00.000Z'),
        eligibleForInvoicing: true,
        invoicingEligibleAt: new Date(),
      },
    });
    const placed = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-PLACEMENT',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: placement.id,
        currency: 'MAD',
        lines: [
          { description: 'Placement fee', quantity: 1, unitPriceCents: 30000, taxRateBps: 2000 },
        ],
      }),
    });
    expect(placed.status).toBe(201);
  });

  it('keeps issued invoice history readable after parent client and mission archival', async () => {
    const { client, mission } = await createClientAndMission(
      'Issue38 Historical Invoice',
      scopedUserId,
    );
    const invoice = await prisma.invoice.create({
      data: {
        reference: 'I38-HISTORICAL-READ',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        currency: 'MAD',
        status: 'ISSUED',
        issueDate: new Date('2026-09-01T00:00:00.000Z'),
        issuedAt: new Date('2026-09-01T00:00:00.000Z'),
        subtotalCents: 1177550311,
        taxCents: 657168664,
        totalCents: 1834718975,
        events: {
          create: {
            actorUserId: commercialUserId,
            action: 'ISSUED',
            nextStatus: 'ISSUED',
            safeSummary: 'Historical invoice issued.',
          },
        },
      },
    });
    await prisma.recruitmentMission.update({
      where: { id: mission.id },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    await prisma.client.update({
      where: { id: client.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });

    const response = await fetch(`${baseUrl}/v1/commercial/invoices/${invoice.id}`, {
      headers: authHeaders(scopedToken),
    });
    expect(response.status).toBe(200);
    const body = InvoiceDetailResponseSchema.parse(await response.json()).invoice;
    expect(body.id).toBe(invoice.id);
    expect(body.history.some((event) => event.action === 'ISSUED')).toBe(true);
  });

  it('allows confirmed eligible placement invoicing after mission closure but blocks revoked or ineligible placements', async () => {
    const { client, mission } = await createClientAndMission(
      'Issue38 Closed Mission Placement',
      commercialUserId,
    );
    const eligible = await createPlacementFixture(
      client.id,
      mission.id,
      commercialUserId,
      'closed-placement-eligible',
    );
    await prisma.recruitmentMission.update({
      where: { id: mission.id },
      data: { state: 'CLOSED_WITH_RECRUITMENT', closedAt: new Date() },
    });

    const created = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CLOSED-MISSION-PLACEMENT',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: eligible.placement.id,
        currency: 'MAD',
        lines: [
          { description: 'Placement fee', quantity: 1, unitPriceCents: 50000, taxRateBps: 2000 },
        ],
      }),
    });
    expect(created.status).toBe(201);

    const ineligible = await createPlacementFixture(
      client.id,
      mission.id,
      commercialUserId,
      'closed-placement-ineligible',
      { eligibleForInvoicing: false },
    );
    const ineligibleResponse = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CLOSED-MISSION-INELIGIBLE',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: ineligible.placement.id,
        currency: 'MAD',
        lines: [
          { description: 'Placement fee', quantity: 1, unitPriceCents: 50000, taxRateBps: 2000 },
        ],
      }),
    });
    expect(ineligibleResponse.status).toBe(409);
    expect(await readErrorCode(ineligibleResponse)).toBe('PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED');

    const corrected = await createPlacementFixture(
      client.id,
      mission.id,
      commercialUserId,
      'closed-placement-corrected',
      { status: PlacementStatus.CORRECTED, eligibleForInvoicing: true },
    );
    const correctedResponse = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CLOSED-MISSION-CORRECTED',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: corrected.placement.id,
        currency: 'MAD',
        lines: [
          { description: 'Placement fee', quantity: 1, unitPriceCents: 50000, taxRateBps: 2000 },
        ],
      }),
    });
    expect(correctedResponse.status).toBe(409);
    expect(await readErrorCode(correctedResponse)).toBe('PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED');
  });

  it('preserves exact contract and purchase-order cents in derived invoice snapshots', async () => {
    const { client } = await createClientAndMission(
      'Issue38 Exact Source Snapshot',
      commercialUserId,
    );
    const contract = await prisma.commercialContract.create({
      data: {
        reference: 'C38-EXACT-SNAPSHOT',
        businessType: CommercialContractBusinessType.TRAINING,
        clientId: client.id,
        currency: 'MAD',
        status: 'ACTIVE',
        contractValueCents: 1177550311,
        taxCents: 657168664,
        totalCents: 1834718975,
      },
    });
    const contractInvoiceResponse = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CONTRACT-EXACT-SNAPSHOT',
        clientId: client.id,
        contractId: contract.id,
        currency: 'MAD',
      }),
    });
    expect(contractInvoiceResponse.status).toBe(201);
    const contractInvoice = InvoiceDetailResponseSchema.parse(
      await contractInvoiceResponse.json(),
    ).invoice;
    expect(contractInvoice.amounts).toMatchObject({
      subtotalCents: 1177550311,
      taxCents: 657168664,
      totalCents: 1834718975,
    });
    expect(contractInvoice.lines?.[0]).toMatchObject({
      lineSubtotalCents: 1177550311,
      lineTaxCents: 657168664,
      lineTotalCents: 1834718975,
    });

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        reference: 'PO38-EXACT-SNAPSHOT',
        clientId: client.id,
        currency: 'MAD',
        status: 'RECEIVED',
        amountCents: 10000,
        taxCents: 2000,
        totalCents: 12000,
      },
    });
    const poInvoiceResponse = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-PO-EXACT-SNAPSHOT',
        clientId: client.id,
        purchaseOrderId: purchaseOrder.id,
        currency: 'MAD',
      }),
    });
    expect(poInvoiceResponse.status).toBe(201);
    const poInvoice = InvoiceDetailResponseSchema.parse(await poInvoiceResponse.json()).invoice;
    expect(poInvoice.amounts).toMatchObject({
      subtotalCents: 10000,
      taxCents: 2000,
      totalCents: 12000,
    });
    expect(poInvoice.lines?.[0]).toMatchObject({
      lineSubtotalCents: 10000,
      lineTaxCents: 2000,
      lineTotalCents: 12000,
    });
  });

  it('prevents duplicate references and concurrent invoice issue duplicates', async () => {
    const { client } = await createClientAndMission('Issue38 Duplicate', commercialUserId);
    await createQuotation(baseUrl, commercialToken, client.id, 'Q38-DUPLICATE');
    const duplicate = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'Q38-DUPLICATE',
        clientId: client.id,
        currency: 'MAD',
        lines: [{ description: 'Duplicate', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(await readErrorCode(duplicate)).toBe('COMMERCIAL_QUOTATION_REFERENCE_EXISTS');

    const created = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CONCURRENT',
        clientId: client.id,
        currency: 'MAD',
        lines: [
          { description: 'Concurrent issue', quantity: 1, unitPriceCents: 100, taxRateBps: 0 },
        ],
      }),
    });
    const invoice = InvoiceDetailResponseSchema.parse(await created.json()).invoice;
    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/v1/commercial/invoices/${invoice.id}/issue`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: JSON.stringify({ reason: 'Concurrent A' }),
      }),
      fetch(`${baseUrl}/v1/commercial/invoices/${invoice.id}/issue`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: JSON.stringify({ reason: 'Concurrent B' }),
      }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(
      await prisma.invoiceEvent.count({ where: { invoiceId: invoice.id, action: 'ISSUED' } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'Invoice', entityId: invoice.id, action: 'commercial.invoice.issued' },
      }),
    ).toBe(1);
  });

  it('serializes concurrent quotation accept and cancel from issued state', async () => {
    const { client } = await createClientAndMission('Issue38 Quotation Race', commercialUserId);
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-RACE');
    await prisma.commercialQuotation.update({
      where: { id: quotation.id },
      data: { status: 'ISSUED' },
    });

    const [accept, cancel] = await Promise.all([
      fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: JSON.stringify({ status: 'ACCEPTED', reason: 'Accepted concurrently.' }),
      }),
      fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: JSON.stringify({ status: 'CANCELED', reason: 'Canceled concurrently.' }),
      }),
    ]);
    expect([accept.status, cancel.status].sort()).toEqual([200, 409]);
    const finalQuotation = await prisma.commercialQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
    });
    expect(['ACCEPTED', 'CANCELED']).toContain(finalQuotation.status);
    expect(
      await prisma.commercialQuotationEvent.count({
        where: {
          quotationId: quotation.id,
          action: 'STATUS_CHANGED',
          nextStatus: { in: ['ACCEPTED', 'CANCELED'] },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'CommercialQuotation',
          entityId: quotation.id,
          action: 'commercial.quotation.status_changed',
        },
      }),
    ).toBe(1);
  });

  it('serializes duplicate placement-backed invoice creation for one placement source', async () => {
    const { client, mission } = await createClientAndMission(
      'Issue38 Duplicate Placement Invoice',
      commercialUserId,
    );
    const { placement } = await createPlacementFixture(
      client.id,
      mission.id,
      commercialUserId,
      'duplicate-placement-invoice',
    );
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'commercial.invoice.created' },
    });
    const invoiceBody = (reference: string) =>
      JSON.stringify({
        reference,
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: placement.id,
        currency: 'MAD',
        lines: [
          { description: 'Placement fee', quantity: 1, unitPriceCents: 30000, taxRateBps: 2000 },
        ],
      });

    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/v1/commercial/invoices`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: invoiceBody('I38-DUPLICATE-PLACEMENT-A'),
      }),
      fetch(`${baseUrl}/v1/commercial/invoices`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: invoiceBody('I38-DUPLICATE-PLACEMENT-B'),
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await prisma.invoice.count({ where: { missionPlacementId: placement.id } })).toBe(1);
    expect(
      await prisma.invoiceEvent.count({
        where: { invoice: { missionPlacementId: placement.id }, action: 'CREATED' },
      }),
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'commercial.invoice.created' } })).toBe(
      auditCountBefore + 1,
    );
    const reloadedPlacement = await prisma.missionPlacement.findUniqueOrThrow({
      where: { id: placement.id },
    });
    expect(reloadedPlacement.eligibleForInvoicing).toBe(true);
  });

  it('combines commercial permissions with client and mission record scope', async () => {
    const assigned = await createClientAndMission('Issue38 Scope Assigned', scopedUserId);
    const hidden = await createClientAndMission('Issue38 Scope Hidden', commercialUserId);

    const assignedResponse = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'Q38-SCOPE-ASSIGNED',
        clientId: assigned.client.id,
        recruitmentMissionId: assigned.mission.id,
        currency: 'MAD',
        lines: [{ description: 'Scoped', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    const assignedQuotation = QuotationDetailResponseSchema.parse(
      await assignedResponse.json(),
    ).quotation;
    const hiddenResponse = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'Q38-SCOPE-HIDDEN',
        clientId: hidden.client.id,
        recruitmentMissionId: hidden.mission.id,
        currency: 'MAD',
        lines: [{ description: 'Hidden', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    const hiddenQuotation = QuotationDetailResponseSchema.parse(
      await hiddenResponse.json(),
    ).quotation;

    const scopedList = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      headers: authHeaders(scopedToken),
    });
    const scopedBody = (await scopedList.json()) as { quotations: { id: string }[] };
    expect(scopedBody.quotations.map((quotation) => quotation.id)).toContain(assignedQuotation.id);
    expect(scopedBody.quotations.map((quotation) => quotation.id)).not.toContain(
      hiddenQuotation.id,
    );

    const hiddenDetail = await fetch(`${baseUrl}/v1/commercial/quotations/${hiddenQuotation.id}`, {
      headers: authHeaders(scopedToken),
    });
    expect(hiddenDetail.status).toBe(404);
    expect(await readErrorCode(hiddenDetail)).toBe('COMMERCIAL_RECORD_NOT_FOUND');

    const scopedCreateHidden = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(scopedToken),
      body: JSON.stringify({
        reference: 'Q38-SCOPE-CREATE-HIDDEN',
        clientId: hidden.client.id,
        recruitmentMissionId: hidden.mission.id,
        currency: 'MAD',
        lines: [{ description: 'Hidden create', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(scopedCreateHidden.status).toBe(404);
    expect(await readErrorCode(scopedCreateHidden)).toBe('COMMERCIAL_SOURCE_NOT_FOUND');

    const noClientScope = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(noClientScopeToken),
      body: JSON.stringify({
        reference: 'Q38-NO-CLIENT-SCOPE',
        clientId: assigned.client.id,
        currency: 'MAD',
        lines: [{ description: 'No client', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(noClientScope.status).toBe(404);
    expect(await readErrorCode(noClientScope)).toBe('COMMERCIAL_SOURCE_NOT_FOUND');
  });

  it('returns indistinguishable responses for hidden and nonexistent commercial records and sources', async () => {
    const assigned = await createClientAndMission('Issue38 Missing Mask Assigned', scopedUserId);
    const hidden = await createClientAndMission('Issue38 Missing Mask Hidden', commercialUserId);
    const missingId = '00000000-0000-4000-8000-000000000038';
    const hiddenQuotation = await prisma.commercialQuotation.create({
      data: {
        reference: 'Q38-MASK-HIDDEN',
        clientId: hidden.client.id,
        recruitmentMissionId: hidden.mission.id,
        currency: 'MAD',
        subtotalCents: 100,
        totalCents: 100,
        lines: {
          create: {
            description: 'Hidden quotation',
            quantity: 1,
            unitPriceCents: 100,
            taxRateBps: 0,
            sortOrder: 0,
            lineSubtotalCents: 100,
            lineTaxCents: 0,
            lineTotalCents: 100,
          },
        },
      },
    });
    const hiddenContract = await prisma.commercialContract.create({
      data: {
        reference: 'C38-MASK-HIDDEN',
        businessType: CommercialContractBusinessType.RECRUITMENT,
        clientId: hidden.client.id,
        recruitmentMissionId: hidden.mission.id,
        currency: 'MAD',
        contractValueCents: 100,
        totalCents: 100,
        status: 'ACTIVE',
      },
    });
    const hiddenPurchaseOrder = await prisma.purchaseOrder.create({
      data: {
        reference: 'PO38-MASK-HIDDEN',
        clientId: hidden.client.id,
        recruitmentMissionId: hidden.mission.id,
        currency: 'MAD',
        amountCents: 100,
        taxCents: 0,
        totalCents: 100,
        status: 'RECEIVED',
      },
    });
    const hiddenInvoice = await prisma.invoice.create({
      data: {
        reference: 'I38-MASK-HIDDEN',
        clientId: hidden.client.id,
        recruitmentMissionId: hidden.mission.id,
        currency: 'MAD',
        status: 'ISSUED',
        subtotalCents: 100,
        totalCents: 100,
      },
    });

    const actionCases = [
      {
        hiddenPath: `/v1/commercial/quotations/${hiddenQuotation.id}`,
        missingPath: `/v1/commercial/quotations/${missingId}`,
        updateBody: { validUntil: '2026-10-01T00:00:00.000Z' },
        statusPath: `/v1/commercial/quotations/${hiddenQuotation.id}/status`,
        missingStatusPath: `/v1/commercial/quotations/${missingId}/status`,
        statusBody: { status: 'ISSUED' },
        archivePath: `/v1/commercial/quotations/${hiddenQuotation.id}/archive`,
        missingArchivePath: `/v1/commercial/quotations/${missingId}/archive`,
      },
      {
        hiddenPath: `/v1/commercial/contracts/${hiddenContract.id}`,
        missingPath: `/v1/commercial/contracts/${missingId}`,
        updateBody: { termsSummary: 'Updated' },
        statusPath: `/v1/commercial/contracts/${hiddenContract.id}/status`,
        missingStatusPath: `/v1/commercial/contracts/${missingId}/status`,
        statusBody: { status: 'COMPLETED' },
        archivePath: `/v1/commercial/contracts/${hiddenContract.id}/archive`,
        missingArchivePath: `/v1/commercial/contracts/${missingId}/archive`,
      },
      {
        hiddenPath: `/v1/commercial/purchase-orders/${hiddenPurchaseOrder.id}`,
        missingPath: `/v1/commercial/purchase-orders/${missingId}`,
        updateBody: { receivedDate: '2026-10-01T00:00:00.000Z' },
        statusPath: `/v1/commercial/purchase-orders/${hiddenPurchaseOrder.id}/status`,
        missingStatusPath: `/v1/commercial/purchase-orders/${missingId}/status`,
        statusBody: { status: 'CANCELED' },
        archivePath: `/v1/commercial/purchase-orders/${hiddenPurchaseOrder.id}/archive`,
        missingArchivePath: `/v1/commercial/purchase-orders/${missingId}/archive`,
      },
      {
        hiddenPath: `/v1/commercial/invoices/${hiddenInvoice.id}`,
        missingPath: `/v1/commercial/invoices/${missingId}`,
        updateBody: { dueDate: '2026-10-01T00:00:00.000Z' },
        statusPath: `/v1/commercial/invoices/${hiddenInvoice.id}/issue`,
        missingStatusPath: `/v1/commercial/invoices/${missingId}/issue`,
        statusBody: { reason: 'Issue' },
        archivePath: `/v1/commercial/invoices/${hiddenInvoice.id}/archive`,
        missingArchivePath: `/v1/commercial/invoices/${missingId}/archive`,
      },
    ];

    for (const item of actionCases) {
      await expectSameNotFoundEnvelope(
        await fetch(`${baseUrl}${item.hiddenPath}`, { headers: authHeaders(scopedToken) }),
        await fetch(`${baseUrl}${item.missingPath}`, { headers: authHeaders(scopedToken) }),
      );
      await expectSameNotFoundEnvelope(
        await fetch(`${baseUrl}${item.hiddenPath}`, {
          method: 'PATCH',
          headers: authHeaders(scopedToken),
          body: JSON.stringify(item.updateBody),
        }),
        await fetch(`${baseUrl}${item.missingPath}`, {
          method: 'PATCH',
          headers: authHeaders(scopedToken),
          body: JSON.stringify(item.updateBody),
        }),
      );
      await expectSameNotFoundEnvelope(
        await fetch(`${baseUrl}${item.statusPath}`, {
          method: 'POST',
          headers: authHeaders(scopedToken),
          body: JSON.stringify(item.statusBody),
        }),
        await fetch(`${baseUrl}${item.missingStatusPath}`, {
          method: 'POST',
          headers: authHeaders(scopedToken),
          body: JSON.stringify(item.statusBody),
        }),
      );
      await expectSameNotFoundEnvelope(
        await fetch(`${baseUrl}${item.archivePath}`, {
          method: 'POST',
          headers: authHeaders(scopedToken),
        }),
        await fetch(`${baseUrl}${item.missingArchivePath}`, {
          method: 'POST',
          headers: authHeaders(scopedToken),
        }),
      );
    }

    const sourceCases = [
      {
        hiddenBody: {
          reference: 'C38-MASK-HIDDEN-Q',
          businessType: 'RECRUITMENT',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          sourceQuotationId: hiddenQuotation.id,
          currency: 'MAD',
          contractValueCents: 100,
        },
        missingBody: {
          reference: 'C38-MASK-MISSING-Q',
          businessType: 'RECRUITMENT',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          sourceQuotationId: missingId,
          currency: 'MAD',
          contractValueCents: 100,
        },
        path: '/v1/commercial/contracts',
      },
      {
        hiddenBody: {
          reference: 'PO38-MASK-HIDDEN-C',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          contractId: hiddenContract.id,
          currency: 'MAD',
          amountCents: 100,
        },
        missingBody: {
          reference: 'PO38-MASK-MISSING-C',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          contractId: missingId,
          currency: 'MAD',
          amountCents: 100,
        },
        path: '/v1/commercial/purchase-orders',
      },
      {
        hiddenBody: {
          reference: 'I38-MASK-HIDDEN-PO',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          purchaseOrderId: hiddenPurchaseOrder.id,
          currency: 'MAD',
        },
        missingBody: {
          reference: 'I38-MASK-MISSING-PO',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          purchaseOrderId: missingId,
          currency: 'MAD',
        },
        path: '/v1/commercial/invoices',
      },
      {
        hiddenBody: {
          reference: 'I38-MASK-HIDDEN-CORRECTION',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          correctionOfInvoiceId: hiddenInvoice.id,
          currency: 'MAD',
          lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
        },
        missingBody: {
          reference: 'I38-MASK-MISSING-CORRECTION',
          clientId: assigned.client.id,
          recruitmentMissionId: assigned.mission.id,
          correctionOfInvoiceId: missingId,
          currency: 'MAD',
          lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
        },
        path: '/v1/commercial/invoices',
      },
    ];

    for (const item of sourceCases) {
      await expectSameNotFoundEnvelope(
        await fetch(`${baseUrl}${item.path}`, {
          method: 'POST',
          headers: authHeaders(scopedToken),
          body: JSON.stringify(item.hiddenBody),
        }),
        await fetch(`${baseUrl}${item.path}`, {
          method: 'POST',
          headers: authHeaders(scopedToken),
          body: JSON.stringify(item.missingBody),
        }),
      );
    }
  }, 15000);

  it('validates quotation to contract and purchase-order source context, currency, and state', async () => {
    const { client, mission } = await createClientAndMission('Issue38 Chain A', commercialUserId);
    const otherMission = await prisma.recruitmentMission.create({
      data: { clientId: client.id, title: 'Issue38 Chain B', numberOfPositions: 1 },
    });
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-CHAIN');
    await prisma.commercialQuotation.update({
      where: { id: quotation.id },
      data: { status: 'ACCEPTED', recruitmentMissionId: mission.id },
    });

    const contextMismatch = await fetch(`${baseUrl}/v1/commercial/contracts`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'C38-CHAIN-CONTEXT',
        businessType: 'RECRUITMENT',
        clientId: client.id,
        recruitmentMissionId: otherMission.id,
        sourceQuotationId: quotation.id,
        currency: 'MAD',
        contractValueCents: 100,
      }),
    });
    expect(await readErrorCode(contextMismatch)).toBe('CONTRACT_QUOTATION_CONTEXT_MISMATCH');

    const currencyMismatch = await fetch(`${baseUrl}/v1/commercial/contracts`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'C38-CHAIN-CURRENCY',
        businessType: 'RECRUITMENT',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        sourceQuotationId: quotation.id,
        currency: 'EUR',
        contractValueCents: 100,
      }),
    });
    expect(await readErrorCode(currencyMismatch)).toBe('CONTRACT_QUOTATION_CURRENCY_MISMATCH');

    const trainingBlocked = await fetch(`${baseUrl}/v1/commercial/contracts`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'C38-TRAINING-MISSION',
        businessType: 'TRAINING',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        currency: 'MAD',
        contractValueCents: 100,
      }),
    });
    expect(await readErrorCode(trainingBlocked)).toBe(
      'TRAINING_CONTRACT_RECRUITMENT_CONTEXT_BLOCKED',
    );

    const contract = await prisma.commercialContract.create({
      data: {
        reference: 'C38-CHAIN-DRAFT',
        businessType: CommercialContractBusinessType.RECRUITMENT,
        clientId: client.id,
        recruitmentMissionId: mission.id,
        currency: 'MAD',
        contractValueCents: 100,
        totalCents: 100,
        status: 'DRAFT',
      },
    });
    const draftContractPo = await fetch(`${baseUrl}/v1/commercial/purchase-orders`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'PO38-CHAIN-DRAFT-CONTRACT',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        contractId: contract.id,
        currency: 'MAD',
        amountCents: 100,
      }),
    });
    expect(await readErrorCode(draftContractPo)).toBe('PURCHASE_ORDER_ACTIVE_CONTRACT_REQUIRED');
  });

  it('validates correction invoice source access, context, currency, status, and placement linkage', async () => {
    const { client, mission } = await createClientAndMission(
      'Issue38 Correction A',
      commercialUserId,
    );
    const otherMission = await prisma.recruitmentMission.create({
      data: { clientId: client.id, title: 'Issue38 Correction B', numberOfPositions: 1 },
    });
    const source = await prisma.invoice.create({
      data: {
        reference: 'I38-CORRECTION-SOURCE',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        currency: 'MAD',
        status: 'ISSUED',
        subtotalCents: 100,
        totalCents: 100,
      },
    });
    const draftSource = await prisma.invoice.create({
      data: {
        reference: 'I38-CORRECTION-DRAFT',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        currency: 'MAD',
        status: 'DRAFT',
        subtotalCents: 100,
        totalCents: 100,
      },
    });

    const wrongContext = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CORRECTION-CONTEXT',
        clientId: client.id,
        recruitmentMissionId: otherMission.id,
        correctionOfInvoiceId: source.id,
        currency: 'MAD',
        lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(await readErrorCode(wrongContext)).toBe('INVOICE_CORRECTION_CONTEXT_MISMATCH');

    const wrongCurrency = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CORRECTION-CURRENCY',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        correctionOfInvoiceId: source.id,
        currency: 'EUR',
        lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(await readErrorCode(wrongCurrency)).toBe('INVOICE_CORRECTION_CURRENCY_MISMATCH');

    const wrongStatus = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CORRECTION-STATUS',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        correctionOfInvoiceId: draftSource.id,
        currency: 'MAD',
        lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(await readErrorCode(wrongStatus)).toBe('INVOICE_CORRECTION_ISSUED_SOURCE_REQUIRED');

    await prisma.invoice.update({
      where: { id: source.id },
      data: { correctionOfInvoiceId: source.id },
    });
    const cycle = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CORRECTION-CYCLE',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        correctionOfInvoiceId: source.id,
        currency: 'MAD',
        lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(await readErrorCode(cycle)).toBe('INVOICE_CORRECTION_CYCLE_BLOCKED');
    await prisma.invoice.update({
      where: { id: source.id },
      data: { correctionOfInvoiceId: null },
    });

    const placementLinked = await fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-CORRECTION-PLACEMENT',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: source.id,
        correctionOfInvoiceId: source.id,
        currency: 'MAD',
        lines: [{ description: 'Correction', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
      }),
    });
    expect(await readErrorCode(placementLinked)).toBe(
      'INVOICE_CORRECTION_PLACEMENT_DIRECT_LINK_BLOCKED',
    );
  });

  it('defaults lists to active records while archive retries avoid duplicate history and audit', async () => {
    const { client } = await createClientAndMission('Issue38 Archive', commercialUserId);
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-ARCHIVE');

    const firstArchive = await fetch(
      `${baseUrl}/v1/commercial/quotations/${quotation.id}/archive`,
      {
        method: 'POST',
        headers: authHeaders(commercialToken),
      },
    );
    const secondArchive = await fetch(
      `${baseUrl}/v1/commercial/quotations/${quotation.id}/archive`,
      {
        method: 'POST',
        headers: authHeaders(commercialToken),
      },
    );
    expect(firstArchive.status).toBe(200);
    expect(secondArchive.status).toBe(200);
    expect(
      await prisma.commercialQuotationEvent.count({
        where: { quotationId: quotation.id, action: 'ARCHIVED' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'CommercialQuotation',
          entityId: quotation.id,
          action: 'commercial.quotation.archived',
        },
      }),
    ).toBe(1);

    const defaultList = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      headers: authHeaders(commercialToken),
    });
    const defaultBody = (await defaultList.json()) as { quotations: { id: string }[] };
    expect(defaultBody.quotations.map((item) => item.id)).not.toContain(quotation.id);

    const archivedList = await fetch(`${baseUrl}/v1/commercial/quotations?includeArchived=true`, {
      headers: authHeaders(commercialToken),
    });
    const archivedBody = (await archivedList.json()) as { quotations: { id: string }[] };
    expect(archivedBody.quotations.map((item) => item.id)).toContain(quotation.id);

    const invalidFilter = await fetch(`${baseUrl}/v1/commercial/quotations?includeArchived=1`, {
      headers: authHeaders(commercialToken),
    });
    expect(invalidFilter.status).toBe(400);
  });

  it('redacts commercial history reasons without commercial_data access', async () => {
    const { client } = await createClientAndMission('Issue38 History Redaction', commercialUserId);
    const quotation = await createQuotation(baseUrl, commercialToken, client.id, 'Q38-REDACT');
    await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}/status`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({ status: 'ISSUED', reason: 'Contains sensitive price context.' }),
    });

    const redacted = await fetch(`${baseUrl}/v1/commercial/quotations/${quotation.id}`, {
      headers: authHeaders(viewerToken),
    });
    const body = QuotationDetailResponseSchema.parse(await redacted.json());
    expect(body.quotation.amounts).toBeNull();
    expect(body.quotation.history.some((event) => event.safeSummary?.includes('ISSUED'))).toBe(
      true,
    );
    expect(body.quotation.history.every((event) => event.reason === null)).toBe(true);
  });

  it('rejects monetary arithmetic overflow before PostgreSQL integer writes', async () => {
    const { client } = await createClientAndMission('Issue38 Money Bounds', commercialUserId);
    const overflowingLine = await fetch(`${baseUrl}/v1/commercial/quotations`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'Q38-MONEY-OVERFLOW',
        clientId: client.id,
        currency: 'MAD',
        lines: [
          {
            description: 'Overflow',
            quantity: 1_000_000,
            unitPriceCents: 2_000_000_000,
            taxRateBps: 0,
          },
        ],
      }),
    });
    expect(overflowingLine.status).toBe(400);
    expect(await readErrorCode(overflowingLine)).toBe('COMMERCIAL_MONEY_BOUNDS_EXCEEDED');

    const overflowingTotal = await fetch(`${baseUrl}/v1/commercial/contracts`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'C38-MONEY-OVERFLOW',
        businessType: 'TRAINING',
        clientId: client.id,
        currency: 'MAD',
        contractValueCents: 2_000_000_000,
        taxCents: 2_000_000_000,
      }),
    });
    expect(overflowingTotal.status).toBe(400);
    expect(await readErrorCode(overflowingTotal)).toBe('COMMERCIAL_MONEY_BOUNDS_EXCEEDED');
  });

  it('rechecks placement invoice eligibility after queued source writes acquire locks', async () => {
    const { client, mission } = await createClientAndMission(
      'Issue38 Placement Race',
      commercialUserId,
    );
    const candidate = await prisma.candidate.create({
      data: {
        displayName: 'Issue38 Placement Race Candidate',
        email: 'placement-race@commercial.test',
        normalizedEmail: 'placement-race@commercial.test',
        status: CandidateStatus.ACTIVE,
      },
    });
    const process = await prisma.missionCandidate.create({
      data: {
        missionId: mission.id,
        candidateId: candidate.id,
        responsibleRecruiterUserId: commercialUserId,
        state: MissionCandidateState.INTEGRATED,
      },
    });
    const offer = await prisma.recruitmentOffer.create({
      data: { missionId: mission.id, missionCandidateId: process.id },
    });
    const version = await prisma.recruitmentOfferVersion.create({
      data: {
        offerId: offer.id,
        missionId: mission.id,
        missionCandidateId: process.id,
        versionNumber: 1,
        status: OfferStatus.ACCEPTED,
        isCurrent: true,
      },
    });
    const placement = await prisma.missionPlacement.create({
      data: {
        missionId: mission.id,
        missionCandidateId: process.id,
        offerVersionId: version.id,
        status: PlacementStatus.CONFIRMED,
        integrationStartDate: new Date('2026-09-20T00:00:00.000Z'),
        eligibleForInvoicing: true,
        invoicingEligibleAt: new Date(),
      },
    });

    let releaseClientLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseClientLock = resolve;
    });
    const locker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id}::uuid FOR UPDATE`;
        await lockReleased;
      },
      { timeout: 10000 },
    );
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'commercial.invoice.created' },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const request = fetch(`${baseUrl}/v1/commercial/invoices`, {
      method: 'POST',
      headers: authHeaders(commercialToken),
      body: JSON.stringify({
        reference: 'I38-PLACEMENT-RACE',
        clientId: client.id,
        recruitmentMissionId: mission.id,
        missionPlacementId: placement.id,
        currency: 'MAD',
        lines: [
          { description: 'Placement fee', quantity: 1, unitPriceCents: 30000, taxRateBps: 0 },
        ],
      }),
    });
    await prisma.missionPlacement.update({
      where: { id: placement.id },
      data: { eligibleForInvoicing: false },
    });
    releaseClientLock();
    await locker;

    const response = await request;
    expect(response.status).toBe(409);
    expect(await readErrorCode(response)).toBe('PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED');
    expect(await prisma.invoice.count({ where: { reference: 'I38-PLACEMENT-RACE' } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: 'commercial.invoice.created' },
      }),
    ).toBe(auditCountBefore);
  });

  it('rolls back business rows and domain history when required commercial audit fails', async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AuditLog" ADD CONSTRAINT "commercial_test_block_audit" CHECK (action <> \'commercial.quotation.created\') NOT VALID',
    );
    try {
      const { client } = await createClientAndMission('Issue38 Audit Atomic', commercialUserId);
      const response = await fetch(`${baseUrl}/v1/commercial/quotations`, {
        method: 'POST',
        headers: authHeaders(commercialToken),
        body: JSON.stringify({
          reference: 'Q38-AUDIT-ROLLBACK',
          clientId: client.id,
          currency: 'MAD',
          lines: [{ description: 'Rollback', quantity: 1, unitPriceCents: 100, taxRateBps: 0 }],
        }),
      });
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(
        await prisma.commercialQuotation.count({ where: { reference: 'Q38-AUDIT-ROLLBACK' } }),
      ).toBe(0);
      expect(
        await prisma.commercialQuotationEvent.count({
          where: { quotation: { reference: 'Q38-AUDIT-ROLLBACK' } },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "commercial_test_block_audit"',
      );
    }
  });
});
