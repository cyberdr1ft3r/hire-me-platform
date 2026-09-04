import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

@Injectable()
export class ReportingAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Records a safe export-audit entry. The metadata summary contains only the
  // report type and a bounded filter summary; never confidential record contents.
  async recordExport(
    context: RequestContext,
    options: { actorUserId: string; metadataSummary: string },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: 'reporting.recruitment.exported',
        entityType: 'RecruitmentReport',
        actorUserId: options.actorUserId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: options.metadataSummary,
      },
    });
  }
}
