import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

@Injectable()
export class DocumentSigningAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async appendSigningEvent(
    signingRequestId: string,
    action: string,
    actorUserId: string | null,
    metadataSummary: string,
    reasonCode?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const latest = await transaction.signingEvent.findFirst({
        where: { signingRequestId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const sequence = (latest?.sequence ?? -1) + 1;
      await transaction.signingEvent.create({
        data: {
          signingRequestId,
          sequence,
          action,
          actorUserId,
          metadataSummary: metadataSummary.slice(0, 500),
          reasonCode: reasonCode?.slice(0, 120),
        },
      });
    });
  }

  async recordPlatformAudit(
    action: string,
    context: RequestContext,
    options: {
      actorUserId: string;
      signingRequestId: string;
      metadataSummary: string;
    },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: `signing.${action}`,
        entityType: 'SigningRequest',
        entityId: options.signingRequestId,
        actorUserId: options.actorUserId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: options.metadataSummary.slice(0, 500),
      },
    });
  }
}
