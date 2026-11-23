import type { CompanyBillingSettingsUpdateRequest } from '@hire-me/contracts';

import { AdminRequestError } from '../api.js';
import type { PlainMessageKey } from '../i18n/index.js';

export const billingGroups = [
  {
    title: 'admin.billing.legal',
    fields: [
      'sellerLegalName',
      'sellerLegalForm',
      'sellerRegistrationNumber',
      'sellerIce',
      'sellerTaxId',
      'sellerPatente',
      'sellerCapital',
      'sellerAddress',
    ],
  },
  {
    title: 'admin.billing.contact',
    fields: ['sellerPhone', 'sellerEmail', 'sellerWebsite'],
  },
  {
    title: 'admin.billing.payment',
    fields: ['paymentTerms', 'paymentMethod', 'bankDetails'],
  },
] as const;

export type BillingField = (typeof billingGroups)[number]['fields'][number];
export type BillingSettings = CompanyBillingSettingsUpdateRequest;
export type Numbering = Pick<
  BillingSettings,
  'invoicePrefix' | 'invoiceDigits' | 'invoiceNumberingEnabled'
>;

export const profileFields = billingGroups.flatMap<BillingField>(({ fields }) => [...fields]);

export function numberingOf({
  invoicePrefix,
  invoiceDigits,
  invoiceNumberingEnabled,
}: Numbering): Numbering {
  return { invoicePrefix, invoiceDigits, invoiceNumberingEnabled };
}

export function sameSeries(first: Numbering, second: Numbering): boolean {
  return (
    first.invoicePrefix === second.invoicePrefix &&
    first.invoiceDigits === second.invoiceDigits &&
    first.invoiceNumberingEnabled === second.invoiceNumberingEnabled
  );
}

export class BillingSeriesChangedError extends Error {}

export function billingWriteError(error: unknown): PlainMessageKey {
  if (error instanceof BillingSeriesChangedError) return 'admin.billing.seriesChanged';
  if (error instanceof AdminRequestError) {
    switch (error.code) {
      case 'INVOICE_NUMBER_BASELINE_REQUIRED':
        return 'admin.billing.baselineRequired';
      case 'INVOICE_NUMBERING_CONFIGURATION_REQUIRED':
        return 'admin.billing.seriesRequired';
      case 'INVOICE_NUMBER_RANGE_EXCEEDED':
        return 'admin.billing.rangeExceeded';
      case 'INVOICE_NUMBER_BASELINE_REGRESSION':
        return 'admin.billing.baselineRegression';
    }
    if (error.status === 403) return 'admin.billing.denied';
  }
  return 'admin.billing.writeFailed';
}
