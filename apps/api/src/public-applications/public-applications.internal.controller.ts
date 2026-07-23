import { Body, Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';
import {
  InternalPublicApplicationListResponseSchema,
  InternalPublicOpportunityDetailResponseSchema,
  InternalPublicOpportunityUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { PUBLIC_APPLICATION_PERMISSIONS } from './public-application-permissions.js';
import { badRequest } from './public-application.errors.js';
import { PublicApplicationsService } from './public-applications.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/missions/:missionId/public-opportunity')
@UseGuards(AuthGuard, PermissionGuard)
export class InternalPublicApplicationsController {
  constructor(
    @Inject(PublicApplicationsService) private readonly service: PublicApplicationsService,
  ) {}

  @Get()
  @RequirePermissions(PUBLIC_APPLICATION_PERMISSIONS.PUBLIC_OPPORTUNITIES_VIEW)
  async getInternalOpportunity(@Param('missionId') missionId: string) {
    return InternalPublicOpportunityDetailResponseSchema.parse(
      await this.service.getInternalOpportunity(this.uuid(missionId)),
    );
  }

  @Patch()
  @RequirePermissions(PUBLIC_APPLICATION_PERMISSIONS.PUBLIC_OPPORTUNITIES_MANAGE)
  async updateInternalOpportunity(
    @Param('missionId') missionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InternalPublicOpportunityUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_PUBLIC_OPPORTUNITY_REQUEST', 'Invalid public opportunity request.');
    }
    return InternalPublicOpportunityDetailResponseSchema.parse(
      await this.service.updateInternalOpportunity(
        this.uuid(missionId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('applications')
  @RequirePermissions(PUBLIC_APPLICATION_PERMISSIONS.PUBLIC_APPLICATIONS_VIEW)
  async listInternalApplications(@Param('missionId') missionId: string) {
    return InternalPublicApplicationListResponseSchema.parse(
      await this.service.listInternalApplications(this.uuid(missionId)),
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
