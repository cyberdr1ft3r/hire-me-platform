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
  TrainingAttendanceCorrectionRequestSchema,
  TrainingAttendanceUpdateRequestSchema,
  TrainingEnrollmentCreateRequestSchema,
  TrainingEnrollmentDetailResponseSchema,
  TrainingEnrollmentListQuerySchema,
  TrainingEnrollmentListResponseSchema,
  TrainingEnrollmentStatusUpdateRequestSchema,
  TrainingEnrollmentWithdrawRequestSchema,
  TrainingParticipationCreateRequestSchema,
  TrainingParticipationDetailResponseSchema,
  TrainingParticipationListQuerySchema,
  TrainingParticipationListResponseSchema,
  TrainingProgramCreateRequestSchema,
  TrainingProgramDetailResponseSchema,
  TrainingProgramListQuerySchema,
  TrainingProgramListResponseSchema,
  TrainingProgramStatusUpdateRequestSchema,
  TrainingProgramUpdateRequestSchema,
  TrainingSessionCancelRequestSchema,
  TrainingSessionCreateRequestSchema,
  TrainingSessionDetailResponseSchema,
  TrainingSessionListQuerySchema,
  TrainingSessionListResponseSchema,
  TrainingSessionRescheduleRequestSchema,
  TrainingSessionStatusUpdateRequestSchema,
  TrainingSessionUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { TRAINING_PERMISSIONS } from './training-permissions.js';
import { badRequest } from './training.errors.js';
import { TrainingService } from './training.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

/**
 * Internal training operations endpoints.
 *
 * Sessions, enrollments, and participation are nested under their training program
 * so that the parent chain is verified server-side on every request. A session or
 * enrollment identifier from a different program resolves to a not-found result
 * rather than leaking or mutating another program's records.
 */
@Controller('v1/training')
@UseGuards(AuthGuard, PermissionGuard)
export class TrainingController {
  constructor(@Inject(TrainingService) private readonly training: TrainingService) {}

  // --- Programs ---------------------------------------------------------------

  @Get('programs')
  @RequirePermissions(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW)
  async listPrograms(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = TrainingProgramListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_TRAINING_PROGRAM_LIST_QUERY', 'Invalid training program query.');
    }

    return TrainingProgramListResponseSchema.parse(
      await this.training.listPrograms(parsed.data, request.user!.id),
    );
  }

  @Post('programs')
  @RequirePermissions(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_MANAGE)
  async createProgram(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = TrainingProgramCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_TRAINING_PROGRAM_REQUEST',
        'Invalid create training program request.',
      );
    }

    return TrainingProgramDetailResponseSchema.parse(
      await this.training.createProgram(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get('programs/:programId')
  @RequirePermissions(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW)
  async getProgram(@Param('programId') programId: string, @Req() request: RequestWithUser) {
    return TrainingProgramDetailResponseSchema.parse(
      await this.training.getProgram(this.uuid(programId), request.user!.id),
    );
  }

  @Patch('programs/:programId')
  @RequirePermissions(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_MANAGE)
  async updateProgram(
    @Param('programId') programId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingProgramUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_UPDATE_TRAINING_PROGRAM_REQUEST',
        'Invalid update training program request.',
      );
    }

    return TrainingProgramDetailResponseSchema.parse(
      await this.training.updateProgram(
        this.uuid(programId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/status')
  @RequirePermissions(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_STATUS_MANAGE)
  async updateProgramStatus(
    @Param('programId') programId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingProgramStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_PROGRAM_STATUS_REQUEST',
        'Invalid training program status request.',
      );
    }

    return TrainingProgramDetailResponseSchema.parse(
      await this.training.updateProgramStatus(
        this.uuid(programId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/archive')
  @RequirePermissions(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_ARCHIVE)
  async archiveProgram(@Param('programId') programId: string, @Req() request: RequestWithUser) {
    return TrainingProgramDetailResponseSchema.parse(
      await this.training.archiveProgram(
        this.uuid(programId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  // --- Sessions ---------------------------------------------------------------

  @Get('programs/:programId/sessions')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_VIEW,
  )
  async listSessions(
    @Param('programId') programId: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingSessionListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_TRAINING_SESSION_LIST_QUERY', 'Invalid training session query.');
    }

    return TrainingSessionListResponseSchema.parse(
      await this.training.listSessions(this.uuid(programId), parsed.data, request.user!.id),
    );
  }

  @Post('programs/:programId/sessions')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_MANAGE,
  )
  async createSession(
    @Param('programId') programId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingSessionCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_TRAINING_SESSION_REQUEST',
        'Invalid create training session request.',
      );
    }

    return TrainingSessionDetailResponseSchema.parse(
      await this.training.createSession(
        this.uuid(programId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('programs/:programId/sessions/:sessionId')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_VIEW,
  )
  async getSession(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithUser,
  ) {
    return TrainingSessionDetailResponseSchema.parse(
      await this.training.getSession(this.uuid(programId), this.uuid(sessionId), request.user!.id),
    );
  }

  @Patch('programs/:programId/sessions/:sessionId')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_MANAGE,
  )
  async updateSession(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingSessionUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_UPDATE_TRAINING_SESSION_REQUEST',
        'Invalid update training session request.',
      );
    }

    return TrainingSessionDetailResponseSchema.parse(
      await this.training.updateSession(
        this.uuid(programId),
        this.uuid(sessionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/sessions/:sessionId/reschedule')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_MANAGE,
  )
  async rescheduleSession(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingSessionRescheduleRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_SESSION_RESCHEDULE_REQUEST',
        'Invalid training session reschedule request.',
      );
    }

    return TrainingSessionDetailResponseSchema.parse(
      await this.training.rescheduleSession(
        this.uuid(programId),
        this.uuid(sessionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/sessions/:sessionId/status')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_MANAGE,
  )
  async updateSessionStatus(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingSessionStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_SESSION_STATUS_REQUEST',
        'Invalid training session status request.',
      );
    }

    return TrainingSessionDetailResponseSchema.parse(
      await this.training.updateSessionStatus(
        this.uuid(programId),
        this.uuid(sessionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/sessions/:sessionId/cancel')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_MANAGE,
  )
  async cancelSession(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingSessionCancelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_SESSION_CANCEL_REQUEST',
        'A training session cancellation reason is required.',
      );
    }

    return TrainingSessionDetailResponseSchema.parse(
      await this.training.cancelSession(
        this.uuid(programId),
        this.uuid(sessionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/sessions/:sessionId/archive')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_ARCHIVE,
  )
  async archiveSession(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithUser,
  ) {
    return TrainingSessionDetailResponseSchema.parse(
      await this.training.archiveSession(
        this.uuid(programId),
        this.uuid(sessionId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  // --- Enrollments ------------------------------------------------------------

  @Get('programs/:programId/enrollments')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_VIEW,
  )
  async listEnrollments(
    @Param('programId') programId: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingEnrollmentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_ENROLLMENT_LIST_QUERY',
        'Invalid training enrollment query.',
      );
    }

    return TrainingEnrollmentListResponseSchema.parse(
      await this.training.listEnrollments(this.uuid(programId), parsed.data, request.user!.id),
    );
  }

  @Post('programs/:programId/enrollments')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_MANAGE,
  )
  async createEnrollment(
    @Param('programId') programId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingEnrollmentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_TRAINING_ENROLLMENT_REQUEST',
        'Invalid create training enrollment request.',
      );
    }

    return TrainingEnrollmentDetailResponseSchema.parse(
      await this.training.createEnrollment(
        this.uuid(programId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('programs/:programId/enrollments/:enrollmentId')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_VIEW,
  )
  async getEnrollment(
    @Param('programId') programId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Req() request: RequestWithUser,
  ) {
    return TrainingEnrollmentDetailResponseSchema.parse(
      await this.training.getEnrollment(
        this.uuid(programId),
        this.uuid(enrollmentId),
        request.user!.id,
      ),
    );
  }

  @Post('programs/:programId/enrollments/:enrollmentId/status')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_MANAGE,
  )
  async updateEnrollmentStatus(
    @Param('programId') programId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingEnrollmentStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_ENROLLMENT_STATUS_REQUEST',
        'Invalid training enrollment status request.',
      );
    }

    return TrainingEnrollmentDetailResponseSchema.parse(
      await this.training.updateEnrollmentStatus(
        this.uuid(programId),
        this.uuid(enrollmentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/enrollments/:enrollmentId/withdraw')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_MANAGE,
  )
  async withdrawEnrollment(
    @Param('programId') programId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingEnrollmentWithdrawRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_ENROLLMENT_WITHDRAW_REQUEST',
        'A training enrollment withdrawal reason is required.',
      );
    }

    return TrainingEnrollmentDetailResponseSchema.parse(
      await this.training.withdrawEnrollment(
        this.uuid(programId),
        this.uuid(enrollmentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/enrollments/:enrollmentId/archive')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_MANAGE,
  )
  async archiveEnrollment(
    @Param('programId') programId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Req() request: RequestWithUser,
  ) {
    return TrainingEnrollmentDetailResponseSchema.parse(
      await this.training.archiveEnrollment(
        this.uuid(programId),
        this.uuid(enrollmentId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  // --- Session participation and attendance -----------------------------------

  @Get('programs/:programId/sessions/:sessionId/participations')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_SESSIONS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_VIEW,
  )
  async listParticipations(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingParticipationListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_PARTICIPATION_LIST_QUERY',
        'Invalid training participation query.',
      );
    }

    return TrainingParticipationListResponseSchema.parse(
      await this.training.listParticipations(
        this.uuid(programId),
        this.uuid(sessionId),
        parsed.data,
        request.user!.id,
      ),
    );
  }

  @Post('programs/:programId/sessions/:sessionId/participations')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_MANAGE,
  )
  async createParticipation(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingParticipationCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_TRAINING_PARTICIPATION_REQUEST',
        'Invalid create training participation request.',
      );
    }

    return TrainingParticipationDetailResponseSchema.parse(
      await this.training.createParticipation(
        this.uuid(programId),
        this.uuid(sessionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('programs/:programId/sessions/:sessionId/participations/:participationId/attendance')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_MANAGE,
  )
  async updateAttendance(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Param('participationId') participationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingAttendanceUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_ATTENDANCE_REQUEST',
        'Invalid training attendance request.',
      );
    }

    return TrainingParticipationDetailResponseSchema.parse(
      await this.training.updateAttendance(
        this.uuid(programId),
        this.uuid(sessionId),
        this.uuid(participationId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  /**
   * Attendance correction is a separate, stricter capability than recording
   * attendance, because a correction rewrites already-recorded training history.
   */
  @Post('programs/:programId/sessions/:sessionId/participations/:participationId/correction')
  @RequirePermissions(
    TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW,
    TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_MANAGE,
    TRAINING_PERMISSIONS.TRAINING_PARTICIPATION_CORRECT,
  )
  async correctAttendance(
    @Param('programId') programId: string,
    @Param('sessionId') sessionId: string,
    @Param('participationId') participationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TrainingAttendanceCorrectionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TRAINING_ATTENDANCE_CORRECTION_REQUEST',
        'A training attendance correction reason is required.',
      );
    }

    return TrainingParticipationDetailResponseSchema.parse(
      await this.training.correctAttendance(
        this.uuid(programId),
        this.uuid(sessionId),
        this.uuid(participationId),
        parsed.data,
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
