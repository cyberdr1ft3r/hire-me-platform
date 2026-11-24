import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const id = z.string().uuid();
const revision = z.number().int().min(0).max(2147483646);
export const CandidateProfileFieldsSchema = z.strictObject({
  fullName: text(160).min(1),
  phone: text(80),
  city: text(180),
  country: text(180),
  currentPosition: text(180),
  summary: text(4000),
  experience: text(4000),
  education: text(4000),
  skills: text(4000),
  languages: text(4000),
  qualifications: text(4000),
  professionalLinks: text(4000).refine((value) =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .every((link) => {
        try {
          const parsed = new URL(link);
          return (
            ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password
          );
        } catch {
          return false;
        }
      }),
  ),
  availability: text(180),
});
export const CandidateProfileSaveSchema = z.strictObject({
  profile: CandidateProfileFieldsSchema,
  revision,
});
export const CandidateProfileResponseSchema = z.strictObject({
  email: z.string().email(),
  profile: CandidateProfileFieldsSchema.nullable(),
  revision,
});
export const CandidateCvVersionSchema = z.strictObject({
  id,
  version: z.number().int().positive(),
  filename: z.string(),
  sizeBytes: z.number().int().positive(),
  scannedAt: z.string().datetime(),
});
export const CandidateCvSchema = z.strictObject({
  id,
  preferred: z.boolean(),
  versions: z.array(CandidateCvVersionSchema).min(1),
});
export const CandidateCvsResponseSchema = z.strictObject({ cvs: z.array(CandidateCvSchema) });
export const CandidateSubmissionResponseSchema = z.strictObject({
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  currentPosition: z.string().nullable(),
  skills: z.string().nullable(),
  languages: z.string().nullable(),
  availability: z.string().nullable(),
  professionalLinks: z.string().nullable(),
  motivation: z.string().nullable(),
  cvFilename: z.string().nullable(),
  libraryVersion: z.number().int().positive().nullable(),
});

export type CandidateProfileFields = z.infer<typeof CandidateProfileFieldsSchema>;
export type CandidateProfileResponse = z.infer<typeof CandidateProfileResponseSchema>;
export type CandidateCv = z.infer<typeof CandidateCvSchema>;
export type CandidateCvVersion = z.infer<typeof CandidateCvVersionSchema>;
export type CandidateSubmission = z.infer<typeof CandidateSubmissionResponseSchema>;
