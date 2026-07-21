import { z } from 'zod';

export const CandidateStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'TALENT_POOL', 'ARCHIVED']);
export const CandidateConsentStatusSchema = z.enum(['UNKNOWN', 'GRANTED', 'REVOKED', 'EXPIRED']);

export const CandidateCompensationSchema = z.object({
  salaryExpectationCents: z.number().int().nonnegative().nullable(),
  salaryExpectationCurrency: z.string().nullable(),
});

export const CandidateConsentSchema = z.object({
  consentStatus: CandidateConsentStatusSchema,
  consentRecordedAt: z.string().datetime().nullable(),
});

export const CandidateSkillSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  name: z.string(),
  level: z.string().nullable(),
  years: z.number().int().nonnegative().nullable(),
  lastUsed: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CandidateLanguageSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  language: z.string(),
  proficiency: z.string(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CandidateWorkExperienceSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  employer: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  description: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CandidateEducationSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  institution: z.string(),
  qualification: z.string(),
  field: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  description: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CandidateSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email().nullable(),
  normalizedEmail: z.string().email().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  currentJobTitle: z.string().nullable(),
  professionalSummary: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  status: CandidateStatusSchema,
  source: z.string().nullable(),
  sourceDetail: z.string().nullable(),
  availabilityNotice: z.string().nullable(),
  compensation: CandidateCompensationSchema.nullable(),
  consent: CandidateConsentSchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CandidateDetailSchema = CandidateSummarySchema.extend({
  skills: z.array(CandidateSkillSchema),
  languages: z.array(CandidateLanguageSchema),
  workExperiences: z.array(CandidateWorkExperienceSchema),
  education: z.array(CandidateEducationSchema),
});

export const CandidateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: CandidateStatusSchema.optional(),
  source: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
});

export const CandidateCreateRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(180),
  firstName: z.string().trim().min(1).max(90).optional(),
  lastName: z.string().trim().min(1).max(90).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().trim().min(1).max(60).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  currentJobTitle: z.string().trim().min(1).max(160).optional(),
  professionalSummary: z.string().trim().min(1).max(3000).optional(),
  linkedinUrl: z.string().trim().min(1).max(2048).optional(),
  status: CandidateStatusSchema.exclude(['ARCHIVED']).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  sourceDetail: z.string().trim().min(1).max(500).optional(),
  availabilityNotice: z.string().trim().min(1).max(240).optional(),
  salaryExpectationCents: z.number().int().nonnegative().optional(),
  salaryExpectationCurrency: z.string().trim().min(3).max(3).optional(),
  consentStatus: CandidateConsentStatusSchema.optional(),
  consentRecordedAt: z.string().datetime().optional(),
});

export const CandidateUpdateRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(180).optional(),
    firstName: z.string().trim().min(1).max(90).nullable().optional(),
    lastName: z.string().trim().min(1).max(90).nullable().optional(),
    email: z.string().email().max(254).nullable().optional(),
    phone: z.string().trim().min(1).max(60).nullable().optional(),
    city: z.string().trim().min(1).max(120).nullable().optional(),
    country: z.string().trim().min(1).max(120).nullable().optional(),
    currentJobTitle: z.string().trim().min(1).max(160).nullable().optional(),
    professionalSummary: z.string().trim().min(1).max(3000).nullable().optional(),
    linkedinUrl: z.string().trim().min(1).max(2048).nullable().optional(),
    source: z.string().trim().min(1).max(120).nullable().optional(),
    sourceDetail: z.string().trim().min(1).max(500).nullable().optional(),
    availabilityNotice: z.string().trim().min(1).max(240).nullable().optional(),
    salaryExpectationCents: z.number().int().nonnegative().nullable().optional(),
    salaryExpectationCurrency: z.string().trim().min(3).max(3).nullable().optional(),
    consentStatus: CandidateConsentStatusSchema.optional(),
    consentRecordedAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable candidate field is required.',
  });

export const CandidateStatusUpdateRequestSchema = z.object({
  status: CandidateStatusSchema,
});

export const CandidateSkillCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(80).optional(),
  years: z.number().int().nonnegative().max(80).optional(),
  lastUsed: z.string().trim().min(1).max(40).optional(),
});

export const CandidateSkillUpdateRequestSchema = CandidateSkillCreateRequestSchema.partial()
  .extend({
    level: z.string().trim().min(1).max(80).nullable().optional(),
    years: z.number().int().nonnegative().max(80).nullable().optional(),
    lastUsed: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable skill field is required.',
  });

export const CandidateLanguageCreateRequestSchema = z.object({
  language: z.string().trim().min(1).max(120),
  proficiency: z.string().trim().min(1).max(80),
});

export const CandidateLanguageUpdateRequestSchema =
  CandidateLanguageCreateRequestSchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable language field is required.',
  });

export const CandidateWorkExperienceCreateRequestSchema = z.object({
  employer: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(180),
  startDate: z.string().trim().min(1).max(40).optional(),
  endDate: z.string().trim().min(1).max(40).optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().min(1).max(2000).optional(),
});

export const CandidateWorkExperienceUpdateRequestSchema =
  CandidateWorkExperienceCreateRequestSchema.partial()
    .extend({
      startDate: z.string().trim().min(1).max(40).nullable().optional(),
      endDate: z.string().trim().min(1).max(40).nullable().optional(),
      description: z.string().trim().min(1).max(2000).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one editable experience field is required.',
    });

export const CandidateEducationCreateRequestSchema = z.object({
  institution: z.string().trim().min(1).max(180),
  qualification: z.string().trim().min(1).max(180),
  field: z.string().trim().min(1).max(180).optional(),
  startDate: z.string().trim().min(1).max(40).optional(),
  endDate: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
});

export const CandidateEducationUpdateRequestSchema = CandidateEducationCreateRequestSchema.partial()
  .extend({
    field: z.string().trim().min(1).max(180).nullable().optional(),
    startDate: z.string().trim().min(1).max(40).nullable().optional(),
    endDate: z.string().trim().min(1).max(40).nullable().optional(),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable education field is required.',
  });

export const CandidateListResponseSchema = z.object({
  candidates: z.array(CandidateSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const CandidateDetailResponseSchema = z.object({
  candidate: CandidateDetailSchema,
});

export const CandidateSkillDetailResponseSchema = z.object({ skill: CandidateSkillSchema });
export const CandidateSkillListResponseSchema = z.object({
  skills: z.array(CandidateSkillSchema),
});
export const CandidateLanguageDetailResponseSchema = z.object({
  language: CandidateLanguageSchema,
});
export const CandidateLanguageListResponseSchema = z.object({
  languages: z.array(CandidateLanguageSchema),
});
export const CandidateWorkExperienceDetailResponseSchema = z.object({
  workExperience: CandidateWorkExperienceSchema,
});
export const CandidateWorkExperienceListResponseSchema = z.object({
  workExperiences: z.array(CandidateWorkExperienceSchema),
});
export const CandidateEducationDetailResponseSchema = z.object({
  education: CandidateEducationSchema,
});
export const CandidateEducationListResponseSchema = z.object({
  education: z.array(CandidateEducationSchema),
});

export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export type CandidateConsentStatus = z.infer<typeof CandidateConsentStatusSchema>;
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;
export type CandidateDetail = z.infer<typeof CandidateDetailSchema>;
export type CandidateSkill = z.infer<typeof CandidateSkillSchema>;
export type CandidateLanguage = z.infer<typeof CandidateLanguageSchema>;
export type CandidateWorkExperience = z.infer<typeof CandidateWorkExperienceSchema>;
export type CandidateEducation = z.infer<typeof CandidateEducationSchema>;
export type CandidateListQuery = z.infer<typeof CandidateListQuerySchema>;
export type CandidateCreateRequest = z.infer<typeof CandidateCreateRequestSchema>;
export type CandidateUpdateRequest = z.infer<typeof CandidateUpdateRequestSchema>;
export type CandidateStatusUpdateRequest = z.infer<typeof CandidateStatusUpdateRequestSchema>;
export type CandidateSkillCreateRequest = z.infer<typeof CandidateSkillCreateRequestSchema>;
export type CandidateSkillUpdateRequest = z.infer<typeof CandidateSkillUpdateRequestSchema>;
export type CandidateLanguageCreateRequest = z.infer<typeof CandidateLanguageCreateRequestSchema>;
export type CandidateLanguageUpdateRequest = z.infer<typeof CandidateLanguageUpdateRequestSchema>;
export type CandidateWorkExperienceCreateRequest = z.infer<
  typeof CandidateWorkExperienceCreateRequestSchema
>;
export type CandidateWorkExperienceUpdateRequest = z.infer<
  typeof CandidateWorkExperienceUpdateRequestSchema
>;
export type CandidateEducationCreateRequest = z.infer<typeof CandidateEducationCreateRequestSchema>;
export type CandidateEducationUpdateRequest = z.infer<typeof CandidateEducationUpdateRequestSchema>;
export type CandidateListResponse = z.infer<typeof CandidateListResponseSchema>;
export type CandidateDetailResponse = z.infer<typeof CandidateDetailResponseSchema>;
export type CandidateSkillDetailResponse = z.infer<typeof CandidateSkillDetailResponseSchema>;
export type CandidateSkillListResponse = z.infer<typeof CandidateSkillListResponseSchema>;
export type CandidateLanguageDetailResponse = z.infer<typeof CandidateLanguageDetailResponseSchema>;
export type CandidateLanguageListResponse = z.infer<typeof CandidateLanguageListResponseSchema>;
export type CandidateWorkExperienceDetailResponse = z.infer<
  typeof CandidateWorkExperienceDetailResponseSchema
>;
export type CandidateWorkExperienceListResponse = z.infer<
  typeof CandidateWorkExperienceListResponseSchema
>;
export type CandidateEducationDetailResponse = z.infer<
  typeof CandidateEducationDetailResponseSchema
>;
export type CandidateEducationListResponse = z.infer<typeof CandidateEducationListResponseSchema>;
