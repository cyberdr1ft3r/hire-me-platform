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
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

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

describe('commercial workflow foundation', () => {
  let app: INestApplication;
  let baseUrl: string;
  let commercialUserId: string;
  let commercialToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    await cleanCommercialTestRecords();
    commercialUserId = await createUser('operator@commercial.test', RoleName.SUPER_ADMIN);
    await createUser('viewer@commercial.test', RoleName.ADMIN);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors({ origin: 'http://127.0.0.1:5173', credentials: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    commercialToken = await loginAccessToken(baseUrl, 'operator@commercial.test');
    viewerToken = await loginAccessToken(baseUrl, 'viewer@commercial.test');
  });

  afterAll(async () => {
    await app?.close();
    await cleanCommercialTestRecords();
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
});
