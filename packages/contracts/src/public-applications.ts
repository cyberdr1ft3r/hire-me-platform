import { z } from 'zod';

import { CANDIDATE_SALARY_EXPECTATION_CENTS_MAX } from './candidates.js';

const TrimmedTextSchema = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value && value.length > 0 ? value : undefined));

/**
 * The one public salary-expectation currency rule (Issue #86 / A-75-05), shared
 * by the public submit contract and the public browser form so they cannot
 * drift apart.
 *
 * The currency is optional. Surrounding whitespace is trimmed, as every other
 * public text field is; an empty result means no currency and is omitted.
 * Otherwise it must be exactly three ASCII letters and is returned in
 * uppercase, so `eur`, `Eur`, and ` EUR ` all become `EUR`. This is a shape
 * rule only: no ISO 4217 catalogue, no conversion, and no pairing with the
 * salary amount. A refusal carries no copy of the submitted text.
 */
export type PublicSalaryExpectationCurrencyResult =
  { ok: true; currency: string | undefined } | { ok: false };

const PUBLIC_SALARY_EXPECTATION_CURRENCY_SHAPE = /^[A-Za-z]{3}$/;

export function normalizePublicSalaryExpectationCurrency(
  value: string,
): PublicSalaryExpectationCurrencyResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, currency: undefined };
  }
  return PUBLIC_SALARY_EXPECTATION_CURRENCY_SHAPE.test(trimmed)
    ? { ok: true, currency: trimmed.toUpperCase() }
    : { ok: false };
}

const PublicSalaryExpectationCurrencySchema = z.string().transform((value, context) => {
  const result = normalizePublicSalaryExpectationCurrency(value);
  if (!result.ok) {
    context.addIssue({ code: 'custom', message: 'Invalid salary expectation currency.' });
    return z.NEVER;
  }
  return result.currency;
});

/**
 * The staff-declared language of an opportunity's recruiter-authored copy
 * (Issue #88 / D-070): exactly `en` or `fr`, lowercase. `null` means the
 * language was not declared. Nothing else is accepted, normalized, or
 * inferred, so this value is the only thing that may reach an authored
 * element's `lang` attribute.
 */
export const PublicContentLanguageSchema = z.enum(['en', 'fr']);

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
  contentLanguage: PublicContentLanguageSchema.nullable(),
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
  /**
   * Integer minor units, as the field name says, for every caller. A browser
   * form converts what a person typed in major units before it gets here; a
   * direct API caller keeps sending cents. The bound is the same PostgreSQL
   * `integer` maximum the stored columns hold, so an oversized amount is a
   * request validation failure instead of a database error.
   */
  salaryExpectationCents: z
    .number()
    .int()
    .nonnegative()
    .max(CANDIDATE_SALARY_EXPECTATION_CENTS_MAX)
    .optional(),
  /**
   * Optional; when present, exactly three ASCII letters after trimming, stored
   * in uppercase. See `normalizePublicSalaryExpectationCurrency`.
   */
  salaryExpectationCurrency: PublicSalaryExpectationCurrencySchema.optional(),
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
  /** Absent keeps the stored value; `null` clears it to "not declared". */
  contentLanguage: PublicContentLanguageSchema.nullable().optional(),
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

export type PublicContentLanguage = z.infer<typeof PublicContentLanguageSchema>;
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
