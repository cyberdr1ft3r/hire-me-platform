import { describe, expect, it } from 'vitest';

import {
  CompanyBillingSettingsUpdateRequestSchema,
  InvoiceNumberBaselineRequestSchema,
} from './admin.js';

const emptyProfile = {
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
};

describe('company billing settings contract', () => {
  it('allows an unconfigured profile without inventing production company data', () => {
    expect(CompanyBillingSettingsUpdateRequestSchema.parse(emptyProfile)).toEqual(emptyProfile);
  });

  it('requires an explicit prefix and width before enabling numbering', () => {
    expect(
      CompanyBillingSettingsUpdateRequestSchema.safeParse({
        ...emptyProfile,
        invoiceNumberingEnabled: true,
      }).success,
    ).toBe(false);
    expect(
      CompanyBillingSettingsUpdateRequestSchema.safeParse({
        ...emptyProfile,
        invoicePrefix: 'HM',
        invoiceDigits: 3,
        invoiceNumberingEnabled: true,
      }).success,
    ).toBe(true);
  });

  it('requires an affirmative external-number confirmation', () => {
    expect(
      InvoiceNumberBaselineRequestSchema.safeParse({
        year: 2026,
        highestExternalNumber: 2,
        confirmed: false,
      }).success,
    ).toBe(false);
  });
});
