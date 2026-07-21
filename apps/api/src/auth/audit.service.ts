import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../persistence/prisma/prisma.service.js';
import type { RequestContext } from './auth.types.js';

@Injectable()
export class AuthAuditService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async record(
    action: string,
    context: RequestContext,
    options: { actorUserId?: string; targetUserId?: string; metadataSummary?: string } = {},
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        entityType: 'Authentication',
        entityId: options.targetUserId,
        actorUserId: options.actorUserId,
        targetUserId: options.targetUserId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: options.metadataSummary,
      },
    });
  }
}
