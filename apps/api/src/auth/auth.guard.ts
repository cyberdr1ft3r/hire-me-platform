import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AuthenticationFailedException } from './auth.errors.js';
import type { RequestWithUser } from './auth.types.js';
import { TokenService } from './token.service.js';
import { UserStatus } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly prisma: PrismaService;
  private readonly tokens: TokenService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(TokenService) tokens: TokenService,
  ) {
    this.prisma = prisma;
    this.tokens = tokens;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!value?.startsWith('Bearer ')) {
      throw new AuthenticationFailedException();
    }

    try {
      const payload = this.tokens.verifyAccessToken(value.slice('Bearer '.length));
      const user = await this.findCurrentlyEligibleUser(payload.sub);

      if (!user) {
        throw new Error('Ineligible user');
      }

      request.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      };
      return true;
    } catch {
      throw new AuthenticationFailedException();
    }
  }

  private async findCurrentlyEligibleUser(userId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
      },
    });
  }
}
