import { Inject, Injectable } from '@nestjs/common';
import type {
  CandidateCreateRequest,
  CandidateDetailResponse,
  CandidateEducationCreateRequest,
  CandidateEducationDetailResponse,
  CandidateEducationListResponse,
  CandidateEducationUpdateRequest,
  CandidateLanguageCreateRequest,
  CandidateLanguageDetailResponse,
  CandidateLanguageListResponse,
  CandidateLanguageUpdateRequest,
  CandidateListQuery,
  CandidateListResponse,
  CandidateSkillCreateRequest,
  CandidateSkillDetailResponse,
  CandidateSkillListResponse,
  CandidateSkillUpdateRequest,
  CandidateStatusUpdateRequest,
  CandidateUpdateRequest,
  CandidateWorkExperienceCreateRequest,
  CandidateWorkExperienceDetailResponse,
  CandidateWorkExperienceListResponse,
  CandidateWorkExperienceUpdateRequest,
} from '@hire-me/contracts';

import { CandidateAuditService } from './candidate-audit.service.js';
import { CANDIDATE_PERMISSIONS } from './candidate-permissions.js';
import { conflict, forbidden, notFound } from './candidate.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { normalizeEmail } from '../auth/normalize-email.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { CandidateStatus, ConsentStatus, Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type CandidateRecord = Prisma.CandidateGetPayload<Record<string, never>>;
type CandidateWithProfile = Prisma.CandidateGetPayload<{
  include: {
    skills: true;
    languages: true;
    workExperiences: true;
    education: true;
  };
}>;
type CandidateSkillRecord = Prisma.CandidateSkillGetPayload<Record<string, never>>;
type CandidateLanguageRecord = Prisma.CandidateLanguageGetPayload<Record<string, never>>;
type CandidateWorkExperienceRecord = Prisma.CandidateWorkExperienceGetPayload<
  Record<string, never>
>;
type CandidateEducationRecord = Prisma.CandidateEducationGetPayload<Record<string, never>>;
type CandidateResponseAccess = {
  profileView: boolean;
  compensationView: boolean;
  compensationUpdate: boolean;
  consentView: boolean;
  consentManage: boolean;
};

@Injectable()
export class CandidatesService {
  constructor(
    @Inject(CandidateAuditService) private readonly audit: CandidateAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listCandidates(
    query: CandidateListQuery,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateListResponse> {
    const access = await this.resolveCandidateAccess(actorUserId);
    const searchFilters: Prisma.CandidateWhereInput[] = query.search
      ? [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { normalizedEmail: { contains: normalizeEmail(query.search) } },
          { currentJobTitle: { contains: query.search, mode: 'insensitive' } },
          { city: { contains: query.search, mode: 'insensitive' } },
          { country: { contains: query.search, mode: 'insensitive' } },
          ...(access.profileView
            ? [
                {
                  skills: {
                    some: { name: { contains: query.search, mode: 'insensitive' } },
                  },
                } satisfies Prisma.CandidateWhereInput,
              ]
            : []),
        ]
      : [];
    const where: Prisma.CandidateWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: { equals: query.source, mode: 'insensitive' } } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.country ? { country: { equals: query.country, mode: 'insensitive' } } : {}),
      ...(searchFilters.length > 0 ? { OR: searchFilters } : {}),
    };

    const [total, candidates] = await this.prisma.$transaction([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    await this.auditSensitiveReads(candidates.length, access, actorUserId, context);

    return {
      candidates: candidates.map((candidate) => this.toCandidateSummary(candidate, access)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  async getCandidate(
    candidateId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateDetailResponse> {
    const access = await this.resolveCandidateAccess(actorUserId);
    const candidate = await this.findCandidateWithProfile(candidateId);

    await this.auditSensitiveReads(1, access, actorUserId, context, candidate.id);

    return { candidate: this.toCandidateDetail(candidate, access) };
  }

  async createCandidate(
    input: CandidateCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateDetailResponse> {
    const access = await this.resolveCandidateAccess(actorUserId);
    this.assertSensitiveInputAllowed(input, access);

    try {
      const candidate = await this.prisma.candidate.create({
        data: {
          displayName: input.displayName,
          firstName: optional(input.firstName),
          lastName: optional(input.lastName),
          email: optional(input.email),
          normalizedEmail: input.email ? normalizeEmail(input.email) : undefined,
          phone: optional(input.phone),
          normalizedPhone: input.phone ? normalizePhone(input.phone) : undefined,
          city: optional(input.city),
          country: optional(input.country),
          currentJobTitle: optional(input.currentJobTitle),
          professionalSummary: optional(input.professionalSummary),
          linkedinUrl: optional(input.linkedinUrl),
          status: input.status ?? CandidateStatus.ACTIVE,
          source: optional(input.source),
          sourceDetail: optional(input.sourceDetail),
          availabilityNotice: optional(input.availabilityNotice),
          salaryExpectationCents: input.salaryExpectationCents,
          salaryExpectationCurrency: optional(input.salaryExpectationCurrency),
          consentStatus: input.consentStatus ?? ConsentStatus.UNKNOWN,
          consentRecordedAt: input.consentRecordedAt
            ? new Date(input.consentRecordedAt)
            : undefined,
        },
        include: profileInclude,
      });

      await this.audit.record('candidates.candidate.created', context, {
        actorUserId,
        entityType: 'Candidate',
        entityId: candidate.id,
        metadataSummary: 'Candidate master record created.',
      });

      return { candidate: this.toCandidateDetail(candidate, access) };
    } catch (error: unknown) {
      this.rethrowDuplicateEmail(error);
      throw error;
    }
  }

  async updateCandidate(
    candidateId: string,
    input: CandidateUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateDetailResponse> {
    const access = await this.resolveCandidateAccess(actorUserId);
    this.assertSensitiveInputAllowed(input, access);

    try {
      const candidate = await this.withWritableCandidateLock(candidateId, (transaction) =>
        transaction.candidate.update({
          where: { id: candidateId },
          data: {
            ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
            ...(input.firstName !== undefined ? { firstName: nullable(input.firstName) } : {}),
            ...(input.lastName !== undefined ? { lastName: nullable(input.lastName) } : {}),
            ...(input.email !== undefined
              ? {
                  email: nullable(input.email),
                  normalizedEmail: input.email ? normalizeEmail(input.email) : null,
                }
              : {}),
            ...(input.phone !== undefined
              ? { phone: nullable(input.phone), normalizedPhone: normalizePhoneOrNull(input.phone) }
              : {}),
            ...(input.city !== undefined ? { city: nullable(input.city) } : {}),
            ...(input.country !== undefined ? { country: nullable(input.country) } : {}),
            ...(input.currentJobTitle !== undefined
              ? { currentJobTitle: nullable(input.currentJobTitle) }
              : {}),
            ...(input.professionalSummary !== undefined
              ? { professionalSummary: nullable(input.professionalSummary) }
              : {}),
            ...(input.linkedinUrl !== undefined
              ? { linkedinUrl: nullable(input.linkedinUrl) }
              : {}),
            ...(input.source !== undefined ? { source: nullable(input.source) } : {}),
            ...(input.sourceDetail !== undefined
              ? { sourceDetail: nullable(input.sourceDetail) }
              : {}),
            ...(input.availabilityNotice !== undefined
              ? { availabilityNotice: nullable(input.availabilityNotice) }
              : {}),
            ...(input.salaryExpectationCents !== undefined
              ? { salaryExpectationCents: input.salaryExpectationCents }
              : {}),
            ...(input.salaryExpectationCurrency !== undefined
              ? { salaryExpectationCurrency: nullable(input.salaryExpectationCurrency) }
              : {}),
            ...(input.consentStatus !== undefined ? { consentStatus: input.consentStatus } : {}),
            ...(input.consentRecordedAt !== undefined
              ? {
                  consentRecordedAt: input.consentRecordedAt
                    ? new Date(input.consentRecordedAt)
                    : null,
                }
              : {}),
          },
          include: profileInclude,
        }),
      );

      await this.audit.record('candidates.candidate.updated', context, {
        actorUserId,
        entityType: 'Candidate',
        entityId: candidate.id,
        metadataSummary: 'Approved candidate profile fields updated.',
      });

      return { candidate: this.toCandidateDetail(candidate, access) };
    } catch (error: unknown) {
      this.rethrowDuplicateEmail(error);
      throw error;
    }
  }

  async updateCandidateStatus(
    candidateId: string,
    input: CandidateStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateDetailResponse> {
    const access = await this.resolveCandidateAccess(actorUserId);
    if (input.status === CandidateStatus.ARCHIVED) {
      throw conflict('CANDIDATE_ARCHIVE_ENDPOINT_REQUIRED', 'Use the archive endpoint.');
    }

    const candidate = await this.withWritableCandidateLock(candidateId, (transaction) =>
      transaction.candidate.update({
        where: { id: candidateId },
        data: { status: input.status },
        include: profileInclude,
      }),
    );

    await this.audit.record('candidates.candidate.status_updated', context, {
      actorUserId,
      entityType: 'Candidate',
      entityId: candidate.id,
      metadataSummary: `Candidate status changed to ${input.status}.`,
    });

    return { candidate: this.toCandidateDetail(candidate, access) };
  }

  async archiveCandidate(
    candidateId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateDetailResponse> {
    const access = await this.resolveCandidateAccess(actorUserId);
    const now = new Date();
    const candidate = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const archived = await transaction.candidate.update({
        where: { id: candidateId },
        data: { status: CandidateStatus.ARCHIVED, archivedAt: now },
        include: profileInclude,
      });
      await Promise.all([
        transaction.candidateSkill.updateMany({
          where: { candidateId, archivedAt: null },
          data: { archivedAt: now },
        }),
        transaction.candidateLanguage.updateMany({
          where: { candidateId, archivedAt: null },
          data: { archivedAt: now },
        }),
        transaction.candidateWorkExperience.updateMany({
          where: { candidateId, archivedAt: null },
          data: { archivedAt: now },
        }),
        transaction.candidateEducation.updateMany({
          where: { candidateId, archivedAt: null },
          data: { archivedAt: now },
        }),
      ]);

      return archived;
    });

    await this.audit.record('candidates.candidate.archived', context, {
      actorUserId,
      entityType: 'Candidate',
      entityId: candidate.id,
      metadataSummary: 'Candidate master record archived with structured profile records archived.',
    });

    return { candidate: this.toCandidateDetail(candidate, access) };
  }

  async createSkill(
    candidateId: string,
    input: CandidateSkillCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateSkillDetailResponse> {
    const skill = await this.withWritableCandidateLock(candidateId, (transaction) =>
      transaction.candidateSkill.create({
        data: {
          candidateId,
          name: input.name,
          level: optional(input.level),
          years: input.years,
          lastUsed: optional(input.lastUsed),
        },
      }),
    );
    await this.audit.record('candidates.skill.created', context, {
      actorUserId,
      entityType: 'CandidateSkill',
      entityId: skill.id,
      metadataSummary: 'Candidate skill created.',
    });
    return { skill: this.toSkill(skill) };
  }

  async listSkills(candidateId: string): Promise<CandidateSkillListResponse> {
    await this.findCandidate(candidateId);
    const skills = await this.prisma.candidateSkill.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return { skills: skills.map((skill) => this.toSkill(skill)) };
  }

  async updateSkill(
    candidateId: string,
    skillId: string,
    input: CandidateSkillUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateSkillDetailResponse> {
    const skill = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const existing = await this.findSkillForCandidate(candidateId, skillId, transaction);
      this.assertChildWritable(existing.archivedAt, 'CANDIDATE_SKILL_ARCHIVED');
      return transaction.candidateSkill.update({
        where: { id: skillId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.level !== undefined ? { level: nullable(input.level) } : {}),
          ...(input.years !== undefined ? { years: input.years } : {}),
          ...(input.lastUsed !== undefined ? { lastUsed: nullable(input.lastUsed) } : {}),
        },
      });
    });
    await this.audit.record('candidates.skill.updated', context, {
      actorUserId,
      entityType: 'CandidateSkill',
      entityId: skill.id,
      metadataSummary: 'Candidate skill updated.',
    });
    return { skill: this.toSkill(skill) };
  }

  async archiveSkill(
    candidateId: string,
    skillId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateSkillDetailResponse> {
    const skill = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const existing = await this.findSkillForCandidate(candidateId, skillId, transaction);
      this.assertChildWritable(existing.archivedAt, 'CANDIDATE_SKILL_ARCHIVED');
      return transaction.candidateSkill.update({
        where: { id: skillId },
        data: { archivedAt: new Date() },
      });
    });
    await this.audit.record('candidates.skill.archived', context, {
      actorUserId,
      entityType: 'CandidateSkill',
      entityId: skill.id,
      metadataSummary: 'Candidate skill archived.',
    });
    return { skill: this.toSkill(skill) };
  }

  async createLanguage(
    candidateId: string,
    input: CandidateLanguageCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateLanguageDetailResponse> {
    const language = await this.withWritableCandidateLock(candidateId, (transaction) =>
      transaction.candidateLanguage.create({
        data: {
          candidateId,
          language: input.language,
          proficiency: input.proficiency,
        },
      }),
    );
    await this.audit.record('candidates.language.created', context, {
      actorUserId,
      entityType: 'CandidateLanguage',
      entityId: language.id,
      metadataSummary: 'Candidate language created.',
    });
    return { language: this.toLanguage(language) };
  }

  async listLanguages(candidateId: string): Promise<CandidateLanguageListResponse> {
    await this.findCandidate(candidateId);
    const languages = await this.prisma.candidateLanguage.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return { languages: languages.map((language) => this.toLanguage(language)) };
  }

  async updateLanguage(
    candidateId: string,
    languageId: string,
    input: CandidateLanguageUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateLanguageDetailResponse> {
    const language = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const existing = await this.findLanguageForCandidate(candidateId, languageId, transaction);
      this.assertChildWritable(existing.archivedAt, 'CANDIDATE_LANGUAGE_ARCHIVED');
      return transaction.candidateLanguage.update({
        where: { id: languageId },
        data: {
          ...(input.language !== undefined ? { language: input.language } : {}),
          ...(input.proficiency !== undefined ? { proficiency: input.proficiency } : {}),
        },
      });
    });
    await this.audit.record('candidates.language.updated', context, {
      actorUserId,
      entityType: 'CandidateLanguage',
      entityId: language.id,
      metadataSummary: 'Candidate language updated.',
    });
    return { language: this.toLanguage(language) };
  }

  async archiveLanguage(
    candidateId: string,
    languageId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateLanguageDetailResponse> {
    const language = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const existing = await this.findLanguageForCandidate(candidateId, languageId, transaction);
      this.assertChildWritable(existing.archivedAt, 'CANDIDATE_LANGUAGE_ARCHIVED');
      return transaction.candidateLanguage.update({
        where: { id: languageId },
        data: { archivedAt: new Date() },
      });
    });
    await this.audit.record('candidates.language.archived', context, {
      actorUserId,
      entityType: 'CandidateLanguage',
      entityId: language.id,
      metadataSummary: 'Candidate language archived.',
    });
    return { language: this.toLanguage(language) };
  }

  async createWorkExperience(
    candidateId: string,
    input: CandidateWorkExperienceCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateWorkExperienceDetailResponse> {
    const workExperience = await this.withWritableCandidateLock(candidateId, (transaction) =>
      transaction.candidateWorkExperience.create({
        data: {
          candidateId,
          employer: input.employer,
          title: input.title,
          startDate: optional(input.startDate),
          endDate: optional(input.endDate),
          isCurrent: input.isCurrent ?? false,
          description: optional(input.description),
        },
      }),
    );
    await this.audit.record('candidates.work_experience.created', context, {
      actorUserId,
      entityType: 'CandidateWorkExperience',
      entityId: workExperience.id,
      metadataSummary: 'Candidate work experience created.',
    });
    return { workExperience: this.toWorkExperience(workExperience) };
  }

  async listWorkExperiences(candidateId: string): Promise<CandidateWorkExperienceListResponse> {
    await this.findCandidate(candidateId);
    const workExperiences = await this.prisma.candidateWorkExperience.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return {
      workExperiences: workExperiences.map((experience) => this.toWorkExperience(experience)),
    };
  }

  async updateWorkExperience(
    candidateId: string,
    workExperienceId: string,
    input: CandidateWorkExperienceUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateWorkExperienceDetailResponse> {
    const workExperience = await this.withWritableCandidateLock(
      candidateId,
      async (transaction) => {
        const existing = await this.findWorkExperienceForCandidate(
          candidateId,
          workExperienceId,
          transaction,
        );
        this.assertChildWritable(existing.archivedAt, 'CANDIDATE_WORK_EXPERIENCE_ARCHIVED');
        return transaction.candidateWorkExperience.update({
          where: { id: workExperienceId },
          data: {
            ...(input.employer !== undefined ? { employer: input.employer } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.startDate !== undefined ? { startDate: nullable(input.startDate) } : {}),
            ...(input.endDate !== undefined ? { endDate: nullable(input.endDate) } : {}),
            ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
            ...(input.description !== undefined
              ? { description: nullable(input.description) }
              : {}),
          },
        });
      },
    );
    await this.audit.record('candidates.work_experience.updated', context, {
      actorUserId,
      entityType: 'CandidateWorkExperience',
      entityId: workExperience.id,
      metadataSummary: 'Candidate work experience updated.',
    });
    return { workExperience: this.toWorkExperience(workExperience) };
  }

  async archiveWorkExperience(
    candidateId: string,
    workExperienceId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateWorkExperienceDetailResponse> {
    const workExperience = await this.withWritableCandidateLock(
      candidateId,
      async (transaction) => {
        const existing = await this.findWorkExperienceForCandidate(
          candidateId,
          workExperienceId,
          transaction,
        );
        this.assertChildWritable(existing.archivedAt, 'CANDIDATE_WORK_EXPERIENCE_ARCHIVED');
        return transaction.candidateWorkExperience.update({
          where: { id: workExperienceId },
          data: { archivedAt: new Date() },
        });
      },
    );
    await this.audit.record('candidates.work_experience.archived', context, {
      actorUserId,
      entityType: 'CandidateWorkExperience',
      entityId: workExperience.id,
      metadataSummary: 'Candidate work experience archived.',
    });
    return { workExperience: this.toWorkExperience(workExperience) };
  }

  async createEducation(
    candidateId: string,
    input: CandidateEducationCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateEducationDetailResponse> {
    const education = await this.withWritableCandidateLock(candidateId, (transaction) =>
      transaction.candidateEducation.create({
        data: {
          candidateId,
          institution: input.institution,
          qualification: input.qualification,
          field: optional(input.field),
          startDate: optional(input.startDate),
          endDate: optional(input.endDate),
          description: optional(input.description),
        },
      }),
    );
    await this.audit.record('candidates.education.created', context, {
      actorUserId,
      entityType: 'CandidateEducation',
      entityId: education.id,
      metadataSummary: 'Candidate education created.',
    });
    return { education: this.toEducation(education) };
  }

  async listEducation(candidateId: string): Promise<CandidateEducationListResponse> {
    await this.findCandidate(candidateId);
    const education = await this.prisma.candidateEducation.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return { education: education.map((item) => this.toEducation(item)) };
  }

  async updateEducation(
    candidateId: string,
    educationId: string,
    input: CandidateEducationUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateEducationDetailResponse> {
    const education = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const existing = await this.findEducationForCandidate(candidateId, educationId, transaction);
      this.assertChildWritable(existing.archivedAt, 'CANDIDATE_EDUCATION_ARCHIVED');
      return transaction.candidateEducation.update({
        where: { id: educationId },
        data: {
          ...(input.institution !== undefined ? { institution: input.institution } : {}),
          ...(input.qualification !== undefined ? { qualification: input.qualification } : {}),
          ...(input.field !== undefined ? { field: nullable(input.field) } : {}),
          ...(input.startDate !== undefined ? { startDate: nullable(input.startDate) } : {}),
          ...(input.endDate !== undefined ? { endDate: nullable(input.endDate) } : {}),
          ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        },
      });
    });
    await this.audit.record('candidates.education.updated', context, {
      actorUserId,
      entityType: 'CandidateEducation',
      entityId: education.id,
      metadataSummary: 'Candidate education updated.',
    });
    return { education: this.toEducation(education) };
  }

  async archiveEducation(
    candidateId: string,
    educationId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CandidateEducationDetailResponse> {
    const education = await this.withWritableCandidateLock(candidateId, async (transaction) => {
      const existing = await this.findEducationForCandidate(candidateId, educationId, transaction);
      this.assertChildWritable(existing.archivedAt, 'CANDIDATE_EDUCATION_ARCHIVED');
      return transaction.candidateEducation.update({
        where: { id: educationId },
        data: { archivedAt: new Date() },
      });
    });
    await this.audit.record('candidates.education.archived', context, {
      actorUserId,
      entityType: 'CandidateEducation',
      entityId: education.id,
      metadataSummary: 'Candidate education archived.',
    });
    return { education: this.toEducation(education) };
  }

  private async resolveCandidateAccess(actorUserId: string): Promise<CandidateResponseAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return {
      profileView: permissions.includes(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_VIEW),
      compensationView: permissions.includes(CANDIDATE_PERMISSIONS.CANDIDATE_COMPENSATION_VIEW),
      compensationUpdate: permissions.includes(CANDIDATE_PERMISSIONS.CANDIDATE_COMPENSATION_UPDATE),
      consentView: permissions.includes(CANDIDATE_PERMISSIONS.CANDIDATE_CONSENT_VIEW),
      consentManage: permissions.includes(CANDIDATE_PERMISSIONS.CANDIDATE_CONSENT_MANAGE),
    };
  }

  private assertSensitiveInputAllowed(
    input: CandidateCreateRequest | CandidateUpdateRequest,
    access: CandidateResponseAccess,
  ): void {
    const hasCompensationInput =
      'salaryExpectationCents' in input || 'salaryExpectationCurrency' in input;
    const hasConsentInput = 'consentStatus' in input || 'consentRecordedAt' in input;

    if (hasCompensationInput && !access.compensationUpdate) {
      throw forbidden(
        'CANDIDATE_COMPENSATION_PERMISSION_REQUIRED',
        'Candidate compensation fields require candidate_compensation:update.',
      );
    }
    if (hasConsentInput && !access.consentManage) {
      throw forbidden(
        'CANDIDATE_CONSENT_PERMISSION_REQUIRED',
        'Candidate consent fields require candidate_consent:manage.',
      );
    }
  }

  private async auditSensitiveReads(
    recordCount: number,
    access: CandidateResponseAccess,
    actorUserId: string,
    context: RequestContext,
    candidateId?: string,
  ): Promise<void> {
    if (recordCount === 0) {
      return;
    }
    if (access.compensationView) {
      await this.audit.record('candidates.compensation.viewed', context, {
        actorUserId,
        entityType: 'Candidate',
        entityId: candidateId,
        metadataSummary: 'Candidate compensation fields included in response.',
      });
    }
    if (access.consentView) {
      await this.audit.record('candidates.consent.viewed', context, {
        actorUserId,
        entityType: 'Candidate',
        entityId: candidateId,
        metadataSummary: 'Candidate consent fields included in response.',
      });
    }
  }

  private async findCandidateWithProfile(candidateId: string): Promise<CandidateWithProfile> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: profileInclude,
    });
    if (!candidate) {
      throw notFound('CANDIDATE_NOT_FOUND', 'Candidate was not found.');
    }

    return candidate;
  }

  private async findCandidate(
    candidateId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<CandidateRecord> {
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) {
      throw notFound('CANDIDATE_NOT_FOUND', 'Candidate was not found.');
    }

    return candidate;
  }

  private async withWritableCandidateLock<T>(
    candidateId: string,
    callback: (transaction: PrismaTransaction, candidate: CandidateRecord) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await this.lockWritableCandidate(candidateId, transaction);
      return callback(transaction, candidate);
    });
  }

  private async lockWritableCandidate(
    candidateId: string,
    transaction: PrismaTransaction,
  ): Promise<CandidateRecord> {
    await transaction.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${candidateId}::uuid FOR UPDATE`;
    const candidate = await this.findCandidate(candidateId, transaction);
    if (candidate.status === CandidateStatus.ARCHIVED || candidate.archivedAt) {
      throw conflict('CANDIDATE_ARCHIVED', 'Archived candidates cannot be changed.');
    }

    return candidate;
  }

  private async findSkillForCandidate(
    candidateId: string,
    skillId: string,
    prisma: PrismaTransaction,
  ): Promise<CandidateSkillRecord> {
    const skill = await prisma.candidateSkill.findFirst({ where: { id: skillId, candidateId } });
    if (!skill) {
      throw notFound('CANDIDATE_SKILL_NOT_FOUND', 'Candidate skill was not found.');
    }

    return skill;
  }

  private async findLanguageForCandidate(
    candidateId: string,
    languageId: string,
    prisma: PrismaTransaction,
  ): Promise<CandidateLanguageRecord> {
    const language = await prisma.candidateLanguage.findFirst({
      where: { id: languageId, candidateId },
    });
    if (!language) {
      throw notFound('CANDIDATE_LANGUAGE_NOT_FOUND', 'Candidate language was not found.');
    }

    return language;
  }

  private async findWorkExperienceForCandidate(
    candidateId: string,
    workExperienceId: string,
    prisma: PrismaTransaction,
  ): Promise<CandidateWorkExperienceRecord> {
    const workExperience = await prisma.candidateWorkExperience.findFirst({
      where: { id: workExperienceId, candidateId },
    });
    if (!workExperience) {
      throw notFound(
        'CANDIDATE_WORK_EXPERIENCE_NOT_FOUND',
        'Candidate work experience was not found.',
      );
    }

    return workExperience;
  }

  private async findEducationForCandidate(
    candidateId: string,
    educationId: string,
    prisma: PrismaTransaction,
  ): Promise<CandidateEducationRecord> {
    const education = await prisma.candidateEducation.findFirst({
      where: { id: educationId, candidateId },
    });
    if (!education) {
      throw notFound('CANDIDATE_EDUCATION_NOT_FOUND', 'Candidate education was not found.');
    }

    return education;
  }

  private assertChildWritable(archivedAt: Date | null, code: string): void {
    if (archivedAt) {
      throw conflict(code, 'Archived candidate profile records cannot be changed.');
    }
  }

  private rethrowDuplicateEmail(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(
        'CANDIDATE_EMAIL_ALREADY_EXISTS',
        'A candidate with that normalized email already exists.',
      );
    }
  }

  private toCandidateDetail(candidate: CandidateWithProfile, access: CandidateResponseAccess) {
    return {
      ...this.toCandidateSummary(candidate, access),
      skills: access.profileView ? candidate.skills.map((skill) => this.toSkill(skill)) : [],
      languages: access.profileView
        ? candidate.languages.map((language) => this.toLanguage(language))
        : [],
      workExperiences: access.profileView
        ? candidate.workExperiences.map((experience) => this.toWorkExperience(experience))
        : [],
      education: access.profileView
        ? candidate.education.map((education) => this.toEducation(education))
        : [],
    };
  }

  private toCandidateSummary(candidate: CandidateRecord, access: CandidateResponseAccess) {
    return {
      id: candidate.id,
      displayName: candidate.displayName,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      normalizedEmail: candidate.normalizedEmail,
      phone: candidate.phone,
      city: candidate.city,
      country: candidate.country,
      currentJobTitle: candidate.currentJobTitle,
      professionalSummary: candidate.professionalSummary,
      linkedinUrl: candidate.linkedinUrl,
      status: candidate.status,
      source: candidate.source,
      sourceDetail: candidate.sourceDetail,
      availabilityNotice: candidate.availabilityNotice,
      compensation: access.compensationView
        ? {
            salaryExpectationCents: candidate.salaryExpectationCents,
            salaryExpectationCurrency: candidate.salaryExpectationCurrency,
          }
        : null,
      consent: access.consentView
        ? {
            consentStatus: candidate.consentStatus,
            consentRecordedAt: isoOrNull(candidate.consentRecordedAt),
          }
        : null,
      archivedAt: isoOrNull(candidate.archivedAt),
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    };
  }

  private toSkill(skill: CandidateSkillRecord) {
    return {
      id: skill.id,
      candidateId: skill.candidateId,
      name: skill.name,
      level: skill.level,
      years: skill.years,
      lastUsed: skill.lastUsed,
      archivedAt: isoOrNull(skill.archivedAt),
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    };
  }

  private toLanguage(language: CandidateLanguageRecord) {
    return {
      id: language.id,
      candidateId: language.candidateId,
      language: language.language,
      proficiency: language.proficiency,
      archivedAt: isoOrNull(language.archivedAt),
      createdAt: language.createdAt.toISOString(),
      updatedAt: language.updatedAt.toISOString(),
    };
  }

  private toWorkExperience(workExperience: CandidateWorkExperienceRecord) {
    return {
      id: workExperience.id,
      candidateId: workExperience.candidateId,
      employer: workExperience.employer,
      title: workExperience.title,
      startDate: workExperience.startDate,
      endDate: workExperience.endDate,
      isCurrent: workExperience.isCurrent,
      description: workExperience.description,
      archivedAt: isoOrNull(workExperience.archivedAt),
      createdAt: workExperience.createdAt.toISOString(),
      updatedAt: workExperience.updatedAt.toISOString(),
    };
  }

  private toEducation(education: CandidateEducationRecord) {
    return {
      id: education.id,
      candidateId: education.candidateId,
      institution: education.institution,
      qualification: education.qualification,
      field: education.field,
      startDate: education.startDate,
      endDate: education.endDate,
      description: education.description,
      archivedAt: isoOrNull(education.archivedAt),
      createdAt: education.createdAt.toISOString(),
      updatedAt: education.updatedAt.toISOString(),
    };
  }
}

const profileInclude = {
  skills: { orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }] },
  languages: { orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }] },
  workExperiences: { orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }] },
  education: { orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }] },
};

function optional(value: string | undefined): string | undefined {
  return value?.trim();
}

function nullable(value: string | null): string | null {
  return value === null ? null : value.trim();
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').toLowerCase();
}

function normalizePhoneOrNull(value: string | null): string | null {
  return value === null ? null : normalizePhone(value);
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
