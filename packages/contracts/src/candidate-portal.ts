import { z } from 'zod';

export function candidateReturnPath(value: string | null | undefined): string {
  return value && /^\/opportunities\/[a-z0-9][a-z0-9-]{0,119}(?:#apply)?$/.test(value)
    ? value
    : '/candidate/applications';
}

export const candidateEmailSchema = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const CandidateEmailRequestSchema = z.object({
  email: candidateEmailSchema,
  returnTo: z.string().max(160).optional(),
});
export const CandidatePasswordLoginSchema = z.object({ email: candidateEmailSchema, password });
export const CandidateEmailCompletionSchema = z.object({ token, password: password.optional() });
export const CandidateGoogleLoginSchema = z.object({
  credential: z.string().min(1).max(8192),
  returnTo: z.string().max(160).optional(),
});
export const CandidatePortalConfigSchema = z.object({
  enabled: z.boolean(),
  googleClientId: z.string().nullable(),
});
export const CandidateGoogleChallengeSchema = z.object({ nonce: token });
export const CandidateGoogleResultSchema = z.object({ verified: z.boolean() });
export const CandidateSessionResponseSchema = z.object({
  candidate: z
    .object({ email: candidateEmailSchema, principal: z.literal('CANDIDATE') })
    .nullable(),
});
export const CandidateApplicationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  submittedAt: z.string().datetime(),
  status: z.enum(['RECEIVED', 'IN_REVIEW', 'CLOSED']),
});
export const CandidateApplicationsResponseSchema = z.object({
  applications: z.array(CandidateApplicationSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type CandidateApplication = z.infer<typeof CandidateApplicationSchema>;
