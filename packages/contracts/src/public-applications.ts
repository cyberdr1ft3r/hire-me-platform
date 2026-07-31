import { z } from 'zod';

const TrimmedTextSchema = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const PublicOpportunityStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'PAUSED',
  'CLOSED',
  'ARCHIVED',
]);
export const PublicApplicationFileCategorySchema = z.enum([
  'CV',
  'CERTIFICATION',
  'DIPLOMA',
  'ADDITIONAL',
]);

export const PublicOpportunityUploadRequirementsSchema = z.object({
  cvRequired: z.boolean(),
  certificationsEnabled: z.boolean(),
  certificationsRequired: z.boolean(),
  diplomasEnabled: z.boolean(),
  diplomasRequired: z.boolean(),
  additionalAttachmentsEnabled: z.boolean(),
  maxFileSizeBytes: z.number().int().positive(),
  maxTotalUploadBytes: z.number().int().positive(),
  allowedMimeTypes: z.array(z.string()),
});

export const PublicOpportunitySchema = z.object({
  publicSlug: z.string(),
  publicTitle: z.string(),
  publicSummary: z.string().nullable(),
  publicDescription: z.string().nullable(),
  publicLocation: z.string().nullable(),
  publicWorkArrangement: z.string().nullable(),
  publicEngagementType: z.string().nullable(),
  publicExperienceLevel: z.string().nullable(),
  publicSkills: z.string().nullable(),
  clientName: z.string().nullable(),
  salary: z
    .object({
      salaryMinCents: z.number().int().nonnegative().nullable(),
      salaryMaxCents: z.number().int().nonnegative().nullable(),
      salaryCurrency: z.string().nullable(),
    })
    .nullable(),
  applicationDeadline: z.string().datetime().nullable(),
  uploadRequirements: PublicOpportunityUploadRequirementsSchema,
});

export const PublicOpportunityListResponseSchema = z.object({
  opportunities: z.array(PublicOpportunitySchema),
});

export const PublicOpportunityDetailResponseSchema = z.object({
  opportunity: PublicOpportunitySchema,
});

export const PublicApplicationFileInputSchema = z.object({
  category: PublicApplicationFileCategorySchema,
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(120),
  base64Content: z.string().min(1),
});

export const PublicApplicationSubmitRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  phone: TrimmedTextSchema.optional(),
  city: TrimmedTextSchema.optional(),
  country: TrimmedTextSchema.optional(),
  currentPosition: TrimmedTextSchema.optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  skills: TrimmedTextSchema.optional(),
  languages: TrimmedTextSchema.optional(),
  availability: TrimmedTextSchema.optional(),
  salaryExpectationCents: z.number().int().nonnegative().optional(),
  salaryExpectationCurrency: TrimmedTextSchema.optional(),
  professionalLinks: TrimmedTextSchema.optional(),
  motivation: TrimmedTextSchema.optional(),
  consentGranted: z.boolean(),
  captchaToken: TrimmedTextSchema.optional(),
  website: TrimmedTextSchema.optional(),
  files: z.array(PublicApplicationFileInputSchema).max(8),
});

export const PublicApplicationSubmitResponseSchema = z.object({
  status: z.literal('RECEIVED'),
  message: z.string(),
});

export const InternalPublicOpportunitySchema = PublicOpportunitySchema.extend({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  status: PublicOpportunityStatusSchema,
  applicationLinkEnabled: z.boolean(),
  listedOnWebsite: z.boolean(),
  publicationStartsAt: z.string().datetime().nullable(),
  showClientName: z.boolean(),
  showSalary: z.boolean(),
  consentTextVersion: z.string(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const InternalPublicOpportunityDetailResponseSchema = z.object({
  publicOpportunity: InternalPublicOpportunitySchema,
});

export const InternalPublicOpportunityUpdateRequestSchema = z.object({
  status: PublicOpportunityStatusSchema.optional(),
  applicationLinkEnabled: z.boolean().optional(),
  listedOnWebsite: z.boolean().optional(),
  publicSlug: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .optional(),
  publicationStartsAt: z.string().datetime().nullable().optional(),
  applicationDeadline: z.string().datetime().nullable().optional(),
  publicTitle: z.string().trim().min(1).max(180).optional(),
  publicSummary: z.string().trim().max(800).nullable().optional(),
  publicDescription: z.string().trim().max(4000).nullable().optional(),
  publicLocation: z.string().trim().max(160).nullable().optional(),
  publicWorkArrangement: z.string().trim().max(120).nullable().optional(),
  publicEngagementType: z.string().trim().max(120).nullable().optional(),
  publicExperienceLevel: z.string().trim().max(120).nullable().optional(),
  publicSkills: z.string().trim().max(1200).nullable().optional(),
  showClientName: z.boolean().optional(),
  showSalary: z.boolean().optional(),
  cvRequired: z.boolean().optional(),
  certificationsEnabled: z.boolean().optional(),
  certificationsRequired: z.boolean().optional(),
  diplomasEnabled: z.boolean().optional(),
  diplomasRequired: z.boolean().optional(),
  additionalAttachmentsEnabled: z.boolean().optional(),
  consentTextVersion: z.string().trim().min(1).max(120).optional(),
});

export const InternalPublicApplicationSummarySchema = z.object({
  id: z.string().uuid(),
  publicOpportunityId: z.string().uuid(),
  missionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  missionCandidateId: z.string().uuid(),
  submittedFullName: z.string(),
  submittedEmail: z.string(),
  submittedCity: z.string().nullable(),
  submittedCountry: z.string().nullable(),
  submittedCurrentPosition: z.string().nullable(),
  fileCount: z.number().int().nonnegative(),
  submittedAt: z.string().datetime(),
});

export const InternalPublicApplicationListResponseSchema = z.object({
  applications: z.array(InternalPublicApplicationSummarySchema),
});

export type PublicOpportunity = z.infer<typeof PublicOpportunitySchema>;
export type PublicOpportunityListResponse = z.infer<typeof PublicOpportunityListResponseSchema>;
export type PublicOpportunityDetailResponse = z.infer<typeof PublicOpportunityDetailResponseSchema>;
export type PublicApplicationFileInput = z.infer<typeof PublicApplicationFileInputSchema>;
export type PublicApplicationSubmitRequest = z.infer<typeof PublicApplicationSubmitRequestSchema>;
export type PublicApplicationSubmitResponse = z.infer<typeof PublicApplicationSubmitResponseSchema>;
export type InternalPublicOpportunity = z.infer<typeof InternalPublicOpportunitySchema>;
export type InternalPublicOpportunityUpdateRequest = z.infer<
  typeof InternalPublicOpportunityUpdateRequestSchema
>;
export type InternalPublicOpportunityDetailResponse = z.infer<
  typeof InternalPublicOpportunityDetailResponseSchema
>;
export type InternalPublicApplicationSummary = z.infer<
  typeof InternalPublicApplicationSummarySchema
>;
export type InternalPublicApplicationListResponse = z.infer<
  typeof InternalPublicApplicationListResponseSchema
>;
