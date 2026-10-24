import { describe, expect, it } from 'vitest';

import { InvoiceIssueRequestSchema } from './commercial.js';

const businessDetails = {
  sellerLegalName: 'Synthetic HireMe SARL',
  sellerLegalForm: 'Synthetic SARL',
  sellerCapital: '100 000 MAD synthetic',
  sellerAddress: '1 Synthetic Avenue, Casablanca',
  sellerIce: 'SYNTHETIC-ICE',
  sellerTaxId: 'SYNTHETIC-IF',
  sellerRegistrationNumber: 'SYNTHETIC-RC',
  sellerEmail: 'synthetic@example.invalid',
  sellerWebsite: 'https://example.invalid',
  buyerLegalName: 'Synthetic Client SA',
  buyerAddress: '2 Test Street, Rabat',
  buyerIce: 'CLIENT-ICE',
  buyerBillingContact: 'Synthetic Billing Contact',
  customerReference: 'BC-TEST-2026-0042',
  paymentTerms: 'Bank transfer within 30 days.',
  paymentMethod: 'Synthetic transfer',
  bankDetails: 'Synthetic test account only.',
  taxTreatment: 'Synthetic 20% VAT test treatment.',
};

describe('invoice issue contract', () => {
  it('requires the immutable business snapshot and both dates', () => {
    expect(InvoiceIssueRequestSchema.safeParse({}).success).toBe(false);
    expect(
      InvoiceIssueRequestSchema.safeParse({
        issueDate: '2026-10-23T00:00:00.000Z',
        dueDate: '2026-11-23T00:00:00.000Z',
        businessDetails,
      }).success,
    ).toBe(true);
  });

  it('rejects a due date before the issue date', () => {
    expect(
      InvoiceIssueRequestSchema.safeParse({
        issueDate: '2026-10-23T00:00:00.000Z',
        dueDate: '2026-10-22T00:00:00.000Z',
        businessDetails,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed optional seller contact data', () => {
    expect(
      InvoiceIssueRequestSchema.safeParse({
        issueDate: '2026-10-23T00:00:00.000Z',
        dueDate: '2026-11-23T00:00:00.000Z',
        businessDetails: { ...businessDetails, sellerEmail: 'not-an-email' },
      }).success,
    ).toBe(false);
  });

  it('accepts an omitted customer-provided reference', () => {
    const parsed = InvoiceIssueRequestSchema.parse({
      issueDate: '2026-10-23T00:00:00.000Z',
      dueDate: '2026-11-23T00:00:00.000Z',
      businessDetails: { ...businessDetails, customerReference: undefined },
    });
    expect(parsed.businessDetails.customerReference).toBeUndefined();
  });
});
