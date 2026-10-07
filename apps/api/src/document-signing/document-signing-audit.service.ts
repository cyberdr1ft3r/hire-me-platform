import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

@Injectable()
export class DocumentSigningAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
