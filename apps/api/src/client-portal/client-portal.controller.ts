import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ClientDemandDecisionSchema,
  ClientDemandEditSchema,
  ClientDemandFieldsSchema,
  ClientDemandRevisionSchema,
  ClientDemandSchema,
  ClientInvitationSchema,
  ClientPortalDashboardSchema,
  ClientPortalForgotSchema,
  ClientPortalLoginSchema,
  ClientPortalPreviewSchema,
  ClientPortalProofSchema,
  ClientPortalPublicationsSchema,
  ClientPortalStaffDemandSchema,
  ClientPortalStaffOrganizationSchema,
  ClientPublicationCommitSchema,
  ClientPublicationRequestSchema,
  ClientPublicationSchema,
  clientPortalPermissions,
} from '@hire-me/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { ClientPortalAuth, clientSessionMs } from './client-portal-auth.service.js';
import { ClientPortalWorkflow } from './client-portal-workflow.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import { loadEnvironment } from '../config/environment.js';

const cookieName = 'hireme_client_session';
const queryId = z.string().uuid().optional();
const publicationQuery = z.strictObject({ demandId: queryId, cursor: queryId });
const cookies = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/v1/client-portal',
  secure: new URL(loadEnvironment().API_CORS_ORIGIN).protocol === 'https:',
});
function session(request: Request) {
  const values = request
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(cookieName + '='));
  return values?.length === 1 ? values[0]?.slice(cookieName.length + 1) : undefined;
}

function read<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      error: {
        code: 'CLIENT_PORTAL_VALIDATION',
        fields: result.error.issues.map((issue) => String(issue.path[0] ?? 'form')),
      },
    });
  return result.data;
}

@Controller('v1/client-portal')
export class ClientPortalController {
  constructor(
    @Inject(ClientPortalAuth) private readonly auth: ClientPortalAuth,
    @Inject(ClientPortalWorkflow) private readonly workflow: ClientPortalWorkflow,
    @Inject(RateLimitService) private readonly rate: RateLimitService,
  ) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  config() {
    return { enabled: this.auth.enabled() };
  }

  @Post('login')
  @HttpCode(204)
  async login(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.check(request);
    const { email, password } = read(ClientPortalLoginSchema, body);
    this.limit(request, 'login', email);
    response.cookie(cookieName, await this.auth.login(email, password), {
      ...cookies(),
      maxAge: clientSessionMs,
    });
  }

  @Post('forgot')
  @HttpCode(202)
  async forgot(@Req() request: Request, @Body() body: unknown) {
    this.check(request);
    const { email } = read(ClientPortalForgotSchema, body);
    this.limit(request, 'forgot', email);
    await this.auth.forgot(email);
  }

  @Post('accept')
  @HttpCode(204)
  accept(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.complete(request, body, response, 'INVITE');
  }

  @Post('reset')
  @HttpCode(204)
  reset(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.complete(request, body, response, 'RESET');
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.check(request);
    await this.auth.logout(session(request));
    response.clearCookie(cookieName, cookies());
  }

  @Get('dashboard')
  @Header('Cache-Control', 'no-store')
  async dashboard(@Req() request: Request, @Query('cursor') cursor: unknown) {
    this.auth.assertEnabled();
    return ClientPortalDashboardSchema.parse(
      await this.workflow.dashboard(session(request), read(queryId, cursor)),
    );
  }

  @Get('demands/:id')
  @Header('Cache-Control', 'no-store')
  async demand(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    this.auth.assertEnabled();
    return ClientDemandSchema.parse(await this.workflow.demand(session(request), id));
  }

  @Post('demands')
  @Header('Cache-Control', 'no-store')
  async create(@Req() request: Request, @Body() body: unknown) {
    this.check(request);
    return ClientDemandSchema.parse(
      await this.workflow.saveDemand(session(request), read(ClientDemandFieldsSchema, body)),
    );
  }

  @Post('demands/:id')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async edit(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    this.check(request);
    const { revision, ...fields } = read(ClientDemandEditSchema, body);
    return ClientDemandSchema.parse(
      await this.workflow.saveDemand(session(request), fields, { id, revision }),
    );
  }

  @Post('demands/:id/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async submit(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    this.check(request);
    return ClientDemandSchema.parse(
      await this.workflow.submit(
        session(request),
        id,
        read(ClientDemandRevisionSchema, body).revision,
      ),
    );
  }

  @Get('publications')
  @Header('Cache-Control', 'no-store')
  async publications(@Req() request: Request, @Query() query: unknown) {
    this.auth.assertEnabled();
    const { demandId, cursor } = read(publicationQuery, query);
    return ClientPortalPublicationsSchema.parse(
      await this.workflow.publications(session(request), demandId, cursor),
    );
  }

  @Get('publications/:id/document')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="hireme-profile-summary.txt"')
  @Header('X-Content-Type-Options', 'nosniff')
  document(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    this.auth.assertEnabled();
    return this.workflow.document(session(request), id);
  }

  private check(request: Request) {
    this.auth.assertEnabled();
    if (request.get('origin') !== new URL(loadEnvironment().API_CORS_ORIGIN).origin)
      throw new ForbiddenException();
  }

  private limit(request: Request, action: string, email?: string) {
    this.rate.assertAllowed(
      'client:ip:' + action + ':' + (request.ip ?? request.socket.remoteAddress ?? 'unknown'),
      30,
    );
    if (email) this.rate.assertAllowed('client:email:' + action + ':' + email.toLowerCase(), 8);
  }

  private async complete(
    request: Request,
    body: unknown,
    response: Response,
    purpose: 'INVITE' | 'RESET',
  ) {
    this.check(request);
    this.limit(request, purpose);
    const proof = read(ClientPortalProofSchema, body);
    response.cookie(cookieName, await this.auth.complete(proof.token, proof.password, purpose), {
      ...cookies(),
      maxAge: clientSessionMs,
    });
  }
}

@Controller('v1/internal/client-portal/organizations/:clientId')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions(...clientPortalPermissions.staff)
export class ClientPortalStaffController {
  constructor(
    @Inject(ClientPortalAuth) private readonly auth: ClientPortalAuth,
    @Inject(ClientPortalWorkflow) private readonly workflow: ClientPortalWorkflow,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async organization(
    @Req() request: RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    this.auth.assertEnabled();
    return ClientPortalStaffOrganizationSchema.parse(
      await this.workflow.staffOrganization(request.user!.id, clientId),
    );
  }

  @Post('invitations')
  @HttpCode(202)
  @RequirePermissions(...clientPortalPermissions.staff, ...clientPortalPermissions.access)
  async invite(
    @Req() request: RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: unknown,
  ) {
    this.auth.assertEnabled();
    await this.workflow.assertStaff(request.user!.id, undefined, clientPortalPermissions.access);
    await this.auth.invite(
      clientId,
      read(ClientInvitationSchema, body).contactId,
      request.user!.id,
    );
  }

  @Post('members/:id/revoke')
  @HttpCode(204)
  @RequirePermissions(...clientPortalPermissions.staff, ...clientPortalPermissions.access)
  async revoke(
    @Req() request: RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.auth.assertEnabled();
    await this.workflow.assertStaff(request.user!.id, undefined, clientPortalPermissions.access);
    await this.auth.revoke(clientId, id, request.user!.id);
  }

  @Post('demands/:id/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  decide(
    @Req() request: Request & RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    this.auth.assertEnabled();
    return this.workflow
      .decide(request.user!.id, clientId, id, read(ClientDemandDecisionSchema, body), {
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      })
      .then((row) => ClientPortalStaffDemandSchema.parse(row));
  }

  @Post('publications/preview')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async preview(
    @Req() request: RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: unknown,
  ) {
    this.auth.assertEnabled();
    return ClientPortalPreviewSchema.parse(
      await this.workflow.preview(
        request.user!.id,
        clientId,
        read(ClientPublicationRequestSchema, body),
      ),
    );
  }

  @Post('publications')
  @Header('Cache-Control', 'no-store')
  async publish(
    @Req() request: RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: unknown,
  ) {
    this.auth.assertEnabled();
    return ClientPublicationSchema.parse(
      await this.workflow.publish(
        request.user!.id,
        clientId,
        read(ClientPublicationCommitSchema, body),
      ),
    );
  }

  @Post('publications/:id/revoke')
  @HttpCode(204)
  async revokePublication(
    @Req() request: RequestWithUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.auth.assertEnabled();
    await this.workflow.revokePublication(request.user!.id, clientId, id);
  }
}
