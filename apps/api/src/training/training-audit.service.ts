import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { Prisma } from '../persistence/prisma/generated-client.js';

export type TrainingAuditEntityType =
  'TrainingProgram' | 'TrainingSession' | 'TrainingEnrollment' | 'TrainingSessionParticipation';

type PrismaTransaction = Prisma.TransactionClient;

/**
 * Training audit entries are written with the same mutation transaction so that a
 * rejected training action can never leave a misleading audit trail behind.
 *
 * `metadataSummary` must stay a short, safe operational summary. Trainer notes,
 * participant contact details, evaluation content, client commercial data, and
 * any other confidential value must never be copied into it.
 */
@Injectable()
export class TrainingAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(
    action: string,
    context: RequestContext,
    options: {
      actorUserId: string;
      entityType: TrainingAuditEntityType;
      entityId?: string;
      metadataSummary: string;
    },
    transaction?: PrismaTransaction,
  ): Promise<void> {
    const client = transaction ?? this.prisma;
    await client.auditLog.create({
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
