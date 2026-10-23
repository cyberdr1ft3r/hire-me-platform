import { describe, expect, it } from 'vitest';

import { InvoiceIssueRequestSchema } from './commercial.js';

const businessDetails = {
  sellerLegalName: 'Synthetic HireMe SARL',
  sellerAddress: '1 Synthetic Avenue, Casablanca',
  sellerIce: 'SYNTHETIC-ICE',
  sellerTaxId: 'SYNTHETIC-IF',
  sellerRegistrationNumber: 'SYNTHETIC-RC',
  buyerLegalName: 'Synthetic Client SA',
  buyerAddress: '2 Test Street, Rabat',
  buyerIce: 'CLIENT-ICE',
  paymentTerms: 'Bank transfer within 30 days.',
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
});
