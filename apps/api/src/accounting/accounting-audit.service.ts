import { Inject, Injectable } from '@nestjs/common';

import type { RequestContext } from '../auth/auth.types.js';
import type { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

export type AccountingAuditEntityType = 'Payment' | 'PaymentAllocation' | 'Expense';

/**
 * Accounting audit rows are written inside the same transaction as the mutation they
 * describe, so a rejected financial action can never leave a misleading trail.
 *
 * `metadataSummary` stays a short, safe operational summary. Amounts, currencies,
 * bank references, vendor details, and free-form notes must never be copied into it.
 */
@Injectable()
export class AccountingAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(
    action: string,
    context: RequestContext,
    options: {
      actorUserId: string;
      entityType: AccountingAuditEntityType;
      entityId?: string;
      metadataSummary: string;
    },
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await prisma.auditLog.create({
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
