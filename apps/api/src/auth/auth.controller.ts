import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthResponseSchema, LoginRequestSchema, MeResponse } from '@hire-me/contracts';

import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { clearRefreshCookie, getRefreshTokenFromCookie, setRefreshCookie } from './cookie.js';
import { RateLimitService } from './rate-limit.service.js';
import type { RequestContext, RequestWithUser } from './auth.types.js';

type CookieResponse = {
  setHeader(name: string, value: string | string[]): void;
};

@Controller('auth')
export class AuthController {
  private readonly auth: AuthService;
  private readonly rateLimit: RateLimitService;

  constructor(
    @Inject(AuthService) auth: AuthService,
    @Inject(RateLimitService) rateLimit: RateLimitService,
  ) {
    this.auth = auth;
    this.rateLimit = rateLimit;
  }

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    this.rateLimit.assertAllowed(`login:${this.getIpAddress(request)}`);
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_AUTH_REQUEST',
          message: 'Invalid authentication request.',
        },
      });
    }

    const result = await this.auth.login(parsed.data, this.getContext(request));
    setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);

    return AuthResponseSchema.parse({
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    });
  }

  @Post('refresh')
  async refresh(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    this.rateLimit.assertAllowed(`refresh:${this.getIpAddress(request)}`, 20);
    const result = await this.auth.refresh(
      getRefreshTokenFromCookie(request.headers.cookie),
      this.getContext(request),
    );
    setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);

    return AuthResponseSchema.parse({
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    });
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logoutCurrent(
      getRefreshTokenFromCookie(request.headers.cookie),
      request.user!.id,
      this.getContext(request),
    );
    clearRefreshCookie(response);
    return { status: 'ok' };
  }

  @Post('logout-all')
  @UseGuards(AuthGuard)
  async logoutAll(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logoutAll(request.user!.id, this.getContext(request));
    clearRefreshCookie(response);
    return { status: 'ok' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: RequestWithUser): Promise<MeResponse> {
    return this.auth.getMe(request.user!.id);
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: this.getIpAddress(request),
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }

  private getIpAddress(request: RequestWithUser): string {
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }
}
