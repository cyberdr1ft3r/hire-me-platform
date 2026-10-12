import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { PermissionsService } from '../src/auth/permissions.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import {
  CandidateStatus,
  DocumentVersionSource,
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
 * Issue #168 / D-086: FINANCE_MANAGER works with mission-linked Commercial,
 * Accounting, generated-document, and financial-signing records through the bounded
 * `recruitment_financial_context:view` capability, without becoming a recruitment
 * user. The seeded FINANCE_MANAGER role is used exactly as seeded; revocation archives
 * and restores the one grant row in place (D-071 row identity).
 */

const FINANCIAL_CONTEXT = 'recruitment_financial_context:view';
const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-finance-context-168!';
const emailDomain = '@issue168-finance.test';
const candidateDomain = '@candidate.issue168-finance.test';
const prefix = 'F168-';

type RolePermissionSnapshot = {
  permissions: { permissionId: string; grantedAt: Date; archivedAt: Date | null }[];
};

const recruiterPermissions = [
  'clients:view',
  'commercial_data:access',
  'missions:view',
  'placements:view',
  'placement_commercial_eligibility:view',
  'quotations:view',
  'quotations:manage',
  'invoices:view',
  'invoices:manage',
  'expenses:view',
  'profitability:view',
  'documents:view',
  'documents:download',
];

async function cleanRecords(): Promise<void> {
  const ownInvoice = { reference: { startsWith: prefix } };
  const generated = await prisma.document.findMany({
    where: { invoice: ownInvoice },
    select: { id: true },
  });
  const generatedIds = generated.map((document) => document.id);
  await prisma.document.updateMany({
    where: { id: { in: generatedIds } },
    data: { currentVersionId: null },
  });
  await prisma.documentVersion.deleteMany({
    where: { documentId: { in: generatedIds }, source: DocumentVersionSource.GENERATED },
  });
  await prisma.document.deleteMany({ where: { id: { in: generatedIds } } });
  await prisma.paymentAllocation.deleteMany({
    where: { payment: { reference: { startsWith: prefix } } },
  });
  await prisma.paymentEvent.deleteMany({
    where: { payment: { reference: { startsWith: prefix } } },
  });
  await prisma.payment.deleteMany({ where: { reference: { startsWith: prefix } } });
  await prisma.expenseEvent.deleteMany({
    where: { expense: { reference: { startsWith: prefix } } },
  });
  await prisma.expense.deleteMany({ where: { reference: { startsWith: prefix } } });
  await prisma.invoiceEvent.deleteMany({ where: { invoice: ownInvoice } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: ownInvoice } });
  await prisma.invoice.deleteMany({ where: ownInvoice });
  await prisma.commercialQuotationEvent.deleteMany({
    where: { quotation: { reference: { startsWith: prefix } } },
  });
  await prisma.commercialQuotationLine.deleteMany({
    where: { quotation: { reference: { startsWith: prefix } } },
  });
  await prisma.commercialQuotation.deleteMany({ where: { reference: { startsWith: prefix } } });
  const ownMission = { mission: { title: { startsWith: 'Issue168' } } };
  await prisma.placementEvent.deleteMany({ where: { placement: ownMission } });
  await prisma.missionPlacement.deleteMany({ where: ownMission });
  await prisma.recruitmentOfferVersion.deleteMany({ where: ownMission });
  await prisma.recruitmentOffer.deleteMany({ where: ownMission });
  await prisma.missionCandidateEvent.deleteMany({ where: { missionCandidate: ownMission } });
  await prisma.missionCandidate.deleteMany({ where: ownMission });
  await prisma.missionRecruiter.deleteMany({ where: ownMission });
  await prisma.recruitmentMission.deleteMany({ where: { title: { startsWith: 'Issue168' } } });
  await prisma.client.deleteMany({ where: { normalizedName: { startsWith: 'issue168' } } });
  await prisma.candidate.deleteMany({ where: { normalizedEmail: { endsWith: candidateDomain } } });
  const ownUser = { normalizedEmail: { endsWith: emailDomain } };
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actor: ownUser }, { targetUser: ownUser }] },
  });
  await prisma.refreshSession.deleteMany({ where: { user: ownUser } });
  await prisma.passwordCredential.deleteMany({ where: { user: ownUser } });
  await prisma.userRole.deleteMany({ where: { user: ownUser } });
  await prisma.user.deleteMany({ where: ownUser });
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

async function snapshotRole(roleName: RoleName): Promise<RolePermissionSnapshot> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: roleName },
    include: { permissions: true },
  });
  return {
    permissions: role.permissions.map((grant) => ({
      permissionId: grant.permissionId,
      grantedAt: grant.grantedAt,
      archivedAt: grant.archivedAt,
    })),
  };
}

async function restoreRole(roleName: RoleName, snapshot: RolePermissionSnapshot): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: { notIn: snapshot.permissions.map((grant) => grant.permissionId) },
    },
  });
  for (const grant of snapshot.permissions) {
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: role.id, permissionId: grant.permissionId } },
      data: { grantedAt: grant.grantedAt, archivedAt: grant.archivedAt },
    });
  }
}

/** Narrows a seeded role in place; restored from its snapshot after the suite. */
async function narrowRole(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  for (const code of codes) {
    const permission = await ensurePermissionForTest(prisma, code, {
      description: `Synthetic ${code} permission for Issue #168 tests.`,
      scopeType: PermissionScopeType.EXPLICIT,
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function financialContextGrant() {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.FINANCE_MANAGER } });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { code: FINANCIAL_CONTEXT },
  });
  return prisma.rolePermission.findUniqueOrThrow({
    where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
  });
}

/** Archives FINANCE_MANAGER's financial-context grant in place, then restores it. */
async function withFinancialContextRevoked(run: () => Promise<void>): Promise<void> {
  const grant = await financialContextGrant();
  expect(grant.archivedAt).toBeNull();
  await prisma.rolePermission.update({
    where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } },
    data: { archivedAt: new Date() },
  });
  try {
    await run();
  } finally {
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } },
      data: { archivedAt: null, grantedAt: grant.grantedAt },
    });
  }
}

async function createMission(clientId: string, title: string) {
  return prisma.recruitmentMission.create({
    data: { clientId, title: `Issue168 ${title}`, numberOfPositions: 1 },
  });
}

async function createPlacement(
  missionId: string,
  responsibleRecruiterUserId: string,
  key: string,
  input: { status?: PlacementStatus; eligibleForInvoicing?: boolean; archived?: boolean } = {},
) {
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `Issue168 ${key} Candidate`,
      email: `${key}${candidateDomain}`,
      normalizedEmail: `${key}${candidateDomain}`,
      status: CandidateStatus.ACTIVE,
    },
  });
  const process = await prisma.missionCandidate.create({
    data: {
      missionId,
      candidateId: candidate.id,
      responsibleRecruiterUserId,
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
  const eligible = input.eligibleForInvoicing ?? true;
  const placement = await prisma.missionPlacement.create({
    data: {
      missionId,
      missionCandidateId: process.id,
      offerVersionId: version.id,
      status: input.status ?? PlacementStatus.CONFIRMED,
      integrationStartDate: new Date('2026-09-15T00:00:00.000Z'),
      eligibleForInvoicing: eligible,
      invoicingEligibleAt: eligible ? new Date() : null,
      archivedAt: input.archived ? new Date() : null,
    },
  });
  return { candidate, process, offer, placement };
}

async function createIssuedInvoice(clientId: string, missionId: string | null, ref: string) {
  return prisma.invoice.create({
    data: {
      reference: `${prefix}${ref}`,
      clientId,
      recruitmentMissionId: missionId,
      currency: 'MAD',
      status: InvoiceStatus.ISSUED,
      issueDate: new Date(),
      issuedAt: new Date(),
      dueDate: new Date(Date.now() + 30 * 86_400_000),
      subtotalCents: 30_000,
      taxCents: 6_000,
      totalCents: 36_000,
      lines: {
        create: [
          {
            sortOrder: 1,
            description: 'Placement fee',
            quantity: 1,
            unitPriceCents: 30_000,
            taxRateBps: 2_000,
            lineSubtotalCents: 30_000,
            lineTaxCents: 6_000,
            lineTotalCents: 36_000,
          },
        ],
      },
    },
  });
}

const placementFee = [
  { description: 'Placement fee', quantity: 1, unitPriceCents: 30_000, taxRateBps: 2_000 },
];

describe('Issue #168 bounded Finance recruitment context (D-086)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let documents: DocumentsService;
  let permissions: PermissionsService;
  let employeeSnapshot: RolePermissionSnapshot;
  let financeUserId: string;
  let recruiterUserId: string;
  let financeToken: string;
  let recruiterToken: string;
  let hybridUserId: string;
  let hybridToken: string;
  let clientA: { id: string };
  let clientB: { id: string };
  let missionA: { id: string; title: string };
  let missionB: { id: string; title: string };
  let terminalMissionA: { id: string };
  let eligible: Awaited<ReturnType<typeof createPlacement>>;
  let ineligible: Awaited<ReturnType<typeof createPlacement>>;
  let archived: Awaited<ReturnType<typeof createPlacement>>;
  let corrected: Awaited<ReturnType<typeof createPlacement>>;
  let otherClientPlacement: Awaited<ReturnType<typeof createPlacement>>;

  async function api(token: string, path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  }

  function post(token: string, path: string, body: unknown) {
    return api(token, path, { method: 'POST', body: JSON.stringify(body) });
  }

  function code(body: unknown): string | undefined {
    return (body as { error?: { code?: string } } | null)?.error?.code;
  }

  async function login(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword }),
    });
    return AuthResponseSchema.parse(await response.json()).accessToken;
  }

  beforeAll(async () => {
    await cleanRecords();
    employeeSnapshot = await snapshotRole(RoleName.EMPLOYEE);
    // An ordinary recruitment actor: `missions:view` plus generic placement grants,
    // without `mission_candidates:transfer`, so mission scope stays assignment-bound.
    await narrowRole(RoleName.EMPLOYEE, recruiterPermissions);
    financeUserId = await createUser(`finance${emailDomain}`, RoleName.FINANCE_MANAGER);
    recruiterUserId = await createUser(`recruiter${emailDomain}`, RoleName.EMPLOYEE);
    hybridUserId = await createUser(`hybrid${emailDomain}`, RoleName.FINANCE_MANAGER);
    const employeeRole = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.EMPLOYEE },
    });
    await prisma.userRole.create({ data: { userId: hybridUserId, roleId: employeeRole.id } });

    clientA = await prisma.client.create({
      data: { name: 'Issue168 Client A', normalizedName: 'issue168 client a' },
    });
    clientB = await prisma.client.create({
      data: { name: 'Issue168 Client B', normalizedName: 'issue168 client b' },
    });
    missionA = await createMission(clientA.id, 'Mission A');
    missionB = await createMission(clientB.id, 'Mission B');
    terminalMissionA = await prisma.recruitmentMission.create({
      data: {
        clientId: clientA.id,
        title: 'Issue168 Terminal A',
        state: 'CLOSED_WITHOUT_RECRUITMENT',
        closedAt: new Date(),
      },
    });
    eligible = await createPlacement(missionA.id, recruiterUserId, 'eligible');
    ineligible = await createPlacement(missionA.id, recruiterUserId, 'ineligible', {
      eligibleForInvoicing: false,
    });
    archived = await createPlacement(missionA.id, recruiterUserId, 'archived', { archived: true });
    corrected = await createPlacement(missionA.id, recruiterUserId, 'corrected', {
      status: PlacementStatus.CORRECTED,
    });
    otherClientPlacement = await createPlacement(missionB.id, recruiterUserId, 'otherclient');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    documents = moduleRef.get(DocumentsService);
    permissions = moduleRef.get(PermissionsService);
    financeToken = await login(`finance${emailDomain}`);
    recruiterToken = await login(`recruiter${emailDomain}`);
    hybridToken = await login(`hybrid${emailDomain}`);
  });

  afterAll(async () => {
    await app?.close();
    await cleanRecords();
    await restoreRole(RoleName.EMPLOYEE, employeeSnapshot);
    await prisma.$disconnect();
  });

  it('grants FINANCE_MANAGER only the bounded financial context, never recruitment grants', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: FINANCIAL_CONTEXT },
    });
    expect(permission.scopeType).toBe(PermissionScopeType.CLIENT);
    const effective = await permissions.getEffectivePermissionCodes(financeUserId);
    expect(effective).toContain(FINANCIAL_CONTEXT);
    for (const forbidden of [
      'missions:view',
      'placements:view',
      'placement_commercial_eligibility:view',
      'mission_candidates:transfer',
      'mission_candidates:view',
      'mission_candidate_notes:view',
      'candidates:view',
      'candidate_profile:view',
      'offers:view',
      'interviews:view',
      'evaluations:view',
      'evaluations:internal:view',
      'client_feedback:view',
      'mission_assignments:view',
    ]) {
      expect(effective).not.toContain(forbidden);
    }
    // No other seeded role gained the new capability except SUPER_ADMIN (all permissions).
    const holders = await prisma.rolePermission.findMany({
      where: { permissionId: permission.id, archivedAt: null },
      select: { role: { select: { name: true } } },
    });
    expect(holders.map((holder) => holder.role.name).sort()).toEqual(
      [RoleName.FINANCE_MANAGER, RoleName.SUPER_ADMIN].sort(),
    );
  });

  it('keeps Missions and recruitment record APIs forbidden, even with an active assignment', async () => {
    await prisma.missionRecruiter.create({
      data: { missionId: missionA.id, userId: financeUserId, status: 'ACTIVE' },
    });
    try {
      const process = eligible.process.id;
      const paths = [
        '/v1/missions',
        `/v1/missions/${missionA.id}`,
        `/v1/missions/${missionA.id}/candidates`,
        `/v1/missions/${missionA.id}/candidates/${process}`,
        `/v1/missions/${missionA.id}/candidates/${process}/offers`,
        // Generic placement detail stays behind `placements:view` + assignment.
        `/v1/missions/${missionA.id}/candidates/${process}/placement`,
        `/v1/missions/${missionA.id}/candidates/${process}/interviews`,
        `/v1/missions/${missionA.id}/candidates/${process}/interviews/${randomUUID()}/evaluations`,
        '/v1/candidates',
        `/v1/candidates/${eligible.candidate.id}`,
        `/v1/commercial/placement-options?clientId=${clientA.id}`,
        `/v1/accounting/placement-options?recruitmentMissionId=${missionA.id}`,
      ];
      for (const path of paths) {
        const response = await api(financeToken, path);
        expect({ path, status: response.status }).toEqual({ path, status: 403 });
        expect(JSON.stringify(response.body)).not.toContain(eligible.candidate.id);
      }
    } finally {
      await prisma.missionRecruiter.deleteMany({ where: { userId: financeUserId } });
    }
  });

  it('serves bounded Commercial mission options: client-bound, id/title only, max 20, no count', async () => {
    await prisma.recruitmentMission.createMany({
      data: Array.from({ length: 22 }, (_, index) => ({
        clientId: clientA.id,
        title: `Issue168 Bulk ${String(index).padStart(2, '0')}`,
        description: 'Confidential mission description',
        requirements: 'Confidential requirements',
        salaryMinCents: 9_999_900,
        commercialSummary: 'Confidential commercial summary',
      })),
    });
    const page = await api(
      financeToken,
      `/v1/commercial/financial-context/missions?clientId=${clientA.id}`,
    );
    expect(page.status).toBe(200);
    const body = page.body as { options: { id: string; title: string }[] };
    expect(Object.keys(body)).toEqual(['options']);
    expect(body.options).toHaveLength(20);
    for (const option of body.options) {
      expect(Object.keys(option).sort()).toEqual(['id', 'title']);
    }
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Confidential');
    expect(serialized).not.toContain(missionB.id);
    expect(serialized).not.toContain(terminalMissionA.id);

    const searched = await api(
      financeToken,
      `/v1/commercial/financial-context/missions?clientId=${clientA.id}&search=Mission%20A`,
    );
    expect((searched.body as typeof body).options.map((option) => option.id)).toEqual([
      missionA.id,
    ]);
    // Another client never lists client A missions; a random client lists nothing.
    const other = await api(
      financeToken,
      `/v1/commercial/financial-context/missions?clientId=${clientB.id}&search=Mission`,
    );
    expect((other.body as typeof body).options.map((option) => option.id)).toEqual([missionB.id]);
    const random = await api(
      financeToken,
      `/v1/commercial/financial-context/missions?clientId=${randomUUID()}`,
    );
    expect(random.body).toEqual({ options: [] });
    expect((await api(financeToken, '/v1/commercial/financial-context/missions')).status).toBe(400);
    // The recruitment actor lacks the capability.
    expect(
      (
        await api(
          recruiterToken,
          `/v1/commercial/financial-context/missions?clientId=${clientA.id}`,
        )
      ).status,
    ).toBe(403);
  });

  it('serves bounded invoice placement options without candidate, process, offer, or history data', async () => {
    const response = await api(
      financeToken,
      `/v1/commercial/financial-context/placements?clientId=${clientA.id}`,
    );
    expect(response.status).toBe(200);
    const body = response.body as { options: Record<string, unknown>[] };
    expect(Object.keys(body)).toEqual(['options']);
    expect(body.options.map((option) => option.id)).toEqual([eligible.placement.id]);
    expect(Object.keys(body.options[0]!).sort()).toEqual([
      'confirmedAt',
      'id',
      'integrationStartDate',
      'missionTitle',
      'recruitmentMissionId',
    ]);
    const serialized = JSON.stringify(body);
    for (const hidden of [
      eligible.candidate.id,
      eligible.process.id,
      eligible.offer.id,
      'Candidate',
    ]) {
      expect(serialized).not.toContain(hidden);
    }
    const otherClient = await api(
      financeToken,
      `/v1/commercial/financial-context/placements?clientId=${clientA.id}&recruitmentMissionId=${missionB.id}`,
    );
    expect(otherClient.body).toEqual({ options: [] });

    const accounting = await api(
      financeToken,
      `/v1/accounting/financial-context/placements?recruitmentMissionId=${missionA.id}`,
    );
    expect(accounting.status).toBe(200);
    const accountingIds = (accounting.body as typeof body).options.map((option) => option.id);
    // D-081 semantics: every non-archived placement of the mission.
    expect(accountingIds.sort()).toEqual(
      [eligible.placement.id, ineligible.placement.id, corrected.placement.id].sort(),
    );
    expect(JSON.stringify(accounting.body)).not.toContain(eligible.candidate.id);
    const missing = await api(
      financeToken,
      `/v1/accounting/financial-context/placements?recruitmentMissionId=${randomUUID()}`,
    );
    expect(missing.status).toBe(404);

    const accountingMissions = await api(
      financeToken,
      `/v1/accounting/financial-context/missions?clientId=${clientA.id}&search=Terminal`,
    );
    expect(accountingMissions.status).toBe(200);
    expect(accountingMissions.body).toEqual({
      options: [{ id: terminalMissionA.id, title: 'Issue168 Terminal A' }],
    });
  });

  it('lets Finance create and read mission-linked Commercial records within client scope', async () => {
    const created = await post(financeToken, '/v1/commercial/quotations', {
      reference: `${prefix}Q-MISSION`,
      clientId: clientA.id,
      recruitmentMissionId: missionA.id,
      currency: 'MAD',
      lines: placementFee,
    });
    expect(created.status).toBe(201);
    const quotation = (created.body as { quotation: { id: string; display: unknown } }).quotation;
    expect(quotation.display).toMatchObject({ missionTitle: missionA.title });

    const detail = await api(financeToken, `/v1/commercial/quotations/${quotation.id}`);
    expect(detail.status).toBe(200);
    const list = await api(
      financeToken,
      `/v1/commercial/quotations?clientId=${clientA.id}&pageSize=100`,
    );
    expect(JSON.stringify(list.body)).toContain(quotation.id);

    // Wrong-client mission: the same conflict the recruitment path returns.
    const mismatch = await post(financeToken, '/v1/commercial/quotations', {
      reference: `${prefix}Q-MISMATCH`,
      clientId: clientA.id,
      recruitmentMissionId: missionB.id,
      currency: 'MAD',
      lines: placementFee,
    });
    expect(mismatch.status).toBe(409);
    expect(code(mismatch.body)).toBe('COMMERCIAL_MISSION_CLIENT_MISMATCH');
    const terminal = await post(financeToken, '/v1/commercial/quotations', {
      reference: `${prefix}Q-TERMINAL`,
      clientId: clientA.id,
      recruitmentMissionId: terminalMissionA.id,
      currency: 'MAD',
      lines: placementFee,
    });
    expect(code(terminal.body)).toBe('MISSION_TERMINAL');
    const unknown = await post(financeToken, '/v1/commercial/quotations', {
      reference: `${prefix}Q-UNKNOWN`,
      clientId: clientA.id,
      recruitmentMissionId: randomUUID(),
      currency: 'MAD',
      lines: placementFee,
    });
    expect(unknown.status).toBe(404);
    expect(code(unknown.body)).toBe('COMMERCIAL_SOURCE_NOT_FOUND');

    // The unassigned recruitment actor keeps the existing assignment rule.
    const hidden = await api(recruiterToken, `/v1/commercial/quotations/${quotation.id}`);
    const nonexistent = await api(recruiterToken, `/v1/commercial/quotations/${randomUUID()}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(nonexistent.body);
    const recruiterList = await api(
      recruiterToken,
      `/v1/commercial/quotations?clientId=${clientA.id}&pageSize=100`,
    );
    expect(JSON.stringify(recruiterList.body)).not.toContain(quotation.id);
    await prisma.missionRecruiter.create({
      data: { missionId: missionA.id, userId: recruiterUserId, status: 'ACTIVE' },
    });
    try {
      expect((await api(recruiterToken, `/v1/commercial/quotations/${quotation.id}`)).status).toBe(
        200,
      );
    } finally {
      await prisma.missionRecruiter.deleteMany({ where: { userId: recruiterUserId } });
    }
  });

  it('completes a placement-backed invoice through the bounded path and rejects invalid placements', async () => {
    const invoice = (placementId: string, ref: string, missionId = missionA.id) =>
      post(financeToken, '/v1/commercial/invoices', {
        reference: `${prefix}${ref}`,
        clientId: clientA.id,
        recruitmentMissionId: missionId,
        missionPlacementId: placementId,
        currency: 'MAD',
        lines: placementFee,
      });

    const created = await invoice(eligible.placement.id, 'I-PLACED');
    expect(created.status).toBe(201);
    const detail = (
      created.body as {
        invoice: { missionPlacementId: string; display: { placement: unknown } };
      }
    ).invoice;
    expect(detail.missionPlacementId).toBe(eligible.placement.id);
    expect(detail.display.placement).toEqual({
      integrationStartDate: '2026-09-15T00:00:00.000Z',
      confirmedAt: eligible.placement.confirmedAt.toISOString(),
    });
    expect(JSON.stringify(created.body)).not.toContain(eligible.candidate.id);

    for (const [placementId, expected] of [
      [ineligible.placement.id, 'PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED'],
      [archived.placement.id, 'PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED'],
      [corrected.placement.id, 'PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED'],
      [otherClientPlacement.placement.id, 'INVOICE_PLACEMENT_MISSION_MISMATCH'],
    ] as const) {
      const rejected = await invoice(placementId, `I-REJECT-${placementId.slice(0, 8)}`);
      expect({ placementId, code: code(rejected.body) }).toEqual({ placementId, code: expected });
    }
    const wrongClient = await invoice(otherClientPlacement.placement.id, 'I-WRONG', missionB.id);
    expect(wrongClient.status).toBe(409);
    expect(code(wrongClient.body)).toBe('INVOICE_PLACEMENT_CLIENT_MISMATCH');
    const missing = await invoice(randomUUID(), 'I-MISSING');
    expect(missing.status).toBe(404);
    expect(code(missing.body)).toBe('MISSION_PLACEMENT_NOT_FOUND');
    // The already-invoiced placement is no longer offered.
    const options = await api(
      financeToken,
      `/v1/commercial/financial-context/placements?clientId=${clientA.id}`,
    );
    expect(options.body).toEqual({ options: [] });
    expect(
      await prisma.invoice.count({ where: { missionPlacementId: eligible.placement.id } }),
    ).toBe(1);
  });

  it('resolves Accounting references, expenses, and profitability through the bounded context', async () => {
    const missionInvoice = await createIssuedInvoice(clientA.id, missionA.id, 'I-ACCT');
    const payment = await post(financeToken, '/v1/accounting/payments', {
      reference: `${prefix}PAY-1`,
      clientId: clientA.id,
      receivedDate: new Date().toISOString(),
      currency: 'MAD',
      amountCents: 36_000,
      method: 'BANK_TRANSFER',
    });
    expect(payment.status).toBe(201);
    const paymentId = (payment.body as { payment: { id: string } }).payment.id;
    const allocation = await post(
      financeToken,
      `/v1/accounting/payments/${paymentId}/allocations`,
      {
        invoiceId: missionInvoice.id,
        amountCents: 10_000,
      },
    );
    expect(allocation.status).toBe(201);
    const paymentDetail = await api(financeToken, `/v1/accounting/payments/${paymentId}`);
    const allocations = (
      paymentDetail.body as {
        payment: { allocations: { display: { invoiceReference: string | null } }[] };
      }
    ).payment.allocations;
    expect(allocations[0]!.display.invoiceReference).toBe(missionInvoice.reference);

    const expense = await post(financeToken, '/v1/accounting/expenses', {
      reference: `${prefix}EXP-1`,
      expenseDate: new Date().toISOString(),
      category: 'RECRUITMENT_SOURCING',
      currency: 'MAD',
      amountCents: 5_000,
      clientId: clientA.id,
      recruitmentMissionId: missionA.id,
      missionPlacementId: eligible.placement.id,
    });
    expect(expense.status).toBe(201);
    const expenseBody = expense.body as {
      expense: { id: string; display: Record<string, unknown> };
    };
    expect(JSON.stringify(expenseBody)).not.toContain(eligible.candidate.id);
    const expenseList = await api(financeToken, '/v1/accounting/expenses?pageSize=100');
    expect(JSON.stringify(expenseList.body)).toContain(expenseBody.expense.id);

    const missionProfit = await api(
      financeToken,
      `/v1/accounting/profitability?context=RECRUITMENT_MISSION&contextId=${missionA.id}`,
    );
    expect(missionProfit.status).toBe(200);
    const placementProfit = await api(
      financeToken,
      `/v1/accounting/profitability?context=PLACEMENT&contextId=${eligible.placement.id}`,
    );
    expect(placementProfit.status).toBe(200);
    // Aggregate scope equals detail scope: the mission revenue includes the issued
    // mission-linked invoice and the expense the detail paths expose.
    const missionRows = (
      missionProfit.body as {
        profitability: {
          totalsByCurrency: { currency: string; revenueCents: number; expenseCents: number }[];
        };
      }
    ).profitability.totalsByCurrency;
    expect(missionRows).toContainEqual(
      expect.objectContaining({ currency: 'MAD', revenueCents: 36_000, expenseCents: 5_000 }),
    );
    const missingProfit = await api(
      financeToken,
      `/v1/accounting/profitability?context=RECRUITMENT_MISSION&contextId=${randomUUID()}`,
    );
    expect(missingProfit.status).toBe(404);
  });

  it('mirrors the Commercial scope for generated documents and financial signing rechecks', async () => {
    const missionInvoice = await createIssuedInvoice(clientA.id, missionA.id, 'I-GEN');
    const generated = await post(
      financeToken,
      `/v1/commercial/invoices/${missionInvoice.id}/generate`,
      { outputFamily: 'PDF', language: 'fr', idempotencyKey: `issue168-${randomUUID()}` },
    );
    expect(generated.status).toBe(201);
    const { documentId, versionId } = (
      generated.body as { generated: { documentId: string; versionId: string } }
    ).generated;
    expect((await api(financeToken, `/v1/documents/${documentId}`)).status).toBe(200);
    const list = await api(financeToken, '/v1/documents?pageSize=100');
    expect(JSON.stringify(list.body)).toContain(documentId);
    expect(await documents.hasAuthorizedDocumentAccess(documentId, financeUserId)).toBe(true);
    await expect(
      documents.assertFinancialSigningVersionAccess(documentId, versionId, financeUserId),
    ).resolves.toMatchObject({ version: { id: versionId } });

    // The unassigned recruitment actor keeps the existing mission-assignment rule.
    const hidden = await api(recruiterToken, `/v1/documents/${documentId}`);
    const nonexistent = await api(recruiterToken, `/v1/documents/${randomUUID()}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(nonexistent.body);
    const recruiterList = await api(recruiterToken, '/v1/documents?pageSize=100');
    expect(JSON.stringify(recruiterList.body)).not.toContain(documentId);
    expect(await documents.hasAuthorizedDocumentAccess(documentId, recruiterUserId)).toBe(false);

    await withFinancialContextRevoked(async () => {
      const revoked = await api(financeToken, `/v1/documents/${documentId}`);
      const missing = await api(financeToken, `/v1/documents/${randomUUID()}`);
      expect(revoked.status).toBe(404);
      expect(revoked.body).toEqual(missing.body);
      const revokedList = await api(financeToken, '/v1/documents?pageSize=100');
      expect(JSON.stringify(revokedList.body)).not.toContain(documentId);
      expect(await documents.hasAuthorizedDocumentAccess(documentId, financeUserId)).toBe(false);
      await expect(
        documents.assertFinancialSigningVersionAccess(documentId, versionId, financeUserId),
      ).rejects.toThrow();
      const regenerate = await post(
        financeToken,
        `/v1/commercial/invoices/${missionInvoice.id}/generate`,
        { outputFamily: 'PDF', language: 'fr', idempotencyKey: `issue168-${randomUUID()}` },
      );
      expect(regenerate.status).toBe(404);
      expect(code(regenerate.body)).toBe('GENERATION_SOURCE_NOT_FOUND');
    });
    expect(await documents.hasAuthorizedDocumentAccess(documentId, financeUserId)).toBe(true);
  });

  it('restores the hidden, client-only behaviour immediately when the capability is revoked', async () => {
    const quotation = await prisma.commercialQuotation.findFirstOrThrow({
      where: { reference: `${prefix}Q-MISSION` },
    });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { reference: `${prefix}PAY-1` },
    });
    const expense = await prisma.expense.findFirstOrThrow({
      where: { reference: `${prefix}EXP-1` },
    });
    const clientOnly = await post(financeToken, '/v1/commercial/quotations', {
      reference: `${prefix}Q-CLIENT`,
      clientId: clientA.id,
      currency: 'MAD',
      lines: placementFee,
    });
    expect(clientOnly.status).toBe(201);

    await withFinancialContextRevoked(async () => {
      const hidden = await api(financeToken, `/v1/commercial/quotations/${quotation.id}`);
      const missing = await api(financeToken, `/v1/commercial/quotations/${randomUUID()}`);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(missing.body);
      const list = JSON.stringify(
        (await api(financeToken, `/v1/commercial/quotations?clientId=${clientA.id}&pageSize=100`))
          .body,
      );
      expect(list).not.toContain(quotation.id);
      expect(list).toContain((clientOnly.body as { quotation: { id: string } }).quotation.id);

      for (const path of [
        `/v1/commercial/financial-context/missions?clientId=${clientA.id}`,
        `/v1/commercial/financial-context/placements?clientId=${clientA.id}`,
        `/v1/accounting/financial-context/missions?clientId=${clientA.id}`,
        `/v1/accounting/financial-context/placements?recruitmentMissionId=${missionA.id}`,
      ]) {
        expect({ path, status: (await api(financeToken, path)).status }).toEqual({
          path,
          status: 403,
        });
      }
      const placementInvoice = await post(financeToken, '/v1/commercial/invoices', {
        reference: `${prefix}I-REVOKED`,
        clientId: clientA.id,
        recruitmentMissionId: missionA.id,
        missionPlacementId: ineligible.placement.id,
        currency: 'MAD',
        lines: placementFee,
      });
      // The pre-D-086 generic placement requirement applies again, before any lookup.
      expect(placementInvoice.status).toBe(403);
      expect(code(placementInvoice.body)).toBe('PLACEMENT_COMMERCIAL_ELIGIBILITY_REQUIRED');
      const missionQuotation = await post(financeToken, '/v1/commercial/quotations', {
        reference: `${prefix}Q-REVOKED`,
        clientId: clientA.id,
        recruitmentMissionId: missionA.id,
        currency: 'MAD',
        lines: placementFee,
      });
      const unknownMission = await post(financeToken, '/v1/commercial/quotations', {
        reference: `${prefix}Q-REVOKED-UNKNOWN`,
        clientId: clientA.id,
        recruitmentMissionId: randomUUID(),
        currency: 'MAD',
        lines: placementFee,
      });
      expect(missionQuotation.status).toBe(404);
      expect(missionQuotation.body).toEqual(unknownMission.body);

      const paymentDetail = await api(financeToken, `/v1/accounting/payments/${payment.id}`);
      expect(paymentDetail.status).toBe(200);
      const allocation = (
        paymentDetail.body as {
          payment: {
            allocations: { amountCents: number | null; display: { invoiceReference: unknown } }[];
          };
        }
      ).payment.allocations[0]!;
      expect(allocation.display.invoiceReference).toBeNull();
      expect(allocation.amountCents).toBe(10_000);

      const expenseHidden = await api(financeToken, `/v1/accounting/expenses/${expense.id}`);
      const expenseMissing = await api(financeToken, `/v1/accounting/expenses/${randomUUID()}`);
      expect(expenseHidden.status).toBe(404);
      expect(expenseHidden.body).toEqual(expenseMissing.body);
      const expenses = await api(financeToken, '/v1/accounting/expenses?pageSize=100');
      expect(JSON.stringify(expenses.body)).not.toContain(expense.id);
      for (const path of [
        `/v1/accounting/profitability?context=RECRUITMENT_MISSION&contextId=${missionA.id}`,
        `/v1/accounting/profitability?context=PLACEMENT&contextId=${eligible.placement.id}`,
      ]) {
        const response = await api(financeToken, path);
        expect(response.status).toBe(404);
      }
      // Client aggregates no longer include the mission-linked invoices.
      const clientProfit = await api(
        financeToken,
        `/v1/accounting/profitability?context=CLIENT&contextId=${clientA.id}`,
      );
      expect(clientProfit.status).toBe(200);
      const rows = (
        clientProfit.body as { profitability: { totalsByCurrency: { revenueCents: number }[] } }
      ).profitability.totalsByCurrency;
      expect(rows.every((row) => row.revenueCents === 0)).toBe(true);
    });

    // Restored grant: access returns without any other change.
    expect((await api(financeToken, `/v1/commercial/quotations/${quotation.id}`)).status).toBe(200);
    expect((await financialContextGrant()).archivedAt).toBeNull();
  });

  it('hybrid finance+recruitment role: financial context stays ALL without assignment; recruitment APIs stay scoped', async () => {
    const hybridPerms = await permissions.getEffectivePermissionCodes(hybridUserId);
    expect(hybridPerms).toContain(FINANCIAL_CONTEXT);
    expect(hybridPerms).toContain('missions:view');
    expect(hybridPerms).not.toContain('mission_candidates:transfer');
    expect(hybridPerms).not.toContain('placements:view');

    const quotationRef = `${prefix}Q-HYBRID`;
    const created = await post(hybridToken, '/v1/commercial/quotations', {
      reference: quotationRef,
      clientId: clientA.id,
      recruitmentMissionId: missionA.id,
      currency: 'MAD',
      lines: placementFee,
    });
    expect(created.status).toBe(201);
    const quotationId = (created.body as { quotation: { id: string } }).quotation.id;

    const commercialMissionOptions = await api(
      hybridToken,
      `/v1/commercial/financial-context/missions?clientId=${clientA.id}&search=Mission%20A`,
    );
    expect(commercialMissionOptions.status).toBe(200);
    expect((commercialMissionOptions.body as { options: { id: string }[] }).options[0]?.id).toBe(
      missionA.id,
    );

    const hybridPlacement = await createPlacement(missionA.id, recruiterUserId, 'hybrid-invoice');
    const commercialPlacements = await api(
      hybridToken,
      `/v1/commercial/financial-context/placements?clientId=${clientA.id}`,
    );
    expect(commercialPlacements.status).toBe(200);
    expect(
      (commercialPlacements.body as { options: { id: string }[] }).options.map((row) => row.id),
    ).toContain(hybridPlacement.placement.id);

    const accountingMissions = await api(
      hybridToken,
      `/v1/accounting/financial-context/missions?clientId=${clientA.id}&search=Mission%20A`,
    );
    expect(accountingMissions.status).toBe(200);

    const hybridInvoice = await post(hybridToken, '/v1/commercial/invoices', {
      reference: `${prefix}I-HYBRID`,
      clientId: clientA.id,
      recruitmentMissionId: missionA.id,
      missionPlacementId: hybridPlacement.placement.id,
      currency: 'MAD',
      lines: placementFee,
    });
    expect(hybridInvoice.status).toBe(201);
    const hybridInvoiceId = (hybridInvoice.body as { invoice: { id: string } }).invoice.id;
    const generated = await post(
      hybridToken,
      `/v1/commercial/invoices/${hybridInvoiceId}/generate`,
      { outputFamily: 'PDF', language: 'fr', idempotencyKey: `issue168-hybrid-${randomUUID()}` },
    );
    expect(generated.status).toBe(201);
    const { documentId, versionId } = (
      generated.body as { generated: { documentId: string; versionId: string } }
    ).generated;
    expect((await api(hybridToken, `/v1/documents/${documentId}`)).status).toBe(200);
    await expect(
      documents.assertFinancialSigningVersionAccess(documentId, versionId, hybridUserId),
    ).resolves.toMatchObject({ version: { id: versionId } });

    const expense = await post(hybridToken, '/v1/accounting/expenses', {
      reference: `${prefix}EXP-HYBRID`,
      expenseDate: new Date().toISOString(),
      category: 'RECRUITMENT_SOURCING',
      currency: 'MAD',
      amountCents: 2_000,
      clientId: clientA.id,
      recruitmentMissionId: missionA.id,
      missionPlacementId: hybridPlacement.placement.id,
    });
    expect(expense.status).toBe(201);
    expect(
      (
        await api(
          hybridToken,
          `/v1/accounting/profitability?context=RECRUITMENT_MISSION&contextId=${missionA.id}`,
        )
      ).status,
    ).toBe(200);

    // Financial mission context works without recruiter assignment (regression for hybrid scope).
    expect((await api(hybridToken, `/v1/commercial/quotations/${quotationId}`)).status).toBe(200);

    // Generic recruitment APIs stay behind their own grants (not opened by finance context alone).
    expect((await api(hybridToken, '/v1/missions')).status).toBe(200);
    const process = eligible.process.id;
    const recruitmentForbidden = [
      `/v1/missions/${missionA.id}/candidates`,
      `/v1/missions/${missionA.id}/candidates/${process}`,
      `/v1/missions/${missionA.id}/candidates/${process}/placement`,
      `/v1/missions/${missionA.id}/candidates/${process}/offers`,
      `/v1/candidates/${eligible.candidate.id}`,
      `/v1/commercial/placement-options?clientId=${clientA.id}`,
    ];
    for (const path of recruitmentForbidden) {
      const response = await api(hybridToken, path);
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
    }

    await prisma.missionRecruiter.create({
      data: { missionId: missionA.id, userId: hybridUserId, status: 'ACTIVE' },
    });
    try {
      const assignedMissions = await api(hybridToken, '/v1/missions');
      expect(assignedMissions.status).toBe(200);
      expect(JSON.stringify(assignedMissions.body)).toContain(missionA.id);
      expect((await api(hybridToken, `/v1/missions/${missionA.id}`)).status).toBe(200);
      expect((await api(hybridToken, `/v1/commercial/quotations/${quotationId}`)).status).toBe(200);
    } finally {
      await prisma.missionRecruiter.deleteMany({ where: { userId: hybridUserId } });
    }
  });
});
