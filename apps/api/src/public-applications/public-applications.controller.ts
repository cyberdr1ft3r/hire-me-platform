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
import type { Request } from 'express';
import {
  assertCandidateOrigin,
  candidateSessionCookie,
} from '../candidate-portal/candidate-portal.controller.js';
import { CandidatePortalService } from '../candidate-portal/candidate-portal.service.js';

@Controller('v1/public/opportunities')
export class PublicApplicationsController {
  constructor(
    @Inject(PublicApplicationsService) private readonly service: PublicApplicationsService,
    @Inject(CandidatePortalService) private readonly portal: CandidatePortalService,
  ) {}

  @Get()
  async listPublicOpportunities() {
    return PublicOpportunityListResponseSchema.parse({
      ...(await this.service.listPublicOpportunities()),
      ...(this.portal.enabled() ? { candidateAuthenticationRequired: true } : {}),
    });
  }

  @Get(':publicSlug')
  async getPublicOpportunity(@Param('publicSlug') publicSlug: string) {
    const detail = await this.service.getPublicOpportunity(publicSlug);
    return PublicOpportunityDetailResponseSchema.parse({
      ...detail,
      ...(this.portal.enabled() ? { candidateAuthenticationRequired: true } : {}),
    });
  }

  @Post(':publicSlug/applications')
  @HttpCode(HttpStatus.OK)
  async submitApplication(
    @Param('publicSlug') publicSlug: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const owner = this.portal.enabled() ? await this.authenticatedCandidate(request) : undefined;
    const parsed = PublicApplicationSubmitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_PUBLIC_APPLICATION_REQUEST', 'Invalid application request.');
    }
    return PublicApplicationSubmitResponseSchema.parse(
      await this.service.submitApplication(
        publicSlug,
        owner ? { ...parsed.data, email: owner.email } : parsed.data,
        this.getContext(request),
        owner?.id,
      ),
    );
  }

  private authenticatedCandidate(request: Request) {
    assertCandidateOrigin(request);
    return this.portal.requireSession(candidateSessionCookie(request));
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
