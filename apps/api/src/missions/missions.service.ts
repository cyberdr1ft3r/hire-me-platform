import { Inject, Injectable } from '@nestjs/common';
import type {
  MissionAssignmentCreateRequest,
  MissionAssignmentDetailResponse,
  MissionAssignmentListQuery,
  MissionAssignmentListResponse,
  MissionAssignmentUpdateRequest,
  MissionClosureRequest,
  MissionCreateRequest,
  MissionDetailResponse,
  MissionLeadRecruiterRequest,
  MissionListQuery,
  MissionListResponse,
  MissionStatusUpdateRequest,
  MissionUpdateRequest,
} from '@hire-me/contracts';

import { MissionAuditService } from './mission-audit.service.js';
import { MISSION_PERMISSIONS } from './mission-permissions.js';
import { conflict, forbidden, notFound } from './mission.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  AssignmentStatus,
  ClientStatus,
  MissionClosureReason,
  MissionRecruiterRole,
  Prisma,
  RecruitmentMissionState,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type MissionRecord = Prisma.RecruitmentMissionGetPayload<{
  include: { client: { select: { name: true } } };
}>;
type AssignmentRecord = Prisma.MissionRecruiterGetPayload<{
  include: { user: { select: { displayName: true } } };
}>;
type MissionAccess = {
  commercialView: boolean;
  commercialUpdate: boolean;
};

const terminalStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
  RecruitmentMissionState.ARCHIVED,
]);

const closureStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
]);

const allowedMissionTransitions = new Map<RecruitmentMissionState, Set<RecruitmentMissionState>>([
  [
    RecruitmentMissionState.DRAFT,
    new Set([
      RecruitmentMissionState.INTERNAL_VALIDATION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.INTERNAL_VALIDATION,
    new Set([
      RecruitmentMissionState.ACTIVE,
      RecruitmentMissionState.WAITING_FOR_CLIENT_INFORMATION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.ACTIVE,
    new Set([
      RecruitmentMissionState.JOB_DESCRIPTION_APPROVED,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.JOB_DESCRIPTION_APPROVED,
    new Set([
      RecruitmentMissionState.CANDIDATE_SOURCING,
      RecruitmentMissionState.WAITING_FOR_CLIENT_INFORMATION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.CANDIDATE_SOURCING,
    new Set([
      RecruitmentMissionState.HR_PRESELECTION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
      RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
    ]),
  ],
  [
    RecruitmentMissionState.HR_PRESELECTION,
    new Set([
      RecruitmentMissionState.HR_INTERVIEWS,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.HR_INTERVIEWS,
    new Set([
      RecruitmentMissionState.TECHNICAL_TESTS,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.TECHNICAL_TESTS,
    new Set([
      RecruitmentMissionState.CANDIDATE_PRESENTATION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.CANDIDATE_PRESENTATION,
    new Set([
      RecruitmentMissionState.CLIENT_INTERVIEWS,
      RecruitmentMissionState.WAITING_FOR_CLIENT_INFORMATION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
      RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
    ]),
  ],
  [
    RecruitmentMissionState.CLIENT_INTERVIEWS,
    new Set([
      RecruitmentMissionState.FINAL_SELECTION,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.FINAL_SELECTION,
    new Set([
      RecruitmentMissionState.OFFER_SENT,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.OFFER_SENT,
    new Set([
      RecruitmentMissionState.CANDIDATE_INTEGRATED,
      RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
      RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
      RecruitmentMissionState.PAUSED,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [
    RecruitmentMissionState.CANDIDATE_INTEGRATED,
    new Set([RecruitmentMissionState.PROBATION_MONITORING]),
  ],
  [
    RecruitmentMissionState.PROBATION_MONITORING,
    new Set([RecruitmentMissionState.CLOSED_WITH_RECRUITMENT]),
  ],
  [
    RecruitmentMissionState.WAITING_FOR_CLIENT_INFORMATION,
    new Set([
      RecruitmentMissionState.INTERNAL_VALIDATION,
      RecruitmentMissionState.JOB_DESCRIPTION_APPROVED,
      RecruitmentMissionState.CANDIDATE_PRESENTATION,
    ]),
  ],
  [
    RecruitmentMissionState.PAUSED,
    new Set([
      RecruitmentMissionState.INTERNAL_VALIDATION,
      RecruitmentMissionState.ACTIVE,
      RecruitmentMissionState.CANDIDATE_SOURCING,
      RecruitmentMissionState.HR_PRESELECTION,
      RecruitmentMissionState.CANDIDATE_PRESENTATION,
      RecruitmentMissionState.CANCELED,
    ]),
  ],
  [RecruitmentMissionState.CLOSED_WITH_RECRUITMENT, new Set([RecruitmentMissionState.ARCHIVED])],
  [RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT, new Set([RecruitmentMissionState.ARCHIVED])],
  [
    RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
    new Set([RecruitmentMissionState.ARCHIVED]),
  ],
  [RecruitmentMissionState.CANCELED, new Set([RecruitmentMissionState.ARCHIVED])],
]);

@Injectable()
export class MissionsService {
  constructor(
    @Inject(MissionAuditService) private readonly audit: MissionAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listMissions(
    query: MissionListQuery,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionListResponse> {
    const access = await this.resolveMissionAccess(actorUserId);
    const where: Prisma.RecruitmentMissionWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeUserId
        ? {
            recruiters: {
              some: {
                userId: query.assigneeUserId,
                status: AssignmentStatus.ACTIVE,
                archivedAt: null,
              },
            },
          }
        : {}),
      ...(query.deadlineFrom || query.deadlineTo
        ? {
            applicationDeadline: {
              ...(query.deadlineFrom ? { gte: new Date(query.deadlineFrom) } : {}),
              ...(query.deadlineTo ? { lte: new Date(query.deadlineTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { requirements: { contains: query.search, mode: 'insensitive' } },
              { client: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, missions] = await this.prisma.$transaction([
      this.prisma.recruitmentMission.count({ where }),
      this.prisma.recruitmentMission.findMany({
        where,
        include: missionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    if (access.commercialView && missions.length > 0) {
      await this.recordCommercialAccess(actorUserId, context);
    }

    return {
      missions: missions.map((mission) => this.toMissionSummary(mission, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getMission(
    missionId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionDetailResponse> {
    const access = await this.resolveMissionAccess(actorUserId);
    const mission = await this.findMission(missionId);
    if (access.commercialView) {
      await this.recordCommercialAccess(actorUserId, context, mission.id);
    }

    return { mission: this.toMissionSummary(mission, access) };
  }

  async createMission(
    input: MissionCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionDetailResponse> {
    const access = await this.resolveMissionAccess(actorUserId);
    this.assertCommercialInputAllowed(input, access);
    this.assertPlacementCounts(input.numberOfPositions ?? 1, input.filledPlacementCount ?? 0);
    this.assertNonTerminalCreateState(input.state);

    const mission = await this.prisma.$transaction(async (transaction) => {
      await this.lockWritableClient(input.clientId, transaction);
      return transaction.recruitmentMission.create({
        data: {
          clientId: input.clientId,
          title: input.title,
          description: optional(input.description),
          requirements: optional(input.requirements),
          state: input.state ?? RecruitmentMissionState.DRAFT,
          priority: input.priority ?? 'NORMAL',
          numberOfPositions: input.numberOfPositions ?? 1,
          filledPlacementCount: input.filledPlacementCount ?? 0,
          location: optional(input.location),
          workArrangement: optional(input.workArrangement),
          engagementType: optional(input.engagementType),
          targetStartDate: dateOrUndefined(input.targetStartDate),
          applicationDeadline: dateOrUndefined(input.applicationDeadline),
          salaryMinCents: input.salaryMinCents,
          salaryMaxCents: input.salaryMaxCents,
          salaryCurrency: optional(input.salaryCurrency),
          commercialSummary: optional(input.commercialSummary),
        },
        include: missionInclude,
      });
    });

    await this.audit.record('missions.mission.created', context, {
      actorUserId,
      entityType: 'RecruitmentMission',
      entityId: mission.id,
      metadataSummary: 'Recruitment mission created.',
    });

    return { mission: this.toMissionSummary(mission, access) };
  }

  async updateMission(
    missionId: string,
    input: MissionUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionDetailResponse> {
    const access = await this.resolveMissionAccess(actorUserId);
    this.assertCommercialInputAllowed(input, access);
    if (input.salaryMinCents !== undefined || input.salaryMaxCents !== undefined) {
      this.assertSalaryRange(input.salaryMinCents, input.salaryMaxCents);
    }

    const mission = await this.withWritableMissionLock(missionId, (transaction, existing) => {
      const nextNumberOfPositions = input.numberOfPositions ?? existing.numberOfPositions;
      const nextFilledPlacementCount = input.filledPlacementCount ?? existing.filledPlacementCount;
      this.assertPlacementCounts(nextNumberOfPositions, nextFilledPlacementCount);

      return transaction.recruitmentMission.update({
        where: { id: missionId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
          ...(input.requirements !== undefined
            ? { requirements: nullable(input.requirements) }
            : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.numberOfPositions !== undefined
            ? { numberOfPositions: input.numberOfPositions }
            : {}),
          ...(input.filledPlacementCount !== undefined
            ? { filledPlacementCount: input.filledPlacementCount }
            : {}),
          ...(input.location !== undefined ? { location: nullable(input.location) } : {}),
          ...(input.workArrangement !== undefined
            ? { workArrangement: nullable(input.workArrangement) }
            : {}),
          ...(input.engagementType !== undefined
            ? { engagementType: nullable(input.engagementType) }
            : {}),
          ...(input.targetStartDate !== undefined
            ? { targetStartDate: dateOrNull(input.targetStartDate) }
            : {}),
          ...(input.applicationDeadline !== undefined
            ? { applicationDeadline: dateOrNull(input.applicationDeadline) }
            : {}),
          ...(input.salaryMinCents !== undefined ? { salaryMinCents: input.salaryMinCents } : {}),
          ...(input.salaryMaxCents !== undefined ? { salaryMaxCents: input.salaryMaxCents } : {}),
          ...(input.salaryCurrency !== undefined
            ? { salaryCurrency: nullable(input.salaryCurrency) }
            : {}),
          ...(input.commercialSummary !== undefined
            ? { commercialSummary: nullable(input.commercialSummary) }
            : {}),
        },
        include: missionInclude,
      });
    });

    await this.audit.record('missions.mission.updated', context, {
      actorUserId,
      entityType: 'RecruitmentMission',
      entityId: mission.id,
      metadataSummary: 'Approved recruitment mission fields updated.',
    });

    return { mission: this.toMissionSummary(mission, access) };
  }

  async updateMissionStatus(
    missionId: string,
    input: MissionStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionDetailResponse> {
    if (closureStates.has(input.state) || input.state === RecruitmentMissionState.ARCHIVED) {
      throw conflict('MISSION_CLOSURE_ENDPOINT_REQUIRED', 'Use the closure or archive endpoint.');
    }
    const access = await this.resolveMissionAccess(actorUserId);
    const mission = await this.withWritableMissionLock(missionId, (transaction, existing) => {
      this.assertAllowedTransition(existing.state, input.state);
      return transaction.recruitmentMission.update({
        where: { id: missionId },
        data: { state: input.state },
        include: missionInclude,
      });
    });

    await this.audit.record('missions.mission.status_updated', context, {
      actorUserId,
      entityType: 'RecruitmentMission',
      entityId: mission.id,
      metadataSummary: `Recruitment mission state changed to ${input.state}.`,
    });

    return { mission: this.toMissionSummary(mission, access) };
  }

  async closeMission(
    missionId: string,
    input: MissionClosureRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionDetailResponse> {
    const access = await this.resolveMissionAccess(actorUserId);
    const now = new Date();
    const mission = await this.withWritableMissionLock(missionId, async (transaction, existing) => {
      this.assertAllowedTransition(existing.state, input.state);
      this.assertClosureReasonMatches(input.state, input.closureReason);
      const filledPlacementCount = input.filledPlacementCount ?? existing.filledPlacementCount;
      this.assertPlacementCounts(existing.numberOfPositions, filledPlacementCount);
      if (
        input.state === RecruitmentMissionState.CLOSED_WITH_RECRUITMENT &&
        filledPlacementCount < existing.numberOfPositions
      ) {
        throw conflict(
          'MISSION_POSITIONS_NOT_FILLED',
          'Successful mission closure requires all planned positions to be filled.',
        );
      }

      await transaction.missionRecruiter.updateMany({
        where: { missionId, status: AssignmentStatus.ACTIVE, archivedAt: null },
        data: { status: AssignmentStatus.INACTIVE, endedAt: now, isLead: false },
      });

      return transaction.recruitmentMission.update({
        where: { id: missionId },
        data: {
          state: input.state,
          closureReason: input.closureReason,
          filledPlacementCount,
          closedAt: now,
        },
        include: missionInclude,
      });
    });

    await this.audit.record('missions.mission.closed', context, {
      actorUserId,
      entityType: 'RecruitmentMission',
      entityId: mission.id,
      metadataSummary: `Recruitment mission closed with state ${input.state}.`,
    });

    return { mission: this.toMissionSummary(mission, access) };
  }

  async archiveMission(
    missionId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionDetailResponse> {
    const access = await this.resolveMissionAccess(actorUserId);
    const now = new Date();
    const mission = await this.prisma.$transaction(async (transaction) => {
      const existing = await this.lockMission(missionId, transaction);
      if (existing.state === RecruitmentMissionState.ARCHIVED || existing.archivedAt) {
        throw conflict('MISSION_ARCHIVED', 'Recruitment mission is already archived.');
      }
      if (!terminalStates.has(existing.state)) {
        throw conflict(
          'MISSION_MUST_CLOSE_FIRST',
          'Only closed or canceled missions can be archived.',
        );
      }

      await transaction.missionRecruiter.updateMany({
        where: { missionId, status: { not: AssignmentStatus.ARCHIVED } },
        data: { status: AssignmentStatus.ARCHIVED, archivedAt: now, endedAt: now, isLead: false },
      });

      return transaction.recruitmentMission.update({
        where: { id: missionId },
        data: { state: RecruitmentMissionState.ARCHIVED, archivedAt: now },
        include: missionInclude,
      });
    });

    await this.audit.record('missions.mission.archived', context, {
      actorUserId,
      entityType: 'RecruitmentMission',
      entityId: mission.id,
      metadataSummary: 'Recruitment mission archived with active assignments archived.',
    });

    return { mission: this.toMissionSummary(mission, access) };
  }

  async listAssignments(
    missionId: string,
    query: MissionAssignmentListQuery,
  ): Promise<MissionAssignmentListResponse> {
    await this.findMission(missionId);
    const where: Prisma.MissionRecruiterWhereInput = {
      missionId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { role: query.role } : {}),
    };
    const [total, assignments] = await this.prisma.$transaction([
      this.prisma.missionRecruiter.count({ where }),
      this.prisma.missionRecruiter.findMany({
        where,
        include: assignmentInclude,
        orderBy: [{ isLead: 'desc' }, { assignedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      assignments: assignments.map((assignment) => this.toAssignmentSummary(assignment)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async createAssignment(
    missionId: string,
    input: MissionAssignmentCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionAssignmentDetailResponse> {
    this.assertLeadConsistency(input.role, input.isLead);
    try {
      const assignment = await this.withWritableMissionLock(missionId, async (transaction) => {
        await this.assertAssignableUser(input.userId, transaction);
        if (input.isLead) {
          await this.clearActiveLead(missionId, transaction);
        }
        return transaction.missionRecruiter.create({
          data: {
            missionId,
            userId: input.userId,
            role: input.role,
            isLead: input.isLead,
          },
          include: assignmentInclude,
        });
      });

      await this.audit.record('missions.assignment.created', context, {
        actorUserId,
        entityType: 'MissionRecruiter',
        entityId: assignment.id,
        metadataSummary: 'Recruitment mission assignment created.',
      });

      return { assignment: this.toAssignmentSummary(assignment) };
    } catch (error: unknown) {
      this.rethrowAssignmentConstraint(error);
      throw error;
    }
  }

  async updateAssignment(
    missionId: string,
    assignmentId: string,
    input: MissionAssignmentUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionAssignmentDetailResponse> {
    try {
      const assignment = await this.withWritableMissionLock(missionId, async (transaction) => {
        const existing = await this.findAssignmentForMission(missionId, assignmentId, transaction);
        if (existing.status === AssignmentStatus.ARCHIVED || existing.archivedAt) {
          throw conflict('MISSION_ASSIGNMENT_ARCHIVED', 'Archived assignments cannot be updated.');
        }
        const nextRole = input.role ?? existing.role;
        const nextIsLead = input.isLead ?? existing.isLead;
        this.assertLeadConsistency(nextRole, nextIsLead);
        if (nextIsLead) {
          await this.clearActiveLead(missionId, transaction, assignmentId);
        }

        return transaction.missionRecruiter.update({
          where: { id: assignmentId },
          data: {
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.isLead !== undefined ? { isLead: input.isLead } : {}),
            ...(input.status !== undefined
              ? {
                  status: input.status,
                  endedAt: input.status === AssignmentStatus.INACTIVE ? new Date() : null,
                  ...(input.status !== AssignmentStatus.ACTIVE ? { isLead: false } : {}),
                }
              : {}),
          },
          include: assignmentInclude,
        });
      });

      await this.audit.record('missions.assignment.updated', context, {
        actorUserId,
        entityType: 'MissionRecruiter',
        entityId: assignment.id,
        metadataSummary: 'Recruitment mission assignment updated.',
      });

      return { assignment: this.toAssignmentSummary(assignment) };
    } catch (error: unknown) {
      this.rethrowAssignmentConstraint(error);
      throw error;
    }
  }

  async setLeadRecruiter(
    missionId: string,
    input: MissionLeadRecruiterRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionAssignmentDetailResponse> {
    const assignment = await this.withWritableMissionLock(missionId, async (transaction) => {
      const existing = await this.findAssignmentForMission(
        missionId,
        input.assignmentId,
        transaction,
      );
      if (existing.status !== AssignmentStatus.ACTIVE || existing.archivedAt) {
        throw conflict(
          'MISSION_ASSIGNMENT_NOT_ACTIVE',
          'Only active assignments can be lead recruiter.',
        );
      }
      if (existing.role !== MissionRecruiterRole.LEAD_RECRUITER) {
        throw conflict('MISSION_LEAD_ROLE_REQUIRED', 'Lead recruiter assignment role is required.');
      }
      await this.clearActiveLead(missionId, transaction, input.assignmentId);
      return transaction.missionRecruiter.update({
        where: { id: input.assignmentId },
        data: { isLead: true },
        include: assignmentInclude,
      });
    });

    await this.audit.record('missions.assignment.lead_changed', context, {
      actorUserId,
      entityType: 'MissionRecruiter',
      entityId: assignment.id,
      metadataSummary: 'Recruitment mission lead recruiter changed atomically.',
    });

    return { assignment: this.toAssignmentSummary(assignment) };
  }

  async archiveAssignment(
    missionId: string,
    assignmentId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<MissionAssignmentDetailResponse> {
    const assignment = await this.withWritableMissionLock(missionId, async (transaction) => {
      const existing = await this.findAssignmentForMission(missionId, assignmentId, transaction);
      if (existing.status === AssignmentStatus.ARCHIVED || existing.archivedAt) {
        throw conflict('MISSION_ASSIGNMENT_ARCHIVED', 'Mission assignment is already archived.');
      }
      return transaction.missionRecruiter.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.ARCHIVED,
          archivedAt: new Date(),
          endedAt: new Date(),
          isLead: false,
        },
        include: assignmentInclude,
      });
    });

    await this.audit.record('missions.assignment.archived', context, {
      actorUserId,
      entityType: 'MissionRecruiter',
      entityId: assignment.id,
      metadataSummary: 'Recruitment mission assignment archived.',
    });

    return { assignment: this.toAssignmentSummary(assignment) };
  }

  private async resolveMissionAccess(actorUserId: string): Promise<MissionAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return {
      commercialView: permissions.includes(MISSION_PERMISSIONS.MISSION_COMMERCIAL_DATA_VIEW),
      commercialUpdate: permissions.includes(MISSION_PERMISSIONS.MISSION_COMMERCIAL_DATA_UPDATE),
    };
  }

  private async findMission(
    missionId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<MissionRecord> {
    const mission = await prisma.recruitmentMission.findUnique({
      where: { id: missionId },
      include: missionInclude,
    });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', 'Recruitment mission was not found.');
    }

    return mission;
  }

  private async withWritableMissionLock<T>(
    missionId: string,
    callback: (transaction: PrismaTransaction, mission: MissionRecord) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const mission = await this.lockMission(missionId, transaction);
      if (terminalStates.has(mission.state) || mission.archivedAt) {
        throw conflict('MISSION_TERMINAL', 'Terminal recruitment missions cannot be changed.');
      }
      return callback(transaction, mission);
    });
  }

  private async lockMission(
    missionId: string,
    transaction: PrismaTransaction,
  ): Promise<MissionRecord> {
    await transaction.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
    return this.findMission(missionId, transaction);
  }

  private async lockWritableClient(
    clientId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId}::uuid FOR UPDATE`;
    const client = await transaction.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw notFound('CLIENT_NOT_FOUND', 'Client was not found.');
    }
    if (client.status === ClientStatus.ARCHIVED || client.archivedAt) {
      throw conflict('CLIENT_ARCHIVED', 'Archived clients cannot receive recruitment missions.');
    }
  }

  private async assertAssignableUser(
    userId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw notFound('MISSION_ASSIGNEE_NOT_FOUND', 'Assigned user was not found.');
    }
    if (
      user.status !== UserStatus.ACTIVE ||
      user.archivedAt ||
      user.userType !== UserType.INTERNAL
    ) {
      throw conflict(
        'MISSION_ASSIGNEE_NOT_ACTIVE',
        'Only active, non-archived internal users can be assigned.',
      );
    }
  }

  private async findAssignmentForMission(
    missionId: string,
    assignmentId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<AssignmentRecord> {
    const assignment = await prisma.missionRecruiter.findFirst({
      where: { id: assignmentId, missionId },
      include: assignmentInclude,
    });
    if (!assignment) {
      throw notFound('MISSION_ASSIGNMENT_NOT_FOUND', 'Mission assignment was not found.');
    }

    return assignment;
  }

  private async clearActiveLead(
    missionId: string,
    transaction: PrismaTransaction,
    exceptAssignmentId?: string,
  ): Promise<void> {
    await transaction.missionRecruiter.updateMany({
      where: {
        missionId,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
        isLead: true,
        ...(exceptAssignmentId ? { id: { not: exceptAssignmentId } } : {}),
      },
      data: { isLead: false },
    });
  }

  private assertAllowedTransition(
    from: RecruitmentMissionState,
    to: RecruitmentMissionState,
  ): void {
    if (from === to) {
      return;
    }
    if (!allowedMissionTransitions.get(from)?.has(to)) {
      throw conflict(
        'MISSION_STATUS_TRANSITION_BLOCKED',
        'Recruitment mission state transition is not allowed.',
      );
    }
  }

  private assertClosureReasonMatches(
    state: RecruitmentMissionState,
    closureReason: MissionClosureReason,
  ): void {
    const expected = closureReasonByState.get(state);
    if (expected !== closureReason) {
      throw conflict(
        'MISSION_CLOSURE_REASON_MISMATCH',
        'Closure reason does not match closure state.',
      );
    }
  }

  private assertLeadConsistency(role: MissionRecruiterRole, isLead: boolean): void {
    if ((role === MissionRecruiterRole.LEAD_RECRUITER) !== isLead) {
      throw conflict(
        'MISSION_LEAD_ROLE_MISMATCH',
        'Lead recruiter assignments must use the lead recruiter role and flag together.',
      );
    }
  }

  private assertCommercialInputAllowed(
    input: MissionCreateRequest | MissionUpdateRequest,
    access: MissionAccess,
  ): void {
    const hasCommercialInput =
      'salaryMinCents' in input ||
      'salaryMaxCents' in input ||
      'salaryCurrency' in input ||
      'commercialSummary' in input;
    if (hasCommercialInput && !access.commercialUpdate) {
      throw forbidden(
        'MISSION_COMMERCIAL_PERMISSION_REQUIRED',
        'Mission salary and commercial fields require mission_commercial_data:update.',
      );
    }
  }

  private assertNonTerminalCreateState(state: RecruitmentMissionState | undefined): void {
    if (state && terminalStates.has(state)) {
      throw conflict(
        'MISSION_INITIAL_STATE_BLOCKED',
        'Missions cannot be created in a terminal state.',
      );
    }
  }

  private assertPlacementCounts(numberOfPositions: number, filledPlacementCount: number): void {
    if (
      numberOfPositions <= 0 ||
      filledPlacementCount < 0 ||
      filledPlacementCount > numberOfPositions
    ) {
      throw conflict('MISSION_PLACEMENT_COUNTS_INVALID', 'Mission placement counts are invalid.');
    }
  }

  private assertSalaryRange(
    salaryMinCents: number | null | undefined,
    salaryMaxCents: number | null | undefined,
  ): void {
    if (
      salaryMinCents !== null &&
      salaryMaxCents !== null &&
      salaryMinCents !== undefined &&
      salaryMaxCents !== undefined &&
      salaryMinCents > salaryMaxCents
    ) {
      throw conflict(
        'MISSION_SALARY_RANGE_INVALID',
        'Mission salary minimum must not exceed maximum.',
      );
    }
  }

  private async recordCommercialAccess(
    actorUserId: string,
    context: RequestContext,
    missionId?: string,
  ): Promise<void> {
    await this.audit.record('missions.commercial_fields.viewed', context, {
      actorUserId,
      entityType: 'RecruitmentMission',
      entityId: missionId,
      metadataSummary: 'Commercial mission fields included in response.',
    });
  }

  private rethrowAssignmentConstraint(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(
        'MISSION_ASSIGNMENT_CONFLICT',
        'Mission assignment active uniqueness or lead recruiter constraint was violated.',
      );
    }
  }

  private toMissionSummary(mission: MissionRecord, access: MissionAccess) {
    return {
      id: mission.id,
      clientId: mission.clientId,
      clientName: mission.client.name,
      title: mission.title,
      description: mission.description,
      requirements: mission.requirements,
      state: mission.state,
      priority: mission.priority,
      numberOfPositions: mission.numberOfPositions,
      filledPlacementCount: mission.filledPlacementCount,
      location: mission.location,
      workArrangement: mission.workArrangement,
      engagementType: mission.engagementType,
      targetStartDate: isoOrNull(mission.targetStartDate),
      applicationDeadline: isoOrNull(mission.applicationDeadline),
      commercial: access.commercialView
        ? {
            salaryMinCents: mission.salaryMinCents,
            salaryMaxCents: mission.salaryMaxCents,
            salaryCurrency: mission.salaryCurrency,
            commercialSummary: mission.commercialSummary,
          }
        : null,
      closureReason: mission.closureReason,
      closedAt: isoOrNull(mission.closedAt),
      archivedAt: isoOrNull(mission.archivedAt),
      createdAt: mission.createdAt.toISOString(),
      updatedAt: mission.updatedAt.toISOString(),
    };
  }

  private toAssignmentSummary(assignment: AssignmentRecord) {
    return {
      id: assignment.id,
      missionId: assignment.missionId,
      userId: assignment.userId,
      userDisplayName: assignment.user.displayName,
      role: assignment.role,
      status: assignment.status,
      isLead: assignment.isLead,
      assignedAt: assignment.assignedAt.toISOString(),
      endedAt: isoOrNull(assignment.endedAt),
      archivedAt: isoOrNull(assignment.archivedAt),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }
}

const missionInclude = {
  client: { select: { name: true } },
} satisfies Prisma.RecruitmentMissionInclude;
const assignmentInclude = {
  user: { select: { displayName: true } },
} satisfies Prisma.MissionRecruiterInclude;
const closureReasonByState = new Map<RecruitmentMissionState, MissionClosureReason>([
  [RecruitmentMissionState.CANCELED, MissionClosureReason.CLIENT_CLOSED_OR_CANCELED],
  [
    RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
    MissionClosureReason.CLOSED_WITHOUT_RECRUITMENT,
  ],
  [
    RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
    MissionClosureReason.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  ],
  [
    RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
    MissionClosureReason.POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED,
  ],
]);

function optional(value: string | undefined): string | undefined {
  return value?.trim();
}

function nullable(value: string | null): string | null {
  return value === null ? null : value.trim();
}

function dateOrUndefined(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function dateOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
