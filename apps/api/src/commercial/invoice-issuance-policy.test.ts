import { afterEach, describe, expect, it } from 'vitest';

import { InvoiceIssuancePolicy } from './invoice-issuance-policy.js';

const original = process.env.INVOICE_ISSUANCE_ENABLED;

afterEach(() => {
  if (original === undefined) {
    delete process.env.INVOICE_ISSUANCE_ENABLED;
  } else {
    process.env.INVOICE_ISSUANCE_ENABLED = original;
  }
});

describe('InvoiceIssuancePolicy', () => {
  it('allows invoice issuance when the deployment explicitly enables it', () => {
    process.env.INVOICE_ISSUANCE_ENABLED = 'true';
    expect(() => new InvoiceIssuancePolicy().assertEnabled()).not.toThrow();
  });

  it('blocks invoice issuance with a stable error when disabled', () => {
    process.env.INVOICE_ISSUANCE_ENABLED = 'false';

    try {
      new InvoiceIssuancePolicy().assertEnabled();
      throw new Error('Expected the issuance policy to reject');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        response: { error: { code: 'INVOICE_ISSUANCE_DISABLED' } },
        status: 403,
      });
    }
  });
});
