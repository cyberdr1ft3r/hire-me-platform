import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  PublicApplicationSubmitRequestSchema,
  PublicApplicationSubmitResponseSchema,
  PublicOpportunityDetailResponseSchema,
  PublicOpportunityListResponseSchema,
} from '@hire-me/contracts';

import { badRequest } from './public-application.errors.js';
import { PublicApplicationsService } from './public-applications.service.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';

@Controller('v1/public/opportunities')
export class PublicApplicationsController {
  constructor(
    @Inject(PublicApplicationsService) private readonly service: PublicApplicationsService,
  ) {}

  @Get()
  async listPublicOpportunities() {
    return PublicOpportunityListResponseSchema.parse(await this.service.listPublicOpportunities());
  }

  @Get(':publicSlug')
  async getPublicOpportunity(@Param('publicSlug') publicSlug: string) {
    return PublicOpportunityDetailResponseSchema.parse(
      await this.service.getPublicOpportunity(publicSlug),
    );
  }

  @Post(':publicSlug/applications')
  @HttpCode(HttpStatus.OK)
  async submitApplication(
    @Param('publicSlug') publicSlug: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PublicApplicationSubmitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_PUBLIC_APPLICATION_REQUEST', 'Invalid application request.');
    }
    return PublicApplicationSubmitResponseSchema.parse(
      await this.service.submitApplication(publicSlug, parsed.data, this.getContext(request)),
    );
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
