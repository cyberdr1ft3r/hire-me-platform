/**
 * Rich disposable Missions fixture for Issue #118 browser evidence.
 */
import {
  InterviewFormat,
  InterviewStatus,
  InterviewType,
  OfferStatus,
  PrismaClient,
  PublicApplicationStatus,
  PublicOpportunityStatus,
} from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();

const MISSION_TITLE = 'Issue118 Evidence Mission';
const CLIENT_NAME = 'Issue118 Evidence Client';
const SLUG = 'issue118-evidence-role';

const CANDIDATES = [
  {
    name: 'Issue118 Primary Candidate',
    email: 'issue118-primary@test.hireme.test',
    state: 'CLIENT_OFFER' as const,
  },
  {
    name: 'Issue118 Second Candidate',
    email: 'issue118-second@test.hireme.test',
    state: 'HR_INTERVIEW_SCHEDULED' as const,
  },
  {
    name: 'Issue118 Third Candidate',
    email: 'issue118-third@test.hireme.test',
    state: 'NEW' as const,
  },
];

async function main(): Promise<void> {
  const admin = await prisma.user.findFirstOrThrow({
    where: { normalizedEmail: 'admin@example.test' },
  });

  let client = await prisma.client.findFirst({
    where: { normalizedName: CLIENT_NAME.toLowerCase() },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: CLIENT_NAME,
        normalizedName: CLIENT_NAME.toLowerCase(),
        status: 'ACTIVE',
        city: 'Casablanca',
        country: 'Morocco',
      },
    });
  }

  let mission = await prisma.recruitmentMission.findFirst({
    where: { clientId: client.id, title: MISSION_TITLE },
  });
  if (!mission) {
    mission = await prisma.recruitmentMission.create({
      data: {
        clientId: client.id,
        title: MISSION_TITLE,
        description: 'Rich synthetic mission for Issue #118 IA evidence.',
        requirements: 'Evidence-only requirements text.',
        state: 'ACTIVE',
        priority: 'NORMAL',
        numberOfPositions: 2,
        location: 'Casablanca',
        workArrangement: 'Hybrid',
        engagementType: 'CDI',
      },
    });
  }

  const existingRecruiter = await prisma.missionRecruiter.findFirst({
    where: { missionId: mission.id, userId: admin.id, archivedAt: null },
  });
  if (!existingRecruiter) {
    await prisma.missionRecruiter.create({
      data: {
        missionId: mission.id,
        userId: admin.id,
        role: 'RECRUITER',
        isLead: true,
        status: 'ACTIVE',
      },
    });
  }

  const processIds: Record<string, string> = {};
  for (const spec of CANDIDATES) {
    const normalizedEmail = spec.email.toLowerCase();
    let candidate = await prisma.candidate.findFirst({
      where: { normalizedEmail },
    });
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          displayName: spec.name,
          email: spec.email,
          normalizedEmail,
          currentJobTitle: 'Engineer',
          city: 'Casablanca',
          country: 'Morocco',
          status: 'ACTIVE',
          source: 'Other',
        },
      });
    }

    let process = await prisma.missionCandidate.findFirst({
      where: { missionId: mission.id, candidateId: candidate.id },
    });
    if (!process) {
      process = await prisma.missionCandidate.create({
        data: {
          missionId: mission.id,
          candidateId: candidate.id,
          responsibleRecruiterUserId: admin.id,
          state: spec.state,
          priority: 'NORMAL',
          clientVisible: true,
        },
      });
    } else if (process.state !== spec.state) {
      process = await prisma.missionCandidate.update({
        where: { id: process.id },
        data: { state: spec.state },
      });
    }
    processIds[spec.name] = process.id;

    if (spec.name === CANDIDATES[0]!.name) {
      const interviewExists = await prisma.interview.findFirst({
        where: { missionCandidateId: process.id },
      });
      if (!interviewExists) {
        await prisma.interview.create({
          data: {
            missionCandidateId: process.id,
            type: InterviewType.HR,
            scheduledStartAt: new Date(Date.now() + 86_400_000),
            scheduledEndAt: new Date(Date.now() + 88_200_000),
            timezone: 'Africa/Casablanca',
            format: InterviewFormat.VIDEO,
            meetingUrl: 'https://meet.example.test/issue118',
            organizerUserId: admin.id,
            status: InterviewStatus.SCHEDULED,
          },
        });
      }

      let offer = await prisma.recruitmentOffer.findUnique({
        where: { missionCandidateId: process.id },
      });
      if (!offer) {
        offer = await prisma.recruitmentOffer.create({
          data: {
            missionId: mission.id,
            missionCandidateId: process.id,
            createdByUserId: admin.id,
            versions: {
              create: {
                missionId: mission.id,
                missionCandidateId: process.id,
                versionNumber: 1,
                status: OfferStatus.SENT,
                isCurrent: true,
                contractType: 'CDI',
                offeredSalaryAmountCents: 450_000,
                offeredSalaryCurrency: 'MAD',
                createdByUserId: admin.id,
                sentByUserId: admin.id,
                sentAt: new Date(),
              },
            },
          },
        });
      }
      void offer;
    }
  }

  let publicOpportunity = await prisma.publicOpportunity.findUnique({
    where: { missionId: mission.id },
  });
  if (!publicOpportunity) {
    publicOpportunity = await prisma.publicOpportunity.create({
      data: {
        missionId: mission.id,
        status: PublicOpportunityStatus.OPEN,
        applicationLinkEnabled: true,
        listedOnWebsite: true,
        publicSlug: SLUG,
        publicTitle: 'Issue118 public role',
        publicSummary: 'Public summary for evidence.',
        publicDescription: 'Public description for Issue #118 evidence.',
        publicLocation: 'Casablanca',
      },
    });
  }

  const primaryProcessId = processIds[CANDIDATES[0]!.name]!;
  const primaryCandidate = await prisma.candidate.findFirstOrThrow({
    where: { normalizedEmail: CANDIDATES[0]!.email.toLowerCase() },
  });
  const appExists = await prisma.publicCandidateApplication.findFirst({
    where: { publicOpportunityId: publicOpportunity.id },
  });
  if (!appExists) {
    await prisma.publicCandidateApplication.create({
      data: {
        publicOpportunityId: publicOpportunity.id,
        missionId: mission.id,
        candidateId: primaryCandidate.id,
        missionCandidateId: primaryProcessId,
        status: PublicApplicationStatus.SUBMITTED,
        submittedFullName: 'Issue118 Applicant',
        submittedEmail: 'issue118-applicant@test.hireme.test',
        submittedNormalizedEmail: 'issue118-applicant@test.hireme.test',
        consentGranted: true,
        consentTextVersion: 'public-application-consent-v1',
      },
    });
  }

  const interview = await prisma.interview.findFirstOrThrow({
    where: { missionCandidateId: primaryProcessId },
  });

  console.log(
    JSON.stringify(
      {
        missionTitle: MISSION_TITLE,
        missionId: mission.id,
        primaryProcessId,
        primaryCandidateName: CANDIDATES[0]!.name,
        interviewId: interview.id,
        publicSlug: SLUG,
        processIds,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
