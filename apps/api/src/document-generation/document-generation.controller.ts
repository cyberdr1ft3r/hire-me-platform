import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  DocumentGenerationRequestSchema,
  DocumentGenerationResponseSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { GENERATION_PERMISSIONS } from './document-generation-permissions.js';
import { generationBadRequest } from './document-generation.errors.js';
import { DocumentGenerationService } from './document-generation.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

/**
 * Source-oriented generation endpoints.
 *
 * Generation is always requested against the authoritative business record, never
 * against a document identifier, so the source domain's own authorization is the entry
 * point and a document UUID can never be used to reach a hidden record.
 */
@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class DocumentGenerationController {
  constructor(
    @Inject(DocumentGenerationService) private readonly generation: DocumentGenerationService,
  ) {}

  @Post('commercial/quotations/:quotationId/generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(GENERATION_PERMISSIONS.DOCUMENTS_GENERATE)
  async generateQuotation(
    @Param('quotationId') quotationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return DocumentGenerationResponseSchema.parse(
      await this.generation.generateQuotation(
        this.uuid(quotationId),
        this.request(body),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('commercial/purchase-orders/:purchaseOrderId/generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(GENERATION_PERMISSIONS.DOCUMENTS_GENERATE)
  async generatePurchaseOrder(
    @Param('purchaseOrderId') purchaseOrderId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return DocumentGenerationResponseSchema.parse(
      await this.generation.generatePurchaseOrder(
        this.uuid(purchaseOrderId),
        this.request(body),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('commercial/contracts/:contractId/generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(GENERATION_PERMISSIONS.DOCUMENTS_GENERATE)
  async generateContract(
    @Param('contractId') contractId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return DocumentGenerationResponseSchema.parse(
      await this.generation.generateContract(
        this.uuid(contractId),
        this.request(body),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('commercial/invoices/:invoiceId/generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(GENERATION_PERMISSIONS.DOCUMENTS_GENERATE)
  async generateInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return DocumentGenerationResponseSchema.parse(
      await this.generation.generateInvoice(
        this.uuid(invoiceId),
        this.request(body),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('training/programs/:programId/enrollments/:enrollmentId/generate-certificate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(GENERATION_PERMISSIONS.DOCUMENTS_GENERATE)
  async generateTrainingCertificate(
    @Param('programId') programId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return DocumentGenerationResponseSchema.parse(
      await this.generation.generateTrainingCertificate(
        this.uuid(programId),
        this.uuid(enrollmentId),
        this.request(body),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  private request(body: unknown) {
    const parsed = DocumentGenerationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw generationBadRequest(
        'INVALID_DOCUMENT_GENERATION_REQUEST',
        'Invalid document generation request.',
      );
    }
    return parsed.data;
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw generationBadRequest('INVALID_IDENTIFIER', 'Invalid identifier.');
    }
    return parsed.data;
  }

  private context(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
