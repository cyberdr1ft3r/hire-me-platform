import { Inject, Injectable } from '@nestjs/common';
import type {
  TrainingAttendanceCorrectionRequest,
  TrainingAttendanceUpdateRequest,
  TrainingEnrollmentCertificateStatusUpdateRequest,
  TrainingEnrollmentCreateRequest,
  TrainingEnrollmentDetailResponse,
  TrainingEnrollmentListQuery,
  TrainingEnrollmentListResponse,
  TrainingEnrollmentStatusUpdateRequest,
  TrainingEnrollmentSummary,
  TrainingEnrollmentWithdrawRequest,
  TrainingParticipationCreateRequest,
  TrainingParticipationDetailResponse,
  TrainingParticipationListQuery,
  TrainingParticipationListResponse,
  TrainingParticipationSummary,
  TrainingProgramCreateRequest,
  TrainingProgramDetailResponse,
  TrainingProgramListQuery,
  TrainingProgramListResponse,
  TrainingProgramStatusUpdateRequest,
  TrainingProgramSummary,
  TrainingProgramUpdateRequest,
  TrainingSessionCancelRequest,
  TrainingSessionCreateRequest,
  TrainingSessionDetailResponse,
  TrainingSessionListQuery,
  TrainingSessionListResponse,
  TrainingSessionRescheduleRequest,
  TrainingSessionStatusUpdateRequest,
  TrainingSessionSummary,
  TrainingSessionUpdateRequest,
} from '@hire-me/contracts';

import { TrainingAuditService } from './training-audit.service.js';
import { TRAINING_PERMISSIONS } from './training-permissions.js';
import { badRequest, conflict, forbidden, notFound } from './training.errors.js';
import {
  ATTENDANCE_RECORDING_SESSION_STATUSES,
  CORRECTABLE_PARTICIPATION_STATUSES,
  RESCHEDULABLE_SESSION_STATUSES,
  isAllowedEnrollmentTransition,
  isAllowedParticipationTransition,
  isAllowedProgramTransition,
  isAllowedSessionTransition,
  isTerminalEnrollmentStatus,
  isTerminalSessionStatus,
} from './training.lifecycle.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  CandidateStatus,
  CertificateStatus,
  ClientContactStatus,
  ClientStatus,
  ExternalParticipantStatus,
  Prisma,
  TrainingEnrollmentStatus,
  TrainingProgramStatus,
  TrainingSessionParticipationStatus,
  TrainingSessionStatus,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type ProgramRecord = Prisma.TrainingProgramGetPayload<Record<string, never>>;
type SessionRecord = Prisma.TrainingSessionGetPayload<Record<string, never>>;
type EnrollmentRecord = Prisma.TrainingEnrollmentGetPayload<Record<string, never>>;
type ParticipationRecord = Prisma.TrainingSessionParticipationGetPayload<Record<string, never>>;

type TrainingAccess = {
  permissions: Set<string>;
  programView: boolean;
  programViewAll: boolean;
  clientsView: boolean;
  candidatesView: boolean;
  clientContactsView: boolean;
};

const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const UNIQUE_VIOLATION = 'P2002';

/**
 * Internal training operations: programs, sessions, enrollment, and attendance.
 *
 * Authorization always combines an explicit permission code with server-side
 * record scope. Nested routes additionally verify the full parent chain so that a
 * training identifier can never be used to reach a record under a different
 * program or an unrelated client.
 *
 * Row locks are always taken in the order program -> session -> enrollment ->
 * participation so that concurrent training mutations serialize deterministically
 * instead of producing contradictory terminal state.
 */
@Injectable()
export class TrainingService {
  private readonly audit: TrainingAuditService;
  private readonly permissions: PermissionsService;
  private readonly prisma: PrismaService;

  constructor(
    @Inject(TrainingAuditService) audit: TrainingAuditService,
    @Inject(PermissionsService) permissions: PermissionsService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    this.audit = audit;
    this.permissions = permissions;
    this.prisma = prisma;
  }

  // ----------------------------------------------------------------------------
  // Training programs
  // ----------------------------------------------------------------------------

  async listPrograms(
    query: TrainingProgramListQuery,
    actorUserId: string,
  ): Promise<TrainingProgramListResponse> {
    const access = await this.resolveAccess(actorUserId);
    const where: Prisma.TrainingProgramWhereInput = {
      AND: [this.visibleProgramWhere(actorUserId, access), this.programFilterWhere(query)],
    };

    const [programs, total] = await this.prisma.$transaction([
      this.prisma.trainingProgram.findMany({
        where,
        orderBy: this.programOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trainingProgram.count({ where }),
    ]);

    return {
      programs: programs.map((program) => this.toProgramSummary(program, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getProgram(programId: string, actorUserId: string): Promise<TrainingProgramDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const program = await this.findVisibleProgram(programId, actorUserId, access);
    return { program: this.toProgramSummary(program, access) };
  }

  async createProgram(
    input: TrainingProgramCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingProgramDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const normalizedReference = normalizeReference(input.reference);

    const program = await this.prisma
      .$transaction(async (transaction) => {
        if (input.clientId !== undefined) {
          await this.assertClientContextAllowed(input.clientId, access, transaction);
        }
        if (input.ownerUserId !== undefined) {
          await this.assertInternalUserActive(
            input.ownerUserId,
            'TRAINING_PROGRAM_OWNER_INELIGIBLE',
            transaction,
          );
        }

        const created = await transaction.trainingProgram.create({
          data: {
            reference: input.reference,
            normalizedReference,
            name: input.name,
            description: input.description ?? null,
            targetAudience: input.targetAudience ?? null,
            ownerUserId: input.ownerUserId ?? null,
            clientId: input.clientId ?? null,
            plannedStartDate: toDate(input.plannedStartDate),
            plannedEndDate: toDate(input.plannedEndDate),
          },
        });

        await this.audit.record(
          'training.program.created',
          context,
          {
            actorUserId,
            entityType: 'TrainingProgram',
            entityId: created.id,
            metadataSummary: `Training program ${created.reference} created.`,
          },
          transaction,
        );

        return created;
      })
      .catch((error: unknown) => {
        throw this.mapUniqueViolation(
          error,
          'TRAINING_PROGRAM_REFERENCE_TAKEN',
          'Training program reference is already used.',
        );
      });

    return { program: this.toProgramSummary(program, access) };
  }

  async updateProgram(
    programId: string,
    input: TrainingProgramUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingProgramDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const program = await this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, current) => {
        this.assertProgramMutable(current);
        if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
          await this.assertInternalUserActive(
            input.ownerUserId,
            'TRAINING_PROGRAM_OWNER_INELIGIBLE',
            transaction,
          );
        }

        const plannedStartDate =
          input.plannedStartDate !== undefined
            ? toDate(input.plannedStartDate)
            : current.plannedStartDate;
        const plannedEndDate =
          input.plannedEndDate !== undefined
            ? toDate(input.plannedEndDate)
            : current.plannedEndDate;
        if (
          plannedStartDate !== null &&
          plannedEndDate !== null &&
          plannedEndDate.getTime() <= plannedStartDate.getTime()
        ) {
          throw badRequest(
            'TRAINING_PROGRAM_PLANNED_WINDOW_INVALID',
            'Planned end date must be after the planned start date.',
          );
        }

        const updated = await transaction.trainingProgram.update({
          where: { id: programId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.targetAudience !== undefined ? { targetAudience: input.targetAudience } : {}),
            ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
            ...(input.plannedStartDate !== undefined ? { plannedStartDate } : {}),
            ...(input.plannedEndDate !== undefined ? { plannedEndDate } : {}),
          },
        });

        await this.audit.record(
          'training.program.updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingProgram',
            entityId: updated.id,
            metadataSummary: `Training program ${updated.reference} updated.`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { program: this.toProgramSummary(program, access) };
  }

  async updateProgramStatus(
    programId: string,
    input: TrainingProgramStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingProgramDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const nextStatus = input.status as TrainingProgramStatus;
    const program = await this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, current) => {
        if (current.status === nextStatus) {
          return current;
        }
        if (!isAllowedProgramTransition(current.status, nextStatus)) {
          throw conflict(
            'TRAINING_PROGRAM_STATUS_TRANSITION_BLOCKED',
            'Training program status transition is not allowed.',
          );
        }

        const updated = await transaction.trainingProgram.update({
          where: { id: programId },
          data: { status: nextStatus },
        });

        await this.audit.record(
          'training.program.status_updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingProgram',
            entityId: updated.id,
            metadataSummary: `Training program status changed to ${nextStatus}.`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { program: this.toProgramSummary(program, access) };
  }

  async archiveProgram(
    programId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingProgramDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const program = await this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, current) => {
        if (current.status === TrainingProgramStatus.PROGRAM_ARCHIVED) {
          return current;
        }
        if (!isAllowedProgramTransition(current.status, TrainingProgramStatus.PROGRAM_ARCHIVED)) {
          throw conflict(
            'TRAINING_PROGRAM_ARCHIVE_BLOCKED',
            'Only a closed training program can be archived.',
          );
        }

        const updated = await transaction.trainingProgram.update({
          where: { id: programId },
          data: { status: TrainingProgramStatus.PROGRAM_ARCHIVED, archivedAt: new Date() },
        });

        await this.audit.record(
          'training.program.archived',
          context,
          {
            actorUserId,
            entityType: 'TrainingProgram',
            entityId: updated.id,
            metadataSummary: `Training program ${updated.reference} archived.`,
          },
          transaction,
        );

        return updated;
      },
      { allowArchived: true },
    );

    return { program: this.toProgramSummary(program, access) };
  }

  // ----------------------------------------------------------------------------
  // Training sessions
  // ----------------------------------------------------------------------------

  async listSessions(
    programId: string,
    query: TrainingSessionListQuery,
    actorUserId: string,
  ): Promise<TrainingSessionListResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.findVisibleProgram(programId, actorUserId, access);

    const where: Prisma.TrainingSessionWhereInput = {
      trainingProgramId: programId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.trainerUserId ? { trainerUserId: query.trainerUserId } : {}),
      ...(query.deliveryMode ? { deliveryMode: query.deliveryMode } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.scheduledFrom || query.scheduledTo
        ? {
            scheduledAt: {
              ...(query.scheduledFrom ? { gte: new Date(query.scheduledFrom) } : {}),
              ...(query.scheduledTo ? { lte: new Date(query.scheduledTo) } : {}),
            },
          }
        : {}),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.trainingSession.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortDirection }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trainingSession.count({ where }),
    ]);

    return {
      sessions: sessions.map((session) => toSessionSummary(session)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getSession(
    programId: string,
    sessionId: string,
    actorUserId: string,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.findVisibleProgram(programId, actorUserId, access);
    const session = await this.findSessionForProgram(programId, sessionId);
    return { session: toSessionSummary(session) };
  }

  async createSession(
    programId: string,
    input: TrainingSessionCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const session = await this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, program) => {
        this.assertProgramAcceptsOperations(program);
        if (input.trainerUserId !== undefined) {
          await this.assertInternalUserActive(
            input.trainerUserId,
            'TRAINING_SESSION_TRAINER_INELIGIBLE',
            transaction,
          );
        }

        const created = await transaction.trainingSession
          .create({
            data: {
              trainingProgramId: programId,
              title: input.title,
              sequence: input.sequence ?? null,
              scheduledAt: new Date(input.scheduledAt),
              scheduledEndAt: new Date(input.scheduledEndAt),
              deliveryMode: input.deliveryMode ?? undefined,
              trainerUserId: input.trainerUserId ?? null,
              location: input.location ?? null,
              meetingUrl: input.meetingUrl ?? null,
            },
          })
          .catch((error: unknown) => {
            throw this.mapUniqueViolation(
              error,
              'TRAINING_SESSION_SEQUENCE_TAKEN',
              'Training session sequence is already used in this program.',
            );
          });

        await this.audit.record(
          'training.session.created',
          context,
          {
            actorUserId,
            entityType: 'TrainingSession',
            entityId: created.id,
            metadataSummary: `Training session scheduled for program ${program.reference}.`,
          },
          transaction,
        );

        return created;
      },
    );

    return { session: toSessionSummary(session) };
  }

  async updateSession(
    programId: string,
    sessionId: string,
    input: TrainingSessionUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const session = await this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (isTerminalSessionStatus(current.status) || current.archivedAt) {
          throw conflict(
            'TRAINING_SESSION_NOT_MUTABLE',
            'Completed, canceled, or archived training sessions cannot be changed.',
          );
        }
        if (input.trainerUserId !== undefined && input.trainerUserId !== null) {
          await this.assertInternalUserActive(
            input.trainerUserId,
            'TRAINING_SESSION_TRAINER_INELIGIBLE',
            transaction,
          );
        }

        const updated = await transaction.trainingSession
          .update({
            where: { id: sessionId },
            data: {
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
              ...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
              ...(input.trainerUserId !== undefined ? { trainerUserId: input.trainerUserId } : {}),
              ...(input.location !== undefined ? { location: input.location } : {}),
              ...(input.meetingUrl !== undefined ? { meetingUrl: input.meetingUrl } : {}),
              ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
            },
          })
          .catch((error: unknown) => {
            throw this.mapUniqueViolation(
              error,
              'TRAINING_SESSION_SEQUENCE_TAKEN',
              'Training session sequence is already used in this program.',
            );
          });

        await this.audit.record(
          'training.session.updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingSession',
            entityId: updated.id,
            metadataSummary: 'Training session details updated.',
          },
          transaction,
        );

        return updated;
      },
    );

    return { session: toSessionSummary(session) };
  }

  async rescheduleSession(
    programId: string,
    sessionId: string,
    input: TrainingSessionRescheduleRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const session = await this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (current.archivedAt || !RESCHEDULABLE_SESSION_STATUSES.includes(current.status)) {
          throw conflict(
            'TRAINING_SESSION_RESCHEDULE_BLOCKED',
            'Only a planned, scheduled, or postponed training session can be rescheduled.',
          );
        }

        const now = new Date();
        // The reason is bounded operational history, kept on the session alongside the
        // rest of the reschedule metadata rather than accepted and discarded.
        const updated = await transaction.trainingSession.update({
          where: { id: sessionId },
          data: {
            previousScheduledAt: current.scheduledAt,
            scheduledAt: new Date(input.scheduledAt),
            scheduledEndAt: new Date(input.scheduledEndAt),
            status: TrainingSessionStatus.SESSION_SCHEDULED,
            rescheduleCount: { increment: 1 },
            lastRescheduledAt: now,
            lastRescheduleReason: input.reason ?? null,
          },
        });

        await this.audit.record(
          'training.session.rescheduled',
          context,
          {
            actorUserId,
            entityType: 'TrainingSession',
            entityId: updated.id,
            metadataSummary: `Training session rescheduled (reschedule ${updated.rescheduleCount}).`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { session: toSessionSummary(session) };
  }

  async updateSessionStatus(
    programId: string,
    sessionId: string,
    input: TrainingSessionStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const nextStatus = input.status as TrainingSessionStatus;
    const session = await this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (current.status === nextStatus) {
          return current;
        }
        if (current.archivedAt || !isAllowedSessionTransition(current.status, nextStatus)) {
          throw conflict(
            'TRAINING_SESSION_STATUS_TRANSITION_BLOCKED',
            'Training session status transition is not allowed.',
          );
        }

        const updated = await transaction.trainingSession.update({
          where: { id: sessionId },
          data: { status: nextStatus },
        });

        await this.audit.record(
          'training.session.status_updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingSession',
            entityId: updated.id,
            metadataSummary: `Training session status changed to ${nextStatus}.`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { session: toSessionSummary(session) };
  }

  async cancelSession(
    programId: string,
    sessionId: string,
    input: TrainingSessionCancelRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const session = await this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (current.status === TrainingSessionStatus.SESSION_CANCELED) {
          return current;
        }
        if (
          current.archivedAt ||
          !isAllowedSessionTransition(current.status, TrainingSessionStatus.SESSION_CANCELED)
        ) {
          throw conflict(
            'TRAINING_SESSION_CANCEL_BLOCKED',
            'Training session cannot be canceled from its current state.',
          );
        }

        const updated = await transaction.trainingSession.update({
          where: { id: sessionId },
          data: {
            status: TrainingSessionStatus.SESSION_CANCELED,
            canceledAt: new Date(),
            cancellationReason: input.reason,
          },
        });

        await this.audit.record(
          'training.session.canceled',
          context,
          {
            actorUserId,
            entityType: 'TrainingSession',
            entityId: updated.id,
            metadataSummary: 'Training session canceled with a recorded reason.',
          },
          transaction,
        );

        return updated;
      },
    );

    return { session: toSessionSummary(session) };
  }

  async archiveSession(
    programId: string,
    sessionId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingSessionDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const session = await this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, _program, current) => {
        if (current.status === TrainingSessionStatus.SESSION_ARCHIVED) {
          return current;
        }
        if (!isAllowedSessionTransition(current.status, TrainingSessionStatus.SESSION_ARCHIVED)) {
          throw conflict(
            'TRAINING_SESSION_ARCHIVE_BLOCKED',
            'Only a completed or canceled training session can be archived.',
          );
        }

        const updated = await transaction.trainingSession.update({
          where: { id: sessionId },
          data: { status: TrainingSessionStatus.SESSION_ARCHIVED, archivedAt: new Date() },
        });

        await this.audit.record(
          'training.session.archived',
          context,
          {
            actorUserId,
            entityType: 'TrainingSession',
            entityId: updated.id,
            metadataSummary: 'Training session archived.',
          },
          transaction,
        );

        return updated;
      },
      { allowArchivedProgram: true },
    );

    return { session: toSessionSummary(session) };
  }

  // ----------------------------------------------------------------------------
  // Enrollment
  // ----------------------------------------------------------------------------

  async listEnrollments(
    programId: string,
    query: TrainingEnrollmentListQuery,
    actorUserId: string,
  ): Promise<TrainingEnrollmentListResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.findVisibleProgram(programId, actorUserId, access);

    const where: Prisma.TrainingEnrollmentWhereInput = {
      trainingProgramId: programId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.participantType ? { participantType: query.participantType } : {}),
      ...(query.certificateReadyOnly
        ? {
            completedAt: { not: null },
            withdrawnAt: null,
            archivedAt: null,
            certificateStatus: CertificateStatus.PENDING,
          }
        : {}),
    };

    const [enrollments, total] = await this.prisma.$transaction([
      this.prisma.trainingEnrollment.findMany({
        where,
        orderBy: [
          {
            [query.sortBy]: query.sortDirection,
          },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trainingEnrollment.count({ where }),
    ]);

    return {
      enrollments: enrollments.map((enrollment) => toEnrollmentSummary(enrollment, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getEnrollment(
    programId: string,
    enrollmentId: string,
    actorUserId: string,
  ): Promise<TrainingEnrollmentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.findVisibleProgram(programId, actorUserId, access);
    const enrollment = await this.findEnrollmentForProgram(programId, enrollmentId);
    return { enrollment: toEnrollmentSummary(enrollment, access) };
  }

  async createEnrollment(
    programId: string,
    input: TrainingEnrollmentCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingEnrollmentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const enrollment = await this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, program) => {
        this.assertProgramAcceptsOperations(program);
        await this.assertParticipantEligible(input, program, access, transaction);

        const participantId = participantIdentifier(input);
        const created = await transaction.trainingEnrollment
          .create({
            data: {
              trainingProgramId: programId,
              participantType: input.participantType,
              candidateId: input.candidateId ?? null,
              userId: input.userId ?? null,
              clientContactId: input.clientContactId ?? null,
              externalTrainingParticipantId: input.externalTrainingParticipantId ?? null,
              activeParticipantKey: activeParticipantKey(input.participantType, participantId),
              createdByUserId: actorUserId,
            },
          })
          .catch((error: unknown) => {
            throw this.mapUniqueViolation(
              error,
              'TRAINING_ENROLLMENT_ALREADY_ACTIVE',
              'This participant already has an active enrollment in the training program.',
            );
          });

        await this.audit.record(
          'training.enrollment.created',
          context,
          {
            actorUserId,
            entityType: 'TrainingEnrollment',
            entityId: created.id,
            metadataSummary: `Training enrollment created for participant type ${created.participantType}.`,
          },
          transaction,
        );

        return created;
      },
    );

    return { enrollment: toEnrollmentSummary(enrollment, access) };
  }

  async updateEnrollmentStatus(
    programId: string,
    enrollmentId: string,
    input: TrainingEnrollmentStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingEnrollmentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const nextStatus = input.status as TrainingEnrollmentStatus;
    const enrollment = await this.withEnrollmentLock(
      programId,
      enrollmentId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (current.status === nextStatus) {
          return current;
        }
        if (current.archivedAt || !isAllowedEnrollmentTransition(current.status, nextStatus)) {
          throw conflict(
            'TRAINING_ENROLLMENT_STATUS_TRANSITION_BLOCKED',
            'Training enrollment status transition is not allowed.',
          );
        }

        const now = new Date();
        const updated = await transaction.trainingEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: nextStatus,
            ...(nextStatus === TrainingEnrollmentStatus.ENROLLED && current.enrolledAt === null
              ? { enrolledAt: now }
              : {}),
            // Reaching EVALUATED means the required training and evaluation criteria
            // were recorded. This is the durable completion boundary a later
            // document-generation feature can consume; no certificate is produced here.
            ...(nextStatus === TrainingEnrollmentStatus.EVALUATED && current.completedAt === null
              ? { completedAt: now }
              : {}),
            ...(nextStatus === TrainingEnrollmentStatus.CERTIFICATE_ISSUED
              ? { certificateStatus: CertificateStatus.ISSUED }
              : {}),
            ...(isTerminalEnrollmentStatus(nextStatus) ? { activeParticipantKey: null } : {}),
          },
        });

        await this.audit.record(
          'training.enrollment.status_updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingEnrollment',
            entityId: updated.id,
            metadataSummary: `Training enrollment status changed to ${nextStatus}.`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { enrollment: toEnrollmentSummary(enrollment, access) };
  }

  async withdrawEnrollment(
    programId: string,
    enrollmentId: string,
    input: TrainingEnrollmentWithdrawRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingEnrollmentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const enrollment = await this.withEnrollmentLock(
      programId,
      enrollmentId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (current.status === TrainingEnrollmentStatus.CANCELED) {
          return current;
        }
        if (current.archivedAt || isTerminalEnrollmentStatus(current.status)) {
          throw conflict(
            'TRAINING_ENROLLMENT_WITHDRAW_BLOCKED',
            'A closed, rejected, or archived training enrollment cannot be withdrawn.',
          );
        }

        // History is preserved: the row is never deleted, and completion timestamps
        // that were already earned are kept. Only the active-slot key is released.
        const updated = await transaction.trainingEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: TrainingEnrollmentStatus.CANCELED,
            withdrawnAt: new Date(),
            withdrawalReason: input.reason,
            activeParticipantKey: null,
          },
        });

        await this.audit.record(
          'training.enrollment.withdrawn',
          context,
          {
            actorUserId,
            entityType: 'TrainingEnrollment',
            entityId: updated.id,
            metadataSummary: 'Training enrollment withdrawn with a recorded reason.',
          },
          transaction,
        );

        return updated;
      },
    );

    return { enrollment: toEnrollmentSummary(enrollment, access) };
  }

  /**
   * Declares whether this enrollment is meant to receive a certificate at all.
   *
   * Applicability is explicit rather than assumed, because NOT_APPLICABLE is a real
   * domain state: not every training program awards a certificate. ISSUED is not
   * settable here; it is reached through the enrollment lifecycle.
   */
  async updateEnrollmentCertificateStatus(
    programId: string,
    enrollmentId: string,
    input: TrainingEnrollmentCertificateStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingEnrollmentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const nextStatus = input.certificateStatus as CertificateStatus;
    const enrollment = await this.withEnrollmentLock(
      programId,
      enrollmentId,
      actorUserId,
      access,
      async (transaction, program, current) => {
        this.assertProgramAcceptsOperations(program);
        if (current.archivedAt || isTerminalEnrollmentStatus(current.status)) {
          throw conflict(
            'TRAINING_ENROLLMENT_NOT_MUTABLE',
            'A terminal or archived training enrollment cannot change certificate applicability.',
          );
        }
        if (current.certificateStatus === CertificateStatus.ISSUED) {
          throw conflict(
            'TRAINING_CERTIFICATE_ALREADY_ISSUED',
            'An issued training certificate cannot be reverted here.',
          );
        }
        if (current.certificateStatus === nextStatus) {
          return current;
        }

        const updated = await transaction.trainingEnrollment.update({
          where: { id: enrollmentId },
          data: { certificateStatus: nextStatus },
        });

        await this.audit.record(
          'training.enrollment.certificate_status_updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingEnrollment',
            entityId: updated.id,
            metadataSummary: `Training certificate applicability set to ${nextStatus}.`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { enrollment: toEnrollmentSummary(enrollment, access) };
  }

  async archiveEnrollment(
    programId: string,
    enrollmentId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingEnrollmentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const enrollment = await this.withEnrollmentLock(
      programId,
      enrollmentId,
      actorUserId,
      access,
      async (transaction, _program, current) => {
        if (current.archivedAt) {
          return current;
        }
        if (!isTerminalEnrollmentStatus(current.status)) {
          throw conflict(
            'TRAINING_ENROLLMENT_ARCHIVE_BLOCKED',
            'Only a closed, rejected, or canceled training enrollment can be archived.',
          );
        }

        const updated = await transaction.trainingEnrollment.update({
          where: { id: enrollmentId },
          data: { archivedAt: new Date(), activeParticipantKey: null },
        });

        await this.audit.record(
          'training.enrollment.archived',
          context,
          {
            actorUserId,
            entityType: 'TrainingEnrollment',
            entityId: updated.id,
            metadataSummary: 'Training enrollment archived without deleting history.',
          },
          transaction,
        );

        return updated;
      },
      { allowArchivedProgram: true },
    );

    return { enrollment: toEnrollmentSummary(enrollment, access) };
  }

  // ----------------------------------------------------------------------------
  // Session participation and attendance
  // ----------------------------------------------------------------------------

  async listParticipations(
    programId: string,
    sessionId: string,
    query: TrainingParticipationListQuery,
    actorUserId: string,
  ): Promise<TrainingParticipationListResponse> {
    const access = await this.resolveAccess(actorUserId);
    await this.findVisibleProgram(programId, actorUserId, access);
    await this.findSessionForProgram(programId, sessionId);
    const includeNotes = access.permissions.has(TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_MANAGE);

    const where: Prisma.TrainingSessionParticipationWhereInput = {
      trainingSessionId: sessionId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
    };

    const [participations, total] = await this.prisma.$transaction([
      this.prisma.trainingSessionParticipation.findMany({
        where,
        orderBy: [
          {
            [query.sortBy]: query.sortDirection,
          },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trainingSessionParticipation.count({ where }),
    ]);

    return {
      participations: participations.map((participation) =>
        toParticipationSummary(participation, includeNotes),
      ),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async createParticipation(
    programId: string,
    sessionId: string,
    input: TrainingParticipationCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingParticipationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const participation = await this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, program, session) => {
        this.assertProgramAcceptsOperations(program);
        if (isTerminalSessionStatus(session.status) || session.archivedAt) {
          throw conflict(
            'TRAINING_SESSION_NOT_MUTABLE',
            'Completed, canceled, or archived training sessions cannot record participation.',
          );
        }

        // Critical integrity rule: the enrollment must belong to the SAME training
        // program as the session. A program A session can never be linked to a
        // program B enrollment.
        const enrollment = await transaction.trainingEnrollment.findFirst({
          where: { id: input.trainingEnrollmentId, trainingProgramId: programId },
        });
        if (!enrollment) {
          throw badRequest(
            'TRAINING_PARTICIPATION_PROGRAM_MISMATCH',
            'The training enrollment does not belong to this training program.',
          );
        }
        if (enrollment.archivedAt || isTerminalEnrollmentStatus(enrollment.status)) {
          throw conflict(
            'TRAINING_ENROLLMENT_NOT_ACTIVE',
            'Only an active training enrollment can be linked to a session.',
          );
        }

        const created = await transaction.trainingSessionParticipation
          .create({
            data: {
              trainingSessionId: sessionId,
              trainingEnrollmentId: enrollment.id,
              recordedByUserId: actorUserId,
            },
          })
          .catch((error: unknown) => {
            throw this.mapUniqueViolation(
              error,
              'TRAINING_PARTICIPATION_ALREADY_EXISTS',
              'This enrollment already has a participation record for the session.',
            );
          });

        await this.audit.record(
          'training.participation.created',
          context,
          {
            actorUserId,
            entityType: 'TrainingSessionParticipation',
            entityId: created.id,
            metadataSummary: 'Training session participation record created.',
          },
          transaction,
        );

        return created;
      },
    );

    return { participation: toParticipationSummary(participation, true) };
  }

  async updateAttendance(
    programId: string,
    sessionId: string,
    participationId: string,
    input: TrainingAttendanceUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingParticipationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const nextStatus = input.status as TrainingSessionParticipationStatus;
    const participation = await this.withParticipationLock(
      programId,
      sessionId,
      participationId,
      actorUserId,
      access,
      async (transaction, program, session, current) => {
        this.assertProgramAcceptsOperations(program);
        this.assertSessionAcceptsAttendance(session);
        this.assertParticipationMutable(current);

        // Resubmitting the current attendance state must not rewrite history. It is a
        // no-op when nothing would change, and otherwise requires the explicit
        // correction action, which carries its own capability and a recorded reason.
        if (current.status === nextStatus) {
          if (this.attendanceDetailsWouldChange(current, input)) {
            throw conflict(
              'TRAINING_ATTENDANCE_ALREADY_RECORDED',
              'Attendance is already recorded in this state. Use an explicit correction to change it.',
            );
          }

          return current;
        }

        if (!isAllowedParticipationTransition(current.status, nextStatus)) {
          throw conflict(
            'TRAINING_ATTENDANCE_TRANSITION_BLOCKED',
            'Training attendance transition is not allowed. Use an explicit correction instead.',
          );
        }

        const updated = await transaction.trainingSessionParticipation.update({
          where: { id: participationId },
          data: {
            status: nextStatus,
            attendanceRecordedAt: new Date(),
            recordedByUserId: actorUserId,
            ...(input.sessionOutcome !== undefined ? { sessionOutcome: input.sessionOutcome } : {}),
            ...(input.completionStatus !== undefined
              ? { completionStatus: input.completionStatus }
              : {}),
            ...(input.trainerNotes !== undefined ? { trainerNotes: input.trainerNotes } : {}),
          },
        });

        await this.audit.record(
          'training.participation.attendance_updated',
          context,
          {
            actorUserId,
            entityType: 'TrainingSessionParticipation',
            entityId: updated.id,
            metadataSummary: `Training attendance recorded as ${nextStatus}.`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { participation: toParticipationSummary(participation, true) };
  }

  async correctAttendance(
    programId: string,
    sessionId: string,
    participationId: string,
    input: TrainingAttendanceCorrectionRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingParticipationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const nextStatus = input.status as TrainingSessionParticipationStatus;
    const participation = await this.withParticipationLock(
      programId,
      sessionId,
      participationId,
      actorUserId,
      access,
      async (transaction, program, session, current) => {
        this.assertProgramAcceptsOperations(program);
        // Corrections use the same session-state policy as ordinary recording, so a
        // completed session may still be corrected but a canceled or archived one
        // fails closed.
        this.assertSessionAcceptsAttendance(session);
        this.assertParticipationMutable(current);
        if (!CORRECTABLE_PARTICIPATION_STATUSES.includes(current.status)) {
          throw conflict(
            'TRAINING_ATTENDANCE_CORRECTION_BLOCKED',
            'Training attendance cannot be corrected from its current state.',
          );
        }

        const now = new Date();
        const updated = await transaction.trainingSessionParticipation.update({
          where: { id: participationId },
          data: {
            status: nextStatus,
            attendanceRecordedAt: now,
            recordedByUserId: actorUserId,
            correctionCount: { increment: 1 },
            lastCorrectedAt: now,
            lastCorrectionReason: input.correctionReason,
            ...(input.sessionOutcome !== undefined ? { sessionOutcome: input.sessionOutcome } : {}),
            ...(input.completionStatus !== undefined
              ? { completionStatus: input.completionStatus }
              : {}),
            ...(input.trainerNotes !== undefined ? { trainerNotes: input.trainerNotes } : {}),
          },
        });

        await this.audit.record(
          'training.participation.attendance_corrected',
          context,
          {
            actorUserId,
            entityType: 'TrainingSessionParticipation',
            entityId: updated.id,
            metadataSummary: `Training attendance corrected to ${nextStatus} (correction ${updated.correctionCount}).`,
          },
          transaction,
        );

        return updated;
      },
    );

    return { participation: toParticipationSummary(participation, true) };
  }

  /**
   * Completes the documented participation lifecycle by reaching
   * PARTICIPATION_ARCHIVED from SESSION_OUTCOME_RECORDED.
   *
   * History is preserved: the row is never deleted, and the recorded attendance,
   * outcome, and correction metadata all remain. Retrying after the first successful
   * archive returns the existing state without duplicate history or audit entries,
   * matching the terminal-write convention used elsewhere in this repository.
   */
  async archiveParticipation(
    programId: string,
    sessionId: string,
    participationId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<TrainingParticipationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    const includeNotes = access.permissions.has(TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_MANAGE);
    const participation = await this.withParticipationLock(
      programId,
      sessionId,
      participationId,
      actorUserId,
      access,
      async (transaction, _program, _session, current) => {
        if (
          current.status === TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED &&
          current.archivedAt
        ) {
          return current;
        }
        if (
          !isAllowedParticipationTransition(
            current.status,
            TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED,
          )
        ) {
          throw conflict(
            'TRAINING_PARTICIPATION_ARCHIVE_BLOCKED',
            'Only participation with a recorded session outcome can be archived.',
          );
        }

        const updated = await transaction.trainingSessionParticipation.update({
          where: { id: participationId },
          data: {
            status: TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED,
            archivedAt: new Date(),
          },
        });

        await this.audit.record(
          'training.participation.archived',
          context,
          {
            actorUserId,
            entityType: 'TrainingSessionParticipation',
            entityId: updated.id,
            metadataSummary: 'Training session participation archived without deleting history.',
          },
          transaction,
        );

        return updated;
      },
      { allowArchivedProgram: true },
    );

    return { participation: toParticipationSummary(participation, includeNotes) };
  }

  // ----------------------------------------------------------------------------
  // Access resolution and record scope
  // ----------------------------------------------------------------------------

  private async resolveAccess(actorUserId: string): Promise<TrainingAccess> {
    const permissions = new Set(await this.permissions.getEffectivePermissionCodes(actorUserId));
    return {
      permissions,
      programView: permissions.has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW),
      programViewAll: permissions.has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW_ALL),
      clientsView: permissions.has(TRAINING_PERMISSIONS.CLIENTS_VIEW),
      candidatesView: permissions.has(TRAINING_PERMISSIONS.CANDIDATES_VIEW),
      clientContactsView: permissions.has(TRAINING_PERMISSIONS.CLIENT_CONTACTS_VIEW),
    };
  }

  /**
   * Server-authoritative training program visibility.
   *
   * Broad oversight requires the separate `training_programs:view_all` capability.
   * Otherwise the actor must be the program owner or a trainer on one of its
   * sessions. Client-linked programs additionally require client read capability,
   * so a training UUID never becomes a path to unrelated client records.
   */
  private visibleProgramWhere(
    actorUserId: string,
    access: TrainingAccess,
  ): Prisma.TrainingProgramWhereInput {
    if (!access.programView && !access.programViewAll) {
      return { id: UNMATCHABLE_ID };
    }

    const clientScope: Prisma.TrainingProgramWhereInput = access.clientsView
      ? {}
      : { clientId: null };

    if (access.programViewAll) {
      return clientScope;
    }

    return {
      AND: [
        clientScope,
        {
          OR: [
            { ownerUserId: actorUserId },
            { sessions: { some: { trainerUserId: actorUserId } } },
          ],
        },
      ],
    };
  }

  private programFilterWhere(query: TrainingProgramListQuery): Prisma.TrainingProgramWhereInput {
    return {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private programOrderBy(
    query: TrainingProgramListQuery,
  ): Prisma.TrainingProgramOrderByWithRelationInput[] {
    return [{ [query.sortBy]: query.sortDirection }, { id: 'asc' }];
  }

  private async findVisibleProgram(
    programId: string,
    actorUserId: string,
    access: TrainingAccess,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<ProgramRecord> {
    const program = await transaction.trainingProgram.findFirst({
      where: { id: programId, ...this.visibleProgramWhere(actorUserId, access) },
    });
    if (!program) {
      throw notFound('TRAINING_PROGRAM_NOT_FOUND', 'Training program was not found.');
    }
    return program;
  }

  private async findSessionForProgram(
    programId: string,
    sessionId: string,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<SessionRecord> {
    // Nested parent integrity: a session is only reachable through its own program.
    const session = await transaction.trainingSession.findFirst({
      where: { id: sessionId, trainingProgramId: programId },
    });
    if (!session) {
      throw notFound('TRAINING_SESSION_NOT_FOUND', 'Training session was not found.');
    }
    return session;
  }

  private async findEnrollmentForProgram(
    programId: string,
    enrollmentId: string,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<EnrollmentRecord> {
    const enrollment = await transaction.trainingEnrollment.findFirst({
      where: { id: enrollmentId, trainingProgramId: programId },
    });
    if (!enrollment) {
      throw notFound('TRAINING_ENROLLMENT_NOT_FOUND', 'Training enrollment was not found.');
    }
    return enrollment;
  }

  private async findParticipationForSession(
    sessionId: string,
    participationId: string,
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<ParticipationRecord> {
    const participation = await transaction.trainingSessionParticipation.findFirst({
      where: { id: participationId, trainingSessionId: sessionId },
    });
    if (!participation) {
      throw notFound(
        'TRAINING_PARTICIPATION_NOT_FOUND',
        'Training session participation was not found.',
      );
    }
    return participation;
  }

  // ----------------------------------------------------------------------------
  // Locking helpers (program -> session -> enrollment -> participation)
  // ----------------------------------------------------------------------------

  private async withProgramLock<T>(
    programId: string,
    actorUserId: string,
    access: TrainingAccess,
    callback: (transaction: PrismaTransaction, program: ProgramRecord) => Promise<T>,
    options: { allowArchived?: boolean } = {},
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "TrainingProgram" WHERE id = ${programId}::uuid FOR UPDATE`;
      const program = await this.findVisibleProgram(programId, actorUserId, access, transaction);
      if (!options.allowArchived) {
        this.assertProgramMutable(program);
      }
      return callback(transaction, program);
    });
  }

  private async withSessionLock<T>(
    programId: string,
    sessionId: string,
    actorUserId: string,
    access: TrainingAccess,
    callback: (
      transaction: PrismaTransaction,
      program: ProgramRecord,
      session: SessionRecord,
    ) => Promise<T>,
    options: { allowArchivedProgram?: boolean } = {},
  ): Promise<T> {
    return this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, program) => {
        await transaction.$queryRaw`SELECT id FROM "TrainingSession" WHERE id = ${sessionId}::uuid FOR UPDATE`;
        const session = await this.findSessionForProgram(programId, sessionId, transaction);
        return callback(transaction, program, session);
      },
      { allowArchived: options.allowArchivedProgram },
    );
  }

  private async withEnrollmentLock<T>(
    programId: string,
    enrollmentId: string,
    actorUserId: string,
    access: TrainingAccess,
    callback: (
      transaction: PrismaTransaction,
      program: ProgramRecord,
      enrollment: EnrollmentRecord,
    ) => Promise<T>,
    options: { allowArchivedProgram?: boolean } = {},
  ): Promise<T> {
    return this.withProgramLock(
      programId,
      actorUserId,
      access,
      async (transaction, program) => {
        await transaction.$queryRaw`SELECT id FROM "TrainingEnrollment" WHERE id = ${enrollmentId}::uuid FOR UPDATE`;
        const enrollment = await this.findEnrollmentForProgram(
          programId,
          enrollmentId,
          transaction,
        );
        return callback(transaction, program, enrollment);
      },
      { allowArchived: options.allowArchivedProgram },
    );
  }

  private async withParticipationLock<T>(
    programId: string,
    sessionId: string,
    participationId: string,
    actorUserId: string,
    access: TrainingAccess,
    callback: (
      transaction: PrismaTransaction,
      program: ProgramRecord,
      session: SessionRecord,
      participation: ParticipationRecord,
    ) => Promise<T>,
    options: { allowArchivedProgram?: boolean } = {},
  ): Promise<T> {
    return this.withSessionLock(
      programId,
      sessionId,
      actorUserId,
      access,
      async (transaction, program, session) => {
        await transaction.$queryRaw`SELECT id FROM "TrainingSessionParticipation" WHERE id = ${participationId}::uuid FOR UPDATE`;
        const participation = await this.findParticipationForSession(
          sessionId,
          participationId,
          transaction,
        );
        return callback(transaction, program, session, participation);
      },
      { allowArchivedProgram: options.allowArchivedProgram },
    );
  }

  // ----------------------------------------------------------------------------
  // Validation helpers
  // ----------------------------------------------------------------------------

  private assertProgramMutable(program: ProgramRecord): void {
    if (program.status === TrainingProgramStatus.PROGRAM_ARCHIVED || program.archivedAt) {
      throw conflict('TRAINING_PROGRAM_ARCHIVED', 'Archived training programs cannot be changed.');
    }
  }

  /**
   * Attendance may only be recorded or corrected while the session is scheduled, in
   * progress, or completed. Planned and postponed sessions are not being delivered,
   * and canceled or archived sessions have frozen history, so both fail closed.
   */
  private assertSessionAcceptsAttendance(session: SessionRecord): void {
    if (session.archivedAt || !ATTENDANCE_RECORDING_SESSION_STATUSES.includes(session.status)) {
      throw conflict(
        'TRAINING_SESSION_NOT_ACCEPTING_ATTENDANCE',
        'This training session does not accept attendance changes in its current state.',
      );
    }
  }

  private assertParticipationMutable(participation: ParticipationRecord): void {
    if (
      participation.archivedAt ||
      participation.status === TrainingSessionParticipationStatus.PARTICIPATION_ARCHIVED
    ) {
      throw conflict(
        'TRAINING_PARTICIPATION_NOT_MUTABLE',
        'Archived training participation cannot be changed.',
      );
    }
  }

  /** True when an ordinary same-status request would rewrite recorded attendance detail. */
  private attendanceDetailsWouldChange(
    current: ParticipationRecord,
    input: TrainingAttendanceUpdateRequest,
  ): boolean {
    return (
      (input.sessionOutcome !== undefined && input.sessionOutcome !== current.sessionOutcome) ||
      (input.completionStatus !== undefined &&
        input.completionStatus !== current.completionStatus) ||
      (input.trainerNotes !== undefined && input.trainerNotes !== current.trainerNotes)
    );
  }

  private assertProgramAcceptsOperations(program: ProgramRecord): void {
    this.assertProgramMutable(program);
    if (program.status === TrainingProgramStatus.PROGRAM_CLOSED) {
      throw conflict(
        'TRAINING_PROGRAM_CLOSED',
        'Closed training programs no longer accept training operations.',
      );
    }
  }

  private async assertClientContextAllowed(
    clientId: string,
    access: TrainingAccess,
    transaction: PrismaService | PrismaTransaction,
  ): Promise<void> {
    if (!access.clientsView) {
      throw forbidden(
        'TRAINING_CLIENT_SCOPE_REQUIRED',
        'Client scope is required to link training to a client.',
      );
    }
    const client = await transaction.client.findUnique({ where: { id: clientId } });
    if (!client || client.status === ClientStatus.ARCHIVED || client.archivedAt) {
      throw badRequest(
        'TRAINING_CLIENT_CONTEXT_INVALID',
        'The linked client context is invalid or archived.',
      );
    }
  }

  private async assertInternalUserActive(
    userId: string,
    code: string,
    transaction: PrismaService | PrismaTransaction,
  ): Promise<void> {
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.archivedAt ||
      user.userType !== UserType.INTERNAL
    ) {
      throw badRequest(code, 'The selected internal user is not an active platform user.');
    }
  }

  /**
   * Participant eligibility.
   *
   * Training permissions must never become an alternate way to discover or link a
   * confidential source record, so each participant type first requires that source
   * domain's own authoritative read authorization:
   *
   * - `CANDIDATE` requires `candidates:view`, the capability the merged candidate
   *   module uses for candidate reads.
   * - `CLIENT_CONTACT` requires `clients:view` plus `client_contacts:view`, matching
   *   the merged nested client-contact read route, and the contact must still belong
   *   to a client-linked program's own client.
   * - `USER` follows the merged mission-assignment precedent, which references active
   *   internal users by id without requiring `users:view`. Inventing a broader
   *   permission here would diverge from that merged model.
   * - `EXTERNAL` participants are owned by training itself. No other module owns
   *   `ExternalTrainingParticipant`, so the training capability is authoritative and
   *   there is no cross-domain disclosure.
   *
   * When the actor lacks the source capability the request fails closed with one
   * identical response, so a caller can never distinguish a nonexistent id from an
   * archived, inactive, or out-of-context one. When the actor does hold the source
   * capability, specific reasons are returned because that actor can already read the
   * record directly.
   */
  private async assertParticipantEligible(
    input: TrainingEnrollmentCreateRequest,
    program: ProgramRecord,
    access: TrainingAccess,
    transaction: PrismaTransaction,
  ): Promise<void> {
    switch (input.participantType) {
      case 'CANDIDATE': {
        this.assertSourceRecordAccess(access.candidatesView);
        const candidate = await transaction.candidate.findUnique({
          where: { id: input.candidateId! },
        });
        if (!candidate) {
          throw badRequest(
            'TRAINING_PARTICIPANT_NOT_FOUND',
            'The training participant was not found.',
          );
        }
        if (candidate.status === CandidateStatus.ARCHIVED || candidate.archivedAt) {
          throw conflict(
            'TRAINING_PARTICIPANT_ARCHIVED',
            'Archived candidates cannot be enrolled in training.',
          );
        }
        if (candidate.status !== CandidateStatus.ACTIVE) {
          throw conflict(
            'TRAINING_PARTICIPANT_INELIGIBLE',
            'Only an active candidate can be enrolled in training.',
          );
        }
        return;
      }
      case 'USER': {
        await this.assertInternalUserActive(
          input.userId!,
          'TRAINING_PARTICIPANT_INELIGIBLE',
          transaction,
        );
        return;
      }
      case 'CLIENT_CONTACT': {
        this.assertSourceRecordAccess(access.clientsView && access.clientContactsView);
        const contact = await transaction.clientContact.findUnique({
          where: { id: input.clientContactId! },
        });
        if (!contact) {
          throw badRequest(
            'TRAINING_PARTICIPANT_NOT_FOUND',
            'The training participant was not found.',
          );
        }
        if (contact.status === ClientContactStatus.ARCHIVED || contact.archivedAt) {
          throw conflict(
            'TRAINING_PARTICIPANT_ARCHIVED',
            'Archived client contacts cannot be enrolled in training.',
          );
        }
        if (contact.status !== ClientContactStatus.ACTIVE) {
          throw conflict(
            'TRAINING_PARTICIPANT_INELIGIBLE',
            'Only an active client contact can be enrolled in training.',
          );
        }
        // Cross-context participant links are rejected: a client-linked program may
        // only enroll contacts of its own client.
        if (program.clientId !== null && contact.clientId !== program.clientId) {
          throw badRequest(
            'TRAINING_PARTICIPANT_CONTEXT_MISMATCH',
            'The client contact does not belong to the training program client context.',
          );
        }
        return;
      }
      case 'EXTERNAL': {
        const participant = await transaction.externalTrainingParticipant.findUnique({
          where: { id: input.externalTrainingParticipantId! },
        });
        if (!participant) {
          throw badRequest(
            'TRAINING_PARTICIPANT_NOT_FOUND',
            'The training participant was not found.',
          );
        }
        if (participant.status === ExternalParticipantStatus.ARCHIVED || participant.archivedAt) {
          throw conflict(
            'TRAINING_PARTICIPANT_ARCHIVED',
            'Archived external participants cannot be enrolled in training.',
          );
        }
        if (participant.status !== ExternalParticipantStatus.ACTIVE) {
          throw conflict(
            'TRAINING_PARTICIPANT_INELIGIBLE',
            'Only an active external participant can be enrolled in training.',
          );
        }
        return;
      }
      default: {
        throw badRequest(
          'TRAINING_PARTICIPANT_TYPE_UNSUPPORTED',
          'The training participant type is not supported.',
        );
      }
    }
  }

  /**
   * Fails closed before any source-record lookup, so the response is identical whether
   * or not the referenced record exists.
   */
  private assertSourceRecordAccess(hasSourceAccess: boolean): void {
    if (!hasSourceAccess) {
      throw forbidden(
        'TRAINING_PARTICIPANT_SOURCE_SCOPE_REQUIRED',
        'Source-record read access is required for this participant type.',
      );
    }
  }

  private mapUniqueViolation(error: unknown, code: string, message: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      return conflict(code, message);
    }
    return error;
  }

  private toProgramSummary(program: ProgramRecord, access: TrainingAccess): TrainingProgramSummary {
    return {
      id: program.id,
      reference: program.reference,
      name: program.name,
      description: program.description,
      targetAudience: program.targetAudience,
      status: program.status,
      ownerUserId: program.ownerUserId,
      // Client context is only disclosed to actors who may read client records.
      clientId: access.clientsView ? program.clientId : null,
      plannedStartDate: isoOrNull(program.plannedStartDate),
      plannedEndDate: isoOrNull(program.plannedEndDate),
      archivedAt: isoOrNull(program.archivedAt),
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
    };
  }
}

function toSessionSummary(session: SessionRecord): TrainingSessionSummary {
  return {
    id: session.id,
    trainingProgramId: session.trainingProgramId,
    title: session.title,
    sequence: session.sequence,
    scheduledAt: session.scheduledAt.toISOString(),
    scheduledEndAt: session.scheduledEndAt.toISOString(),
    deliveryMode: session.deliveryMode,
    trainerUserId: session.trainerUserId,
    location: session.location,
    meetingUrl: session.meetingUrl,
    status: session.status,
    outcome: session.outcome,
    rescheduleCount: session.rescheduleCount,
    previousScheduledAt: isoOrNull(session.previousScheduledAt),
    lastRescheduledAt: isoOrNull(session.lastRescheduledAt),
    lastRescheduleReason: session.lastRescheduleReason,
    canceledAt: isoOrNull(session.canceledAt),
    cancellationReason: session.cancellationReason,
    archivedAt: isoOrNull(session.archivedAt),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * Shapes an enrollment for the caller.
 *
 * Source-record identifiers are redacted unless the caller independently satisfies the
 * owning domain's read authorization, so a training read can never disclose a
 * confidential CRM identifier that the caller could not obtain directly.
 * `participantType` stays visible because it is training metadata and identifies no
 * source record.
 */
function toEnrollmentSummary(
  enrollment: EnrollmentRecord,
  access: TrainingAccess,
): TrainingEnrollmentSummary {
  return {
    id: enrollment.id,
    trainingProgramId: enrollment.trainingProgramId,
    participantType: enrollment.participantType,
    participant: {
      candidateId: access.candidatesView ? enrollment.candidateId : null,
      userId: enrollment.userId,
      clientContactId:
        access.clientsView && access.clientContactsView ? enrollment.clientContactId : null,
      externalTrainingParticipantId: enrollment.externalTrainingParticipantId,
    },
    status: enrollment.status,
    enrolledAt: isoOrNull(enrollment.enrolledAt),
    withdrawnAt: isoOrNull(enrollment.withdrawnAt),
    withdrawalReason: enrollment.withdrawalReason,
    completedAt: isoOrNull(enrollment.completedAt),
    certificateStatus: enrollment.certificateStatus,
    certificateReady: isCertificateReady(enrollment),
    createdByUserId: enrollment.createdByUserId,
    archivedAt: isoOrNull(enrollment.archivedAt),
    createdAt: enrollment.createdAt.toISOString(),
    updatedAt: enrollment.updatedAt.toISOString(),
  };
}

function toParticipationSummary(
  participation: ParticipationRecord,
  includeTrainerNotes: boolean,
): TrainingParticipationSummary {
  return {
    id: participation.id,
    trainingSessionId: participation.trainingSessionId,
    trainingEnrollmentId: participation.trainingEnrollmentId,
    status: participation.status,
    attendanceRecordedAt: isoOrNull(participation.attendanceRecordedAt),
    recordedByUserId: participation.recordedByUserId,
    sessionOutcome: participation.sessionOutcome,
    completionStatus: participation.completionStatus,
    trainerNotes: includeTrainerNotes ? participation.trainerNotes : null,
    correctionCount: participation.correctionCount,
    lastCorrectedAt: isoOrNull(participation.lastCorrectedAt),
    lastCorrectionReason: participation.lastCorrectionReason,
    archivedAt: isoOrNull(participation.archivedAt),
    createdAt: participation.createdAt.toISOString(),
    updatedAt: participation.updatedAt.toISOString(),
  };
}

/**
 * The durable certificate-readiness boundary.
 *
 * True means the enrollment recorded its required training and evaluation criteria,
 * is still a live record, and a certificate is actually expected but not yet issued.
 *
 * `NOT_APPLICABLE` is the domain's way of saying this enrollment is not meant to
 * receive a certificate at all, so it is never certificate-ready. Applicability is set
 * explicitly through the certificate-status action rather than assumed, because not
 * every training program awards a certificate. A later document-generation feature
 * consumes this flag; this module never renders or distributes a certificate file.
 */
function isCertificateReady(enrollment: EnrollmentRecord): boolean {
  return (
    enrollment.completedAt !== null &&
    enrollment.archivedAt === null &&
    enrollment.withdrawnAt === null &&
    enrollment.certificateStatus === CertificateStatus.PENDING
  );
}

function participantIdentifier(input: TrainingEnrollmentCreateRequest): string {
  switch (input.participantType) {
    case 'CANDIDATE':
      return input.candidateId!;
    case 'USER':
      return input.userId!;
    case 'CLIENT_CONTACT':
      return input.clientContactId!;
    default:
      return input.externalTrainingParticipantId!;
  }
}

/**
 * The active-slot key. It is populated only while the enrollment occupies the
 * participant's active place in the program, and released (set to NULL) on
 * withdrawal, terminal status, or archival. PostgreSQL treats NULLs as distinct,
 * so the unique index blocks concurrent duplicate active enrollment while keeping
 * every historical enrollment row.
 */
function activeParticipantKey(participantType: string, participantId: string): string {
  return `${participantType}:${participantId}`;
}

function normalizeReference(reference: string): string {
  return reference.trim().toLowerCase();
}

function toDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(value);
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
