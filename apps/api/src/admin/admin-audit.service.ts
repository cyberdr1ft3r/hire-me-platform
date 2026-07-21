import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

@Injectable()
export class AdminAuditService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async record(
    action: string,
    context: RequestContext,
    options: {
      actorUserId: string;
      targetUserId?: string;
      entityType: string;
      entityId?: string;
      metadataSummary: string;
    },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        entityType: options.entityType,
        entityId: options.entityId,
        actorUserId: options.actorUserId,
        targetUserId: options.targetUserId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: options.metadataSummary,
      },
    });
  }
}
