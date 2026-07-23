import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  EvaluationCreateRequestSchema,
  EvaluationDetailResponseSchema,
  EvaluationListQuerySchema,
  EvaluationListResponseSchema,
  EvaluationUpdateRequestSchema,
  InterviewCancellationRequestSchema,
  InterviewCompletionRequestSchema,
  InterviewDetailResponseSchema,
  InterviewListQuerySchema,
  InterviewListResponseSchema,
  InterviewParticipantCreateRequestSchema,
  InterviewPostponeRequestSchema,
  InterviewRescheduleRequestSchema,
  InterviewScheduleRequestSchema,
  MissionAssignmentCreateRequestSchema,
  MissionAssignmentDetailResponseSchema,
  MissionAssignmentListQuerySchema,
  MissionAssignmentListResponseSchema,
  MissionAssignmentUpdateRequestSchema,
  MissionCandidateCreateRequestSchema,
  MissionCandidateDetailResponseSchema,
  MissionCandidateIntegrationConfirmationRequestSchema,
  MissionCandidateListQuerySchema,
  MissionCandidateListResponseSchema,
  MissionCandidatePresentationRequestSchema,
  MissionCandidateTransferRequestSchema,
  MissionCandidateTransitionRequestSchema,
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
import { MissionCandidatesService } from './mission-candidates.service.js';
import { MissionInterviewsService } from './mission-interviews.service.js';
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
  constructor(
    @Inject(MissionCandidatesService)
    private readonly missionCandidates: MissionCandidatesService,
    @Inject(MissionInterviewsService)
    private readonly missionInterviews: MissionInterviewsService,
    @Inject(MissionsService) private readonly missions: MissionsService,
  ) {}

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

  @Get(':missionId/candidates')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_VIEW)
  async listMissionCandidates(
    @Param('missionId') missionId: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionCandidateListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_MISSION_CANDIDATE_LIST_QUERY',
        'Invalid mission candidate list query.',
      );
    }

    return MissionCandidateListResponseSchema.parse(
      await this.missionCandidates.listMissionCandidates(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_CREATE)
  async createMissionCandidate(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionCandidateCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_MISSION_CANDIDATE_REQUEST',
        'Invalid mission candidate request.',
      );
    }

    return MissionCandidateDetailResponseSchema.parse(
      await this.missionCandidates.createMissionCandidate(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':missionId/candidates/:processId')
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_VIEW)
  async getMissionCandidate(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Req() request: RequestWithUser,
  ) {
    return MissionCandidateDetailResponseSchema.parse(
      await this.missionCandidates.getMissionCandidate(
        this.uuid(missionId),
        this.uuid(processId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSITION)
  async transitionMissionCandidate(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionCandidateTransitionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_MISSION_CANDIDATE_TRANSITION_REQUEST',
        'Invalid mission candidate transition request.',
      );
    }

    return MissionCandidateDetailResponseSchema.parse(
      await this.missionCandidates.transitionMissionCandidate(
        this.uuid(missionId),
        this.uuid(processId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/transfer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSFER)
  async transferResponsibleRecruiter(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionCandidateTransferRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_MISSION_CANDIDATE_TRANSFER_REQUEST',
        'Invalid mission candidate transfer request.',
      );
    }

    return MissionCandidateDetailResponseSchema.parse(
      await this.missionCandidates.transferResponsibleRecruiter(
        this.uuid(missionId),
        this.uuid(processId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/present')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_PRESENT)
  async presentMissionCandidate(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionCandidatePresentationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_MISSION_CANDIDATE_PRESENTATION_REQUEST',
        'Invalid mission candidate presentation request.',
      );
    }

    return MissionCandidateDetailResponseSchema.parse(
      await this.missionCandidates.presentMissionCandidate(
        this.uuid(missionId),
        this.uuid(processId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/confirm-integration')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.MISSION_CANDIDATES_INTEGRATION_CONFIRM)
  async confirmMissionCandidateIntegration(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = MissionCandidateIntegrationConfirmationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_MISSION_CANDIDATE_INTEGRATION_REQUEST',
        'Invalid mission candidate integration confirmation request.',
      );
    }

    return MissionCandidateDetailResponseSchema.parse(
      await this.missionCandidates.confirmIntegration(
        this.uuid(missionId),
        this.uuid(processId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':missionId/candidates/:processId/interviews')
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_VIEW)
  async listInterviews(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_LIST_QUERY', 'Invalid interview list query.');
    }

    return InterviewListResponseSchema.parse(
      await this.missionInterviews.listInterviews(
        this.uuid(missionId),
        this.uuid(processId),
        parsed.data,
        request.user!.id,
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews')
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_SCHEDULE)
  async scheduleInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewScheduleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_SCHEDULE_REQUEST', 'Invalid interview schedule request.');
    }

    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.scheduleInterview(
        this.uuid(missionId),
        this.uuid(processId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':missionId/candidates/:processId/interviews/:interviewId')
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_VIEW)
  async getInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Req() request: RequestWithUser,
  ) {
    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.getInterview(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        request.user!.id,
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/reschedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_RESCHEDULE)
  async rescheduleInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewRescheduleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_RESCHEDULE_REQUEST', 'Invalid reschedule request.');
    }

    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.rescheduleInterview(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/postpone')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_RESCHEDULE)
  async postponeInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewPostponeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_POSTPONE_REQUEST', 'Invalid postpone request.');
    }

    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.postponeInterview(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_COMPLETE)
  async completeInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewCompletionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_COMPLETION_REQUEST', 'Invalid completion request.');
    }

    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.completeInterview(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_CANCEL)
  async cancelInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewCancellationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_CANCELLATION_REQUEST', 'Invalid cancellation request.');
    }

    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.cancelInterview(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEWS_ARCHIVE)
  async archiveInterview(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Req() request: RequestWithUser,
  ) {
    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.archiveInterview(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/participants')
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEW_PARTICIPANTS_MANAGE)
  async addInterviewParticipant(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InterviewParticipantCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INTERVIEW_PARTICIPANT_REQUEST', 'Invalid participant request.');
    }

    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.addParticipant(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Delete(':missionId/candidates/:processId/interviews/:interviewId/participants/:participantId')
  @RequirePermissions(MISSION_PERMISSIONS.INTERVIEW_PARTICIPANTS_MANAGE)
  async removeInterviewParticipant(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Param('participantId') participantId: string,
    @Req() request: RequestWithUser,
  ) {
    return InterviewDetailResponseSchema.parse(
      await this.missionInterviews.removeParticipant(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        this.uuid(participantId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':missionId/candidates/:processId/interviews/:interviewId/evaluations')
  @RequirePermissions(MISSION_PERMISSIONS.EVALUATIONS_VIEW)
  async listEvaluations(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = EvaluationListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_EVALUATION_LIST_QUERY', 'Invalid evaluation list query.');
    }

    return EvaluationListResponseSchema.parse(
      await this.missionInterviews.listEvaluations(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
      ),
    );
  }

  @Post(':missionId/candidates/:processId/interviews/:interviewId/evaluations')
  @RequirePermissions(MISSION_PERMISSIONS.EVALUATIONS_CREATE)
  async createEvaluation(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = EvaluationCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_EVALUATION_CREATE_REQUEST', 'Invalid evaluation request.');
    }

    return EvaluationDetailResponseSchema.parse(
      await this.missionInterviews.createEvaluation(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':missionId/candidates/:processId/interviews/:interviewId/evaluations/:evaluationId')
  @RequirePermissions(MISSION_PERMISSIONS.EVALUATIONS_UPDATE)
  async updateEvaluation(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = EvaluationUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_EVALUATION_UPDATE_REQUEST', 'Invalid evaluation update request.');
    }

    return EvaluationDetailResponseSchema.parse(
      await this.missionInterviews.updateEvaluation(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        this.uuid(evaluationId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(
    ':missionId/candidates/:processId/interviews/:interviewId/evaluations/:evaluationId/finalize',
  )
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MISSION_PERMISSIONS.EVALUATIONS_FINALIZE)
  async finalizeEvaluation(
    @Param('missionId') missionId: string,
    @Param('processId') processId: string,
    @Param('interviewId') interviewId: string,
    @Param('evaluationId') evaluationId: string,
    @Req() request: RequestWithUser,
  ) {
    return EvaluationDetailResponseSchema.parse(
      await this.missionInterviews.finalizeEvaluation(
        this.uuid(missionId),
        this.uuid(processId),
        this.uuid(interviewId),
        this.uuid(evaluationId),
        request.user!.id,
        this.getContext(request),
      ),
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
