import { z } from 'zod';

/**
 * Issue #49 template-driven document and business-output generation.
 *
 * Structured business records stay authoritative. A generated file is only an output
 * snapshot, published as a normal immutable `DocumentVersion`, so nothing here models a
 * second mutable source of truth. These contracts stay Prisma-independent.
 */

/** Output families this issue renders. Excel generation is deliberately not included. */
export const GenerationOutputFamilySchema = z.enum(['PDF', 'WORD']);

/** Supported template languages. The product ships French and English only. */
export const GenerationLanguageSchema = z.enum(['fr', 'en']);

/** The authoritative business record a generated output was rendered from. */
export const GeneratedDocumentSourceSchema = z.enum([
  'COMMERCIAL_QUOTATION',
  'PURCHASE_ORDER',
  'COMMERCIAL_CONTRACT',
  'INVOICE',
  'TRAINING_ENROLLMENT',
]);

/**
 * Idempotency keys are caller-supplied and resolved globally, so replaying one key
 * against a different source, family, language, or template is a deterministic conflict
 * rather than a silently mismatched result. Bounded to keep the stored key safe.
 */
export const GenerationIdempotencyKeySchema = z.string().trim().min(8).max(128);

export const DocumentGenerationRequestSchema = z.object({
  outputFamily: GenerationOutputFamilySchema,
  language: GenerationLanguageSchema,
  idempotencyKey: GenerationIdempotencyKeySchema,
});

/** Invoice outputs distinguish a tax invoice from a non-issued draft preview. */
export const InvoiceGenerationPurposeSchema = z.enum(['ISSUED', 'DRAFT_PREVIEW']);

export const InvoiceDocumentGenerationRequestSchema = DocumentGenerationRequestSchema.extend({
  purpose: InvoiceGenerationPurposeSchema.default('ISSUED'),
}).superRefine((request, context) => {
  if (request.purpose === 'DRAFT_PREVIEW' && request.outputFamily !== 'PDF') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputFamily'],
      message: 'Draft invoice previews are available as PDF only.',
    });
  }
});

/**
 * Bounded provenance for one generated version. It answers what produced these exact
 * bytes without carrying the rendered content, storage key, or any commercial payload.
 */
export const GeneratedVersionProvenanceSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  sourceType: GeneratedDocumentSourceSchema,
  sourceId: z.string().uuid(),
  documentType: z.string(),
  outputFamily: GenerationOutputFamilySchema,
  language: GenerationLanguageSchema,
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string(),
  generatedByUserId: z.string().uuid().nullable(),
  generatedAt: z.string().datetime(),
  /** True when an idempotent replay returned the original version unchanged. */
  replayed: z.boolean(),
});

export const DocumentGenerationResponseSchema = z.object({
  generated: GeneratedVersionProvenanceSchema,
});

export type GenerationOutputFamily = z.infer<typeof GenerationOutputFamilySchema>;
export type GenerationLanguage = z.infer<typeof GenerationLanguageSchema>;
export type GeneratedDocumentSource = z.infer<typeof GeneratedDocumentSourceSchema>;
export type DocumentGenerationRequest = z.infer<typeof DocumentGenerationRequestSchema>;
export type InvoiceGenerationPurpose = z.infer<typeof InvoiceGenerationPurposeSchema>;
export type InvoiceDocumentGenerationRequest = z.infer<
  typeof InvoiceDocumentGenerationRequestSchema
>;
export type GeneratedVersionProvenance = z.infer<typeof GeneratedVersionProvenanceSchema>;
export type DocumentGenerationResponse = z.infer<typeof DocumentGenerationResponseSchema>;
