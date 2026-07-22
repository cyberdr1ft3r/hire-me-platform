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
  CandidateCreateRequestSchema,
  CandidateDetailResponseSchema,
  CandidateEducationCreateRequestSchema,
  CandidateEducationDetailResponseSchema,
  CandidateEducationListResponseSchema,
  CandidateEducationUpdateRequestSchema,
  CandidateLanguageCreateRequestSchema,
  CandidateLanguageDetailResponseSchema,
  CandidateLanguageListResponseSchema,
  CandidateLanguageUpdateRequestSchema,
  CandidateListQuerySchema,
  CandidateListResponseSchema,
  CandidateSkillCreateRequestSchema,
  CandidateSkillDetailResponseSchema,
  CandidateSkillListResponseSchema,
  CandidateSkillUpdateRequestSchema,
  CandidateStatusUpdateRequestSchema,
  CandidateUpdateRequestSchema,
  CandidateWorkExperienceCreateRequestSchema,
  CandidateWorkExperienceDetailResponseSchema,
  CandidateWorkExperienceListResponseSchema,
  CandidateWorkExperienceUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { CANDIDATE_PERMISSIONS } from './candidate-permissions.js';
import { badRequest } from './candidate.errors.js';
import { CandidatesService } from './candidates.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/candidates')
@UseGuards(AuthGuard, PermissionGuard)
export class CandidatesController {
  constructor(@Inject(CandidatesService) private readonly candidates: CandidatesService) {}

  @Get()
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATES_VIEW)
  async listCandidates(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = CandidateListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_CANDIDATE_LIST_QUERY', 'Invalid candidate list query.');
    }

    return CandidateListResponseSchema.parse(
      await this.candidates.listCandidates(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Post()
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATES_CREATE)
  async createCandidate(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = CandidateCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_CANDIDATE_REQUEST', 'Invalid create candidate request.');
    }

    return CandidateDetailResponseSchema.parse(
      await this.candidates.createCandidate(
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':candidateId')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATES_VIEW)
  async getCandidate(@Param('candidateId') candidateId: string, @Req() request: RequestWithUser) {
    return CandidateDetailResponseSchema.parse(
      await this.candidates.getCandidate(
        this.uuid(candidateId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':candidateId')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATES_UPDATE)
  async updateCandidate(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_CANDIDATE_REQUEST', 'Invalid update candidate request.');
    }

    return CandidateDetailResponseSchema.parse(
      await this.candidates.updateCandidate(
        this.uuid(candidateId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':candidateId/status')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATES_STATUS_MANAGE)
  async updateCandidateStatus(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CANDIDATE_STATUS_REQUEST', 'Invalid candidate status request.');
    }

    return CandidateDetailResponseSchema.parse(
      await this.candidates.updateCandidateStatus(
        this.uuid(candidateId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/archive')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATES_ARCHIVE)
  async archiveCandidate(
    @Param('candidateId') candidateId: string,
    @Req() request: RequestWithUser,
  ) {
    return CandidateDetailResponseSchema.parse(
      await this.candidates.archiveCandidate(
        this.uuid(candidateId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/skills')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async createSkill(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateSkillCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_CANDIDATE_SKILL_REQUEST', 'Invalid create skill request.');
    }

    return CandidateSkillDetailResponseSchema.parse(
      await this.candidates.createSkill(
        this.uuid(candidateId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':candidateId/skills')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_VIEW)
  async listSkills(@Param('candidateId') candidateId: string) {
    return CandidateSkillListResponseSchema.parse(
      await this.candidates.listSkills(this.uuid(candidateId)),
    );
  }

  @Patch(':candidateId/skills/:skillId')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async updateSkill(
    @Param('candidateId') candidateId: string,
    @Param('skillId') skillId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateSkillUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_CANDIDATE_SKILL_REQUEST', 'Invalid update skill request.');
    }

    return CandidateSkillDetailResponseSchema.parse(
      await this.candidates.updateSkill(
        this.uuid(candidateId),
        this.uuid(skillId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/skills/:skillId/archive')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async archiveSkill(
    @Param('candidateId') candidateId: string,
    @Param('skillId') skillId: string,
    @Req() request: RequestWithUser,
  ) {
    return CandidateSkillDetailResponseSchema.parse(
      await this.candidates.archiveSkill(
        this.uuid(candidateId),
        this.uuid(skillId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/languages')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async createLanguage(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateLanguageCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_CANDIDATE_LANGUAGE_REQUEST',
        'Invalid create language request.',
      );
    }

    return CandidateLanguageDetailResponseSchema.parse(
      await this.candidates.createLanguage(
        this.uuid(candidateId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':candidateId/languages')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_VIEW)
  async listLanguages(@Param('candidateId') candidateId: string) {
    return CandidateLanguageListResponseSchema.parse(
      await this.candidates.listLanguages(this.uuid(candidateId)),
    );
  }

  @Patch(':candidateId/languages/:languageId')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async updateLanguage(
    @Param('candidateId') candidateId: string,
    @Param('languageId') languageId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateLanguageUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_UPDATE_CANDIDATE_LANGUAGE_REQUEST',
        'Invalid update language request.',
      );
    }

    return CandidateLanguageDetailResponseSchema.parse(
      await this.candidates.updateLanguage(
        this.uuid(candidateId),
        this.uuid(languageId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/languages/:languageId/archive')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async archiveLanguage(
    @Param('candidateId') candidateId: string,
    @Param('languageId') languageId: string,
    @Req() request: RequestWithUser,
  ) {
    return CandidateLanguageDetailResponseSchema.parse(
      await this.candidates.archiveLanguage(
        this.uuid(candidateId),
        this.uuid(languageId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/work-experiences')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async createWorkExperience(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateWorkExperienceCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_CANDIDATE_WORK_EXPERIENCE_REQUEST',
        'Invalid create work experience request.',
      );
    }

    return CandidateWorkExperienceDetailResponseSchema.parse(
      await this.candidates.createWorkExperience(
        this.uuid(candidateId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':candidateId/work-experiences')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_VIEW)
  async listWorkExperiences(@Param('candidateId') candidateId: string) {
    return CandidateWorkExperienceListResponseSchema.parse(
      await this.candidates.listWorkExperiences(this.uuid(candidateId)),
    );
  }

  @Patch(':candidateId/work-experiences/:workExperienceId')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async updateWorkExperience(
    @Param('candidateId') candidateId: string,
    @Param('workExperienceId') workExperienceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateWorkExperienceUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_UPDATE_CANDIDATE_WORK_EXPERIENCE_REQUEST',
        'Invalid update work experience request.',
      );
    }

    return CandidateWorkExperienceDetailResponseSchema.parse(
      await this.candidates.updateWorkExperience(
        this.uuid(candidateId),
        this.uuid(workExperienceId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/work-experiences/:workExperienceId/archive')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async archiveWorkExperience(
    @Param('candidateId') candidateId: string,
    @Param('workExperienceId') workExperienceId: string,
    @Req() request: RequestWithUser,
  ) {
    return CandidateWorkExperienceDetailResponseSchema.parse(
      await this.candidates.archiveWorkExperience(
        this.uuid(candidateId),
        this.uuid(workExperienceId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/education')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async createEducation(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateEducationCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_CREATE_CANDIDATE_EDUCATION_REQUEST',
        'Invalid create education request.',
      );
    }

    return CandidateEducationDetailResponseSchema.parse(
      await this.candidates.createEducation(
        this.uuid(candidateId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':candidateId/education')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_VIEW)
  async listEducation(@Param('candidateId') candidateId: string) {
    return CandidateEducationListResponseSchema.parse(
      await this.candidates.listEducation(this.uuid(candidateId)),
    );
  }

  @Patch(':candidateId/education/:educationId')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async updateEducation(
    @Param('candidateId') candidateId: string,
    @Param('educationId') educationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CandidateEducationUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_UPDATE_CANDIDATE_EDUCATION_REQUEST',
        'Invalid update education request.',
      );
    }

    return CandidateEducationDetailResponseSchema.parse(
      await this.candidates.updateEducation(
        this.uuid(candidateId),
        this.uuid(educationId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':candidateId/education/:educationId/archive')
  @RequirePermissions(CANDIDATE_PERMISSIONS.CANDIDATE_PROFILE_MANAGE)
  async archiveEducation(
    @Param('candidateId') candidateId: string,
    @Param('educationId') educationId: string,
    @Req() request: RequestWithUser,
  ) {
    return CandidateEducationDetailResponseSchema.parse(
      await this.candidates.archiveEducation(
        this.uuid(candidateId),
        this.uuid(educationId),
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
