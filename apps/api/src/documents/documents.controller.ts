import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  DocumentCreateRequestSchema,
  DocumentDetailResponseSchema,
  DocumentListQuerySchema,
  DocumentListResponseSchema,
  DocumentUpdateRequestSchema,
  DocumentVersionCreateRequestSchema,
  DocumentVersionListResponseSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { DOCUMENT_PERMISSIONS } from './document-permissions.js';
import { badRequest } from './document.errors.js';
import { DocumentsService } from './documents.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/documents')
@UseGuards(AuthGuard, PermissionGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW)
  async listDocuments(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = DocumentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_DOCUMENT_LIST_QUERY', 'Invalid document list query.');
    }

    return DocumentListResponseSchema.parse(
      await this.documents.listDocuments(parsed.data, request.user!.id),
    );
  }

  @Post()
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_CREATE)
  async createDocument(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = DocumentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_DOCUMENT_REQUEST', 'Invalid create document request.');
    }

    return DocumentDetailResponseSchema.parse(
      await this.documents.createDocument(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get(':documentId')
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW)
  async getDocument(@Param('documentId') documentId: string, @Req() request: RequestWithUser) {
    return DocumentDetailResponseSchema.parse(
      await this.documents.getDocument(this.uuid(documentId), request.user!.id),
    );
  }

  @Patch(':documentId')
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_UPDATE)
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = DocumentUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_DOCUMENT_REQUEST', 'Invalid update document request.');
    }

    return DocumentDetailResponseSchema.parse(
      await this.documents.updateDocument(
        this.uuid(documentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':documentId/archive')
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_ARCHIVE)
  async archiveDocument(@Param('documentId') documentId: string, @Req() request: RequestWithUser) {
    return DocumentDetailResponseSchema.parse(
      await this.documents.archiveDocument(
        this.uuid(documentId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':documentId/versions')
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW)
  async listVersions(@Param('documentId') documentId: string, @Req() request: RequestWithUser) {
    return DocumentVersionListResponseSchema.parse(
      await this.documents.listVersions(this.uuid(documentId), request.user!.id),
    );
  }

  @Post(':documentId/versions')
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_VERSION_CREATE)
  async addVersion(
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = DocumentVersionCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_DOCUMENT_VERSION_REQUEST', 'Invalid version request.');
    }

    return DocumentDetailResponseSchema.parse(
      await this.documents.addUploadedVersion(
        this.uuid(documentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':documentId/versions/:versionId/download')
  @RequirePermissions(DOCUMENT_PERMISSIONS.DOCUMENTS_DOWNLOAD)
  @Header('Cache-Control', 'no-store')
  async downloadVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Req() request: RequestWithUser,
  ) {
    const download = await this.documents.downloadVersion(
      this.uuid(documentId),
      this.uuid(versionId),
      request.user!.id,
      this.getContext(request),
    );
    return new StreamableFile(download.content, {
      type: download.mimeType,
      disposition: `attachment; filename="${download.filename.replace(/"/g, '')}"`,
    });
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
