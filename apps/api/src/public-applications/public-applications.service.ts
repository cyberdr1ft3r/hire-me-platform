import { createHash, randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type {
  InternalPublicApplicationListResponse,
  InternalPublicOpportunityDetailResponse,
  InternalPublicOpportunityUpdateRequest,
  PublicApplicationFileInput,
  PublicApplicationSubmitRequest,
  PublicApplicationSubmitResponse,
  PublicOpportunityDetailResponse,
  PublicOpportunityListResponse,
} from '@hire-me/contracts';

import { badRequest, conflict, notFound } from './public-application.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { normalizeEmail } from '../auth/normalize-email.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import {
  AssignmentStatus,
  CandidateDocumentStatus,
  CandidateDocumentType,
  CandidateStatus,
  ConsentStatus,
  DocumentVersionSource,
  DocumentVisibility,
  MissionCandidateEventAction,
  MissionCandidateState,
  MissionRecruiterRole,
  Prisma,
  PublicApplicationFileCategory,
  PublicOpportunityStatus,
  RecruitmentMissionState,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { ProtectedStorageService } from '../storage/protected-storage.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type OpportunityRecord = Prisma.PublicOpportunityGetPayload<{
  include: { mission: { include: { client: { select: { name: true } } } } };
}>;
type PreparedFile = PublicApplicationFileInput & {
  buffer: Buffer;
  sizeBytes: number;
  sanitizedFilename: string;
  storageKey: string;
};

const maxFileSizeBytes = 1_500_000;
const maxTotalUploadBytes = 5_000_000;
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'] as const;
const successResponse: PublicApplicationSubmitResponse = {
  status: 'RECEIVED',
  message: 'Application received for review if the opportunity is available.',
};

const publicMissionStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.ACTIVE,
  RecruitmentMissionState.JOB_DESCRIPTION_APPROVED,
  RecruitmentMissionState.CANDIDATE_SOURCING,
  RecruitmentMissionState.HR_PRESELECTION,
  RecruitmentMissionState.HR_INTERVIEWS,
  RecruitmentMissionState.TECHNICAL_TESTS,
  RecruitmentMissionState.CANDIDATE_PRESENTATION,
  RecruitmentMissionState.CLIENT_INTERVIEWS,
  RecruitmentMissionState.FINAL_SELECTION,
  RecruitmentMissionState.OFFER_SENT,
]);

const terminalMissionStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
  RecruitmentMissionState.ARCHIVED,
]);

@Injectable()
export class PublicApplicationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProtectedStorageService) private readonly storage: ProtectedStorageService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  async listPublicOpportunities(): Promise<PublicOpportunityListResponse> {
    const opportunities = await this.prisma.publicOpportunity.findMany({
      where: this.publicAvailabilityWhere(true),
      include: opportunityInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return {
      opportunities: opportunities.map((opportunity) => this.toPublicOpportunity(opportunity)),
    };
  }

  async getPublicOpportunity(publicSlug: string): Promise<PublicOpportunityDetailResponse> {
    const opportunity = await this.findAvailableOpportunity(publicSlug, false);
    return { opportunity: this.toPublicOpportunity(opportunity) };
  }

  async submitApplication(
    publicSlug: string,
    input: PublicApplicationSubmitRequest,
    context: RequestContext,
  ): Promise<PublicApplicationSubmitResponse> {
    this.rateLimit.assertAllowed(
      `public-application:${publicSlug}:${context.ipAddress ?? 'unknown'}`,
      12,
      60_000,
    );
    if (input.website) {
      return successResponse;
    }
    if (!input.consentGranted) {
      throw badRequest('PUBLIC_APPLICATION_CONSENT_REQUIRED', 'Application consent is required.');
    }

    const opportunity = await this.findAvailableOpportunity(publicSlug, false);
    this.assertUploadRequirements(opportunity, input.files);
    const preparedFiles = this.prepareFiles(publicSlug, input.files);
    const storedKeys: string[] = [];

    try {
      for (const file of preparedFiles) {
        await this.storage.put(file.storageKey, file.buffer);
        storedKeys.push(file.storageKey);
      }

      const accepted = await this.prisma.$transaction(async (transaction) =>
        this.createApplicationRecords(transaction, opportunity.id, input, preparedFiles, context),
      );

      if (!accepted) {
        await this.deleteStoredFiles(storedKeys);
      }

      return successResponse;
    } catch (error: unknown) {
      await this.deleteStoredFiles(storedKeys);
      if (isUniqueConstraintError(error)) {
        return successResponse;
      }
      if (error instanceof ConflictException) {
        return successResponse;
      }
      throw error;
    }
  }

  async getInternalOpportunity(
    missionId: string,
  ): Promise<InternalPublicOpportunityDetailResponse> {
    const opportunity = await this.prisma.publicOpportunity.findUnique({
      where: { missionId },
      include: opportunityInclude,
    });
    if (!opportunity) {
      throw notFound('PUBLIC_OPPORTUNITY_NOT_FOUND');
    }
    return { publicOpportunity: this.toInternalOpportunity(opportunity) };
  }

  async updateInternalOpportunity(
    missionId: string,
    input: InternalPublicOpportunityUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InternalPublicOpportunityDetailResponse> {
    const opportunity = await this.prisma.$transaction(async (transaction) => {
      const mission = await this.lockMission(missionId, transaction);
      if (terminalMissionStates.has(mission.state) || mission.archivedAt) {
        throw conflict('MISSION_TERMINAL', 'Terminal recruitment missions cannot be published.');
      }
      const existing = await transaction.publicOpportunity.findUnique({ where: { missionId } });
      this.assertPublicationWindow(input, {
        publicationStartsAt: existing?.publicationStartsAt ?? null,
        applicationDeadline: existing?.applicationDeadline ?? mission.applicationDeadline,
      });
      const data = {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.applicationLinkEnabled !== undefined
          ? { applicationLinkEnabled: input.applicationLinkEnabled }
          : {}),
        ...(input.listedOnWebsite !== undefined ? { listedOnWebsite: input.listedOnWebsite } : {}),
        ...(input.publicSlug !== undefined ? { publicSlug: input.publicSlug } : {}),
        ...(input.publicationStartsAt !== undefined
          ? { publicationStartsAt: dateOrNull(input.publicationStartsAt) }
          : {}),
        ...(input.applicationDeadline !== undefined
          ? { applicationDeadline: dateOrNull(input.applicationDeadline) }
          : {}),
        ...(input.publicTitle !== undefined ? { publicTitle: input.publicTitle } : {}),
        ...(input.publicSummary !== undefined
          ? { publicSummary: nullable(input.publicSummary) }
          : {}),
        ...(input.publicDescription !== undefined
          ? { publicDescription: nullable(input.publicDescription) }
          : {}),
        ...(input.publicLocation !== undefined
          ? { publicLocation: nullable(input.publicLocation) }
          : {}),
        ...(input.publicWorkArrangement !== undefined
          ? { publicWorkArrangement: nullable(input.publicWorkArrangement) }
          : {}),
        ...(input.publicEngagementType !== undefined
          ? { publicEngagementType: nullable(input.publicEngagementType) }
          : {}),
        ...(input.publicExperienceLevel !== undefined
          ? { publicExperienceLevel: nullable(input.publicExperienceLevel) }
          : {}),
        ...(input.publicSkills !== undefined ? { publicSkills: nullable(input.publicSkills) } : {}),
        ...(input.showClientName !== undefined ? { showClientName: input.showClientName } : {}),
        ...(input.showSalary !== undefined ? { showSalary: input.showSalary } : {}),
        ...(input.cvRequired !== undefined ? { cvRequired: input.cvRequired } : {}),
        ...(input.certificationsEnabled !== undefined
          ? { certificationsEnabled: input.certificationsEnabled }
          : {}),
        ...(input.certificationsRequired !== undefined
          ? { certificationsRequired: input.certificationsRequired }
          : {}),
        ...(input.diplomasEnabled !== undefined ? { diplomasEnabled: input.diplomasEnabled } : {}),
        ...(input.diplomasRequired !== undefined
          ? { diplomasRequired: input.diplomasRequired }
          : {}),
        ...(input.additionalAttachmentsEnabled !== undefined
          ? { additionalAttachmentsEnabled: input.additionalAttachmentsEnabled }
          : {}),
        ...(input.consentTextVersion !== undefined
          ? { consentTextVersion: input.consentTextVersion }
          : {}),
      } satisfies Prisma.PublicOpportunityUpdateInput;

      if (existing) {
        return transaction.publicOpportunity.update({
          where: { missionId },
          data,
          include: opportunityInclude,
        });
      }

      const createData = { ...data };
      delete createData.publicSlug;
      delete createData.publicTitle;
      delete createData.publicSummary;
      delete createData.publicDescription;
      delete createData.publicLocation;
      delete createData.publicWorkArrangement;
      delete createData.publicEngagementType;
      delete createData.publicExperienceLevel;
      delete createData.publicSkills;
      delete createData.applicationDeadline;

      return transaction.publicOpportunity.create({
        data: {
          ...createData,
          missionId,
          publicSlug: input.publicSlug ?? `opportunity-${randomUUID()}`,
          publicTitle: input.publicTitle ?? mission.title,
          publicSummary: input.publicSummary ?? mission.description,
          publicDescription: input.publicDescription ?? mission.description,
          publicLocation: input.publicLocation ?? mission.location,
          publicWorkArrangement: input.publicWorkArrangement ?? mission.workArrangement,
          publicEngagementType: input.publicEngagementType ?? mission.engagementType,
          applicationDeadline: input.applicationDeadline
            ? new Date(input.applicationDeadline)
            : mission.applicationDeadline,
        },
        include: opportunityInclude,
      });
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'public_opportunities.configuration.updated',
        entityType: 'PublicOpportunity',
        entityId: opportunity.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: 'Public opportunity configuration updated.',
      },
    });

    return { publicOpportunity: this.toInternalOpportunity(opportunity) };
  }

  async listInternalApplications(
    missionId: string,
  ): Promise<InternalPublicApplicationListResponse> {
    const applications = await this.prisma.publicCandidateApplication.findMany({
      where: { missionId },
      include: { files: true },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });

    return {
      applications: applications.map((application) => ({
        id: application.id,
        publicOpportunityId: application.publicOpportunityId,
        missionId: application.missionId,
        candidateId: application.candidateId,
        missionCandidateId: application.missionCandidateId,
        submittedFullName: application.submittedFullName,
        submittedEmail: application.submittedEmail,
        submittedCity: application.submittedCity,
        submittedCountry: application.submittedCountry,
        submittedCurrentPosition: application.submittedCurrentPosition,
        fileCount: application.files.length,
        submittedAt: application.submittedAt.toISOString(),
      })),
    };
  }

  private async createApplicationRecords(
    transaction: PrismaTransaction,
    opportunityId: string,
    input: PublicApplicationSubmitRequest,
    files: PreparedFile[],
    context: RequestContext,
  ): Promise<boolean> {
    const opportunity = await transaction.publicOpportunity.findUnique({
      where: { id: opportunityId },
      include: opportunityInclude,
    });
    if (!opportunity || !this.isPubliclyAvailable(opportunity, false)) {
      throw notFound();
    }

    const mission = await this.lockMission(opportunity.missionId, transaction);
    if (!publicMissionStates.has(mission.state) || mission.archivedAt) {
      throw notFound();
    }

    const normalizedEmail = normalizeEmail(input.email);
    const existingApplication = await transaction.publicCandidateApplication.findUnique({
      where: {
        publicOpportunityId_submittedNormalizedEmail: {
          publicOpportunityId: opportunity.id,
          submittedNormalizedEmail: normalizedEmail,
        },
      },
    });
    if (existingApplication) {
      return false;
    }

    const existingCandidate = await transaction.candidate.findUnique({
      where: { normalizedEmail },
    });
    if (existingCandidate) {
      await this.lockCandidate(existingCandidate.id, transaction);
      if (existingCandidate.status === CandidateStatus.ARCHIVED || existingCandidate.archivedAt) {
        return false;
      }
      const duplicateProcess = await transaction.missionCandidate.findUnique({
        where: {
          missionId_candidateId: { missionId: mission.id, candidateId: existingCandidate.id },
        },
      });
      if (duplicateProcess) {
        return false;
      }
    }

    const candidate =
      existingCandidate ??
      (await transaction.candidate.create({
        data: {
          displayName: input.fullName,
          email: input.email,
          normalizedEmail,
          phone: optional(input.phone),
          normalizedPhone: normalizePhoneOrUndefined(input.phone),
          city: optional(input.city),
          country: optional(input.country),
          currentJobTitle: optional(input.currentPosition),
          linkedinUrl: firstProfessionalLink(input.professionalLinks),
          status: CandidateStatus.ACTIVE,
          source: 'public_application',
          sourceDetail: opportunity.publicSlug,
          consentStatus: ConsentStatus.GRANTED,
          consentRecordedAt: new Date(),
          availabilityNotice: optional(input.availability),
          salaryExpectationCents: input.salaryExpectationCents,
          salaryExpectationCurrency: optional(input.salaryExpectationCurrency),
        },
      }));

    const recruiterUserId = await this.findResponsibleRecruiter(mission.id, transaction);
    const missionCandidate = await transaction.missionCandidate.create({
      data: {
        missionId: mission.id,
        candidateId: candidate.id,
        responsibleRecruiterUserId: recruiterUserId,
        source: 'public_application',
        sourceContext: opportunity.publicSlug,
        clientVisible: false,
      },
    });

    await transaction.missionCandidateEvent.create({
      data: {
        missionCandidateId: missionCandidate.id,
        actorUserId: null,
        action: MissionCandidateEventAction.CREATED,
        nextState: MissionCandidateState.NEW,
        nextRecruiterId: recruiterUserId,
        reason: 'Public application submitted.',
      },
    });

    const application = await transaction.publicCandidateApplication.create({
      data: {
        publicOpportunityId: opportunity.id,
        missionId: mission.id,
        candidateId: candidate.id,
        missionCandidateId: missionCandidate.id,
        submittedFullName: input.fullName,
        submittedEmail: input.email,
        submittedNormalizedEmail: normalizedEmail,
        submittedPhone: optional(input.phone),
        submittedNormalizedPhone: normalizePhoneOrUndefined(input.phone),
        submittedCity: optional(input.city),
        submittedCountry: optional(input.country),
        submittedCurrentPosition: optional(input.currentPosition),
        submittedExperienceYears: input.experienceYears,
        submittedSkills: optional(input.skills),
        submittedLanguages: optional(input.languages),
        submittedAvailability: optional(input.availability),
        submittedSalaryExpectationCents: input.salaryExpectationCents,
        submittedSalaryExpectationCurrency: optional(input.salaryExpectationCurrency),
        submittedProfessionalLinks: optional(input.professionalLinks),
        submittedMotivation: optional(input.motivation),
        consentGranted: true,
        consentTextVersion: opportunity.consentTextVersion,
        sourceIpHash: safeHash(context.ipAddress),
        userAgentHash: safeHash(context.userAgent),
      },
    });

    for (const file of files) {
      await this.createDocumentVersion(
        transaction,
        candidate.id,
        mission.id,
        missionCandidate.id,
        application.id,
        opportunity.id,
        file,
      );
    }

    await transaction.auditLog.create({
      data: {
        action: 'public_applications.application.submitted',
        entityType: 'PublicCandidateApplication',
        entityId: application.id,
        metadataSummary: 'Public application accepted; sensitive candidate payload excluded.',
      },
    });

    return true;
  }

  private async createDocumentVersion(
    transaction: PrismaTransaction,
    candidateId: string,
    missionId: string,
    missionCandidateId: string,
    applicationId: string,
    opportunityId: string,
    file: PreparedFile,
  ): Promise<void> {
    const documentType = toCandidateDocumentType(file.category);
    const existingCvDocument =
      file.category === PublicApplicationFileCategory.CV
        ? await transaction.candidateDocument.findFirst({
            where: {
              candidateId,
              documentType: CandidateDocumentType.CV,
              status: CandidateDocumentStatus.ACTIVE,
              archivedAt: null,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : null;
    const document =
      existingCvDocument ??
      (await transaction.candidateDocument.create({
        data: {
          candidateId,
          documentType,
          title:
            file.category === PublicApplicationFileCategory.CV
              ? 'Candidate CV'
              : file.sanitizedFilename,
          visibility: DocumentVisibility.INTERNAL_ONLY,
        },
      }));
    const lastVersion = await transaction.candidateDocumentVersion.findFirst({
      where: { candidateDocumentId: document.id },
      orderBy: { versionNumber: 'desc' },
    });
    const version = await transaction.candidateDocumentVersion.create({
      data: {
        candidateDocumentId: document.id,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        filename: file.sanitizedFilename,
        storageKey: file.storageKey,
        mimeType: file.contentType,
        sizeBytes: file.sizeBytes,
        source: DocumentVersionSource.UPLOADED,
      },
    });
    await transaction.candidateDocument.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });
    await transaction.publicCandidateApplicationFile.create({
      data: {
        publicCandidateApplicationId: applicationId,
        publicOpportunityId: opportunityId,
        missionId,
        missionCandidateId,
        candidateId,
        candidateDocumentVersionId: version.id,
        category: file.category,
        originalFilename: file.filename,
        sanitizedFilename: file.sanitizedFilename,
        mimeType: file.contentType,
        sizeBytes: file.sizeBytes,
        storageKey: file.storageKey,
      },
    });
  }

  private async findAvailableOpportunity(
    publicSlug: string,
    listedOnly: boolean,
  ): Promise<OpportunityRecord> {
    const opportunity = await this.prisma.publicOpportunity.findFirst({
      where: { publicSlug, ...this.publicAvailabilityWhere(listedOnly) },
      include: opportunityInclude,
    });
    if (!opportunity) {
      throw notFound();
    }
    return opportunity;
  }

  private publicAvailabilityWhere(listedOnly: boolean): Prisma.PublicOpportunityWhereInput {
    const now = new Date();
    return {
      status: PublicOpportunityStatus.OPEN,
      applicationLinkEnabled: true,
      archivedAt: null,
      ...(listedOnly ? { listedOnWebsite: true } : {}),
      OR: [{ publicationStartsAt: null }, { publicationStartsAt: { lte: now } }],
      AND: [{ OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: now } }] }],
      mission: {
        state: { in: [...publicMissionStates] },
        archivedAt: null,
      },
    };
  }

  private isPubliclyAvailable(opportunity: OpportunityRecord, listedOnly: boolean): boolean {
    const now = Date.now();
    return (
      opportunity.status === PublicOpportunityStatus.OPEN &&
      opportunity.applicationLinkEnabled &&
      !opportunity.archivedAt &&
      (!listedOnly || opportunity.listedOnWebsite) &&
      (!opportunity.publicationStartsAt || opportunity.publicationStartsAt.getTime() <= now) &&
      (!opportunity.applicationDeadline || opportunity.applicationDeadline.getTime() >= now)
    );
  }

  private async lockMission(
    missionId: string,
    transaction: PrismaTransaction,
  ): Promise<Prisma.RecruitmentMissionGetPayload<Record<string, never>>> {
    await transaction.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
    const mission = await transaction.recruitmentMission.findUnique({ where: { id: missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND');
    }
    return mission;
  }

  private async lockCandidate(candidateId: string, transaction: PrismaTransaction): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${candidateId}::uuid FOR UPDATE`;
  }

  private async findResponsibleRecruiter(
    missionId: string,
    transaction: PrismaTransaction,
  ): Promise<string> {
    const assignment = await transaction.missionRecruiter.findFirst({
      where: {
        missionId,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
        role: {
          in: [
            MissionRecruiterRole.LEAD_RECRUITER,
            MissionRecruiterRole.RECRUITER,
            MissionRecruiterRole.SOURCER,
          ],
        },
        user: { status: UserStatus.ACTIVE, archivedAt: null, userType: UserType.INTERNAL },
      },
      orderBy: [{ isLead: 'desc' }, { assignedAt: 'asc' }, { id: 'asc' }],
    });
    if (!assignment) {
      throw conflict(
        'PUBLIC_APPLICATION_RECRUITER_NOT_AVAILABLE',
        'Application cannot be accepted until an eligible mission recruiter is assigned.',
      );
    }
    return assignment.userId;
  }

  private assertUploadRequirements(
    opportunity: OpportunityRecord,
    files: PublicApplicationFileInput[],
  ): void {
    const categories = new Set(files.map((file) => file.category));
    if (opportunity.cvRequired && !categories.has(PublicApplicationFileCategory.CV)) {
      throw badRequest('PUBLIC_APPLICATION_CV_REQUIRED', 'A CV file is required.');
    }
    if (
      opportunity.certificationsRequired &&
      !categories.has(PublicApplicationFileCategory.CERTIFICATION)
    ) {
      throw badRequest(
        'PUBLIC_APPLICATION_CERTIFICATION_REQUIRED',
        'A certification file is required.',
      );
    }
    if (opportunity.diplomasRequired && !categories.has(PublicApplicationFileCategory.DIPLOMA)) {
      throw badRequest('PUBLIC_APPLICATION_DIPLOMA_REQUIRED', 'A diploma file is required.');
    }
    if (
      !opportunity.certificationsEnabled &&
      categories.has(PublicApplicationFileCategory.CERTIFICATION)
    ) {
      throw badRequest(
        'PUBLIC_APPLICATION_FILE_CATEGORY_DISABLED',
        'This file category is not enabled.',
      );
    }
    if (!opportunity.diplomasEnabled && categories.has(PublicApplicationFileCategory.DIPLOMA)) {
      throw badRequest(
        'PUBLIC_APPLICATION_FILE_CATEGORY_DISABLED',
        'This file category is not enabled.',
      );
    }
    if (
      !opportunity.additionalAttachmentsEnabled &&
      categories.has(PublicApplicationFileCategory.ADDITIONAL)
    ) {
      throw badRequest(
        'PUBLIC_APPLICATION_FILE_CATEGORY_DISABLED',
        'This file category is not enabled.',
      );
    }
  }

  private prepareFiles(publicSlug: string, files: PublicApplicationFileInput[]): PreparedFile[] {
    const prepared = files.map((file) => {
      const buffer = Buffer.from(file.base64Content, 'base64');
      const sanitizedFilename = sanitizeFilename(file.filename);
      this.assertFileIsSafe(file, buffer);
      return {
        ...file,
        buffer,
        sizeBytes: buffer.byteLength,
        sanitizedFilename,
        storageKey: `public-applications/${publicSlug}/${randomUUID()}-${sanitizedFilename}`,
      };
    });
    const totalSize = prepared.reduce((total, file) => total + file.sizeBytes, 0);
    if (totalSize > maxTotalUploadBytes) {
      throw badRequest(
        'PUBLIC_APPLICATION_UPLOAD_TOO_LARGE',
        'Uploaded files exceed the total limit.',
      );
    }
    return prepared;
  }

  private assertFileIsSafe(file: PublicApplicationFileInput, buffer: Buffer): void {
    if (!allowedMimeTypes.includes(file.contentType as (typeof allowedMimeTypes)[number])) {
      throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (buffer.byteLength === 0 || buffer.byteLength > maxFileSizeBytes) {
      throw badRequest('PUBLIC_APPLICATION_FILE_SIZE_REJECTED', 'File size is not allowed.');
    }
    const lowerName = file.filename.toLowerCase();
    if (/\.(exe|bat|cmd|com|scr|js|jar|zip|rar|7z|tar|gz)$/i.test(lowerName)) {
      throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (
      buffer.subarray(0, 2).toString('hex') === '4d5a' ||
      buffer.subarray(0, 2).toString() === 'PK'
    ) {
      throw badRequest('PUBLIC_APPLICATION_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (file.contentType === 'application/pdf' && buffer.subarray(0, 4).toString() !== '%PDF') {
      throw badRequest(
        'PUBLIC_APPLICATION_FILE_SIGNATURE_REJECTED',
        'File content does not match its type.',
      );
    }
  }

  private async deleteStoredFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storage.delete(key)));
  }

  private assertPublicationWindow(
    input: InternalPublicOpportunityUpdateRequest,
    current: { publicationStartsAt: Date | null; applicationDeadline: Date | null },
  ): void {
    const startsAt =
      input.publicationStartsAt !== undefined
        ? dateOrNull(input.publicationStartsAt)
        : current.publicationStartsAt;
    const deadline =
      input.applicationDeadline !== undefined
        ? dateOrNull(input.applicationDeadline)
        : current.applicationDeadline;

    if (startsAt && deadline) {
      const startsAtTimestamp = startsAt.getTime();
      const deadlineTimestamp = deadline.getTime();
      if (startsAtTimestamp > deadlineTimestamp) {
        throw conflict(
          'PUBLIC_OPPORTUNITY_WINDOW_INVALID',
          'Publication start must be before the application deadline.',
        );
      }
    }
  }

  private toPublicOpportunity(opportunity: OpportunityRecord) {
    return {
      publicSlug: opportunity.publicSlug,
      publicTitle: opportunity.publicTitle,
      publicSummary: opportunity.publicSummary,
      publicDescription: opportunity.publicDescription,
      publicLocation: opportunity.publicLocation,
      publicWorkArrangement: opportunity.publicWorkArrangement,
      publicEngagementType: opportunity.publicEngagementType,
      publicExperienceLevel: opportunity.publicExperienceLevel,
      publicSkills: opportunity.publicSkills,
      clientName: opportunity.showClientName ? opportunity.mission.client.name : null,
      salary: opportunity.showSalary
        ? {
            salaryMinCents: opportunity.mission.salaryMinCents,
            salaryMaxCents: opportunity.mission.salaryMaxCents,
            salaryCurrency: opportunity.mission.salaryCurrency,
          }
        : null,
      applicationDeadline: isoOrNull(opportunity.applicationDeadline),
      uploadRequirements: {
        cvRequired: opportunity.cvRequired,
        certificationsEnabled: opportunity.certificationsEnabled,
        certificationsRequired: opportunity.certificationsRequired,
        diplomasEnabled: opportunity.diplomasEnabled,
        diplomasRequired: opportunity.diplomasRequired,
        additionalAttachmentsEnabled: opportunity.additionalAttachmentsEnabled,
        maxFileSizeBytes,
        maxTotalUploadBytes,
        allowedMimeTypes: [...allowedMimeTypes],
      },
    };
  }

  private toInternalOpportunity(opportunity: OpportunityRecord) {
    return {
      ...this.toPublicOpportunity(opportunity),
      id: opportunity.id,
      missionId: opportunity.missionId,
      status: opportunity.status,
      applicationLinkEnabled: opportunity.applicationLinkEnabled,
      listedOnWebsite: opportunity.listedOnWebsite,
      publicSlug: opportunity.publicSlug,
      publicationStartsAt: isoOrNull(opportunity.publicationStartsAt),
      showClientName: opportunity.showClientName,
      showSalary: opportunity.showSalary,
      consentTextVersion: opportunity.consentTextVersion,
      archivedAt: isoOrNull(opportunity.archivedAt),
      createdAt: opportunity.createdAt.toISOString(),
      updatedAt: opportunity.updatedAt.toISOString(),
    };
  }
}

const opportunityInclude = {
  mission: { include: { client: { select: { name: true } } } },
} satisfies Prisma.PublicOpportunityInclude;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizePhoneOrUndefined(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\D/g, '');
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function firstProfessionalLink(value: string | undefined): string | undefined {
  return optional(value)?.split(/\s+/)[0];
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return sanitized.length > 0 ? sanitized.slice(0, 160) : 'upload';
}

function safeHash(value: string | undefined): string | undefined {
  return value ? createHash('sha256').update(value).digest('hex') : undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toCandidateDocumentType(category: PublicApplicationFileCategory): CandidateDocumentType {
  if (category === PublicApplicationFileCategory.CV) {
    return CandidateDocumentType.CV;
  }
  if (category === PublicApplicationFileCategory.CERTIFICATION) {
    return CandidateDocumentType.CERTIFICATION;
  }
  return CandidateDocumentType.OTHER;
}
