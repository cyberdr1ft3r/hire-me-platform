import { Inject, Injectable } from '@nestjs/common';
import type {
  MissionCandidateCreateRequest,
  MissionCandidateDetailResponse,
  MissionCandidateIntegrationConfirmationRequest,
  MissionCandidateListQuery,
  MissionCandidateListResponse,
  MissionCandidatePresentationRequest,
  MissionCandidateTransferRequest,
  MissionCandidateTransitionRequest,
} from '@hire-me/contracts';

import { MissionAuditService } from './mission-audit.service.js';
import { conflict, forbidden, notFound } from './mission.errors.js';
import { MISSION_PERMISSIONS } from './mission-permissions.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  AssignmentStatus,
  CandidateStatus,
  MissionCandidateEventAction,
  MissionCandidateState,
  MissionRecruiterRole,
  Prisma,
  RecruitmentMissionState,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type MissionCandidateRecord = Prisma.MissionCandidateGetPayload<{
  include: typeof missionCandidateInclude;
}>;
type MissionCandidateEventRecord = Prisma.MissionCandidateEventGetPayload<Record<string, never>>;
type MissionCandidateAccess = {
  compensationView: boolean;
  consentView: boolean;
  notesView: boolean;
  notesManage: boolean;
  transition: boolean;
  transfer: boolean;
  present: boolean;
  integrationConfirm: boolean;
  outcomeManage: boolean;
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

const reasonRequiredStates = new Set<MissionCandidateState>([
  MissionCandidateState.CANDIDATE_REJECTED,
  MissionCandidateState.CLIENT_REJECTED,
  MissionCandidateState.WITHDRAWN,
  MissionCandidateState.TALENT_POOL,
]);

const optionalSkips = new Set<string>([
  skipKey(MissionCandidateState.HR_INTERVIEW_COMPLETED, MissionCandidateState.INTERNAL_VALIDATION),
  skipKey(MissionCandidateState.CLIENT_INTERVIEW_1, MissionCandidateState.CLIENT_OFFER),
]);

const allowedTransitions = new Map<MissionCandidateState, Set<MissionCandidateState>>([
  [
    MissionCandidateState.NEW,
    new Set([MissionCandidateState.CV_TO_REVIEW, MissionCandidateState.WITHDRAWN]),
  ],
  [
    MissionCandidateState.CV_TO_REVIEW,
    new Set([
      MissionCandidateState.HR_PRESELECTION,
      MissionCandidateState.WAITING,
      MissionCandidateState.CANDIDATE_REJECTED,
      MissionCandidateState.WITHDRAWN,
      MissionCandidateState.TALENT_POOL,
    ]),
  ],
  [
    MissionCandidateState.HR_PRESELECTION,
    new Set([
      MissionCandidateState.HR_INTERVIEW_SCHEDULED,
      MissionCandidateState.WAITING,
      MissionCandidateState.CANDIDATE_REJECTED,
      MissionCandidateState.WITHDRAWN,
      MissionCandidateState.TALENT_POOL,
    ]),
  ],
  [
    MissionCandidateState.HR_INTERVIEW_SCHEDULED,
    new Set([
      MissionCandidateState.HR_INTERVIEW_COMPLETED,
      MissionCandidateState.POSTPONED,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
  [
    MissionCandidateState.HR_INTERVIEW_COMPLETED,
    new Set([MissionCandidateState.TECHNICAL_TEST, MissionCandidateState.INTERNAL_VALIDATION]),
  ],
  [MissionCandidateState.TECHNICAL_TEST, new Set([MissionCandidateState.INTERNAL_VALIDATION])],
  [
    MissionCandidateState.INTERNAL_VALIDATION,
    new Set([
      MissionCandidateState.PRESENTED_TO_CLIENT,
      MissionCandidateState.WAITING,
      MissionCandidateState.CANDIDATE_REJECTED,
      MissionCandidateState.WITHDRAWN,
      MissionCandidateState.TALENT_POOL,
    ]),
  ],
  [
    MissionCandidateState.PRESENTED_TO_CLIENT,
    new Set([
      MissionCandidateState.CLIENT_INTERVIEW_1,
      MissionCandidateState.WAITING,
      MissionCandidateState.CLIENT_REJECTED,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
  [
    MissionCandidateState.CLIENT_INTERVIEW_1,
    new Set([
      MissionCandidateState.CLIENT_INTERVIEW_2,
      MissionCandidateState.CLIENT_OFFER,
      MissionCandidateState.POSTPONED,
      MissionCandidateState.CLIENT_REJECTED,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
  [
    MissionCandidateState.CLIENT_INTERVIEW_2,
    new Set([
      MissionCandidateState.CLIENT_OFFER,
      MissionCandidateState.POSTPONED,
      MissionCandidateState.CLIENT_REJECTED,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
  [
    MissionCandidateState.CLIENT_OFFER,
    new Set([
      MissionCandidateState.ACCEPTED,
      MissionCandidateState.CANDIDATE_REJECTED,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
  [MissionCandidateState.ACCEPTED, new Set([MissionCandidateState.INTEGRATED])],
  [MissionCandidateState.INTEGRATED, new Set([MissionCandidateState.PROBATION_COMPLETED])],
  [MissionCandidateState.PROBATION_COMPLETED, new Set([MissionCandidateState.PROCESS_COMPLETED])],
  [
    MissionCandidateState.WAITING,
    new Set([
      MissionCandidateState.CV_TO_REVIEW,
      MissionCandidateState.HR_PRESELECTION,
      MissionCandidateState.PRESENTED_TO_CLIENT,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
  [
    MissionCandidateState.POSTPONED,
    new Set([
      MissionCandidateState.HR_INTERVIEW_SCHEDULED,
      MissionCandidateState.CLIENT_INTERVIEW_1,
      MissionCandidateState.CLIENT_INTERVIEW_2,
      MissionCandidateState.WITHDRAWN,
    ]),
  ],
]);

@Injectable()
export class MissionCandidatesService {
  constructor(
    @Inject(MissionAuditService) private readonly audit: MissionAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listMissionCandidates(
    missionId: string,
    query: MissionCandidateListQuery,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateListResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.assertMissionProcessScope(missionId, actorUserId, access);
    const where: Prisma.MissionCandidateWhereInput = {
      missionId,
      ...(query.state ? { state: query.state } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.responsibleRecruiterUserId
        ? { responsibleRecruiterUserId: query.responsibleRecruiterUserId }
        : {}),
      ...(query.clientVisible !== undefined ? { clientVisible: query.clientVisible } : {}),
      ...(query.search
        ? {
            OR: [
              { candidate: { displayName: { contains: query.search, mode: 'insensitive' } } },
              { candidate: { currentJobTitle: { contains: query.search, mode: 'insensitive' } } },
              { source: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, candidates] = await this.prisma.$transaction([
      this.prisma.missionCandidate.count({ where }),
      this.prisma.missionCandidate.findMany({
        where,
        include: missionCandidateInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    await this.auditSensitiveReads(candidates.length, access, actorUserId, context);

    return {
      candidates: candidates.map((candidate) => this.toSummary(candidate, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getMissionCandidate(
    missionId: string,
    processId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.assertMissionProcessScope(missionId, actorUserId, access);
    const process = await this.findProcessForMission(missionId, processId);
    await this.auditSensitiveReads(1, access, actorUserId, context, process.candidateId);
    return { candidateProcess: this.toDetail(process, access) };
  }

  async createMissionCandidate(
    missionId: string,
    input: MissionCandidateCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertInternalNotesInputAllowed(input.internalNotes, access);
    try {
      const process = await this.prisma.$transaction(async (transaction) => {
        await this.lockWritableMission(missionId, transaction);
        await this.lockWritableCandidate(input.candidateId, transaction);
        await this.assertResponsibleRecruiterEligible(
          missionId,
          input.responsibleRecruiterUserId,
          transaction,
        );
        await this.assertMissionProcessScope(missionId, actorUserId, access, transaction);
        const created = await transaction.missionCandidate.create({
          data: {
            missionId,
            candidateId: input.candidateId,
            responsibleRecruiterUserId: input.responsibleRecruiterUserId,
            source: optional(input.source),
            sourceContext: optional(input.sourceContext),
            priority: input.priority ?? 'NORMAL',
            internalNotes: optional(input.internalNotes),
          },
          include: missionCandidateInclude,
        });
        await this.createEvent(transaction, {
          missionCandidateId: created.id,
          actorUserId,
          action: MissionCandidateEventAction.CREATED,
          nextState: MissionCandidateState.NEW,
          nextRecruiterId: input.responsibleRecruiterUserId,
          reason: 'Mission candidate process created.',
        });
        return this.findProcessForMission(missionId, created.id, transaction);
      });

      await this.audit.record('mission_candidates.process.created', context, {
        actorUserId,
        entityType: 'MissionCandidate',
        entityId: process.id,
        metadataSummary: 'Mission candidate process created.',
      });

      return { candidateProcess: this.toDetail(process, access) };
    } catch (error: unknown) {
      this.rethrowPermanentDuplicate(error);
      throw error;
    }
  }

  async transitionMissionCandidate(
    missionId: string,
    processId: string,
    input: MissionCandidateTransitionRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const process = await this.withWritableProcessLock(
      missionId,
      processId,
      async (transaction, existing) => {
        await this.assertActorCanManageProcess(
          missionId,
          existing,
          actorUserId,
          access,
          transaction,
        );
        this.assertAllowedTransition(existing.state, input.state, input.skip, input.reason);
        if (reasonRequiredStates.has(input.state) && !input.reason) {
          throw conflict(
            'MISSION_CANDIDATE_OUTCOME_REASON_REQUIRED',
            'Outcome, rejection, withdrawal, and talent-pool transitions require a reason.',
          );
        }
        if (reasonRequiredStates.has(input.state) && !access.outcomeManage) {
          throw forbidden(
            'MISSION_CANDIDATE_OUTCOME_PERMISSION_REQUIRED',
            'Outcome transitions require mission_candidates:outcome:manage.',
          );
        }
        const updated = await transaction.missionCandidate.update({
          where: { id: processId },
          data: {
            state: input.state,
            ...(reasonRequiredStates.has(input.state) ? { outcomeReason: input.reason } : {}),
          },
          include: missionCandidateInclude,
        });
        await this.createEvent(transaction, {
          missionCandidateId: processId,
          actorUserId,
          action: input.skip
            ? MissionCandidateEventAction.OPTIONAL_STAGE_SKIPPED
            : reasonRequiredStates.has(input.state)
              ? MissionCandidateEventAction.OUTCOME_RECORDED
              : MissionCandidateEventAction.TRANSITIONED,
          previousState: existing.state,
          nextState: input.state,
          reason: input.reason,
          safeComment: input.comment,
        });
        return updated;
      },
    );

    await this.audit.record('mission_candidates.process.transitioned', context, {
      actorUserId,
      entityType: 'MissionCandidate',
      entityId: process.id,
      metadataSummary: `Mission candidate process transitioned to ${input.state}.`,
    });

    return { candidateProcess: this.toDetail(process, access) };
  }

  async transferResponsibleRecruiter(
    missionId: string,
    processId: string,
    input: MissionCandidateTransferRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const process = await this.withWritableProcessLock(
      missionId,
      processId,
      async (transaction, existing) => {
        await this.assertActorCanTransfer(missionId, actorUserId, access, transaction);
        await this.assertResponsibleRecruiterEligible(
          missionId,
          input.responsibleRecruiterUserId,
          transaction,
        );
        const updated = await transaction.missionCandidate.update({
          where: { id: processId },
          data: { responsibleRecruiterUserId: input.responsibleRecruiterUserId },
          include: missionCandidateInclude,
        });
        await this.createEvent(transaction, {
          missionCandidateId: processId,
          actorUserId,
          action: MissionCandidateEventAction.RESPONSIBLE_RECRUITER_TRANSFERRED,
          previousState: existing.state,
          nextState: existing.state,
          previousRecruiterId: existing.responsibleRecruiterUserId,
          nextRecruiterId: input.responsibleRecruiterUserId,
          reason: input.reason,
        });
        return updated;
      },
    );

    await this.audit.record('mission_candidates.responsible_recruiter.transferred', context, {
      actorUserId,
      entityType: 'MissionCandidate',
      entityId: process.id,
      metadataSummary: 'Mission candidate responsible recruiter transferred.',
    });

    return { candidateProcess: this.toDetail(process, access) };
  }

  async presentMissionCandidate(
    missionId: string,
    processId: string,
    input: MissionCandidatePresentationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const process = await this.withWritableProcessLock(
      missionId,
      processId,
      async (transaction, existing) => {
        await this.assertActorCanPresent(missionId, existing, actorUserId, access, transaction);
        if (existing.state !== MissionCandidateState.PRESENTED_TO_CLIENT) {
          this.assertAllowedTransition(
            existing.state,
            MissionCandidateState.PRESENTED_TO_CLIENT,
            false,
          );
        }
        const now = new Date();
        const updated = await transaction.missionCandidate.update({
          where: { id: processId },
          data: {
            state: MissionCandidateState.PRESENTED_TO_CLIENT,
            clientVisible: true,
            presentedAt: existing.presentedAt ?? now,
            presentedByUserId: existing.presentedByUserId ?? actorUserId,
          },
          include: missionCandidateInclude,
        });
        await this.createEvent(transaction, {
          missionCandidateId: processId,
          actorUserId,
          action: MissionCandidateEventAction.PRESENTED_TO_CLIENT,
          previousState: existing.state,
          nextState: MissionCandidateState.PRESENTED_TO_CLIENT,
          reason: input.reason,
          safeComment: input.comment,
        });
        return updated;
      },
    );

    await this.audit.record('mission_candidates.process.presented_to_client', context, {
      actorUserId,
      entityType: 'MissionCandidate',
      entityId: process.id,
      metadataSummary: 'Mission candidate explicitly presented to client.',
    });

    return { candidateProcess: this.toDetail(process, access) };
  }

  async confirmIntegration(
    missionId: string,
    processId: string,
    input: MissionCandidateIntegrationConfirmationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionCandidateDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const process = await this.withWritableProcessLock(
      missionId,
      processId,
      async (transaction, existing, mission) => {
        await this.assertActorCanConfirmIntegration(
          missionId,
          existing,
          actorUserId,
          access,
          transaction,
        );
        if (existing.state !== MissionCandidateState.INTEGRATED) {
          throw conflict(
            'MISSION_CANDIDATE_INTEGRATION_STATE_REQUIRED',
            'Placement confirmation requires an integrated candidate process.',
          );
        }
        if (!existing.placementConfirmedAt) {
          if (mission.filledPlacementCount + 1 > mission.numberOfPositions) {
            throw conflict(
              'MISSION_PLACEMENT_COUNTS_INVALID',
              'Mission placement count would exceed planned positions.',
            );
          }
          await transaction.recruitmentMission.update({
            where: { id: missionId },
            data: { filledPlacementCount: { increment: 1 } },
          });
        }
        const updated = await transaction.missionCandidate.update({
          where: { id: processId },
          data: {
            placementConfirmedAt: existing.placementConfirmedAt ?? new Date(),
            placementConfirmedByUserId: existing.placementConfirmedByUserId ?? actorUserId,
          },
          include: missionCandidateInclude,
        });
        await this.createEvent(transaction, {
          missionCandidateId: processId,
          actorUserId,
          action: MissionCandidateEventAction.INTEGRATION_CONFIRMED,
          previousState: existing.state,
          nextState: existing.state,
          reason: input.reason,
        });
        return updated;
      },
    );

    await this.audit.record('mission_candidates.integration.confirmed', context, {
      actorUserId,
      entityType: 'MissionCandidate',
      entityId: process.id,
      metadataSummary: 'Mission candidate integration confirmed manually.',
    });

    return { candidateProcess: this.toDetail(process, access) };
  }

  private async resolveAccess(actorUserId: string): Promise<MissionCandidateAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return {
      compensationView: permissions.includes('candidate_compensation:view'),
      consentView: permissions.includes('candidate_consent:view'),
      notesView: permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATE_NOTES_VIEW),
      notesManage: permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATE_NOTES_MANAGE),
      transition: permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSITION),
      transfer: permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSFER),
      present: permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATES_PRESENT),
      integrationConfirm: permissions.includes(
        MISSION_PERMISSIONS.MISSION_CANDIDATES_INTEGRATION_CONFIRM,
      ),
      outcomeManage: permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATES_OUTCOME_MANAGE),
    };
  }

  private async withWritableProcessLock<T>(
    missionId: string,
    processId: string,
    callback: (
      transaction: PrismaTransaction,
      process: MissionCandidateRecord,
      mission: Prisma.RecruitmentMissionGetPayload<Record<string, never>>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const mission = await this.lockWritableMission(missionId, transaction);
      const process = await this.lockProcess(missionId, processId, transaction);
      await this.lockWritableCandidate(process.candidateId, transaction);
      if (terminalProcessStates.has(process.state) || process.archivedAt) {
        throw conflict(
          'MISSION_CANDIDATE_TERMINAL',
          'Terminal mission candidate processes cannot be changed.',
        );
      }
      return callback(transaction, process, mission);
    });
  }

  private async lockWritableMission(
    missionId: string,
    transaction: PrismaTransaction,
  ): Promise<Prisma.RecruitmentMissionGetPayload<Record<string, never>>> {
    await transaction.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
    const mission = await transaction.recruitmentMission.findUnique({ where: { id: missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', 'Recruitment mission was not found.');
    }
    if (terminalMissionStates.has(mission.state) || mission.archivedAt) {
      throw conflict('MISSION_TERMINAL', 'Terminal recruitment missions cannot be changed.');
    }
    return mission;
  }

  private async lockProcess(
    missionId: string,
    processId: string,
    transaction: PrismaTransaction,
  ): Promise<MissionCandidateRecord> {
    await transaction.$queryRaw`SELECT id FROM "MissionCandidate" WHERE id = ${processId}::uuid AND "missionId" = ${missionId}::uuid FOR UPDATE`;
    return this.findProcessForMission(missionId, processId, transaction);
  }

  private async lockWritableCandidate(
    candidateId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${candidateId}::uuid FOR UPDATE`;
    const candidate = await transaction.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) {
      throw notFound('CANDIDATE_NOT_FOUND', 'Candidate was not found.');
    }
    if (candidate.status === CandidateStatus.ARCHIVED || candidate.archivedAt) {
      throw conflict('CANDIDATE_ARCHIVED', 'Archived candidates cannot be linked to missions.');
    }
  }

  private async findProcessForMission(
    missionId: string,
    processId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<MissionCandidateRecord> {
    const process = await prisma.missionCandidate.findFirst({
      where: { id: processId, missionId },
      include: missionCandidateInclude,
    });
    if (!process) {
      throw notFound('MISSION_CANDIDATE_NOT_FOUND', 'Mission candidate process was not found.');
    }
    return process;
  }

  private async assertResponsibleRecruiterEligible(
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
        'MISSION_CANDIDATE_RECRUITER_NOT_ELIGIBLE',
        'Responsible recruiter must be an active, non-archived internal user.',
      );
    }
    const assignment = await transaction.missionRecruiter.findFirst({
      where: {
        missionId,
        userId,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
        role: {
          in: [
            MissionRecruiterRole.LEAD_RECRUITER,
            MissionRecruiterRole.RECRUITER,
            MissionRecruiterRole.SOURCER,
          ],
        },
      },
    });
    if (!assignment) {
      throw conflict(
        'MISSION_CANDIDATE_RECRUITER_NOT_ASSIGNED',
        'Responsible recruiter must be assigned to the mission.',
      );
    }
  }

  private async assertMissionProcessScope(
    missionId: string,
    actorUserId: string,
    access: MissionCandidateAccess,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<void> {
    if (access.transfer) {
      return;
    }
    const assignment = await prisma.missionRecruiter.findFirst({
      where: { missionId, userId: actorUserId, status: AssignmentStatus.ACTIVE, archivedAt: null },
    });
    if (!assignment) {
      throw forbidden(
        'MISSION_CANDIDATE_SCOPE_DENIED',
        'Mission candidate access requires mission assignment scope.',
      );
    }
  }

  private async assertActorCanManageProcess(
    missionId: string,
    process: MissionCandidateRecord,
    actorUserId: string,
    access: MissionCandidateAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (!access.transition) {
      throw forbidden(
        'MISSION_CANDIDATE_TRANSITION_PERMISSION_REQUIRED',
        'Pipeline transitions require mission_candidates:transition.',
      );
    }
    await this.assertActorHasProcessControl(missionId, process, actorUserId, access, transaction);
  }

  private async assertActorHasProcessControl(
    missionId: string,
    process: MissionCandidateRecord,
    actorUserId: string,
    access: MissionCandidateAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (access.transfer || process.responsibleRecruiterUserId === actorUserId) {
      return;
    }
    if (await this.isActiveLeadRecruiter(missionId, actorUserId, transaction)) {
      return;
    }
    throw forbidden(
      'MISSION_CANDIDATE_RESPONSIBLE_RECRUITER_REQUIRED',
      'Only the responsible recruiter, mission lead, or authorized override user can manage this process.',
    );
  }

  private async assertActorCanTransfer(
    missionId: string,
    actorUserId: string,
    access: MissionCandidateAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (
      access.transfer ||
      (await this.isActiveLeadRecruiter(missionId, actorUserId, transaction))
    ) {
      return;
    }
    throw forbidden(
      'MISSION_CANDIDATE_TRANSFER_PERMISSION_REQUIRED',
      'Responsible recruiter transfer requires lead or transfer permission.',
    );
  }

  private async assertActorCanPresent(
    missionId: string,
    process: MissionCandidateRecord,
    actorUserId: string,
    access: MissionCandidateAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (!access.present) {
      throw forbidden(
        'MISSION_CANDIDATE_PRESENT_PERMISSION_REQUIRED',
        'Candidate presentation requires mission_candidates:present.',
      );
    }
    await this.assertActorHasProcessControl(missionId, process, actorUserId, access, transaction);
  }

  private async assertActorCanConfirmIntegration(
    missionId: string,
    process: MissionCandidateRecord,
    actorUserId: string,
    access: MissionCandidateAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    if (!access.integrationConfirm) {
      throw forbidden(
        'MISSION_CANDIDATE_INTEGRATION_PERMISSION_REQUIRED',
        'Integration confirmation requires mission_candidates:integration:confirm.',
      );
    }
    await this.assertActorHasProcessControl(missionId, process, actorUserId, access, transaction);
  }

  private async isActiveLeadRecruiter(
    missionId: string,
    actorUserId: string,
    prisma: PrismaTransaction,
  ): Promise<boolean> {
    const assignment = await prisma.missionRecruiter.findFirst({
      where: {
        missionId,
        userId: actorUserId,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
        role: MissionRecruiterRole.LEAD_RECRUITER,
        isLead: true,
      },
    });
    return Boolean(assignment);
  }

  private assertAllowedTransition(
    from: MissionCandidateState,
    to: MissionCandidateState,
    skip: boolean,
    reason?: string,
  ): void {
    if (from === to) {
      return;
    }
    if (!allowedTransitions.get(from)?.has(to)) {
      throw conflict(
        'MISSION_CANDIDATE_TRANSITION_BLOCKED',
        'Mission candidate state transition is not allowed.',
      );
    }
    const isSkip = optionalSkips.has(skipKey(from, to));
    if (skip && !isSkip) {
      throw conflict(
        'MISSION_CANDIDATE_SKIP_NOT_ALLOWED',
        'Only approved optional stages can be skipped.',
      );
    }
    if (isSkip && !skip) {
      throw conflict(
        'MISSION_CANDIDATE_SKIP_REQUIRED',
        'Skipping an optional stage requires an explicit skip request.',
      );
    }
    if (skip && !reason) {
      throw conflict(
        'MISSION_CANDIDATE_SKIP_REASON_REQUIRED',
        'Skipping an optional stage requires a reason.',
      );
    }
  }

  private assertInternalNotesInputAllowed(
    internalNotes: string | undefined,
    access: MissionCandidateAccess,
  ): void {
    if (internalNotes && !access.notesManage) {
      throw forbidden(
        'MISSION_CANDIDATE_NOTES_PERMISSION_REQUIRED',
        'Internal notes require mission_candidate_notes:manage.',
      );
    }
  }

  private async createEvent(
    transaction: PrismaTransaction,
    data: {
      missionCandidateId: string;
      actorUserId: string;
      action: MissionCandidateEventAction;
      previousState?: MissionCandidateState;
      nextState?: MissionCandidateState;
      previousRecruiterId?: string;
      nextRecruiterId?: string;
      reason?: string;
      safeComment?: string;
    },
  ): Promise<MissionCandidateEventRecord> {
    return transaction.missionCandidateEvent.create({
      data: {
        missionCandidateId: data.missionCandidateId,
        actorUserId: data.actorUserId,
        action: data.action,
        previousState: data.previousState,
        nextState: data.nextState,
        previousRecruiterId: data.previousRecruiterId,
        nextRecruiterId: data.nextRecruiterId,
        reason: optional(data.reason),
        safeComment: optional(data.safeComment),
      },
    });
  }

  private async auditSensitiveReads(
    recordCount: number,
    access: MissionCandidateAccess,
    actorUserId: string,
    context: RequestContext,
    candidateId?: string,
  ): Promise<void> {
    if (recordCount === 0) {
      return;
    }
    if (access.compensationView) {
      await this.audit.record('mission_candidates.compensation.viewed', context, {
        actorUserId,
        entityType: 'MissionCandidate',
        entityId: candidateId,
        metadataSummary: 'Live candidate compensation fields included in mission process response.',
      });
    }
  }

  private rethrowPermanentDuplicate(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(
        'MISSION_CANDIDATE_ALREADY_EXISTS',
        'A candidate can have only one recruitment process ever for a mission.',
      );
    }
  }

  private toDetail(process: MissionCandidateRecord, access: MissionCandidateAccess) {
    return {
      ...this.toSummary(process, access),
      history: process.events.map((event) => this.toEvent(event)),
    };
  }

  private toSummary(process: MissionCandidateRecord, access: MissionCandidateAccess) {
    return {
      id: process.id,
      missionId: process.missionId,
      candidateId: process.candidateId,
      candidate: this.toCandidateSummary(process.candidate, access),
      responsibleRecruiterUserId: process.responsibleRecruiterUserId,
      responsibleRecruiterDisplayName: process.responsibleRecruiter.displayName,
      state: process.state,
      rank: process.rank,
      source: process.source,
      sourceContext: process.sourceContext,
      priority: process.priority,
      internalNotes: access.notesView ? process.internalNotes : null,
      outcomeReason: process.outcomeReason,
      clientVisible: process.clientVisible,
      presentedAt: isoOrNull(process.presentedAt),
      placementConfirmedAt: isoOrNull(process.placementConfirmedAt),
      archivedAt: isoOrNull(process.archivedAt),
      createdAt: process.createdAt.toISOString(),
      updatedAt: process.updatedAt.toISOString(),
    };
  }

  private toCandidateSummary(
    candidate: MissionCandidateRecord['candidate'],
    access: MissionCandidateAccess,
  ) {
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

  private toEvent(event: MissionCandidateEventRecord) {
    return {
      id: event.id,
      missionCandidateId: event.missionCandidateId,
      actorUserId: event.actorUserId,
      action: event.action,
      previousState: event.previousState,
      nextState: event.nextState,
      previousRecruiterId: event.previousRecruiterId,
      nextRecruiterId: event.nextRecruiterId,
      reason: event.reason,
      safeComment: event.safeComment,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

const missionCandidateInclude = {
  candidate: true,
  responsibleRecruiter: { select: { displayName: true } },
  events: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.MissionCandidateInclude;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function skipKey(from: MissionCandidateState, to: MissionCandidateState): string {
  return `${from}->${to}`;
}
