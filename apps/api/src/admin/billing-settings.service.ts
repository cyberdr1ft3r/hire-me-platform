import { Inject, Injectable } from '@nestjs/common';
import type {
  CompanyBillingSettingsResponse,
  CompanyBillingSettingsUpdateRequest,
  InvoiceNumberBaselineRequest,
  InvoiceNumberSequenceResponse,
} from '@hire-me/contracts';

import { conflict } from './admin.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import type { CompanyBillingSettings as CompanyBillingSettingsRow } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

export const COMPANY_BILLING_SETTINGS_ID = 'primary';

const emptySettings = {
  sellerLegalName: null,
  sellerLegalForm: null,
  sellerCapital: null,
  sellerAddress: null,
  sellerIce: null,
  sellerTaxId: null,
  sellerRegistrationNumber: null,
  sellerPatente: null,
  sellerPhone: null,
  sellerEmail: null,
  sellerWebsite: null,
  paymentTerms: null,
  paymentMethod: null,
  bankDetails: null,
  invoicePrefix: null,
  invoiceDigits: null,
  invoiceNumberingEnabled: false,
  updatedAt: null,
} as const;

@Injectable()
export class BillingSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(): Promise<CompanyBillingSettingsResponse> {
    const row = await this.prisma.companyBillingSettings.findUnique({
      where: { id: COMPANY_BILLING_SETTINGS_ID },
    });
    return { settings: row ? this.serialize(row) : emptySettings };
  }

  async update(
    input: CompanyBillingSettingsUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CompanyBillingSettingsResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CompanyBillingSettings" WHERE id = ${COMPANY_BILLING_SETTINGS_ID} FOR UPDATE`;
      const existing = await tx.companyBillingSettings.findUnique({
        where: { id: COMPANY_BILLING_SETTINGS_ID },
      });
      const changesEnabledSeries =
        input.invoiceNumberingEnabled &&
        (!existing?.invoiceNumberingEnabled ||
          existing.invoicePrefix !== input.invoicePrefix ||
          existing.invoiceDigits !== input.invoiceDigits);
      if (changesEnabledSeries) {
        const currentYear = new Date().getUTCFullYear();
        const sequence = input.invoicePrefix
          ? await tx.invoiceNumberSequence.findUnique({
              where: { prefix_year: { prefix: input.invoicePrefix, year: currentYear } },
            })
          : null;
        if (!sequence || sequence.digits !== input.invoiceDigits) {
          throw conflict(
            'INVOICE_NUMBER_BASELINE_REQUIRED',
            'Confirm the current annual external invoice baseline before enabling this series.',
          );
        }
      }
      const settings = await tx.companyBillingSettings.upsert({
        where: { id: COMPANY_BILLING_SETTINGS_ID },
        create: {
          id: COMPANY_BILLING_SETTINGS_ID,
          ...input,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        update: { ...input, updatedByUserId: actorUserId },
      });
      await tx.auditLog.create({
        data: {
          action: 'admin.billing_settings.updated',
          entityType: 'CompanyBillingSettings',
          actorUserId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadataSummary: 'Company billing settings updated; no invoice snapshots were changed.',
        },
      });
      return settings;
    });
    return { settings: this.serialize(row) };
  }

  async confirmBaseline(
    input: InvoiceNumberBaselineRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceNumberSequenceResponse> {
    const sequence = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CompanyBillingSettings" WHERE id = ${COMPANY_BILLING_SETTINGS_ID} FOR UPDATE`;
      const settings = await tx.companyBillingSettings.findUnique({
        where: { id: COMPANY_BILLING_SETTINGS_ID },
      });
      if (!settings?.invoicePrefix || !settings.invoiceDigits) {
        throw conflict(
          'INVOICE_NUMBERING_CONFIGURATION_REQUIRED',
          'Configure an invoice prefix and digit width before confirming a baseline.',
        );
      }
      const max = 10 ** settings.invoiceDigits - 1;
      if (input.highestExternalNumber > max) {
        throw conflict(
          'INVOICE_NUMBER_RANGE_EXCEEDED',
          'The baseline exceeds the configured width.',
        );
      }
      const existing = await tx.invoiceNumberSequence.findUnique({
        where: { prefix_year: { prefix: settings.invoicePrefix, year: input.year } },
      });
      if (existing && input.highestExternalNumber < existing.lastNumber) {
        throw conflict(
          'INVOICE_NUMBER_BASELINE_REGRESSION',
          'The confirmed baseline cannot move behind an already reserved number.',
        );
      }
      const confirmedAt = new Date();
      const saved = await tx.invoiceNumberSequence.upsert({
        where: { prefix_year: { prefix: settings.invoicePrefix, year: input.year } },
        create: {
          prefix: settings.invoicePrefix,
          year: input.year,
          digits: settings.invoiceDigits,
          lastNumber: input.highestExternalNumber,
          externalHighestNumber: input.highestExternalNumber,
          confirmedByUserId: actorUserId,
          confirmedAt,
        },
        update: {
          digits: settings.invoiceDigits,
          lastNumber: input.highestExternalNumber,
          externalHighestNumber: input.highestExternalNumber,
          confirmedByUserId: actorUserId,
          confirmedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'admin.invoice_number_baseline.confirmed',
          entityType: 'InvoiceNumberSequence',
          entityId: saved.id,
          actorUserId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadataSummary: `Invoice sequence baseline confirmed for ${saved.prefix}-${saved.year}.`,
        },
      });
      return saved;
    });
    return {
      sequence: {
        prefix: sequence.prefix,
        year: sequence.year,
        digits: sequence.digits,
        lastNumber: sequence.lastNumber,
        externalHighestNumber: sequence.externalHighestNumber,
        confirmedAt: sequence.confirmedAt.toISOString(),
      },
    };
  }

  private serialize(row: CompanyBillingSettingsRow) {
    return {
      sellerLegalName: row.sellerLegalName,
      sellerLegalForm: row.sellerLegalForm,
      sellerCapital: row.sellerCapital,
      sellerAddress: row.sellerAddress,
      sellerIce: row.sellerIce,
      sellerTaxId: row.sellerTaxId,
      sellerRegistrationNumber: row.sellerRegistrationNumber,
      sellerPatente: row.sellerPatente,
      sellerPhone: row.sellerPhone,
      sellerEmail: row.sellerEmail,
      sellerWebsite: row.sellerWebsite,
      paymentTerms: row.paymentTerms,
      paymentMethod: row.paymentMethod,
      bankDetails: row.bankDetails,
      invoicePrefix: row.invoicePrefix,
      invoiceDigits: row.invoiceDigits,
      invoiceNumberingEnabled: row.invoiceNumberingEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
