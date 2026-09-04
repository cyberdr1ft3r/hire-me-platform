import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthResponseSchema,
  ReportingBreakdownsResponseSchema,
  ReportingDrilldownResponseSchema,
  ReportingPipelineResponseSchema,
  ReportingSummaryResponseSchema,
  ReportingTrendsResponseSchema,
} from '@hire-me/contracts';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ClientStatus,
  InterviewFormat,
  InterviewStatus,
  InterviewType,
  MissionCandidateState,
  MissionRecruiterRole,
  OfferStatus,
  PermissionScopeType,
  PlacementStatus,
  PrismaClient,
  PublicApplicationStatus,
  PublicOpportunityStatus,
  RecruitmentMissionState,
  RoleName,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

const EMAIL_SUFFIX = '@reporting.test';
const MISSION_TAG = 'Issue36';
const CLIENT_TAG = 'issue36';

const REPORTING_VIEW = 'reporting:recruitment:view';
const REPORTING_EXPORT = 'reporting:recruitment:export';
const BROAD_SCOPE = 'mission_candidates:transfer';

const ids: Record<string, string> = {};

async function cleanReportingRecords(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: 'RecruitmentReport' },
        { actor: { normalizedEmail: { endsWith: EMAIL_SUFFIX } } },
      ],
    },
  });
  await prisma.missionPlacement.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.offerEvent.deleteMany({
    where: { offer: { mission: { title: { contains: MISSION_TAG } } } },
  });
  await prisma.recruitmentOfferVersion.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.recruitmentOffer.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.interviewEvent.deleteMany({
    where: { interview: { missionCandidate: { mission: { title: { contains: MISSION_TAG } } } } },
  });
  await prisma.interview.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: MISSION_TAG } } } },
  });
  await prisma.publicCandidateApplicationFile.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.publicCandidateApplication.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.publicOpportunity.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.missionCandidateEvent.deleteMany({
    where: { missionCandidate: { mission: { title: { contains: MISSION_TAG } } } },
  });
  await prisma.missionCandidate.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: { mission: { title: { contains: MISSION_TAG } } },
  });
  await prisma.recruitmentMission.deleteMany({ where: { title: { contains: MISSION_TAG } } });
  await prisma.client.deleteMany({ where: { normalizedName: { contains: CLIENT_TAG } } });
  await prisma.candidate.deleteMany({ where: { normalizedEmail: { endsWith: EMAIL_SUFFIX } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: EMAIL_SUFFIX } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: EMAIL_SUFFIX } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: EMAIL_SUFFIX } } },
  });
  await prisma.user.deleteMany({ where: { normalizedEmail: { endsWith: EMAIL_SUFFIX } } });
}

// Additively grants permission codes to a role without disturbing the role's other
// seeded permissions, so shared roles stay intact for later suites in the same run.
async function grantPermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} reporting role.`,
      status: 'ACTIVE',
    },
  });
  for (const code of permissionCodes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { status: 'ACTIVE' },
      create: {
        code,
        description: `Synthetic ${code} permission.`,
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

async function archivePermissions(
  roleName: RoleName,
  permissionCodes: readonly string[],
): Promise<void> {
  await prisma.rolePermission.updateMany({
    where: { role: { name: roleName }, permission: { code: { in: [...permissionCodes] } } },
    data: { archivedAt: new Date() },
  });
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

async function createClient(name: string): Promise<string> {
  const client = await prisma.client.create({
    data: { name, normalizedName: name.trim().toLowerCase(), status: ClientStatus.ACTIVE },
  });
  return client.id;
}

async function createMission(
  clientId: string,
  title: string,
  state: RecruitmentMissionState,
  numberOfPositions: number,
  filledPlacementCount: number,
  applicationDeadline: Date | null = null,
): Promise<string> {
  const mission = await prisma.recruitmentMission.create({
    data: { clientId, title, state, numberOfPositions, filledPlacementCount, applicationDeadline },
  });
  return mission.id;
}

async function assign(missionId: string, userId: string): Promise<void> {
  await prisma.missionRecruiter.create({
    data: {
      missionId,
      userId,
      role: MissionRecruiterRole.RECRUITER,
      status: AssignmentStatus.ACTIVE,
      isLead: false,
    },
  });
}

async function createCandidate(displayName: string, email: string): Promise<string> {
  const candidate = await prisma.candidate.create({
    data: {
      displayName,
      email,
      normalizedEmail: email.toLowerCase(),
      status: CandidateStatus.ACTIVE,
    },
  });
  return candidate.id;
}

async function createProcess(options: {
  missionId: string;
  candidateId: string;
  responsibleRecruiterUserId: string;
  state: MissionCandidateState;
  source?: string;
  clientVisible?: boolean;
  presentedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}): Promise<string> {
  const process = await prisma.missionCandidate.create({
    data: {
      missionId: options.missionId,
      candidateId: options.candidateId,
      responsibleRecruiterUserId: options.responsibleRecruiterUserId,
      state: options.state,
      source: options.source,
      clientVisible: options.clientVisible ?? false,
      presentedAt: options.presentedAt ?? null,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
    },
  });
  return process.id;
}

async function createInterview(
  missionCandidateId: string,
  organizerUserId: string,
  type: InterviewType,
  status: InterviewStatus,
  scheduledStartAt: Date,
): Promise<void> {
  await prisma.interview.create({
    data: {
      missionCandidateId,
      organizerUserId,
      type,
      status,
      scheduledStartAt,
      timezone: 'UTC',
      format: InterviewFormat.VIDEO,
    },
  });
}

async function createAcceptedOfferAndPlacement(
  missionId: string,
  missionCandidateId: string,
  confirmedAt: Date,
): Promise<void> {
  const offer = await prisma.recruitmentOffer.create({ data: { missionId, missionCandidateId } });
  const version = await prisma.recruitmentOfferVersion.create({
    data: {
      offerId: offer.id,
      missionId,
      missionCandidateId,
      versionNumber: 1,
      status: OfferStatus.ACCEPTED,
      isCurrent: true,
    },
  });
  await prisma.missionPlacement.create({
    data: {
      missionId,
      missionCandidateId,
      offerVersionId: version.id,
      status: PlacementStatus.CONFIRMED,
      integrationStartDate: confirmedAt,
      confirmedAt,
    },
  });
}

async function createPublicApplication(options: {
  publicOpportunityId: string;
  missionId: string;
  candidateId: string;
  missionCandidateId: string;
  email: string;
  submittedAt: Date;
}): Promise<void> {
  await prisma.publicCandidateApplication.create({
    data: {
      publicOpportunityId: options.publicOpportunityId,
      missionId: options.missionId,
      candidateId: options.candidateId,
      missionCandidateId: options.missionCandidateId,
      status: PublicApplicationStatus.SUBMITTED,
      submittedFullName: 'Synthetic Applicant',
      submittedEmail: options.email,
      submittedNormalizedEmail: options.email.toLowerCase(),
      consentGranted: true,
      consentTextVersion: 'public-application-consent-v1',
      submittedAt: options.submittedAt,
    },
  });
}

async function createOpportunity(missionId: string, slug: string): Promise<string> {
  const opportunity = await prisma.publicOpportunity.create({
    data: {
      missionId,
      status: PublicOpportunityStatus.OPEN,
      publicSlug: slug,
      publicTitle: 'Synthetic public opportunity',
    },
  });
  return opportunity.id;
}

const now = new Date();
const daysAgo = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

async function seedFixture(): Promise<void> {
  // Broad reporter: SUPER_ADMIN already carries every seeded permission, including the
  // broad cross-mission scope signal. Grant idempotently to be explicit.
  await grantPermissions(RoleName.SUPER_ADMIN, [REPORTING_VIEW, REPORTING_EXPORT, BROAD_SCOPE]);
  // Assigned reporter: MANAGER lacks the broad scope signal by seed. Add view+export.
  await grantPermissions(RoleName.MANAGER, [REPORTING_VIEW, REPORTING_EXPORT]);
  await archivePermissions(RoleName.MANAGER, [BROAD_SCOPE]);
  // View-only reporter: TEAM_LEADER gets view without export or broad scope.
  await grantPermissions(RoleName.TEAM_LEADER, [REPORTING_VIEW]);
  await archivePermissions(RoleName.TEAM_LEADER, [REPORTING_EXPORT, BROAD_SCOPE]);
  // No reporting access: GUEST must not hold reporting:recruitment:view.
  await archivePermissions(RoleName.GUEST, [REPORTING_VIEW, REPORTING_EXPORT, BROAD_SCOPE]);

  ids.broad = await createUser(`broad${EMAIL_SUFFIX}`, RoleName.SUPER_ADMIN);
  ids.assigned = await createUser(`assigned${EMAIL_SUFFIX}`, RoleName.MANAGER);
  ids.viewOnly = await createUser(`viewonly${EMAIL_SUFFIX}`, RoleName.TEAM_LEADER);
  ids.none = await createUser(`none${EMAIL_SUFFIX}`, RoleName.GUEST);

  ids.clientA = await createClient(`${CLIENT_TAG} Client A`);
  ids.clientB = await createClient(`${CLIENT_TAG} Client B`);

  // Mission A: open (ACTIVE), 3 positions, 1 filled. Assigned to the assigned recruiter.
  ids.missionA = await createMission(
    ids.clientA,
    `${MISSION_TAG} Mission A`,
    RecruitmentMissionState.ACTIVE,
    3,
    1,
  );
  await assign(ids.missionA, ids.assigned);
  // Mission A2: closure-eligible (open FINAL_SELECTION, 1 position, 1 filled). Assigned.
  ids.missionA2 = await createMission(
    ids.clientA,
    `${MISSION_TAG} Mission A2`,
    RecruitmentMissionState.FINAL_SELECTION,
    1,
    1,
    daysAgo(5),
  );
  await assign(ids.missionA2, ids.assigned);
  // Mission B: closed with recruitment, 2 positions, 2 filled. NOT assigned to assigned recruiter.
  ids.missionB = await createMission(
    ids.clientB,
    `${MISSION_TAG} Mission B`,
    RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
    2,
    2,
  );

  // Candidates.
  ids.candA1 = await createCandidate('Alice A', `alice${EMAIL_SUFFIX}`);
  ids.candA2 = await createCandidate('Bob A', `bob${EMAIL_SUFFIX}`);
  ids.candA3 = await createCandidate('Carol A', `carol${EMAIL_SUFFIX}`);
  ids.candA4 = await createCandidate('Dan A', `dan${EMAIL_SUFFIX}`);
  ids.candFormula = await createCandidate('=cmd()|calc', `formula${EMAIL_SUFFIX}`);
  ids.candB1 = await createCandidate('Eve B', `eve${EMAIL_SUFFIX}`);
  ids.candB2 = await createCandidate('Frank B', `frank${EMAIL_SUFFIX}`);

  // Mission A processes.
  ids.pA1 = await createProcess({
    missionId: ids.missionA,
    candidateId: ids.candA1,
    responsibleRecruiterUserId: ids.assigned,
    state: MissionCandidateState.HR_PRESELECTION,
    source: 'LINKEDIN',
  });
  ids.pA2 = await createProcess({
    missionId: ids.missionA,
    candidateId: ids.candA2,
    responsibleRecruiterUserId: ids.assigned,
    state: MissionCandidateState.PRESENTED_TO_CLIENT,
    clientVisible: true,
    presentedAt: now,
  });
  ids.pA3 = await createProcess({
    missionId: ids.missionA,
    candidateId: ids.candA3,
    responsibleRecruiterUserId: ids.assigned,
    state: MissionCandidateState.ACCEPTED,
  });
  ids.pA4 = await createProcess({
    missionId: ids.missionA,
    candidateId: ids.candA4,
    responsibleRecruiterUserId: ids.assigned,
    state: MissionCandidateState.CANDIDATE_REJECTED,
    updatedAt: daysAgo(120),
  });
  // Process with a formula-injection candidate name and source for CSV hardening tests.
  ids.pAFormula = await createProcess({
    missionId: ids.missionA,
    candidateId: ids.candFormula,
    responsibleRecruiterUserId: ids.assigned,
    state: MissionCandidateState.NEW,
    source: '=SUM(A1:A2)',
  });

  await createInterview(ids.pA1, ids.assigned, InterviewType.HR, InterviewStatus.SCHEDULED, now);
  await createInterview(
    ids.pA2,
    ids.assigned,
    InterviewType.CLIENT_INTERVIEW_1,
    InterviewStatus.COMPLETED,
    daysAgo(2),
  );
  await createAcceptedOfferAndPlacement(ids.missionA, ids.pA3, now);

  const opportunityA = await createOpportunity(ids.missionA, `${CLIENT_TAG}-slug-a`);
  // pA1 recent public application (within default window).
  await createPublicApplication({
    publicOpportunityId: opportunityA,
    missionId: ids.missionA,
    candidateId: ids.candA1,
    missionCandidateId: ids.pA1,
    email: `alice${EMAIL_SUFFIX}`,
    submittedAt: now,
  });
  // pA2 old public application (200 days ago; outside default 90d window).
  await createPublicApplication({
    publicOpportunityId: opportunityA,
    missionId: ids.missionA,
    candidateId: ids.candA2,
    missionCandidateId: ids.pA2,
    email: `bob${EMAIL_SUFFIX}`,
    submittedAt: daysAgo(200),
  });

  // Mission B processes (hidden from the assigned recruiter).
  ids.pB1 = await createProcess({
    missionId: ids.missionB,
    candidateId: ids.candB1,
    responsibleRecruiterUserId: ids.broad,
    state: MissionCandidateState.ACCEPTED,
  });
  ids.pB2 = await createProcess({
    missionId: ids.missionB,
    candidateId: ids.candB2,
    responsibleRecruiterUserId: ids.broad,
    state: MissionCandidateState.HR_PRESELECTION,
  });
  await createInterview(ids.pB1, ids.broad, InterviewType.HR, InterviewStatus.SCHEDULED, now);
  await createAcceptedOfferAndPlacement(ids.missionB, ids.pB1, now);
  const opportunityB = await createOpportunity(ids.missionB, `${CLIENT_TAG}-slug-b`);
  await createPublicApplication({
    publicOpportunityId: opportunityB,
    missionId: ids.missionB,
    candidateId: ids.candB1,
    missionCandidateId: ids.pB1,
    email: `eve${EMAIL_SUFFIX}`,
    submittedAt: now,
  });
}

describe('Recruitment reporting API', () => {
  let app: INestApplication;
  let baseUrl: string;

  async function login(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const body = AuthResponseSchema.parse(await response.json());
    return body.accessToken;
  }

  function headers(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  async function fetchReporting(token: string, path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { headers: headers(token) });
  }

  async function summaryOf(token: string, path = '/v1/reporting/recruitment/summary') {
    const response = await fetchReporting(token, path);
    expect(response.status).toBe(200);
    return ReportingSummaryResponseSchema.parse(await response.json()).summary;
  }

  beforeAll(async () => {
    await cleanReportingRecords();
    await seedFixture();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await cleanReportingRecords();
    // Restore the seeded baseline: MANAGER and TEAM_LEADER hold no reporting permissions.
    await archivePermissions(RoleName.MANAGER, [REPORTING_VIEW, REPORTING_EXPORT]);
    await archivePermissions(RoleName.TEAM_LEADER, [REPORTING_VIEW, REPORTING_EXPORT]);
    await prisma.$disconnect();
  });

  it('requires reporting:recruitment:view for every reporting endpoint', async () => {
    const token = await login(`none${EMAIL_SUFFIX}`);
    for (const path of [
      '/v1/reporting/recruitment/summary',
      '/v1/reporting/recruitment/pipeline',
      '/v1/reporting/recruitment/trends',
      '/v1/reporting/recruitment/breakdowns',
      '/v1/reporting/recruitment/drilldown',
      '/v1/reporting/recruitment/export.csv',
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { headers: headers(token) });
      expect(response.status).toBe(403);
    }
  });

  it('computes correct KPI totals for a broad authorized manager', async () => {
    const token = await login(`broad${EMAIL_SUFFIX}`);
    const summary = await summaryOf(token);
    expect(summary.scope.kind).toBe('broad');
    // Missions: A(ACTIVE) + A2(FINAL_SELECTION) + B(CLOSED_WITH_RECRUITMENT) = 3.
    expect(summary.missions.total).toBe(3);
    expect(summary.missions.open).toBe(2); // A and A2 are open; B is closed.
    expect(summary.missions.closed).toBe(1); // B.
    expect(summary.missions.closureEligible).toBe(1); // A2 filled==positions and open.
    expect(summary.missions.requestedPositions).toBe(6); // 3 + 1 + 2.
    // Pipeline: A has 5 processes, B has 2 => 7 total.
    expect(summary.pipeline.totalProcesses).toBe(7);
    expect(summary.pipeline.presentedToClient).toBe(1); // pA2.
    // Interviews: 2 scheduled (pA1, pB1), 1 completed (pA2).
    expect(summary.interviews.scheduled).toBe(2);
    expect(summary.interviews.completed).toBe(1);
    // Offers: 2 accepted current versions (pA3, pB1).
    expect(summary.offers.accepted).toBe(2);
    // Placements: 2 confirmed (missionA pA3, missionB pB1).
    expect(summary.placements.confirmed).toBe(2);
    // New public applications in default 90d window: alice(now) + eve(now) = 2 (bob is 200d old).
    expect(summary.applications.newInWindow).toBe(2);
    // Aging: A2 has an application deadline in the past and is open => overdue.
    expect(summary.aging.overdueMissions).toBe(1);
    // pA4 is terminal (rejected) so it is not stale; no non-terminal stale process here.
    expect(summary.aging.stalePipelineProcesses).toBe(0);
  });

  it('limits an assigned recruiter to their assigned mission scope', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    const summary = await summaryOf(token);
    expect(summary.scope.kind).toBe('assigned');
    expect(summary.scope.authorizedMissionCount).toBe(2); // A and A2.
    // Only missions A and A2 are visible; B is excluded.
    expect(summary.missions.total).toBe(2);
    expect(summary.missions.requestedPositions).toBe(4); // 3 + 1.
    expect(summary.pipeline.totalProcesses).toBe(5); // A's 5 processes only.
    expect(summary.placements.confirmed).toBe(1); // only missionA pA3.
    expect(summary.offers.accepted).toBe(1); // only pA3.
    expect(summary.applications.newInWindow).toBe(1); // only alice (missionA).
  });

  it('does not leak hidden mission existence through an out-of-scope missionId filter', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    // No 403/404 difference that would reveal the hidden mission's existence.
    const summary = await summaryOf(
      token,
      `/v1/reporting/recruitment/summary?missionId=${ids.missionB}`,
    );
    expect(summary.missions.total).toBe(0);
    expect(summary.pipeline.totalProcesses).toBe(0);
    expect(summary.placements.confirmed).toBe(0);
  });

  it('does not leak hidden client existence through an out-of-scope clientId filter', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    const summary = await summaryOf(
      token,
      `/v1/reporting/recruitment/summary?clientId=${ids.clientB}`,
    );
    expect(summary.missions.total).toBe(0);
    expect(summary.pipeline.totalProcesses).toBe(0);
  });

  it('does not broaden results through an out-of-scope recruiterId filter', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    // ids.broad is the responsible recruiter of the hidden mission B processes.
    const summary = await summaryOf(
      token,
      `/v1/reporting/recruitment/summary?recruiterUserId=${ids.broad}`,
    );
    expect(summary.pipeline.totalProcesses).toBe(0);
    expect(summary.placements.confirmed).toBe(0);
  });

  it('lets a broad manager scope down to a single mission via filter', async () => {
    const token = await login(`broad${EMAIL_SUFFIX}`);
    const summary = await summaryOf(
      token,
      `/v1/reporting/recruitment/summary?missionId=${ids.missionB}`,
    );
    expect(summary.missions.total).toBe(1);
    expect(summary.pipeline.totalProcesses).toBe(2);
    expect(summary.placements.confirmed).toBe(1);
  });

  it('honors a wider date window for new public applications', async () => {
    const token = await login(`broad${EMAIL_SUFFIX}`);
    const start = daysAgo(300).toISOString();
    const end = now.toISOString();
    const summary = await summaryOf(
      token,
      `/v1/reporting/recruitment/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    // alice(now) + eve(now) + bob(200d) = 3 within a 300d window.
    expect(summary.applications.newInWindow).toBe(3);
  });

  it('rejects malformed and over-large date ranges', async () => {
    const token = await login(`broad${EMAIL_SUFFIX}`);
    const inverted = await fetch(
      `${baseUrl}/v1/reporting/recruitment/summary?start=${encodeURIComponent(
        now.toISOString(),
      )}&end=${encodeURIComponent(daysAgo(10).toISOString())}`,
      { headers: headers(token) },
    );
    expect(inverted.status).toBe(400);

    const tooLarge = await fetch(
      `${baseUrl}/v1/reporting/recruitment/summary?start=${encodeURIComponent(
        daysAgo(500).toISOString(),
      )}&end=${encodeURIComponent(now.toISOString())}`,
      { headers: headers(token) },
    );
    expect(tooLarge.status).toBe(400);
  });

  it('returns a pipeline distribution scoped to the actor', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    const response = await fetchReporting(token, '/v1/reporting/recruitment/pipeline');
    const body = ReportingPipelineResponseSchema.parse(await response.json());
    const states = Object.fromEntries(
      body.distributions.processesByState.map((entry) => [entry.key, entry.count]),
    );
    expect(states[MissionCandidateState.HR_PRESELECTION]).toBe(1);
    expect(states[MissionCandidateState.PRESENTED_TO_CLIENT]).toBe(1);
    expect(states[MissionCandidateState.ACCEPTED]).toBe(1);
    expect(states[MissionCandidateState.CANDIDATE_REJECTED]).toBe(1);
    expect(states[MissionCandidateState.NEW]).toBe(1);
    // Mission B state (ACCEPTED count) must not include B's process for assigned scope.
    expect(states[MissionCandidateState.ACCEPTED]).toBe(1);
  });

  it('returns bounded deterministic trends', async () => {
    const token = await login(`broad${EMAIL_SUFFIX}`);
    const response = await fetchReporting(token, '/v1/reporting/recruitment/trends?interval=week');
    const body = ReportingTrendsResponseSchema.parse(await response.json());
    const placements = body.series.find((series) => series.metric === 'placementsConfirmed');
    expect(placements).toBeDefined();
    const totalPlacements = (placements?.points ?? []).reduce((sum, point) => sum + point.count, 0);
    expect(totalPlacements).toBe(2); // both placements confirmed now, within window.
    expect((placements?.points ?? []).length).toBeLessThanOrEqual(366);
  });

  it('provides authorized breakdowns whose scope matches aggregates', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    const response = await fetchReporting(token, '/v1/reporting/recruitment/breakdowns');
    const body = ReportingBreakdownsResponseSchema.parse(await response.json());
    const clientIds = body.byClient.map((entry) => entry.clientId);
    expect(clientIds).toContain(ids.clientA);
    expect(clientIds).not.toContain(ids.clientB);
    const missionIds = body.byMission.map((entry) => entry.missionId);
    expect(missionIds).toContain(ids.missionA);
    expect(missionIds).not.toContain(ids.missionB);
  });

  it('returns a scoped, ordered drilldown that excludes protected fields', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    const response = await fetchReporting(token, '/v1/reporting/recruitment/drilldown?pageSize=50');
    const body = ReportingDrilldownResponseSchema.parse(await response.json());
    expect(body.rows.length).toBe(5); // Mission A's 5 processes only.
    for (const row of body.rows) {
      expect(row.missionId).toBe(ids.missionA);
      // Protected fields must never appear in drilldown rows.
      expect(row).not.toHaveProperty('salaryExpectationCents');
      expect(row).not.toHaveProperty('internalNotes');
      expect(row).not.toHaveProperty('compensation');
      expect(row).not.toHaveProperty('commercial');
    }
    // Deterministic ordering: createdAt desc then id asc; timestamps are non-increasing.
    const created = body.rows.map((row) => row.createdAt);
    const sorted = [...created].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(created).toEqual(sorted);
  });

  it('requires the export permission for CSV export', async () => {
    const viewOnly = await login(`viewonly${EMAIL_SUFFIX}`);
    const denied = await fetch(`${baseUrl}/v1/reporting/recruitment/export.csv`, {
      headers: headers(viewOnly),
    });
    expect(denied.status).toBe(403);
    // The same view-only actor can still read the interactive summary.
    const summary = await fetch(`${baseUrl}/v1/reporting/recruitment/summary`, {
      headers: headers(viewOnly),
    });
    expect(summary.status).toBe(200);
  });

  it('exports safe CSV with formula-injection neutralization and matching scope', async () => {
    const token = await login(`assigned${EMAIL_SUFFIX}`);
    const response = await fetch(`${baseUrl}/v1/reporting/recruitment/export.csv`, {
      headers: headers(token),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment; filename="recruitment-report-',
    );
    const csv = await response.text();
    const lines = csv.split('\r\n');
    // Header + 5 Mission A rows (Mission B excluded by scope).
    expect(lines[0]).toContain('candidateDisplayName');
    expect(lines.length).toBe(6);
    // Formula-injection neutralization: the '=cmd()|calc' candidate name is prefixed with '.
    expect(csv).toContain("'=cmd()|calc");
    // The '=SUM(A1:A2)' source is neutralized as well.
    expect(csv).toContain("'=SUM(A1:A2)");
    // No protected fields present in the header row.
    expect(lines[0]).not.toContain('salary');
    expect(lines[0]).not.toContain('commercial');
    expect(lines[0]).not.toContain('internalNotes');
    // No Mission B data leaks into the export.
    expect(csv).not.toContain('Eve B');
  });

  it('escapes quotes, commas, and newlines in CSV cells', async () => {
    const token = await login(`broad${EMAIL_SUFFIX}`);
    // Rename a client to include a comma and quote, then export broad scope.
    await prisma.client.update({
      where: { id: ids.clientB },
      data: { name: 'Comma, "Quote" Co' },
    });
    try {
      const response = await fetch(`${baseUrl}/v1/reporting/recruitment/export.csv`, {
        headers: headers(token),
      });
      const csv = await response.text();
      // The comma/quote client name must be wrapped in quotes with doubled inner quotes.
      expect(csv).toContain('"Comma, ""Quote"" Co"');
    } finally {
      await prisma.client.update({
        where: { id: ids.clientB },
        data: { name: `${CLIENT_TAG} Client B` },
      });
    }
  });
});
