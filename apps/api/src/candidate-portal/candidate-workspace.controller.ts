import {
  Body,
  CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Header,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CandidateCvSchema,
  CandidateCvsResponseSchema,
  CandidateProfileResponseSchema,
  CandidateProfileSaveSchema,
  CandidateSubmissionResponseSchema,
  publicApplicationMaxFileSizeBytes,
} from '@hire-me/contracts';
import type { Request } from 'express';

import { assertCandidateOrigin, candidateSessionCookie } from './candidate-portal.controller.js';
import { CandidatePortalService } from './candidate-portal.service.js';
import { CandidateWorkspace, type CandidatePdfUpload } from './candidate-workspace.service.js';
import { RateLimitService } from '../auth/rate-limit.service.js';

type CandidateRequest = Request & { candidateIdentity: { id: string; email: string } };

@Injectable()
export class CandidateWorkspaceGuard implements CanActivate {
  constructor(
    @Inject(CandidatePortalService) private readonly portal: CandidatePortalService,
    @Inject(RateLimitService) private readonly rate: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext) {
    this.portal.assertEnabled();
    const request = context.switchToHttp().getRequest<CandidateRequest>();
    if (request.method !== 'GET' && request.method !== 'HEAD') assertCandidateOrigin(request);
    const identity = await this.portal.requireSession(candidateSessionCookie(request));
    if (request.is('multipart/form-data')) {
      this.rate.assertAllowed('candidate:cv-upload:' + identity.id, 10, 60_000);
    }
    request.candidateIdentity = identity;
    return true;
  }
}

const pdf = () =>
  FileInterceptor('file', {
    limits: { fileSize: publicApplicationMaxFileSizeBytes, files: 1, fields: 0, parts: 2 },
  });

@Controller('v1/candidate')
@UseGuards(CandidateWorkspaceGuard)
export class CandidateWorkspaceController {
  constructor(@Inject(CandidateWorkspace) private readonly workspace: CandidateWorkspace) {}

  @Get('profile')
  @Header('Cache-Control', 'no-store')
  async profile(@Req() request: CandidateRequest) {
    return CandidateProfileResponseSchema.parse(
      await this.workspace.profile(request.candidateIdentity),
    );
  }

  @Post('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async save(@Req() request: CandidateRequest, @Body() body: unknown) {
    const parsed = CandidateProfileSaveSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        error: {
          code: 'CANDIDATE_PROFILE_INVALID',
          fields: parsed.error.issues.map((issue) => issue.path.join('.')),
        },
      });
    return CandidateProfileResponseSchema.parse(
      await this.workspace.saveProfile(
        request.candidateIdentity,
        parsed.data.profile,
        parsed.data.revision,
      ),
    );
  }

  @Get('documents')
  @Header('Cache-Control', 'no-store')
  async documents(@Req() request: CandidateRequest) {
    return CandidateCvsResponseSchema.parse(await this.workspace.cvs(request.candidateIdentity.id));
  }

  @Post('documents')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(pdf())
  async add(@Req() request: CandidateRequest, @UploadedFile() file?: CandidatePdfUpload) {
    return CandidateCvSchema.parse(await this.workspace.upload(request.candidateIdentity.id, file));
  }

  @Post('documents/:id/replace')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(pdf())
  async replace(
    @Req() request: CandidateRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: CandidatePdfUpload,
  ) {
    return CandidateCvSchema.parse(
      await this.workspace.upload(request.candidateIdentity.id, file, id),
    );
  }

  @Post('documents/:id/prefer')
  @HttpCode(204)
  prefer(@Req() request: CandidateRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspace.choose(request.candidateIdentity.id, id);
  }

  @Post('documents/:id/remove')
  @HttpCode(204)
  remove(@Req() request: CandidateRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspace.remove(request.candidateIdentity.id, id);
  }

  @Get('documents/versions/:id')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Req() request: CandidateRequest, @Param('id', ParseUUIDPipe) id: string) {
    const { bytes, filename } = await this.workspace.file(request.candidateIdentity.id, id);
    const encoded = encodeURIComponent(filename).replace(
      /['()*]/g,
      (char) => '%' + char.charCodeAt(0).toString(16),
    );
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: 'attachment; filename="candidate-cv.pdf"; filename*=UTF-8\'\'' + encoded,
      length: bytes.length,
    });
  }

  @Get('applications/:id/submission')
  @Header('Cache-Control', 'no-store')
  async submission(@Req() request: CandidateRequest, @Param('id', ParseUUIDPipe) id: string) {
    return CandidateSubmissionResponseSchema.parse(
      await this.workspace.submission(request.candidateIdentity.id, id),
    );
  }
}
