import { Inject, Injectable } from '@nestjs/common';
import type {
  EvaluationCreateRequest,
  EvaluationDetailResponse,
  EvaluationListQuery,
  EvaluationListResponse,
  EvaluationUpdateRequest,
  InterviewCancellationRequest,
  InterviewCompletionRequest,
  InterviewDetailResponse,
  InterviewListQuery,
  InterviewListResponse,
  InterviewParticipantCreateRequest,
  InterviewPostponeRequest,
  InterviewRescheduleRequest,
  InterviewScheduleRequest,
} from '@hire-me/contracts';

import { MissionAuditService } from './mission-audit.service.js';
import { conflict, forbidden, notFound } from './mission.errors.js';
import { MISSION_PERMISSIONS } from './mission-permissions.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  ClientContactStatus,
  EvaluationStatus,
  EvaluationType,
  InterviewEventAction,
  InterviewParticipantKind,
  InterviewParticipantStatus,
  InterviewStatus,
  InterviewType,
  MissionCandidateState,
  MissionRecruiterRole,
  Prisma,
  RecruitmentMissionState,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type ProcessRecord = Prisma.MissionCandidateGetPayload<{
  include: {
    mission: { select: { clientId: true; state: true; archivedAt: true } };
    candidate: { select: { status: true; archivedAt: true } };
  };
}>;
type InterviewRecord = Prisma.InterviewGetPayload<{ include: typeof interviewInclude }>;
type EvaluationRecord = Prisma.CandidateEvaluationGetPayload<{
  include: typeof evaluationInclude;
}>;
type InterviewAccess = {
  archive: boolean;
  internalEvaluationView: boolean;
  clientFeedbackView: boolean;
  evaluationUpdate: boolean;
  evaluationFinalize: boolean;
};

const terminalMissionStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
  RecruitmentMissionState.ARCHIVED,
]);

const terminalProcessStates = new Set<MissionCandidateState>([
  MissionCandidateState.CANDIDATE_REJECTED,
  MissionCandidateState.CLIENT_REJECTED,
  MissionCandidateState.WITHDRAWN,
  MissionCandidateState.TALENT_POOL,
  MissionCandidateState.PROCESS_COMPLETED,
]);

const clientInterviewTypes = new Set<InterviewType>([
  InterviewType.CLIENT_INTERVIEW_1,
  InterviewType.CLIENT_INTERVIEW_2,
]);

@Injectable()
export class MissionInterviewsService {
  constructor(
    @Inject(MissionAuditService) private readonly audit: MissionAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listInterviews(
    missionId: string,
    processId: string,
    query: InterviewListQuery,
    actorUserId: string,
  ): Promise<InterviewListResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.assertMissionScope(missionId, actorUserId, access);
    await this.findProcessForMission(missionId, processId);
    const where: Prisma.InterviewWhereInput = {
      missionCandidateId: processId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, interviews] = await this.prisma.$transaction([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        include: interviewInclude,
        orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      interviews: interviews.map((interview) => this.toInterviewSummary(interview)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getInterview(
    missionId: string,
    processId: string,
    interviewId: string,
    actorUserId: string,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.assertMissionScope(missionId, actorUserId, access);
    await this.findProcessForMission(missionId, processId);
    return {
      interview: this.toInterviewDetail(await this.findInterview(processId, interviewId), access),
    };
  }

  async scheduleInterview(
    missionId: string,
    processId: string,
    input: InterviewScheduleRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    try {
      const interview = await this.withWritableProcessLock(
        missionId,
        processId,
        async (transaction, process) => {
          await this.assertActorCanControlProcess(
            missionId,
            process,
            actorUserId,
            access,
            transaction,
          );
          await this.assertOrganizerEligible(missionId, input.organizerUserId, transaction);
          await this.assertInterviewContextAllowed(processId, input.type, process, transaction);
          const created = await transaction.interview.create({
            data: {
              missionCandidateId: processId,
              type: input.type,
              scheduledStartAt: new Date(input.scheduledStartAt),
              scheduledEndAt: dateOrNull(input.scheduledEndAt),
              timezone: input.timezone,
              format: input.format,
              location: optional(input.location),
              meetingUrl: optional(input.meetingUrl),
              organizerUserId: input.organizerUserId,
            },
          });
          await this.createParticipants(transaction, created.id, process.mission.clientId, input);
          await this.createInterviewEvent(transaction, {
            interviewId: created.id,
            actorUserId,
            action: InterviewEventAction.SCHEDULED,
            nextStatus: InterviewStatus.SCHEDULED,
            nextStartAt: created.scheduledStartAt,
            nextEndAt: created.scheduledEndAt,
            nextTimezone: created.timezone,
          });
          return this.findInterview(processId, created.id, transaction);
        },
      );

      await this.audit.record('interviews.interview.scheduled', context, {
        actorUserId,
        entityType: 'Interview',
        entityId: interview.id,
        metadataSummary: `Interview scheduled with type ${input.type}.`,
      });
      return { interview: this.toInterviewDetail(interview, access) };
    } catch (error: unknown) {
      this.rethrowDuplicateParticipant(error);
      throw error;
    }
  }

  async rescheduleInterview(
    missionId: string,
    processId: string,
    interviewId: string,
    input: InterviewRescheduleRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const interview = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction, existing) => {
        this.assertInterviewWritable(existing);
        const updated = await transaction.interview.update({
          where: { id: interviewId },
          data: {
            status: InterviewStatus.SCHEDULED,
            scheduledStartAt: new Date(input.scheduledStartAt),
            scheduledEndAt: dateOrNull(input.scheduledEndAt),
            timezone: input.timezone,
            postponedAt: null,
          },
          include: interviewInclude,
        });
        await this.createInterviewEvent(transaction, {
          interviewId,
          actorUserId,
          action: InterviewEventAction.RESCHEDULED,
          previousStatus: existing.status,
          nextStatus: InterviewStatus.SCHEDULED,
          previousStartAt: existing.scheduledStartAt,
          nextStartAt: updated.scheduledStartAt,
          previousEndAt: existing.scheduledEndAt,
          nextEndAt: updated.scheduledEndAt,
          previousTimezone: existing.timezone,
          nextTimezone: updated.timezone,
          reason: input.reason,
        });
        return updated;
      },
    );
    await this.audit.record('interviews.interview.rescheduled', context, {
      actorUserId,
      entityType: 'Interview',
      entityId: interview.id,
      metadataSummary: 'Interview rescheduled with preserved reason.',
    });
    return { interview: this.toInterviewDetail(interview, access) };
  }

  async postponeInterview(
    missionId: string,
    processId: string,
    interviewId: string,
    input: InterviewPostponeRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const interview = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction, existing) => {
        this.assertInterviewWritable(existing);
        const updated = await transaction.interview.update({
          where: { id: interviewId },
          data: { status: InterviewStatus.POSTPONED, postponedAt: new Date() },
          include: interviewInclude,
        });
        await this.createInterviewEvent(transaction, {
          interviewId,
          actorUserId,
          action: InterviewEventAction.POSTPONED,
          previousStatus: existing.status,
          nextStatus: InterviewStatus.POSTPONED,
          reason: input.reason,
        });
        return updated;
      },
    );
    await this.audit.record('interviews.interview.postponed', context, {
      actorUserId,
      entityType: 'Interview',
      entityId: interview.id,
      metadataSummary: 'Interview postponed with preserved reason.',
    });
    return { interview: this.toInterviewDetail(interview, access) };
  }

  async completeInterview(
    missionId: string,
    processId: string,
    interviewId: string,
    input: InterviewCompletionRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const { interview, changed } = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction, existing) => {
        if (existing.status === InterviewStatus.COMPLETED) {
          return { interview: existing, changed: false };
        }
        if (
          existing.status === InterviewStatus.CANCELED ||
          existing.status === InterviewStatus.ARCHIVED
        ) {
          throw conflict('INTERVIEW_TERMINAL', 'Terminal interviews cannot be completed.');
        }
        const updated = await transaction.interview.update({
          where: { id: interviewId },
          data: {
            status: InterviewStatus.COMPLETED,
            completedAt: new Date(),
            outcome: optional(input.outcome),
          },
          include: interviewInclude,
        });
        await this.createInterviewEvent(transaction, {
          interviewId,
          actorUserId,
          action: InterviewEventAction.COMPLETED,
          previousStatus: existing.status,
          nextStatus: InterviewStatus.COMPLETED,
        });
        return { interview: updated, changed: true };
      },
    );
    if (changed) {
      await this.audit.record('interviews.interview.completed', context, {
        actorUserId,
        entityType: 'Interview',
        entityId: interview.id,
        metadataSummary: 'Interview completed without changing candidate pipeline state.',
      });
    }
    return { interview: this.toInterviewDetail(interview, access) };
  }

  async cancelInterview(
    missionId: string,
    processId: string,
    interviewId: string,
    input: InterviewCancellationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const interview = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction, existing) => {
        if (existing.status === InterviewStatus.COMPLETED) {
          throw conflict('INTERVIEW_ALREADY_COMPLETED', 'Completed interviews cannot be canceled.');
        }
        if (existing.status === InterviewStatus.ARCHIVED) {
          throw conflict('INTERVIEW_ARCHIVED', 'Archived interviews cannot be canceled.');
        }
        if (existing.status === InterviewStatus.CANCELED) {
          return existing;
        }
        const updated = await transaction.interview.update({
          where: { id: interviewId },
          data: { status: InterviewStatus.CANCELED, canceledAt: new Date() },
          include: interviewInclude,
        });
        await this.createInterviewEvent(transaction, {
          interviewId,
          actorUserId,
          action: InterviewEventAction.CANCELED,
          previousStatus: existing.status,
          nextStatus: InterviewStatus.CANCELED,
          reason: input.reason,
        });
        return updated;
      },
    );
    await this.audit.record('interviews.interview.canceled', context, {
      actorUserId,
      entityType: 'Interview',
      entityId: interview.id,
      metadataSummary: 'Interview canceled with preserved reason.',
    });
    return { interview: this.toInterviewDetail(interview, access) };
  }

  async archiveInterview(
    missionId: string,
    processId: string,
    interviewId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const interview = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction, existing) => {
        if (existing.status === InterviewStatus.ARCHIVED || existing.archivedAt) {
          throw conflict('INTERVIEW_ARCHIVED', 'Interview is already archived.');
        }
        const now = new Date();
        await transaction.interviewParticipant.updateMany({
          where: { interviewId, status: InterviewParticipantStatus.ACTIVE, archivedAt: null },
          data: { status: InterviewParticipantStatus.ARCHIVED, archivedAt: now },
        });
        const updated = await transaction.interview.update({
          where: { id: interviewId },
          data: { status: InterviewStatus.ARCHIVED, archivedAt: now },
          include: interviewInclude,
        });
        await this.createInterviewEvent(transaction, {
          interviewId,
          actorUserId,
          action: InterviewEventAction.ARCHIVED,
          previousStatus: existing.status,
          nextStatus: InterviewStatus.ARCHIVED,
        });
        return updated;
      },
    );
    await this.audit.record('interviews.interview.archived', context, {
      actorUserId,
      entityType: 'Interview',
      entityId: interview.id,
      metadataSummary: 'Interview archived without physical deletion.',
    });
    return { interview: this.toInterviewDetail(interview, access) };
  }

  async addParticipant(
    missionId: string,
    processId: string,
    interviewId: string,
    input: InterviewParticipantCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    try {
      const interview = await this.withWritableInterviewLock(
        missionId,
        processId,
        interviewId,
        access,
        actorUserId,
        async (transaction, existing, process) => {
          this.assertInterviewWritable(existing);
          const participant = await this.createParticipant(
            transaction,
            interviewId,
            process.mission.clientId,
            input,
          );
          await this.createInterviewEvent(transaction, {
            interviewId,
            actorUserId,
            action: InterviewEventAction.PARTICIPANT_ADDED,
            participantId: participant.id,
          });
          return this.findInterview(processId, interviewId, transaction);
        },
      );
      await this.audit.record('interviews.participant.added', context, {
        actorUserId,
        entityType: 'InterviewParticipant',
        entityId: interview.id,
        metadataSummary: 'Interview participant added.',
      });
      return { interview: this.toInterviewDetail(interview, access) };
    } catch (error: unknown) {
      this.rethrowDuplicateParticipant(error);
      throw error;
    }
  }

  async removeParticipant(
    missionId: string,
    processId: string,
    interviewId: string,
    participantId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InterviewDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const interview = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction, existing) => {
        this.assertInterviewWritable(existing);
        const participant = await transaction.interviewParticipant.findFirst({
          where: { id: participantId, interviewId },
        });
        if (!participant) {
          throw notFound('INTERVIEW_PARTICIPANT_NOT_FOUND', 'Interview participant was not found.');
        }
        if (participant.status === InterviewParticipantStatus.ACTIVE && !participant.archivedAt) {
          await transaction.interviewParticipant.update({
            where: { id: participantId },
            data: {
              status: InterviewParticipantStatus.ARCHIVED,
              archivedAt: new Date(),
            },
          });
          await this.createInterviewEvent(transaction, {
            interviewId,
            actorUserId,
            action: InterviewEventAction.PARTICIPANT_REMOVED,
            participantId,
          });
        }
        return this.findInterview(processId, interviewId, transaction);
      },
    );
    await this.audit.record('interviews.participant.removed', context, {
      actorUserId,
      entityType: 'InterviewParticipant',
      entityId: participantId,
      metadataSummary: 'Interview participant archived.',
    });
    return { interview: this.toInterviewDetail(interview, access) };
  }

  async listEvaluations(
    missionId: string,
    processId: string,
    interviewId: string,
    query: EvaluationListQuery,
    actorUserId: string,
  ): Promise<EvaluationListResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.assertMissionScope(missionId, actorUserId, access);
    await this.findProcessForMission(missionId, processId);
    await this.findInterview(processId, interviewId);
    const where: Prisma.CandidateEvaluationWhereInput = {
      interviewId,
      ...(query.evaluationType ? { evaluationType: query.evaluationType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, evaluations] = await this.prisma.$transaction([
      this.prisma.candidateEvaluation.count({ where }),
      this.prisma.candidateEvaluation.findMany({
        where,
        include: evaluationInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      evaluations: evaluations.map((evaluation) => this.toEvaluation(evaluation, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async createEvaluation(
    missionId: string,
    processId: string,
    interviewId: string,
    input: EvaluationCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<EvaluationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    try {
      const evaluation = await this.withWritableInterviewLock(
        missionId,
        processId,
        interviewId,
        access,
        actorUserId,
        async (transaction, existing, process) => {
          await this.assertEvaluatorEligible(actorUserId, transaction);
          await this.assertActorCanEvaluate(
            missionId,
            interviewId,
            actorUserId,
            access,
            transaction,
          );
          const created = await transaction.candidateEvaluation.create({
            data: {
              missionCandidateId: process.id,
              interviewId: existing.id,
              authorUserId: actorUserId,
              evaluationType: input.evaluationType,
              recommendation: input.recommendation,
              recommended: input.recommended,
              overallScore: input.overallScore,
              communicationScore: input.communicationScore,
              technicalScore: input.technicalScore,
              roleFitScore: input.roleFitScore,
              cultureFitScore: input.cultureFitScore,
              motivationScore: input.motivationScore,
              salaryAlignmentScore: input.salaryAlignmentScore,
              strengths: optional(input.strengths),
              weaknesses: optional(input.weaknesses),
              risks: optional(input.risks),
              comment: optional(input.comment),
              finalOpinion: input.finalOpinion,
              internalOnly: input.evaluationType !== EvaluationType.CLIENT,
              clientVisible: input.evaluationType === EvaluationType.CLIENT && input.clientVisible,
            },
            include: evaluationInclude,
          });
          return created;
        },
      );
      await this.audit.record('evaluations.evaluation.created', context, {
        actorUserId,
        entityType: 'CandidateEvaluation',
        entityId: evaluation.id,
        metadataSummary: `Structured interview evaluation created as ${input.evaluationType}.`,
      });
      return { evaluation: this.toEvaluation(evaluation, access) };
    } catch (error: unknown) {
      this.rethrowEvaluationConflict(error);
      throw error;
    }
  }

  async updateEvaluation(
    missionId: string,
    processId: string,
    interviewId: string,
    evaluationId: string,
    input: EvaluationUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<EvaluationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const evaluation = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction) => {
        const existing = await this.findEvaluation(interviewId, evaluationId, transaction);
        this.assertEvaluationMutable(existing, actorUserId);
        const nextType = input.evaluationType ?? existing.evaluationType;
        return transaction.candidateEvaluation.update({
          where: { id: evaluationId },
          data: {
            ...(input.evaluationType !== undefined ? { evaluationType: input.evaluationType } : {}),
            ...(input.recommendation !== undefined ? { recommendation: input.recommendation } : {}),
            ...(input.recommended !== undefined ? { recommended: input.recommended } : {}),
            ...(input.overallScore !== undefined ? { overallScore: input.overallScore } : {}),
            ...(input.communicationScore !== undefined
              ? { communicationScore: input.communicationScore }
              : {}),
            ...(input.technicalScore !== undefined ? { technicalScore: input.technicalScore } : {}),
            ...(input.roleFitScore !== undefined ? { roleFitScore: input.roleFitScore } : {}),
            ...(input.cultureFitScore !== undefined
              ? { cultureFitScore: input.cultureFitScore }
              : {}),
            ...(input.motivationScore !== undefined
              ? { motivationScore: input.motivationScore }
              : {}),
            ...(input.salaryAlignmentScore !== undefined
              ? { salaryAlignmentScore: input.salaryAlignmentScore }
              : {}),
            ...(input.strengths !== undefined ? { strengths: optional(input.strengths) } : {}),
            ...(input.weaknesses !== undefined ? { weaknesses: optional(input.weaknesses) } : {}),
            ...(input.risks !== undefined ? { risks: optional(input.risks) } : {}),
            ...(input.comment !== undefined ? { comment: optional(input.comment) } : {}),
            ...(input.finalOpinion !== undefined ? { finalOpinion: input.finalOpinion } : {}),
            ...(input.clientVisible !== undefined
              ? { clientVisible: nextType === EvaluationType.CLIENT && input.clientVisible }
              : {}),
            internalOnly: nextType !== EvaluationType.CLIENT,
          },
          include: evaluationInclude,
        });
      },
    );
    await this.audit.record('evaluations.evaluation.updated', context, {
      actorUserId,
      entityType: 'CandidateEvaluation',
      entityId: evaluation.id,
      metadataSummary: 'Structured interview evaluation draft updated.',
    });
    return { evaluation: this.toEvaluation(evaluation, access) };
  }

  async finalizeEvaluation(
    missionId: string,
    processId: string,
    interviewId: string,
    evaluationId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<EvaluationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const { evaluation, changed } = await this.withWritableInterviewLock(
      missionId,
      processId,
      interviewId,
      access,
      actorUserId,
      async (transaction) => {
        const existing = await this.findEvaluation(interviewId, evaluationId, transaction);
        if (existing.status === EvaluationStatus.SUBMITTED) {
          return { evaluation: existing, changed: false };
        }
        this.assertEvaluationMutable(existing, actorUserId);
        const updated = await transaction.candidateEvaluation.update({
          where: { id: evaluationId },
          data: { status: EvaluationStatus.SUBMITTED, submittedAt: new Date() },
          include: evaluationInclude,
        });
        return { evaluation: updated, changed: true };
      },
    );
    if (changed) {
      await this.audit.record('evaluations.evaluation.finalized', context, {
        actorUserId,
        entityType: 'CandidateEvaluation',
        entityId: evaluation.id,
        metadataSummary: 'Structured interview evaluation finalized explicitly.',
      });
    }
    return { evaluation: this.toEvaluation(evaluation, access) };
  }

  private async resolveAccess(actorUserId: string): Promise<InterviewAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return {
      archive: permissions.includes(MISSION_PERMISSIONS.INTERVIEWS_ARCHIVE),
      internalEvaluationView: permissions.includes(MISSION_PERMISSIONS.EVALUATIONS_INTERNAL_VIEW),
      clientFeedbackView: permissions.includes(MISSION_PERMISSIONS.CLIENT_FEEDBACK_VIEW),
      evaluationUpdate: permissions.includes(MISSION_PERMISSIONS.EVALUATIONS_UPDATE),
      evaluationFinalize: permissions.includes(MISSION_PERMISSIONS.EVALUATIONS_FINALIZE),
    };
  }

  private async withWritableInterviewLock<T>(
    missionId: string,
    processId: string,
    interviewId: string,
    access: InterviewAccess,
    actorUserId: string,
    callback: (
      transaction: PrismaTransaction,
      interview: InterviewRecord,
      process: ProcessRecord,
    ) => Promise<T>,
  ): Promise<T> {
    return this.withWritableProcessLock(missionId, processId, async (transaction, process) => {
      await this.assertActorCanControlProcess(missionId, process, actorUserId, access, transaction);
      const interview = await this.lockInterview(processId, interviewId, transaction);
      return callback(transaction, interview, process);
    });
  }

  private async withWritableProcessLock<T>(
    missionId: string,
    processId: string,
    callback: (transaction: PrismaTransaction, process: ProcessRecord) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
      const mission = await transaction.recruitmentMission.findUnique({ where: { id: missionId } });
      if (!mission) {
        throw notFound('MISSION_NOT_FOUND', 'Recruitment mission was not found.');
      }
      if (terminalMissionStates.has(mission.state) || mission.archivedAt) {
        throw conflict('MISSION_TERMINAL', 'Terminal recruitment missions cannot be changed.');
      }
      await transaction.$queryRaw`SELECT id FROM "MissionCandidate" WHERE id = ${processId}::uuid AND "missionId" = ${missionId}::uuid FOR UPDATE`;
      const process = await this.findProcessForMission(missionId, processId, transaction);
      await transaction.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${process.candidateId}::uuid FOR UPDATE`;
      if (process.candidate.status === CandidateStatus.ARCHIVED || process.candidate.archivedAt) {
        throw conflict(
          'CANDIDATE_ARCHIVED',
          'Archived candidates cannot receive interview writes.',
        );
      }
      if (terminalProcessStates.has(process.state) || process.archivedAt) {
        throw conflict(
          'MISSION_CANDIDATE_TERMINAL',
          'Terminal candidate processes cannot receive interview writes.',
        );
      }
      return callback(transaction, process);
    });
  }

  private async lockInterview(
    processId: string,
    interviewId: string,
    transaction: PrismaTransaction,
  ): Promise<InterviewRecord> {
    await transaction.$queryRaw`SELECT id FROM "Interview" WHERE id = ${interviewId}::uuid AND "missionCandidateId" = ${processId}::uuid FOR UPDATE`;
    return this.findInterview(processId, interviewId, transaction);
  }

  private async findProcessForMission(
    missionId: string,
    processId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<ProcessRecord> {
    const process = await prisma.missionCandidate.findFirst({
      where: { id: processId, missionId },
      include: {
        mission: { select: { clientId: true, state: true, archivedAt: true } },
        candidate: { select: { status: true, archivedAt: true } },
      },
    });
    if (!process) {
      throw notFound('MISSION_CANDIDATE_NOT_FOUND', 'Mission candidate process was not found.');
    }
    return process;
  }

  private async findInterview(
    processId: string,
    interviewId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<InterviewRecord> {
    const interview = await prisma.interview.findFirst({
      where: { id: interviewId, missionCandidateId: processId },
      include: interviewInclude,
    });
    if (!interview) {
      throw notFound('INTERVIEW_NOT_FOUND', 'Interview was not found.');
    }
    return interview;
  }

  private async findEvaluation(
    interviewId: string,
    evaluationId: string,
    transaction: PrismaTransaction,
  ): Promise<EvaluationRecord> {
    await transaction.$queryRaw`SELECT id FROM "CandidateEvaluation" WHERE id = ${evaluationId}::uuid AND "interviewId" = ${interviewId}::uuid FOR UPDATE`;
    const evaluation = await transaction.candidateEvaluation.findFirst({
      where: { id: evaluationId, interviewId },
      include: evaluationInclude,
    });
    if (!evaluation) {
      throw notFound('EVALUATION_NOT_FOUND', 'Candidate evaluation was not found.');
    }
    return evaluation;
  }

  private async assertMissionScope(
    missionId: string,
    actorUserId: string,
    access: InterviewAccess,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<void> {
    if (access.archive || access.internalEvaluationView) {
      return;
    }
    const assignment = await prisma.missionRecruiter.findFirst({
      where: { missionId, userId: actorUserId, status: AssignmentStatus.ACTIVE, archivedAt: null },
    });
    if (!assignment) {
      throw forbidden(
        'INTERVIEW_SCOPE_DENIED',
        'Interview access requires mission assignment scope.',
      );
    }
  }

  private async assertActorCanControlProcess(
    missionId: string,
    process: ProcessRecord,
    actorUserId: string,
    access: InterviewAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (access.archive || process.responsibleRecruiterUserId === actorUserId) {
      return;
    }
    const lead = await transaction.missionRecruiter.findFirst({
      where: {
        missionId,
        userId: actorUserId,
        role: MissionRecruiterRole.LEAD_RECRUITER,
        isLead: true,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
      },
    });
    if (!lead) {
      throw forbidden(
        'MISSION_CANDIDATE_RESPONSIBLE_RECRUITER_REQUIRED',
        'Only the responsible recruiter, mission lead, or authorized override user can manage process interviews.',
      );
    }
  }

  private async assertOrganizerEligible(
    missionId: string,
    userId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.archivedAt ||
      user.userType !== UserType.INTERNAL
    ) {
      throw conflict(
        'INTERVIEW_ORGANIZER_NOT_ELIGIBLE',
        'Organizer must be an active, non-archived internal user.',
      );
    }
    const assignment = await transaction.missionRecruiter.findFirst({
      where: { missionId, userId, status: AssignmentStatus.ACTIVE, archivedAt: null },
    });
    if (!assignment) {
      throw conflict(
        'INTERVIEW_ORGANIZER_NOT_ASSIGNED',
        'Organizer must be assigned to the mission.',
      );
    }
  }

  private async assertInterviewContextAllowed(
    processId: string,
    type: InterviewType,
    process: ProcessRecord,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (clientInterviewTypes.has(type) && !process.clientVisible) {
      throw conflict(
        'INTERVIEW_PRESENTATION_REQUIRED',
        'Client interviews require explicit candidate presentation first.',
      );
    }
    if (type === InterviewType.CLIENT_INTERVIEW_2) {
      const firstClientInterview = await transaction.interview.findFirst({
        where: {
          missionCandidateId: processId,
          type: InterviewType.CLIENT_INTERVIEW_1,
          status: { in: [InterviewStatus.COMPLETED, InterviewStatus.POSTPONED] },
          archivedAt: null,
        },
      });
      if (!firstClientInterview) {
        throw conflict(
          'INTERVIEW_CLIENT_FIRST_REQUIRED',
          'Client interview 2 requires a completed or postponed client interview 1.',
        );
      }
    }
  }

  private async createParticipants(
    transaction: PrismaTransaction,
    interviewId: string,
    clientId: string,
    input: InterviewScheduleRequest,
  ): Promise<void> {
    const userIds = new Set([input.organizerUserId, ...input.internalUserParticipantIds]);
    for (const userId of userIds) {
      await this.assertParticipantUserEligible(userId, transaction);
      await transaction.interviewParticipant.create({
        data: { interviewId, kind: InterviewParticipantKind.INTERNAL_USER, userId },
      });
    }
    for (const clientContactId of new Set(input.clientContactParticipantIds)) {
      await this.assertClientContactEligible(clientId, clientContactId, transaction);
      await transaction.interviewParticipant.create({
        data: { interviewId, kind: InterviewParticipantKind.CLIENT_CONTACT, clientContactId },
      });
    }
    for (const external of input.externalParticipants) {
      await transaction.interviewParticipant.create({
        data: {
          interviewId,
          kind: InterviewParticipantKind.EXTERNAL,
          externalName: external.name,
          externalRole: optional(external.role),
        },
      });
    }
  }

  private async createParticipant(
    transaction: PrismaTransaction,
    interviewId: string,
    clientId: string,
    input: InterviewParticipantCreateRequest,
  ) {
    if (input.kind === InterviewParticipantKind.INTERNAL_USER && input.userId) {
      await this.assertParticipantUserEligible(input.userId, transaction);
      return transaction.interviewParticipant.create({
        data: { interviewId, kind: input.kind, userId: input.userId },
      });
    }
    if (input.kind === InterviewParticipantKind.CLIENT_CONTACT && input.clientContactId) {
      await this.assertClientContactEligible(clientId, input.clientContactId, transaction);
      return transaction.interviewParticipant.create({
        data: { interviewId, kind: input.kind, clientContactId: input.clientContactId },
      });
    }
    if (input.kind === InterviewParticipantKind.EXTERNAL && input.externalName) {
      return transaction.interviewParticipant.create({
        data: {
          interviewId,
          kind: input.kind,
          externalName: input.externalName,
          externalRole: optional(input.externalRole),
        },
      });
    }
    throw conflict('INTERVIEW_PARTICIPANT_INVALID', 'Participant kind and subject do not match.');
  }

  private async assertParticipantUserEligible(
    userId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.archivedAt ||
      user.userType !== UserType.INTERNAL
    ) {
      throw conflict(
        'INTERVIEW_PARTICIPANT_NOT_ELIGIBLE',
        'Internal participants must be active, non-archived internal users.',
      );
    }
  }

  private async assertClientContactEligible(
    clientId: string,
    clientContactId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    const contact = await transaction.clientContact.findUnique({ where: { id: clientContactId } });
    if (!contact || contact.clientId !== clientId) {
      throw conflict(
        'INTERVIEW_CLIENT_CONTACT_INVALID',
        'Client contact must belong to the mission client.',
      );
    }
    if (contact.status !== ClientContactStatus.ACTIVE || contact.archivedAt) {
      throw conflict(
        'INTERVIEW_CLIENT_CONTACT_INACTIVE',
        'Client contact must be active and non-archived.',
      );
    }
  }

  private async assertEvaluatorEligible(
    userId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.archivedAt ||
      user.userType !== UserType.INTERNAL
    ) {
      throw conflict(
        'EVALUATION_AUTHOR_NOT_ELIGIBLE',
        'Evaluator must be an active, non-archived internal user.',
      );
    }
  }

  private async assertActorCanEvaluate(
    missionId: string,
    interviewId: string,
    actorUserId: string,
    access: InterviewAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (access.archive) {
      return;
    }
    const participant = await transaction.interviewParticipant.findFirst({
      where: {
        interviewId,
        userId: actorUserId,
        status: InterviewParticipantStatus.ACTIVE,
        archivedAt: null,
      },
    });
    if (participant) {
      return;
    }
    const assignment = await transaction.missionRecruiter.findFirst({
      where: { missionId, userId: actorUserId, status: AssignmentStatus.ACTIVE, archivedAt: null },
    });
    if (!assignment) {
      throw forbidden(
        'EVALUATION_SCOPE_DENIED',
        'Evaluator must participate in the interview or be assigned to the mission.',
      );
    }
  }

  private assertInterviewWritable(interview: InterviewRecord): void {
    if (
      interview.status === InterviewStatus.COMPLETED ||
      interview.status === InterviewStatus.CANCELED ||
      interview.status === InterviewStatus.ARCHIVED ||
      interview.archivedAt
    ) {
      throw conflict('INTERVIEW_TERMINAL', 'Terminal interviews cannot receive ordinary updates.');
    }
  }

  private assertEvaluationMutable(evaluation: EvaluationRecord, actorUserId: string): void {
    if (evaluation.authorUserId !== actorUserId) {
      throw forbidden(
        'EVALUATION_AUTHOR_REQUIRED',
        'Only the evaluation author can change this draft evaluation.',
      );
    }
    if (evaluation.status === EvaluationStatus.SUBMITTED || evaluation.submittedAt) {
      throw conflict('EVALUATION_FINALIZED', 'Finalized evaluations cannot be changed.');
    }
    if (evaluation.status === EvaluationStatus.ARCHIVED || evaluation.archivedAt) {
      throw conflict('EVALUATION_ARCHIVED', 'Archived evaluations cannot be changed.');
    }
  }

  private async createInterviewEvent(
    transaction: PrismaTransaction,
    data: {
      interviewId: string;
      actorUserId: string;
      action: InterviewEventAction;
      previousStatus?: InterviewStatus;
      nextStatus?: InterviewStatus;
      previousStartAt?: Date | null;
      nextStartAt?: Date | null;
      previousEndAt?: Date | null;
      nextEndAt?: Date | null;
      previousTimezone?: string | null;
      nextTimezone?: string | null;
      participantId?: string;
      reason?: string;
      safeComment?: string;
    },
  ): Promise<void> {
    await transaction.interviewEvent.create({
      data: {
        interviewId: data.interviewId,
        actorUserId: data.actorUserId,
        action: data.action,
        previousStatus: data.previousStatus,
        nextStatus: data.nextStatus,
        previousStartAt: data.previousStartAt,
        nextStartAt: data.nextStartAt,
        previousEndAt: data.previousEndAt,
        nextEndAt: data.nextEndAt,
        previousTimezone: data.previousTimezone,
        nextTimezone: data.nextTimezone,
        participantId: data.participantId,
        reason: optional(data.reason),
        safeComment: optional(data.safeComment),
      },
    });
  }

  private rethrowDuplicateParticipant(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(
        'INTERVIEW_PARTICIPANT_CONFLICT',
        'Duplicate active interview participants are not allowed.',
      );
    }
  }

  private rethrowEvaluationConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(
        'EVALUATION_CONFLICT',
        'One active evaluation per evaluator and evaluation type is allowed for an interview.',
      );
    }
  }

  private toInterviewSummary(interview: InterviewRecord) {
    return {
      id: interview.id,
      missionCandidateId: interview.missionCandidateId,
      type: interview.type,
      scheduledStartAt: interview.scheduledStartAt.toISOString(),
      scheduledEndAt: isoOrNull(interview.scheduledEndAt),
      timezone: interview.timezone,
      format: interview.format,
      location: interview.location,
      meetingUrl: interview.meetingUrl,
      organizerUserId: interview.organizerUserId,
      organizerDisplayName: interview.organizer.displayName,
      status: interview.status,
      outcome: interview.outcome,
      completedAt: isoOrNull(interview.completedAt),
      canceledAt: isoOrNull(interview.canceledAt),
      postponedAt: isoOrNull(interview.postponedAt),
      archivedAt: isoOrNull(interview.archivedAt),
      participantCount: interview.participants.length,
      evaluationCount: interview.evaluations.length,
      createdAt: interview.createdAt.toISOString(),
      updatedAt: interview.updatedAt.toISOString(),
    };
  }

  private toInterviewDetail(interview: InterviewRecord, access: InterviewAccess) {
    return {
      ...this.toInterviewSummary(interview),
      participants: interview.participants.map((participant) => ({
        id: participant.id,
        interviewId: participant.interviewId,
        kind: participant.kind,
        userId: participant.userId,
        userDisplayName: participant.user?.displayName ?? null,
        clientContactId: participant.clientContactId,
        clientContactDisplayName: participant.clientContact?.displayName ?? null,
        externalName: participant.externalName,
        externalRole: participant.externalRole,
        status: participant.status,
        archivedAt: isoOrNull(participant.archivedAt),
        createdAt: participant.createdAt.toISOString(),
        updatedAt: participant.updatedAt.toISOString(),
      })),
      evaluations: interview.evaluations.map((evaluation) => this.toEvaluation(evaluation, access)),
      history: interview.events.map((event) => ({
        id: event.id,
        interviewId: event.interviewId,
        actorUserId: event.actorUserId,
        action: event.action,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        previousStartAt: isoOrNull(event.previousStartAt),
        nextStartAt: isoOrNull(event.nextStartAt),
        previousEndAt: isoOrNull(event.previousEndAt),
        nextEndAt: isoOrNull(event.nextEndAt),
        previousTimezone: event.previousTimezone,
        nextTimezone: event.nextTimezone,
        participantId: event.participantId,
        reason: event.reason,
        safeComment: event.safeComment,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private toEvaluation(evaluation: EvaluationRecord, access: InterviewAccess) {
    const redacted =
      (evaluation.internalOnly && !access.internalEvaluationView) ||
      (evaluation.evaluationType === EvaluationType.CLIENT && !access.clientFeedbackView);
    return {
      id: evaluation.id,
      missionCandidateId: evaluation.missionCandidateId,
      interviewId: evaluation.interviewId,
      authorUserId: evaluation.authorUserId,
      authorDisplayName: evaluation.author.displayName,
      evaluationType: evaluation.evaluationType,
      recommendation: redacted ? null : evaluation.recommendation,
      recommended: redacted ? null : evaluation.recommended,
      scores: {
        overall: redacted ? null : evaluation.overallScore,
        communication: redacted ? null : evaluation.communicationScore,
        technical: redacted ? null : evaluation.technicalScore,
        roleFit: redacted ? null : evaluation.roleFitScore,
        cultureFit: redacted ? null : evaluation.cultureFitScore,
        motivation: redacted ? null : evaluation.motivationScore,
        salaryAlignment: redacted ? null : evaluation.salaryAlignmentScore,
      },
      strengths: redacted ? null : evaluation.strengths,
      weaknesses: redacted ? null : evaluation.weaknesses,
      risks: redacted ? null : evaluation.risks,
      comment: redacted ? null : evaluation.comment,
      finalOpinion: redacted ? false : evaluation.finalOpinion,
      internalOnly: evaluation.internalOnly,
      clientVisible: evaluation.clientVisible,
      redacted,
      status: evaluation.status,
      submittedAt: isoOrNull(evaluation.submittedAt),
      archivedAt: isoOrNull(evaluation.archivedAt),
      createdAt: evaluation.createdAt.toISOString(),
      updatedAt: evaluation.updatedAt.toISOString(),
    };
  }
}

const evaluationInclude = {
  author: { select: { displayName: true } },
} satisfies Prisma.CandidateEvaluationInclude;

const interviewInclude = {
  organizer: { select: { displayName: true } },
  participants: {
    include: {
      user: { select: { displayName: true } },
      clientContact: { select: { displayName: true } },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  evaluations: {
    include: evaluationInclude,
    orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
  },
  events: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.InterviewInclude;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function dateOrNull(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
