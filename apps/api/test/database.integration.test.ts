import {
  CandidateDocumentType,
  DocumentType,
  DocumentVersionSource,
  DocumentVisibility,
  MissionRecruiterRole,
  Prisma,
  PrismaClient,
  UserType,
} from '../src/persistence/prisma/generated-client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

async function cleanDatabase(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.document.updateMany({ data: { currentVersionId: null } });
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.candidateDocument.updateMany({ data: { currentVersionId: null } });
  await prisma.candidateDocumentVersion.deleteMany();
  await prisma.candidateDocument.deleteMany();
  await prisma.candidateSkill.deleteMany();
  await prisma.candidateLanguage.deleteMany();
  await prisma.candidateWorkExperience.deleteMany();
  await prisma.candidateEducation.deleteMany();
  await prisma.candidateEvaluation.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.trainingSessionParticipation.deleteMany();
  await prisma.trainingEnrollment.deleteMany();
  await prisma.trainingSession.deleteMany();
  await prisma.trainingProgram.deleteMany();
  await prisma.externalTrainingParticipant.deleteMany();
  await prisma.missionCandidateEvent.deleteMany();
  await prisma.missionCandidate.deleteMany();
  await prisma.missionRecruiter.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.recruitmentMission.deleteMany();
  await prisma.client.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
}

function expectUniqueConstraint(error: unknown): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
}

function expectForeignKeyConstraint(error: unknown): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');
}

async function createUser(email: string, displayName: string, userType = UserType.INTERNAL) {
  return prisma.user.create({
    data: {
      displayName,
      email,
      normalizedEmail: email.toLowerCase(),
      userType,
    },
  });
}

describe('foundational Prisma schema', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('preserves one candidate across multiple recruitment missions', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Synthetic Client Alpha',
        normalizedName: 'synthetic client alpha',
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        displayName: 'Synthetic Candidate',
        email: 'candidate.issue3@example.test',
        normalizedEmail: 'candidate.issue3@example.test',
      },
    });
    const responsibleRecruiter = await createUser(
      'mission-candidate-owner.issue3@example.test',
      'Synthetic Responsible Recruiter',
    );
    const firstMission = await prisma.recruitmentMission.create({
      data: {
        clientId: client.id,
        title: 'Synthetic Mission One',
      },
    });
    const secondMission = await prisma.recruitmentMission.create({
      data: {
        clientId: client.id,
        title: 'Synthetic Mission Two',
      },
    });

    await prisma.missionCandidate.createMany({
      data: [
        {
          candidateId: candidate.id,
          missionId: firstMission.id,
          responsibleRecruiterUserId: responsibleRecruiter.id,
        },
        {
          candidateId: candidate.id,
          missionId: secondMission.id,
          responsibleRecruiterUserId: responsibleRecruiter.id,
        },
      ],
    });

    const storedCandidate = await prisma.candidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { missionCandidates: true },
    });

    expect(storedCandidate.missionCandidates).toHaveLength(2);
    expect(storedCandidate.missionCandidates.map((entry) => entry.missionId).sort()).toEqual(
      [firstMission.id, secondMission.id].sort(),
    );
  });

  it('supports multiple recruiters on one mission and prevents duplicate recruiter roles', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Synthetic Client Beta',
        normalizedName: 'synthetic client beta',
      },
    });
    const mission = await prisma.recruitmentMission.create({
      data: {
        clientId: client.id,
        title: 'Synthetic Multi Recruiter Mission',
      },
    });
    const leadRecruiter = await createUser('lead.recruiter@example.test', 'Lead Recruiter');
    const recruiter = await createUser('recruiter@example.test', 'Recruiter');

    await prisma.missionRecruiter.createMany({
      data: [
        {
          missionId: mission.id,
          userId: leadRecruiter.id,
          role: MissionRecruiterRole.LEAD_RECRUITER,
          isLead: true,
        },
        {
          missionId: mission.id,
          userId: recruiter.id,
          role: MissionRecruiterRole.RECRUITER,
        },
      ],
    });

    const storedMission = await prisma.recruitmentMission.findUniqueOrThrow({
      where: { id: mission.id },
      include: { recruiters: true },
    });

    expect(storedMission.recruiters).toHaveLength(2);

    await expect(
      prisma.missionRecruiter.create({
        data: {
          missionId: mission.id,
          userId: recruiter.id,
          role: MissionRecruiterRole.RECRUITER,
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectUniqueConstraint(error);
      return true;
    });
  });

  it('supports multiple contacts per client and enforces client-scoped normalized email uniqueness', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Synthetic Client Gamma',
        normalizedName: 'synthetic client gamma',
      },
    });

    await prisma.clientContact.createMany({
      data: [
        {
          clientId: client.id,
          displayName: 'Primary Contact',
          email: 'primary@example.test',
          normalizedEmail: 'primary@example.test',
        },
        {
          clientId: client.id,
          displayName: 'Secondary Contact',
          email: 'secondary@example.test',
          normalizedEmail: 'secondary@example.test',
        },
      ],
    });

    const storedClient = await prisma.client.findUniqueOrThrow({
      where: { id: client.id },
      include: { contacts: true },
    });

    expect(storedClient.contacts).toHaveLength(2);

    await expect(
      prisma.clientContact.create({
        data: {
          clientId: client.id,
          displayName: 'Duplicate Contact',
          email: 'PRIMARY@example.test',
          normalizedEmail: 'primary@example.test',
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectUniqueConstraint(error);
      return true;
    });
  });

  it('enforces normalized user and candidate email uniqueness', async () => {
    await createUser('unique.user@example.test', 'Unique User');

    await expect(createUser('UNIQUE.USER@example.test', 'Duplicate User')).rejects.toSatisfy(
      (error: unknown) => {
        expectUniqueConstraint(error);
        return true;
      },
    );

    await prisma.candidate.create({
      data: {
        displayName: 'Unique Candidate',
        email: 'unique.candidate@example.test',
        normalizedEmail: 'unique.candidate@example.test',
      },
    });

    await expect(
      prisma.candidate.create({
        data: {
          displayName: 'Duplicate Candidate',
          email: 'UNIQUE.CANDIDATE@example.test',
          normalizedEmail: 'unique.candidate@example.test',
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectUniqueConstraint(error);
      return true;
    });
  });

  it('models safe document ownership, visibility, and version history', async () => {
    const owner = await createUser('document.owner@example.test', 'Document Owner');
    const candidate = await prisma.candidate.create({
      data: {
        displayName: 'Document Candidate',
        email: 'document.candidate@example.test',
        normalizedEmail: 'document.candidate@example.test',
      },
    });

    const candidateDocument = await prisma.candidateDocument.create({
      data: {
        candidateId: candidate.id,
        documentType: CandidateDocumentType.CV,
        title: 'Synthetic CV Placeholder',
        visibility: DocumentVisibility.INTERNAL_ONLY,
        uploadedByUserId: owner.id,
      },
    });
    const version = await prisma.candidateDocumentVersion.create({
      data: {
        candidateDocumentId: candidateDocument.id,
        versionNumber: 1,
        filename: 'synthetic-cv-placeholder.pdf',
        storageKey: 'candidate-documents/synthetic-cv-placeholder-v1',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(1024),
        createdByUserId: owner.id,
        source: DocumentVersionSource.UPLOADED,
      },
    });

    await prisma.candidateDocument.update({
      where: { id: candidateDocument.id },
      data: { currentVersionId: version.id },
    });

    const storedDocument = await prisma.candidateDocument.findUniqueOrThrow({
      where: { id: candidateDocument.id },
      include: { currentVersion: true, versions: true },
    });

    expect(storedDocument.visibility).toBe(DocumentVisibility.INTERNAL_ONLY);
    expect(storedDocument.currentVersion?.storageKey).toBe(
      'candidate-documents/synthetic-cv-placeholder-v1',
    );
    expect(storedDocument.versions).toHaveLength(1);

    const generalDocument = await prisma.document.create({
      data: {
        title: 'Synthetic Candidate Summary',
        documentType: DocumentType.CANDIDATE_SUMMARY,
        visibility: DocumentVisibility.ASSIGNED_ONLY,
        ownerUserId: owner.id,
        createdByUserId: owner.id,
        candidateId: candidate.id,
      },
    });
    const generalVersion = await prisma.documentVersion.create({
      data: {
        documentId: generalDocument.id,
        versionNumber: 1,
        filename: 'synthetic-candidate-summary.pdf',
        storageKey: 'documents/synthetic-candidate-summary-v1',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        createdByUserId: owner.id,
        source: DocumentVersionSource.GENERATED,
      },
    });

    await prisma.document.update({
      where: { id: generalDocument.id },
      data: { currentVersionId: generalVersion.id },
    });

    await expect(
      prisma.documentVersion.create({
        data: {
          documentId: generalDocument.id,
          versionNumber: 2,
          filename: 'duplicate-storage-key.pdf',
          storageKey: 'documents/synthetic-candidate-summary-v1',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(2048),
          createdByUserId: owner.id,
          source: DocumentVersionSource.GENERATED,
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectUniqueConstraint(error);
      return true;
    });
  });

  it('preserves history through deliberate foreign-key deletion restrictions', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Synthetic Client Delta',
        normalizedName: 'synthetic client delta',
      },
    });

    await prisma.recruitmentMission.create({
      data: {
        clientId: client.id,
        title: 'Deletion Restriction Mission',
      },
    });

    await expect(prisma.client.delete({ where: { id: client.id } })).rejects.toSatisfy(
      (error: unknown) => {
        expectForeignKeyConstraint(error);
        return true;
      },
    );
  });

  it('allows audit and notification user references without storing confidential payloads', async () => {
    const actor = await createUser('audit.actor@example.test', 'Audit Actor');
    const target = await createUser('audit.target@example.test', 'Audit Target');

    const notification = await prisma.notification.create({
      data: {
        recipientUserId: target.id,
        actorUserId: actor.id,
        type: 'synthetic.assignment',
        title: 'Synthetic assignment changed',
        bodySummary: 'Safe synthetic notification summary.',
      },
    });

    const auditLog = await prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        targetUserId: target.id,
        action: 'synthetic.assignment.updated',
        entityType: 'User',
        entityId: target.id,
        requestId: 'synthetic-request-id',
        metadataSummary: 'Safe synthetic audit metadata.',
      },
    });

    const storedTarget = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      include: {
        notifications: true,
        targetedAuditLogs: true,
      },
    });

    expect(storedTarget.notifications.map((entry) => entry.id)).toContain(notification.id);
    expect(storedTarget.targetedAuditLogs.map((entry) => entry.id)).toContain(auditLog.id);
  });
});
