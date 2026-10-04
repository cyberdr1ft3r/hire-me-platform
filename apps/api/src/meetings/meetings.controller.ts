import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  MeetingCancelRequestSchema,
  MeetingCompleteRequestSchema,
  MeetingCreateRequestSchema,
  MeetingDetailResponseSchema,
  MeetingListQuerySchema,
  MeetingListResponseSchema,
  MeetingParticipantStatusUpdateRequestSchema,
  MeetingScheduleUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { MEETING_PERMISSIONS } from './meeting-permissions.js';
import { badRequest } from './meeting.errors.js';
import { MeetingsService } from './meetings.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/meetings')
@UseGuards(AuthGuard, PermissionGuard)
export class MeetingsController {
  constructor(@Inject(MeetingsService) private readonly meetings: MeetingsService) {}

  @Get()
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_VIEW)
  async listMeetings(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = MeetingListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw badRequest('INVALID_MEETING_LIST_QUERY', 'Invalid meeting list query.');
    }
    return MeetingListResponseSchema.parse(
      await this.meetings.listMeetings(request.user!.id, parsed.data),
    );
  }

  @Post()
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_CREATE)
  async createMeeting(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = MeetingCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_MEETING_CREATE_REQUEST', 'Invalid meeting create request.');
    }
    return MeetingDetailResponseSchema.parse(
      await this.meetings.createMeeting(parsed.data, request.user!.id),
    );
  }

  @Get(':meetingId')
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_VIEW)
  async getMeeting(@Param('meetingId') meetingId: string, @Req() request: RequestWithUser) {
    return MeetingDetailResponseSchema.parse(
      await this.meetings.getMeeting(this.uuid(meetingId), request.user!.id),
    );
  }

  @Patch(':meetingId/schedule')
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_MANAGE)
  async updateSchedule(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MeetingScheduleUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_MEETING_SCHEDULE_REQUEST', 'Invalid meeting schedule request.');
    }
    return MeetingDetailResponseSchema.parse(
      await this.meetings.updateSchedule(this.uuid(meetingId), parsed.data, request.user!.id),
    );
  }

  @Patch(':meetingId/cancel')
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_MANAGE)
  async cancelMeeting(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MeetingCancelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_MEETING_CANCEL_REQUEST', 'Invalid meeting cancel request.');
    }
    return MeetingDetailResponseSchema.parse(
      await this.meetings.cancelMeeting(this.uuid(meetingId), parsed.data, request.user!.id),
    );
  }

  @Patch(':meetingId/complete')
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_MANAGE)
  async completeMeeting(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MeetingCompleteRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw badRequest('INVALID_MEETING_COMPLETE_REQUEST', 'Invalid meeting complete request.');
    }
    return MeetingDetailResponseSchema.parse(
      await this.meetings.completeMeeting(this.uuid(meetingId), parsed.data, request.user!.id),
    );
  }

  @Patch(':meetingId/participants/:participantId/status')
  @RequirePermissions(MEETING_PERMISSIONS.MEETINGS_VIEW)
  async updateParticipantStatus(
    @Param('meetingId') meetingId: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MeetingParticipantStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_MEETING_PARTICIPANT_STATUS_REQUEST',
        'Invalid meeting participant status request.',
      );
    }
    return MeetingDetailResponseSchema.parse(
      await this.meetings.updateParticipantStatus(
        this.uuid(meetingId),
        this.uuid(participantId),
        parsed.data,
        request.user!.id,
      ),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_MEETING_ID', 'Meeting id must be a UUID.');
    }
    return parsed.data;
  }
}
