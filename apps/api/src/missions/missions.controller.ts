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
  MissionAssignmentCreateRequestSchema,
  MissionAssignmentDetailResponseSchema,
  MissionAssignmentListQuerySchema,
  MissionAssignmentListResponseSchema,
  MissionAssignmentUpdateRequestSchema,
  MissionClosureRequestSchema,
  MissionDetailResponseSchema,
  MissionLeadRecruiterRequestSchema,
  MissionListQuerySchema,
  MissionListResponseSchema,
  MissionStatusUpdateRequestSchema,
  MissionUpdateRequestSchema,
  MissionCreateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { badRequest } from './mission.errors.js';
import { MISSION_PERMISSIONS } from './mission-permissions.js';
import { MissionsService } from './missions.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/missions')
@UseGuards(AuthGuard, PermissionGuard)
export class MissionsController {
  constructor(@Inject(MissionsService) private readonly missions: MissionsService) {}

  @Get()
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_VIEW)
  async listMissions(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = MissionListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_MISSION_LIST_QUERY', 'Invalid mission list query.');
    }

    return MissionListResponseSchema.parse(
      await this.missions.listMissions(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Post()
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_CREATE)
  async createMission(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = MissionCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_MISSION_REQUEST', 'Invalid create mission request.');
    }

    return MissionDetailResponseSchema.parse(
      await this.missions.createMission(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get(':missionId')
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_VIEW)
  async getMission(@Param('missionId') missionId: string, @Req() request: RequestWithUser) {
    return MissionDetailResponseSchema.parse(
      await this.missions.getMission(
        this.uuid(missionId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':missionId')
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_UPDATE)
  async updateMission(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_MISSION_REQUEST', 'Invalid update mission request.');
    }

    return MissionDetailResponseSchema.parse(
      await this.missions.updateMission(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':missionId/status')
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_STATUS_MANAGE)
  async updateMissionStatus(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_MISSION_STATUS_REQUEST', 'Invalid mission status request.');
    }

    return MissionDetailResponseSchema.parse(
      await this.missions.updateMissionStatus(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/close')
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_CLOSURE_MANAGE)
  async closeMission(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionClosureRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_MISSION_CLOSURE_REQUEST', 'Invalid mission closure request.');
    }

    return MissionDetailResponseSchema.parse(
      await this.missions.closeMission(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/archive')
  @RequirePermissions(MISSION_PERMISSIONS.MISSIONS_ARCHIVE)
  async archiveMission(@Param('missionId') missionId: string, @Req() request: RequestWithUser) {
    return MissionDetailResponseSchema.parse(
      await this.missions.archiveMission(
        this.uuid(missionId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':missionId/assignments')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_ASSIGNMENTS_VIEW)
  async listAssignments(@Param('missionId') missionId: string, @Query() query: unknown) {
    const parsed = MissionAssignmentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_MISSION_ASSIGNMENT_LIST_QUERY', 'Invalid assignment list query.');
    }

    return MissionAssignmentListResponseSchema.parse(
      await this.missions.listAssignments(this.uuid(missionId), parsed.data),
    );
  }

  @Post(':missionId/assignments')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_ASSIGNMENTS_MANAGE)
  async createAssignment(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionAssignmentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_MISSION_ASSIGNMENT_REQUEST', 'Invalid assignment request.');
    }

    return MissionAssignmentDetailResponseSchema.parse(
      await this.missions.createAssignment(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':missionId/assignments/:assignmentId')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_ASSIGNMENTS_MANAGE)
  async updateAssignment(
    @Param('missionId') missionId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionAssignmentUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_MISSION_ASSIGNMENT_REQUEST', 'Invalid assignment request.');
    }

    return MissionAssignmentDetailResponseSchema.parse(
      await this.missions.updateAssignment(
        this.uuid(missionId),
        this.uuid(assignmentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/assignments/lead')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_ASSIGNMENTS_MANAGE)
  async setLeadRecruiter(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionLeadRecruiterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_MISSION_LEAD_RECRUITER_REQUEST', 'Invalid lead recruiter request.');
    }

    return MissionAssignmentDetailResponseSchema.parse(
      await this.missions.setLeadRecruiter(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/assignments/:assignmentId/archive')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_ASSIGNMENTS_MANAGE)
  async archiveAssignment(
    @Param('missionId') missionId: string,
    @Param('assignmentId') assignmentId: string,
    @Req() request: RequestWithUser,
  ) {
    return MissionAssignmentDetailResponseSchema.parse(
      await this.missions.archiveAssignment(
        this.uuid(missionId),
        this.uuid(assignmentId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid identifier.');
    }

    return parsed.data;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
