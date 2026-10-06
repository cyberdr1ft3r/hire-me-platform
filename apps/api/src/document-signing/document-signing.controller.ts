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
  UseGuards,
} from '@nestjs/common';
import {
  SigningCredentialCreateRequestSchema,
  SigningCredentialGrantCreateRequestSchema,
  SigningOrganizationCreateRequestSchema,
  SigningRequestApproveRequestSchema,
  SigningRequestAuditResponseSchema,
  SigningRequestCreateRequestSchema,
  SigningRequestDetailResponseSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { DocumentSigningService } from './document-signing.service.js';
import { signingBadRequest } from './document-signing.errors.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class DocumentSigningController {
  constructor(@Inject(DocumentSigningService) private readonly signing: DocumentSigningService) {}

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }

  @Post('signing/organizations')
  async createOrganization(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = SigningOrganizationCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw signingBadRequest('INVALID_SIGNING_ORGANIZATION', 'Invalid signing organization body.');
    }
    return this.signing.createOrganization(parsed.data, request.user!.id);
  }

  @Post('signing/credentials')
  async createCredential(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = SigningCredentialCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw signingBadRequest('INVALID_SIGNING_CREDENTIAL', 'Invalid signing credential body.');
    }
    return this.signing.createCredential(parsed.data, request.user!.id);
  }

  @Post('signing/credentials/:credentialId/grants')
  async createGrant(
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    if (!UuidParamSchema.safeParse(credentialId).success) {
      throw signingBadRequest('INVALID_CREDENTIAL_ID', 'Invalid credential id.');
    }
    const parsed = SigningCredentialGrantCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw signingBadRequest('INVALID_SIGNING_GRANT', 'Invalid signing grant body.');
    }
    return this.signing.createCredentialGrant(credentialId, parsed.data, request.user!.id);
  }

  @Post('documents/:documentId/versions/:versionId/signing-requests')
  async createSigningRequest(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    if (
      !UuidParamSchema.safeParse(documentId).success ||
      !UuidParamSchema.safeParse(versionId).success
    ) {
      throw signingBadRequest('INVALID_DOCUMENT_VERSION', 'Invalid document or version id.');
    }
    const parsed = SigningRequestCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw signingBadRequest('INVALID_SIGNING_REQUEST', 'Invalid signing request body.');
    }
    return SigningRequestDetailResponseSchema.parse(
      await this.signing.createSigningRequest(
        documentId,
        versionId,
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('signing/requests/:requestId')
  async getSigningRequest(@Param('requestId') requestId: string, @Req() request: RequestWithUser) {
    if (!UuidParamSchema.safeParse(requestId).success) {
      throw signingBadRequest('INVALID_SIGNING_REQUEST_ID', 'Invalid signing request id.');
    }
    return SigningRequestDetailResponseSchema.parse(
      await this.signing.getSigningRequest(requestId, request.user!.id),
    );
  }

  @Post('signing/requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  async approveSigningRequest(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    if (!UuidParamSchema.safeParse(requestId).success) {
      throw signingBadRequest('INVALID_SIGNING_REQUEST_ID', 'Invalid signing request id.');
    }
    const parsed = SigningRequestApproveRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw signingBadRequest('INVALID_SIGNING_APPROVAL', 'Invalid signing approval body.');
    }
    return SigningRequestDetailResponseSchema.parse(
      await this.signing.approveSigningRequest(
        requestId,
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('signing/requests/:requestId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelSigningRequest(
    @Param('requestId') requestId: string,
    @Req() request: RequestWithUser,
  ) {
    if (!UuidParamSchema.safeParse(requestId).success) {
      throw signingBadRequest('INVALID_SIGNING_REQUEST_ID', 'Invalid signing request id.');
    }
    return SigningRequestDetailResponseSchema.parse(
      await this.signing.cancelSigningRequest(
        requestId,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get('signing/requests/:requestId/audit')
  async listSigningAudit(@Param('requestId') requestId: string, @Req() request: RequestWithUser) {
    if (!UuidParamSchema.safeParse(requestId).success) {
      throw signingBadRequest('INVALID_SIGNING_REQUEST_ID', 'Invalid signing request id.');
    }
    return SigningRequestAuditResponseSchema.parse(
      await this.signing.listSigningAudit(requestId, request.user!.id),
    );
  }
}
