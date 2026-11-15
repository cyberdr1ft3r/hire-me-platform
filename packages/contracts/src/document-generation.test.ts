import { describe, expect, it } from 'vitest';

import { InvoiceDocumentGenerationRequestSchema } from './document-generation.js';

const base = {
  idempotencyKey: 'preview-request-123',
  language: 'fr' as const,
  outputFamily: 'PDF' as const,
};

describe('invoice document generation contract', () => {
  it('accepts a PDF-only draft preview request', () => {
    expect(
      InvoiceDocumentGenerationRequestSchema.parse({ ...base, purpose: 'DRAFT_PREVIEW' }),
    ).toEqual({ ...base, purpose: 'DRAFT_PREVIEW' });
  });

  it('defaults to issued generation and rejects Word draft previews', () => {
    expect(InvoiceDocumentGenerationRequestSchema.parse(base).purpose).toBe('ISSUED');
    expect(
      InvoiceDocumentGenerationRequestSchema.safeParse({
        ...base,
        outputFamily: 'WORD',
        purpose: 'DRAFT_PREVIEW',
      }).success,
    ).toBe(false);
  });
});
