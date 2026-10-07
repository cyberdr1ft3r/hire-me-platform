import { Inject, Injectable } from '@nestjs/common';

import {
  commercialContractSourceFingerprint,
  invoiceSourceFingerprint,
  purchaseOrderSourceFingerprint,
  quotationSourceFingerprint,
} from './financial-source-fingerprint.js';
import type { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

/**
 * Recomputes the current authoritative business-source fingerprint for a generated
 * financial document without regenerating PDF bytes (Issue #141).
 */
@Injectable()
export class FinancialSourceSnapshotService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async computeCurrentFingerprint(
    documentId: string,
    transaction: DbClient = this.prisma,
  ): Promise<string | null> {
    const document = await transaction.document.findUnique({
      where: { id: documentId },
      select: {
        commercialQuotationId: true,
        purchaseOrderId: true,
        commercialContractId: true,
        invoiceId: true,
      },
    });
    if (!document) {
      return null;
    }

    if (document.commercialQuotationId) {
      const quotation = await transaction.commercialQuotation.findUnique({
        where: { id: document.commercialQuotationId },
        include: {
          client: { select: { name: true } },
          recruitmentMission: { select: { title: true } },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      });
      return quotation ? quotationSourceFingerprint(quotation) : null;
    }

    if (document.purchaseOrderId) {
      const order = await transaction.purchaseOrder.findUnique({
        where: { id: document.purchaseOrderId },
        include: {
          client: { select: { name: true } },
          recruitmentMission: { select: { title: true } },
        },
      });
      return order ? purchaseOrderSourceFingerprint(order) : null;
    }

    if (document.commercialContractId) {
      const contract = await transaction.commercialContract.findUnique({
        where: { id: document.commercialContractId },
        include: {
          client: { select: { name: true } },
          recruitmentMission: { select: { title: true } },
        },
      });
      return contract ? commercialContractSourceFingerprint(contract) : null;
    }

    if (document.invoiceId) {
      const invoice = await transaction.invoice.findUnique({
        where: { id: document.invoiceId },
        include: {
          client: { select: { name: true } },
          recruitmentMission: { select: { title: true } },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      });
      return invoice ? invoiceSourceFingerprint(invoice) : null;
    }

    return null;
  }
}
