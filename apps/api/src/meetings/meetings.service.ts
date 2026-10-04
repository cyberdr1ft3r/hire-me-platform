import { Inject, Injectable } from '@nestjs/common';
import type {
  MeetingCancelRequest,
  MeetingCompleteRequest,
  MeetingCreateRequest,
  MeetingDetailResponse,
  MeetingListQuery,
  MeetingListResponse,
  MeetingParticipantStatusUpdateRequest,
  MeetingScheduleUpdateRequest,
} from '@hire-me/contracts';

import { MEETING_PERMISSIONS } from './meeting-permissions.js';
import { badRequest, conflict, forbidden, notFound } from './meeting.errors.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  MeetingStatus,
  Prisma,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;

type MeetingRecord = Prisma.MeetingGetPayload<{
  include: typeof meetingInclude;
}>;

const meetingInclude = {
  organizer: { select: { displayName: true } },
  participants: {
    where: { archivedAt: null },
    include: { user: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.MeetingInclude;

type MeetingAccess = {
  view: boolean;
  create: boolean;
  manage: boolean;
};

@Injectable()
export class MeetingsService {
  constructor(
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listMeetings(actorUserId: string, query: MeetingListQuery): Promise<MeetingListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.view,
      'MEETINGS_VIEW_REQUIRED',
      'Meeting view permission is required.',
    );
    const filters: Prisma.MeetingWhereInput[] = [this.visibleMeetingWhere(actorUserId)];
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.from || query.to) {
      filters.push({
        scheduledStartAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    const where = { AND: filters };
    const pageSize = query.pageSize;
    const skip = (query.page - 1) * pageSize;
    const [meetings, total] = await this.prisma.$transaction([
      this.prisma.meeting.findMany({
        where,
        include: meetingInclude,
        orderBy: [{ scheduledStartAt: query.sortDirection }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.meeting.count({ where }),
    ]);
    return {
      meetings: meetings.map((meeting) => this.toSummary(meeting)),
      pageInfo: {
        page: query.page,
        pageSize,
        total,
        hasNextPage: skip + meetings.length < total,
      },
    };
  }

  async getMeeting(meetingId: string, actorUserId: string): Promise<MeetingDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.view,
      'MEETINGS_VIEW_REQUIRED',
      'Meeting view permission is required.',
    );
    const meeting = await this.requireVisibleMeeting(meetingId, actorUserId);
    return { meeting: this.toDetail(meeting) };
  }

  async createMeeting(
    input: MeetingCreateRequest,
    actorUserId: string,
  ): Promise<MeetingDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.create,
      'MEETINGS_CREATE_REQUIRED',
      'Meeting creation permission is required.',
    );
    const participantIds = [...new Set(input.participantUserIds)].filter(
      (userId) => userId !== actorUserId,
    );
    const start = new Date(input.scheduledStartAt);
    const end = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null;
    if (end && end.getTime() < start.getTime()) {
      throw badRequest('MEETING_INVALID_WINDOW', 'Meeting end must be after start.');
    }
    const meeting = await this.prisma.$transaction(async (tx) => {
      if (input.clientId) {
        await this.assertClientExists(tx, input.clientId);
      }
      await this.assertActiveInternalUsers(tx, [actorUserId, ...participantIds]);
      const created = await tx.meeting.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          scheduledStartAt: start,
          scheduledEndAt: end,
          timezone: input.timezone,
          location: input.location ?? null,
          meetingUrl: input.meetingUrl ?? null,
          organizerUserId: actorUserId,
          clientId: input.clientId ?? null,
          participants: {
            create: participantIds.map((userId) => ({ userId })),
          },
        },
        include: meetingInclude,
      });
      return created;
    });
    return { meeting: this.toDetail(meeting) };
  }

  async updateSchedule(
    meetingId: string,
    input: MeetingScheduleUpdateRequest,
    actorUserId: string,
  ): Promise<MeetingDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertManage(access, actorUserId, meetingId);
    const start = new Date(input.scheduledStartAt);
    const end = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null;
    if (end && end.getTime() < start.getTime()) {
      throw badRequest('MEETING_INVALID_WINDOW', 'Meeting end must be after start.');
    }
    const meeting = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockVisibleMeeting(tx, meetingId, actorUserId);
      this.assertMeetingWritable(existing);
      return tx.meeting.update({
        where: { id: meetingId },
        data: {
          scheduledStartAt: start,
          scheduledEndAt: end,
          timezone: input.timezone,
          location: input.location ?? null,
          meetingUrl: input.meetingUrl ?? null,
        },
        include: meetingInclude,
      });
    });
    return { meeting: this.toDetail(meeting) };
  }

  async cancelMeeting(
    meetingId: string,
    input: MeetingCancelRequest,
    actorUserId: string,
  ): Promise<MeetingDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertManage(access, actorUserId, meetingId);
    const meeting = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockVisibleMeeting(tx, meetingId, actorUserId);
      if (existing.status === MeetingStatus.COMPLETED) {
        throw conflict('MEETING_ALREADY_COMPLETED', 'Completed meetings cannot be canceled.');
      }
      if (existing.status === MeetingStatus.CANCELED) {
        return existing;
      }
      return tx.meeting.update({
        where: { id: meetingId },
        data: {
          status: MeetingStatus.CANCELED,
          canceledAt: new Date(),
          cancellationReason: input.reason,
        },
        include: meetingInclude,
      });
    });
    return { meeting: this.toDetail(meeting) };
  }

  async completeMeeting(
    meetingId: string,
    _input: MeetingCompleteRequest,
    actorUserId: string,
  ): Promise<MeetingDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertManage(access, actorUserId, meetingId);
    const meeting = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockVisibleMeeting(tx, meetingId, actorUserId);
      if (existing.status === MeetingStatus.CANCELED) {
        throw conflict('MEETING_CANCELED', 'Canceled meetings cannot be completed.');
      }
      if (existing.status === MeetingStatus.COMPLETED) {
        return existing;
      }
      return tx.meeting.update({
        where: { id: meetingId },
        data: { status: MeetingStatus.COMPLETED, completedAt: new Date() },
        include: meetingInclude,
      });
    });
    return { meeting: this.toDetail(meeting) };
  }

  async updateParticipantStatus(
    meetingId: string,
    participantId: string,
    input: MeetingParticipantStatusUpdateRequest,
    actorUserId: string,
  ): Promise<MeetingDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertAccess(
      access.view,
      'MEETINGS_VIEW_REQUIRED',
      'Meeting view permission is required.',
    );
    const meeting = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockVisibleMeeting(tx, meetingId, actorUserId);
      const participant = existing.participants.find((row) => row.id === participantId);
      if (!participant) {
        throw notFound('MEETING_PARTICIPANT_NOT_FOUND', 'Meeting participant was not found.');
      }
      const isOrganizer = existing.organizerUserId === actorUserId;
      const isSelf = participant.userId === actorUserId;
      if (!isSelf && !(isOrganizer && access.manage)) {
        throw forbidden(
          'MEETING_PARTICIPANT_STATUS_FORBIDDEN',
          'Only the participant or the organizing manager can update participation status.',
        );
      }
      await tx.meetingParticipant.update({
        where: { id: participantId },
        data: { status: input.status },
      });
      return tx.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: meetingInclude });
    });
    return { meeting: this.toDetail(meeting) };
  }

  visibleMeetingWhere(actorUserId: string): Prisma.MeetingWhereInput {
    return {
      archivedAt: null,
      OR: [
        { organizerUserId: actorUserId },
        {
          participants: {
            some: { userId: actorUserId, archivedAt: null },
          },
        },
      ],
    };
  }

  private async requireVisibleMeeting(
    meetingId: string,
    actorUserId: string,
  ): Promise<MeetingRecord> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, ...this.visibleMeetingWhere(actorUserId) },
      include: meetingInclude,
    });
    if (!meeting) {
      throw notFound('MEETING_NOT_FOUND', 'Meeting was not found.');
    }
    return meeting;
  }

  private async lockVisibleMeeting(
    tx: PrismaTransaction,
    meetingId: string,
    actorUserId: string,
  ): Promise<MeetingRecord> {
    await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id = ${meetingId}::uuid FOR UPDATE`;
    const meeting = await tx.meeting.findFirst({
      where: { id: meetingId, ...this.visibleMeetingWhere(actorUserId) },
      include: meetingInclude,
    });
    if (!meeting) {
      throw notFound('MEETING_NOT_FOUND', 'Meeting was not found.');
    }
    if (meeting.organizerUserId !== actorUserId) {
      const access = await this.resolveAccess(actorUserId);
      this.assertAccess(
        access.manage,
        'MEETINGS_MANAGE_REQUIRED',
        'Only the organizer with manage permission can change this meeting.',
      );
      throw forbidden(
        'MEETING_ORGANIZER_REQUIRED',
        'Only the meeting organizer can perform this action.',
      );
    }
    return meeting;
  }

  private assertManage(access: MeetingAccess, actorUserId: string, meetingId: string): void {
    this.assertAccess(
      access.manage,
      'MEETINGS_MANAGE_REQUIRED',
      'Meeting manage permission is required.',
    );
    void meetingId;
    void actorUserId;
  }

  private assertMeetingWritable(meeting: MeetingRecord): void {
    if (meeting.status === MeetingStatus.CANCELED || meeting.archivedAt) {
      throw conflict('MEETING_NOT_WRITABLE', 'Canceled or archived meetings cannot be changed.');
    }
  }

  private async assertClientExists(tx: PrismaTransaction, clientId: string): Promise<void> {
    const client = await tx.client.findFirst({ where: { id: clientId, archivedAt: null } });
    if (!client) {
      throw badRequest('MEETING_CLIENT_NOT_FOUND', 'Client was not found.');
    }
  }

  private async assertActiveInternalUsers(tx: PrismaTransaction, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !user ||
        user.status !== UserStatus.ACTIVE ||
        user.archivedAt ||
        user.userType !== UserType.INTERNAL
      ) {
        throw badRequest(
          'MEETING_USER_NOT_ELIGIBLE',
          'Participants must be active internal users.',
        );
      }
    }
  }

  private async resolveAccess(actorUserId: string): Promise<MeetingAccess> {
    const permissions = new Set(await this.permissions.getEffectivePermissionCodes(actorUserId));
    return {
      view: permissions.has(MEETING_PERMISSIONS.MEETINGS_VIEW),
      create: permissions.has(MEETING_PERMISSIONS.MEETINGS_CREATE),
      manage: permissions.has(MEETING_PERMISSIONS.MEETINGS_MANAGE),
    };
  }

  private assertAccess(condition: boolean, code: string, message: string): void {
    if (!condition) {
      throw forbidden(code, message);
    }
  }

  private toSummary(meeting: MeetingRecord) {
    return {
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      scheduledStartAt: meeting.scheduledStartAt.toISOString(),
      scheduledEndAt: meeting.scheduledEndAt?.toISOString() ?? null,
      timezone: meeting.timezone,
      location: meeting.location,
      meetingUrl: meeting.meetingUrl,
      organizerUserId: meeting.organizerUserId,
      organizerDisplayName: meeting.organizer.displayName,
      clientId: meeting.clientId,
      status: meeting.status,
      completedAt: meeting.completedAt?.toISOString() ?? null,
      canceledAt: meeting.canceledAt?.toISOString() ?? null,
      cancellationReason: meeting.cancellationReason,
      archivedAt: meeting.archivedAt?.toISOString() ?? null,
      participantCount: meeting.participants.length,
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString(),
    };
  }

  private toDetail(meeting: MeetingRecord) {
    return {
      ...this.toSummary(meeting),
      participants: meeting.participants.map((participant) => ({
        id: participant.id,
        meetingId: participant.meetingId,
        userId: participant.userId,
        userDisplayName: participant.user.displayName,
        status: participant.status,
        archivedAt: participant.archivedAt?.toISOString() ?? null,
        createdAt: participant.createdAt.toISOString(),
        updatedAt: participant.updatedAt.toISOString(),
      })),
    };
  }
}
