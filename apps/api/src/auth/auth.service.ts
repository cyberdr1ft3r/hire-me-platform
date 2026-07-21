import { Inject, Injectable } from '@nestjs/common';
import { AuthResponse, LoginRequest, MeResponse } from '@hire-me/contracts';

import { ARGON2ID_PARAMETERS } from './auth.constants.js';
import { AuthenticationFailedException } from './auth.errors.js';
import type { RequestContext } from './auth.types.js';
import { normalizeEmail } from './normalize-email.js';
import { AuthAuditService } from './audit.service.js';
import { PasswordService } from './password.service.js';
import { PermissionsService } from './permissions.service.js';
import { TokenService } from './token.service.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type AuthTokens = AuthResponse & {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

@Injectable()
export class AuthService {
  private readonly audit: AuthAuditService;
  private readonly passwords: PasswordService;
  private readonly permissions: PermissionsService;
  private readonly prisma: PrismaService;
  private readonly tokens: TokenService;

  constructor(
    @Inject(AuthAuditService) audit: AuthAuditService,
    @Inject(PasswordService) passwords: PasswordService,
    @Inject(PermissionsService) permissions: PermissionsService,
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(TokenService) tokens: TokenService,
  ) {
    this.audit = audit;
    this.passwords = passwords;
    this.permissions = permissions;
    this.prisma = prisma;
    this.tokens = tokens;
  }

  async login(input: LoginRequest, context: RequestContext): Promise<AuthTokens> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: { passwordCredential: true },
    });

    const passwordMatches = await this.passwords.verifyPassword(
      user?.passwordCredential?.passwordHash,
      input.password,
    );

    if (!user || user.status !== 'ACTIVE' || user.archivedAt || !passwordMatches) {
      await this.audit.record('auth.login.failed', context, {
        targetUserId: user?.id,
        metadataSummary: 'Generic login failure.',
      });
      throw new AuthenticationFailedException();
    }

    const result = await this.createTokenPair(user.id, context);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record('auth.login.succeeded', context, {
      actorUserId: user.id,
      targetUserId: user.id,
      metadataSummary: 'Successful password login.',
    });

    return result;
  }

  async refresh(refreshToken: string | null, context: RequestContext): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new AuthenticationFailedException();
    }

    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const existing = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      await this.audit.record('auth.refresh.failed', context, {
        metadataSummary: 'Refresh token hash was not found.',
      });
      throw new AuthenticationFailedException();
    }

    if (existing.user.status !== 'ACTIVE' || existing.user.archivedAt) {
      await this.revokeSessionFamily(existing.userId, existing.sessionFamilyId, context);
      throw new AuthenticationFailedException();
    }

    const now = new Date();
    const nextRefreshToken = this.tokens.createRefreshToken();
    const nextRefreshTokenHash = this.tokens.hashRefreshToken(nextRefreshToken);
    const nextRefreshTokenExpiresAt = this.tokens.getRefreshExpiresAt();
    const access = this.tokens.createAccessToken(existing.userId);

    const consumed = await this.prisma.$transaction(async (transaction) => {
      const consumeResult = await transaction.refreshSession.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now, lastUsedAt: now },
      });

      if (consumeResult.count !== 1) {
        await transaction.refreshSession.updateMany({
          where: { sessionFamilyId: existing.sessionFamilyId },
          data: { revokedAt: now, reuseDetectedAt: now },
        });
        return false;
      }

      await transaction.refreshSession.create({
        data: {
          userId: existing.userId,
          tokenHash: nextRefreshTokenHash,
          sessionFamilyId: existing.sessionFamilyId,
          expiresAt: nextRefreshTokenExpiresAt,
          rotatedFromSessionId: existing.id,
          userAgentHash: this.hashMetadata(context.userAgent),
          ipAddressHash: this.hashMetadata(context.ipAddress),
        },
      });
      return true;
    });

    if (!consumed) {
      await this.audit.record('auth.refresh.reuse_detected', context, {
        actorUserId: existing.userId,
        targetUserId: existing.userId,
        metadataSummary: 'Refresh token reuse revoked the session family.',
      });
      throw new AuthenticationFailedException();
    }

    const permissions = await this.permissions.getEffectivePermissionCodes(existing.userId);
    await this.audit.record('auth.refresh.rotated', context, {
      actorUserId: existing.userId,
      targetUserId: existing.userId,
      metadataSummary: 'Refresh token rotated.',
    });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: nextRefreshToken,
      refreshTokenExpiresAt: nextRefreshTokenExpiresAt,
      user: {
        id: existing.user.id,
        displayName: existing.user.displayName,
        email: existing.user.email,
        permissions,
      },
    };
  }

  async logoutCurrent(
    refreshToken: string | null,
    userId: string,
    context: RequestContext,
  ): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash: this.tokens.hashRefreshToken(refreshToken), userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.record('auth.logout.current', context, {
      actorUserId: userId,
      targetUserId: userId,
      metadataSummary: 'Current refresh session revoked.',
    });
  }

  async logoutAll(userId: string, context: RequestContext): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record('auth.logout.all', context, {
      actorUserId: userId,
      targetUserId: userId,
      metadataSummary: 'All refresh sessions revoked.',
    });
  }

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, status: 'ACTIVE', archivedAt: null },
    });
    const permissions = await this.permissions.getEffectivePermissionCodes(user.id);

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        permissions,
      },
    };
  }

  async createTokenPair(userId: string, context: RequestContext): Promise<AuthTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const access = this.tokens.createAccessToken(userId);
    const refreshToken = this.tokens.createRefreshToken();
    const refreshTokenExpiresAt = this.tokens.getRefreshExpiresAt();
    const sessionFamilyId = this.tokens.createSessionFamilyId();

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        sessionFamilyId,
        expiresAt: refreshTokenExpiresAt,
        userAgentHash: this.hashMetadata(context.userAgent),
        ipAddressHash: this.hashMetadata(context.ipAddress),
      },
    });

    const permissions = await this.permissions.getEffectivePermissionCodes(userId);

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        permissions,
      },
    };
  }

  getPasswordParameters(): typeof ARGON2ID_PARAMETERS {
    return ARGON2ID_PARAMETERS;
  }

  private async revokeSessionFamily(
    userId: string,
    sessionFamilyId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, sessionFamilyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record('auth.session_family.revoked', context, {
      actorUserId: userId,
      targetUserId: userId,
      metadataSummary: 'Session family revoked.',
    });
  }

  private hashMetadata(value: string | undefined): string | undefined {
    return value ? this.tokens.hashRefreshToken(value) : undefined;
  }
}
