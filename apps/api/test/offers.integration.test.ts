import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  OfferDetailResponseSchema,
  PlacementDetailResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  MissionCandidateState,
  MissionRecruiterRole,
  PermissionScopeType,
  PrismaClient,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';
const offerPermissions = [
  'missions:view',
  'mission_assignments:view',
  'mission_candidates:view',
  'mission_candidates:create',
  'mission_candidates:transition',
  'offers:view',
  'offers:create',
  'offers:update',
  'offers:send_or_mark_sent',
  'offers:record_response',
  'offers:withdraw',
  'placements:view',
  'placements:confirm',
  'placements:correct',
  'placement_commercial_eligibility:view',
] as const;

async function cleanOfferTestRecords(): Promise<void> {
  await prisma.placementEvent.deleteMany({
    where: { placement: { mission: { title: { contains: 'Issue29' } } } },
  });
  await prisma.missionPlacement.deleteMany({
    where: { mission: { title: { contains: 'Issue29' } } },
  });
  await prisma.offerEvent.deleteMany({
    where: { offer: { mission: { title: { contains: 'Issue29' } } } },
  });
  await prisma.recruitmentOfferVersion.deleteMany({
    where: { mission: { title: { contains: 'Issue29' } } },
  });
  await prisma.recruitmentOffer.deleteMany({
    where: { mission: { title: { contains: 'Issue29' } } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: { in: ['RecruitmentOffer', 'MissionPlacement'] } },
        { targetUser: { normalizedEmail: { endsWith: '@offers.test' } } },
      ],
    },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: 'Issue29' } } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: { mission: { title: { contains: 'Issue29' } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: {
      OR: [
        { mission: { title: { contains: 'Issue29' } } },
        { user: { normalizedEmail: { endsWith: '@offers.test' } } },
      ],
    },
  });
  await prisma.recruitmentMission.deleteMany({
    where: { title: { contains: 'Issue29' } },
  });
  await prisma.client.deleteMany({
    where: { normalizedName: { contains: 'issue29' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@offers.test' } },
  });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@offers.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@offers.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@offers.test' } } },
  });
  await prisma.user.deleteMany({
    where: { normalizedEmail: { endsWith: '@offers.test' } },
  });
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
      description: `Synthetic ${roleName} role for offer tests.`,
      status: 'ACTIVE',
    },
  });
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        description: `Synthetic ${code} permission for offer tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
      create: {
        code,
        description: `Synthetic ${code} permission for offer tests.`,
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

async function createMissionWithProcess(title: string, recruiterUserId: string) {
  const client = await prisma.client.create({
    data: { name: `${title} Client`, normalizedName: `${title} client`.toLowerCase() },
  });
  const mission = await prisma.recruitmentMission.create({
    data: { clientId: client.id, title, numberOfPositions: 1 },
  });
  await prisma.missionRecruiter.create({
    data: {
      missionId: mission.id,
      userId: recruiterUserId,
      role: MissionRecruiterRole.RECRUITER,
      status: AssignmentStatus.ACTIVE,
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      displayName: `${title} Candidate`,
      email: `${title.toLowerCase()}@offers.test`,
      normalizedEmail: `${title.toLowerCase()}@offers.test`,
      status: CandidateStatus.ACTIVE,
    },
  });
  const process = await prisma.missionCandidate.create({
    data: {
      missionId: mission.id,
      candidateId: candidate.id,
      responsibleRecruiterUserId: recruiterUserId,
      state: MissionCandidateState.CLIENT_OFFER,
    },
  });
  return { mission, process };
}

async function createAcceptedOffer(
  baseUrl: string,
  token: string,
  missionId: string,
  processId: string,
) {
  const created = await fetch(
    `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/offers`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        offeredSalaryAmountCents: 900000,
        offeredSalaryCurrency: 'MAD',
        contractType: 'CDI',
        proposedStartDate: new Date('2026-09-01T00:00:00.000Z').toISOString(),
      }),
    },
  );
  const body = OfferDetailResponseSchema.parse(await created.json());
  const versionId = body.offer.currentVersionId!;
  await fetch(
    `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/offers/${versionId}/mark-sent`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ reason: 'Sent to candidate by recruiter.' }),
    },
  );
  const accepted = await fetch(
    `${baseUrl}/v1/missions/${missionId}/candidates/${processId}/offers/${versionId}/response`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status: 'ACCEPTED', reason: 'Candidate accepted.' }),
    },
  );
  return OfferDetailResponseSchema.parse(await accepted.json());
}

describe('offer and placement lifecycle', () => {
  let app: INestApplication;
  let baseUrl: string;
  let recruiterUserId: string;
  let recruiterToken: string;

  beforeAll(async () => {
    await cleanOfferTestRecords();
    await ensureRoleWithPermissions(RoleName.HR_MANAGER, offerPermissions);
    recruiterUserId = await createUser('recruiter@offers.test', RoleName.HR_MANAGER);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors({ origin: 'http://127.0.0.1:5173', credentials: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    recruiterToken = await loginAccessToken(baseUrl, 'recruiter@offers.test');
  });

  afterAll(async () => {
    await app?.close();
    await cleanOfferTestRecords();
    await prisma.$disconnect();
  });

  it('creates immutable offer versions and allows only one current active version', async () => {
    const { mission, process } = await createMissionWithProcess(
      'Issue29 Versioning',
      recruiterUserId,
    );
    const first = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ offeredSalaryAmountCents: 800000, offeredSalaryCurrency: 'MAD' }),
      },
    );
    const firstBody = OfferDetailResponseSchema.parse(await first.json());
    const firstVersionId = firstBody.offer.currentVersionId!;
    const [revisionA, revisionB] = await Promise.all([
      fetch(
        `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${firstVersionId}/revise`,
        {
          method: 'POST',
          headers: authHeaders(recruiterToken),
          body: JSON.stringify({
            reason: 'Improved package.',
            offeredSalaryAmountCents: 850000,
            offeredSalaryCurrency: 'MAD',
          }),
        },
      ),
      fetch(
        `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${firstVersionId}/revise`,
        {
          method: 'POST',
          headers: authHeaders(recruiterToken),
          body: JSON.stringify({
            reason: 'Concurrent duplicate revision.',
            offeredSalaryAmountCents: 860000,
            offeredSalaryCurrency: 'MAD',
          }),
        },
      ),
    ]);
    const successful = [revisionA, revisionB].filter((response) => response.status === 200);
    expect(first.status).toBe(201);
    expect(successful).toHaveLength(1);

    const offer = await prisma.recruitmentOffer.findUniqueOrThrow({
      where: { missionCandidateId: process.id },
      include: { versions: true },
    });
    expect(offer.versions).toHaveLength(2);
    expect(
      offer.versions.filter((version) => version.isCurrent && !version.archivedAt),
    ).toHaveLength(1);
    expect(new Set(offer.versions.map((version) => version.versionNumber))).toEqual(
      new Set([1, 2]),
    );
  });

  it('records allowed lifecycle responses and rejects invalid transitions without misleading audit', async () => {
    const { mission, process } = await createMissionWithProcess(
      'Issue29 Transitions',
      recruiterUserId,
    );
    const created = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ offeredSalaryAmountCents: 800000, offeredSalaryCurrency: 'MAD' }),
      },
    );
    const createdBody = OfferDetailResponseSchema.parse(await created.json());
    const versionId = createdBody.offer.currentVersionId!;
    const invalid = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/response`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ status: 'ACCEPTED', reason: 'Accepted before sent.' }),
      },
    );
    const markedSent = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/mark-sent`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ reason: 'Sent.' }),
      },
    );
    const rejectedWithoutReason = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/response`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ status: 'REJECTED' }),
      },
    );
    const negotiating = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/response`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ status: 'NEGOTIATING', reason: 'Candidate is negotiating.' }),
      },
    );
    const invalidAudit = await prisma.auditLog.findMany({
      where: { entityType: 'RecruitmentOffer', action: 'offers.response_recorded' },
    });

    expect(await readErrorCode(invalid)).toBe('OFFER_INVALID_TRANSITION');
    expect(markedSent.status).toBe(200);
    expect(rejectedWithoutReason.status).toBe(400);
    expect(negotiating.status).toBe(200);
    expect(invalidAudit).toHaveLength(1);
  });

  it('requires an accepted current offer and confirms placement idempotently under concurrency', async () => {
    const { mission, process } = await createMissionWithProcess('Issue29 Confirm', recruiterUserId);
    const createdDraft = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ offeredSalaryAmountCents: 900000, offeredSalaryCurrency: 'MAD' }),
      },
    );
    const draft = OfferDetailResponseSchema.parse(await createdDraft.json());
    const rejectedConfirmation = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${draft.offer.currentVersionId}/confirm-placement`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({
          integrationStartDate: new Date('2026-09-15T00:00:00.000Z').toISOString(),
          eligibleForInvoicing: false,
        }),
      },
    );
    expect(await readErrorCode(rejectedConfirmation)).toBe(
      'PLACEMENT_ACCEPTED_CURRENT_OFFER_REQUIRED',
    );

    const versionIdToWithdraw = draft.offer.currentVersionId!;
    await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionIdToWithdraw}/withdraw`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ reason: 'Replacing draft with a test-specific accepted version.' }),
      },
    );
    const revised = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionIdToWithdraw}/revise`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({
          reason: 'Accepted version for placement.',
          offeredSalaryAmountCents: 900000,
          offeredSalaryCurrency: 'MAD',
        }),
      },
    );
    const revisedBody = OfferDetailResponseSchema.parse(await revised.json());
    const versionId = revisedBody.offer.currentVersionId!;
    await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/mark-sent`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ reason: 'Sent.' }),
      },
    );
    await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/response`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ status: 'ACCEPTED', reason: 'Candidate accepted.' }),
      },
    );
    const payload = {
      integrationStartDate: new Date('2026-09-15T00:00:00.000Z').toISOString(),
      eligibleForInvoicing: true,
      operationalNote: 'Synthetic operational note.',
    };
    const [first, second] = await Promise.all([
      fetch(
        `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/confirm-placement`,
        {
          method: 'POST',
          headers: authHeaders(recruiterToken),
          body: JSON.stringify(payload),
        },
      ),
      fetch(
        `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/confirm-placement`,
        {
          method: 'POST',
          headers: authHeaders(recruiterToken),
          body: JSON.stringify(payload),
        },
      ),
    ]);
    const firstBody = PlacementDetailResponseSchema.parse(await first.json());
    const secondBody = PlacementDetailResponseSchema.parse(await second.json());
    const reloadedMission = await prisma.recruitmentMission.findUniqueOrThrow({
      where: { id: mission.id },
    });
    const events = await prisma.placementEvent.findMany({
      where: { placement: { missionCandidateId: process.id } },
    });
    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'MissionPlacement', action: 'placements.confirmed' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.placement!.id).toBe(secondBody.placement!.id);
    expect(reloadedMission.filledPlacementCount).toBe(1);
    expect(firstBody.placement!.closureEligible).toBe(true);
    expect(events.filter((event) => event.action === 'CONFIRMED')).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(reloadedMission.state).toBe('DRAFT');
  });

  it('corrects placement once without negative counts and removes commercial eligibility', async () => {
    const { mission, process } = await createMissionWithProcess(
      'Issue29 Correction',
      recruiterUserId,
    );
    const offer = await createAcceptedOffer(baseUrl, recruiterToken, mission.id, process.id);
    const versionId = offer.offer.currentVersionId!;
    await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers/${versionId}/confirm-placement`,
      {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({
          integrationStartDate: new Date('2026-09-15T00:00:00.000Z').toISOString(),
          eligibleForInvoicing: true,
        }),
      },
    );
    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/placement/correct`, {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({ reason: 'PROBATION_FAILED', comment: 'Synthetic correction.' }),
      }),
      fetch(`${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/placement/correct`, {
        method: 'POST',
        headers: authHeaders(recruiterToken),
        body: JSON.stringify({
          reason: 'PROBATION_FAILED',
          comment: 'Synthetic correction retry.',
        }),
      }),
    ]);
    const firstBody = PlacementDetailResponseSchema.parse(await first.json());
    const secondBody = PlacementDetailResponseSchema.parse(await second.json());
    const reloadedMission = await prisma.recruitmentMission.findUniqueOrThrow({
      where: { id: mission.id },
    });
    const correctedEvents = await prisma.placementEvent.findMany({
      where: { placement: { missionCandidateId: process.id }, action: 'CORRECTED' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.placement!.status).toBe('CORRECTED');
    expect(secondBody.placement!.status).toBe('CORRECTED');
    expect(firstBody.placement!.confirmedAt).toBe(secondBody.placement!.confirmedAt);
    expect(firstBody.placement!.eligibleForInvoicing).toBe(false);
    expect(reloadedMission.filledPlacementCount).toBe(0);
    expect(correctedEvents).toHaveLength(1);
  });

  it('prevents mission/process IDOR even when the actor has offer permissions', async () => {
    const otherUserId = await createUser('other-recruiter@offers.test', RoleName.HR_MANAGER);
    const otherToken = await loginAccessToken(baseUrl, 'other-recruiter@offers.test');
    const { mission, process } = await createMissionWithProcess('Issue29 Scope', recruiterUserId);

    expect(otherUserId).not.toBe(recruiterUserId);
    const response = await fetch(
      `${baseUrl}/v1/missions/${mission.id}/candidates/${process.id}/offers`,
      {
        method: 'GET',
        headers: authHeaders(otherToken),
      },
    );

    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe('MISSION_SCOPE_REQUIRED');
  });
});
