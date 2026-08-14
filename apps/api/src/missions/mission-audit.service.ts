import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

@Injectable()
export class MissionAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(
    action: string,
    context: RequestContext,
    options: {
      actorUserId: string;
      entityType:
        | 'RecruitmentMission'
        | 'MissionRecruiter'
        | 'MissionCandidate'
        | 'RecruitmentOffer'
        | 'MissionPlacement'
        | 'Interview'
        | 'InterviewParticipant'
        | 'CandidateEvaluation';
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
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: options.metadataSummary,
      },
    });
  }
}
