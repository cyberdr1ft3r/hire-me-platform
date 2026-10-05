/**
 * Disposable local setup for Issue #116 stacked master-detail browser evidence.
 * Creates synthetic client, candidate, mission, and pipeline process in the active DATABASE_URL.
 */
import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();

const CLIENT_NAME = 'Issue116 Evidence Client';
const CONTACT_NAME = 'Issue116 Evidence Contact';
const CONTACT_EMAIL = 'issue116-contact@test.hireme.test';
const CANDIDATE_NAME = 'Issue116 Evidence Candidate';
const CANDIDATE_EMAIL = 'issue116-candidate@test.hireme.test';
const MISSION_TITLE = 'Issue116 Evidence Mission';

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

  const normalizedContactEmail = CONTACT_EMAIL.toLowerCase();
  let contact = await prisma.clientContact.findFirst({
    where: { clientId: client.id, normalizedEmail: normalizedContactEmail },
  });
  if (!contact) {
    contact = await prisma.clientContact.create({
      data: {
        clientId: client.id,
        displayName: CONTACT_NAME,
        email: CONTACT_EMAIL,
        normalizedEmail: normalizedContactEmail,
        roleTitle: 'HR Partner',
      },
    });
  }

  const normalizedCandidateEmail = CANDIDATE_EMAIL.toLowerCase();
  let candidate = await prisma.candidate.findFirst({
    where: { normalizedEmail: normalizedCandidateEmail },
  });
  if (!candidate) {
    candidate = await prisma.candidate.create({
      data: {
        displayName: CANDIDATE_NAME,
        email: CANDIDATE_EMAIL,
        normalizedEmail: normalizedCandidateEmail,
        currentJobTitle: 'Software Engineer',
        city: 'Casablanca',
        country: 'Morocco',
        status: 'ACTIVE',
        source: 'Other',
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
        description: 'Synthetic mission for Issue #116 stacked reveal evidence.',
        state: 'ACTIVE',
        priority: 'NORMAL',
        numberOfPositions: 1,
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

  let process = await prisma.missionCandidate.findFirst({
    where: { missionId: mission.id, candidateId: candidate.id },
  });
  if (!process) {
    process = await prisma.missionCandidate.create({
      data: {
        missionId: mission.id,
        candidateId: candidate.id,
        responsibleRecruiterUserId: admin.id,
        state: 'NEW',
        priority: 'NORMAL',
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        clientName: CLIENT_NAME,
        contactName: CONTACT_NAME,
        candidateName: CANDIDATE_NAME,
        missionTitle: MISSION_TITLE,
        ids: {
          clientId: client.id,
          contactId: contact.id,
          candidateId: candidate.id,
          missionId: mission.id,
          missionCandidateId: process.id,
        },
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
