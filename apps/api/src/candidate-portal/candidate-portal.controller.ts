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
} from '@nestjs/common';
import {
  CandidateApplicationSchema,
  CandidateApplicationsResponseSchema,
  CandidateEmailCompletionSchema,
  CandidateEmailRequestSchema,
  CandidateGoogleLoginSchema,
  CandidatePasswordLoginSchema,
} from '@hire-me/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { RateLimitService } from '../auth/rate-limit.service.js';
import { loadEnvironment } from '../config/environment.js';
import { candidateSessionMs, CandidatePortalService } from './candidate-portal.service.js';

const sessionCookie = 'hireme_candidate_session';
const googleCookie = 'hireme_candidate_google';

function cookie(request: Request, name: string): string | undefined {
  const prefix = name + '=';
  const matches = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix));
  return matches?.length === 1 ? matches[0]?.slice(prefix.length) : undefined;
}

export function candidateSessionCookie(request: Request): string | undefined {
  return cookie(request, sessionCookie);
}

export function assertCandidateOrigin(request: Request): void {
  if (request.get('origin') !== new URL(loadEnvironment().API_CORS_ORIGIN).origin) {
    throw new ForbiddenException('Invalid candidate request origin.');
  }
}

function read<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Check the candidate form fields.');
  return parsed.data;
}

@Controller('v1/candidate')
export class CandidatePortalController {
  constructor(
    @Inject(CandidatePortalService) private readonly portal: CandidatePortalService,
    @Inject(RateLimitService) private readonly rate: RateLimitService,
  ) {}

  private check(request: Request, action: string, limit: number, email?: string) {
    this.portal.assertEnabled();
    assertCandidateOrigin(request);
    this.rate.assertAllowed(
      'candidate:' + action + ':ip:' + (request.ip ?? request.socket.remoteAddress ?? 'unknown'),
      limit,
    );
    if (email) this.rate.assertAllowed('candidate:' + action + ':email:' + email.toLowerCase(), 5);
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/v1',
      secure: new URL(loadEnvironment().API_CORS_ORIGIN).protocol === 'https:',
    };
  }

  private setSession(response: Response, token: string) {
    response.cookie(sessionCookie, token, { ...this.cookieOptions(), maxAge: candidateSessionMs });
  }

  @Get('config')
  @Header('Cache-Control', 'no-store')
  config() {
    const enabled = this.portal.enabled();
    return {
      enabled,
      googleClientId: enabled ? (loadEnvironment().CANDIDATE_GOOGLE_CLIENT_ID ?? null) : null,
    };
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() request: Request) {
    this.portal.assertEnabled();
    const identity = await this.portal.session(candidateSessionCookie(request));
    return { candidate: identity ? { principal: 'CANDIDATE', email: identity.email } : null };
  }

  @Post('register')
  @HttpCode(202)
  async register(@Req() request: Request, @Body() body: unknown) {
    const { email, returnTo } = read(CandidateEmailRequestSchema, body);
    this.check(request, 'register', 20, email);
    await this.portal.requestEmail(email, 'VERIFY', returnTo);
  }

  @Post('forgot')
  @HttpCode(202)
  async forgot(@Req() request: Request, @Body() body: unknown) {
    const { email, returnTo } = read(CandidateEmailRequestSchema, body);
    this.check(request, 'forgot', 20, email);
    await this.portal.requestEmail(email, 'RESET', returnTo);
  }

  @Post('verify')
  @HttpCode(204)
  async verify(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.check(request, 'verify', 20);
    const { token, password } = read(CandidateEmailCompletionSchema, body);
    this.setSession(response, await this.portal.completeEmail(token, 'VERIFY', password));
  }

  @Post('reset')
  @HttpCode(204)
  async reset(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.check(request, 'reset', 20);
    const { token, password } = read(CandidateEmailCompletionSchema, body);
    this.setSession(response, await this.portal.completeEmail(token, 'RESET', password));
  }

  @Post('login')
  @HttpCode(204)
  async login(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { email, password } = read(CandidatePasswordLoginSchema, body);
    this.check(request, 'login', 30, email);
    this.setSession(response, await this.portal.login(email, password));
  }

  @Post('google/challenge')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async googleChallenge(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.check(request, 'google-challenge', 30);
    const { binding, nonce } = await this.portal.googleChallenge();
    response.cookie(googleCookie, binding, { ...this.cookieOptions(), maxAge: 600_000 });
    return { nonce };
  }

  @Post('google')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async google(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.check(request, 'google', 20);
    const { credential, returnTo } = read(CandidateGoogleLoginSchema, body);
    const token = await this.portal.loginWithGoogle(
      credential,
      cookie(request, googleCookie),
      returnTo,
    );
    response.clearCookie(googleCookie, this.cookieOptions());
    if (token) this.setSession(response, token);
    return { verified: Boolean(token) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.portal.assertEnabled();
    assertCandidateOrigin(request);
    await this.portal.logout(candidateSessionCookie(request));
    response.clearCookie(sessionCookie, this.cookieOptions());
  }

  @Get('applications')
  @Header('Cache-Control', 'no-store')
  async applications(@Req() request: Request, @Query('cursor') cursor?: unknown) {
    this.portal.assertEnabled();
    const identity = await this.portal.requireSession(candidateSessionCookie(request));
    return CandidateApplicationsResponseSchema.parse(
      await this.portal.applications(identity.id, read(z.string().uuid().optional(), cursor)),
    );
  }

  @Get('applications/:id')
  @Header('Cache-Control', 'no-store')
  async application(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    this.portal.assertEnabled();
    const identity = await this.portal.requireSession(candidateSessionCookie(request));
    return CandidateApplicationSchema.parse(await this.portal.application(identity.id, id));
  }
}
