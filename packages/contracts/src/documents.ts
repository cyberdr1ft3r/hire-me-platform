import { z } from 'zod';

export const DocumentTypeSchema = z.enum([
  'JOB_DESCRIPTION',
  'INTERVIEW_REPORT',
  'CANDIDATE_SUMMARY',
  'QUOTATION',
  'PURCHASE_ORDER',
  'LEGACY_CONTRACT',
  'CONTRAT_RECRUTEMENT',
  'CONTRAT_FORMATION',
  'INVOICE',
  'HR_DOCUMENT',
  'TECHNICAL_TEST_REPORT',
  'TRAINING_MATERIAL',
  'MESSAGE_ATTACHMENT',
  'CLIENT_FILE',
  'OTHER',
]);
export const DocumentStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED']);
export const DocumentVisibilitySchema = z.enum([
  'INTERNAL_ONLY',
  'ASSIGNED_ONLY',
  'CLIENT_SHARED',
  'PRIVATE',
]);
export const DocumentVersionSourceSchema = z.enum(['UPLOADED', 'GENERATED', 'IMPORTED']);
export const OutputFamilySchema = z.enum(['PDF', 'WORD', 'EXCEL', 'OTHER']);
export const DocumentBase64ContentMaxLength = 5_400_000;

function isStrictBase64Content(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  const firstPaddingIndex = value.indexOf('=');
  if (firstPaddingIndex !== -1) {
    const padding = value.length - firstPaddingIndex;
    if (padding > 2 || firstPaddingIndex < value.length - padding) {
      return false;
    }
    for (let index = firstPaddingIndex; index < value.length; index += 1) {
      if (value[index] !== '=') {
        return false;
      }
    }
  }
  const contentLength = firstPaddingIndex === -1 ? value.length : firstPaddingIndex;
  for (let index = 0; index < contentLength; index += 1) {
    const code = value.charCodeAt(index);
    const isAlphaUpper = code >= 65 && code <= 90;
    const isAlphaLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (
      !isAlphaUpper &&
      !isAlphaLower &&
      !isDigit &&
      value[index] !== '+' &&
      value[index] !== '/'
    ) {
      return false;
    }
  }
  return true;
}

export const DocumentContextSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    candidateId: z.string().uuid().optional(),
    recruitmentMissionId: z.string().uuid().optional(),
    missionCandidateId: z.string().uuid().optional(),
    interviewId: z.string().uuid().optional(),
  })
  .strict();

export const DocumentVersionInputSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(120),
  base64Content: z
    .string()
    .min(1)
    .max(DocumentBase64ContentMaxLength)
    .refine(isStrictBase64Content, {
      message: 'File content must be strict base64.',
    }),
  outputFamily: OutputFamilySchema.optional(),
});

export const DocumentCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(180),
  documentType: DocumentTypeSchema.exclude(['LEGACY_CONTRACT']),
  visibility: DocumentVisibilitySchema.default('INTERNAL_ONLY'),
  outputFamily: OutputFamilySchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  context: DocumentContextSchema.default({}),
  version: DocumentVersionInputSchema.optional(),
});

export const DocumentVersionCreateRequestSchema = DocumentVersionInputSchema;

export const DocumentUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    visibility: DocumentVisibilitySchema.optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable document field is required.',
  });

export const DocumentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  documentType: DocumentTypeSchema.optional(),
  status: DocumentStatusSchema.optional(),
  clientId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  missionCandidateId: z.string().uuid().optional(),
});

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  filename: z.string(),
  originalFilename: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().nullable(),
  outputFamily: OutputFamilySchema.nullable(),
  source: DocumentVersionSourceSchema,
  status: DocumentStatusSchema,
  archivedAt: z.string().datetime().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const DocumentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  documentType: DocumentTypeSchema,
  visibility: DocumentVisibilitySchema,
  status: DocumentStatusSchema,
  outputFamily: OutputFamilySchema.nullable(),
  ownerUserId: z.string().uuid().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  context: DocumentContextSchema,
  currentVersionId: z.string().uuid().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DocumentDetailSchema = DocumentSummarySchema.extend({
  versions: z.array(DocumentVersionSchema),
});

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const DocumentDetailResponseSchema = z.object({
  document: DocumentDetailSchema,
});

export const DocumentVersionListResponseSchema = z.object({
  versions: z.array(DocumentVersionSchema),
});

export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export type DocumentVisibility = z.infer<typeof DocumentVisibilitySchema>;
export type DocumentVersionSource = z.infer<typeof DocumentVersionSourceSchema>;
export type OutputFamily = z.infer<typeof OutputFamilySchema>;
export type DocumentContext = z.infer<typeof DocumentContextSchema>;
export type DocumentVersionInput = z.infer<typeof DocumentVersionInputSchema>;
export type DocumentCreateRequest = z.infer<typeof DocumentCreateRequestSchema>;
export type DocumentVersionCreateRequest = z.infer<typeof DocumentVersionCreateRequestSchema>;
export type DocumentUpdateRequest = z.infer<typeof DocumentUpdateRequestSchema>;
export type DocumentListQuery = z.infer<typeof DocumentListQuerySchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;
export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>;
export type DocumentDetailResponse = z.infer<typeof DocumentDetailResponseSchema>;
export type DocumentVersionListResponse = z.infer<typeof DocumentVersionListResponseSchema>;
