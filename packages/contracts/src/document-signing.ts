import { z } from 'zod';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const SigningKindSchema = z.enum(['PERSON_SIGNATURE', 'ORGANIZATION_SEAL']);
export const SigningRequestStateSchema = z.enum([
  'PREPARED',
  'APPROVED',
  'AWAITING_RESULT',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'STALE',
]);
export const SigningCredentialStatusSchema = z.enum(['ENABLED', 'DISABLED', 'ARCHIVED']);
export const SigningGrantActionSchema = z.enum(['USE_PERSON_SIGNATURE', 'USE_ORGANIZATION_SEAL']);

const forbiddenSecretKeys = [
  'privateKey',
  'privateKeyPem',
  'pin',
  'puk',
  'p12',
  'pfx',
  'tokenSecret',
  'providerSecret',
] as const;

function rejectSecretKeys(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return true;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (forbiddenSecretKeys.some((forbidden) => forbidden === key)) {
      return false;
    }
  }
  return true;
}

export const SigningOrganizationCreateRequestSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    registrationNumber: z.string().trim().min(1).max(120).optional(),
    countryCode: z.string().trim().length(2).optional(),
  })
  .strict()
  .refine(rejectSecretKeys, { message: 'Secret key material is not accepted.' });

export const SigningOrganizationSummarySchema = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
  registrationNumber: z.string().nullable(),
  countryCode: z.string(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
});

export const SigningCredentialCreateRequestSchema = z
  .object({
    ownerType: z.enum(['USER', 'ORGANIZATION']),
    ownerUserId: z.string().uuid().optional(),
    signingOrganizationId: z.string().uuid().optional(),
    providerLabel: z.string().trim().min(1).max(120),
    serviceTypeOid: z.string().trim().min(1).max(120).optional(),
    certificateSerial: z.string().trim().min(1).max(120),
    certificateFingerprintSha256: sha256Hex,
    certificateSubjectSummary: z.string().trim().min(1).max(500),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime(),
  })
  .strict()
  .refine(rejectSecretKeys, { message: 'Secret key material is not accepted.' })
  .refine(
    (value) =>
      (value.ownerType === 'USER' && value.ownerUserId && !value.signingOrganizationId) ||
      (value.ownerType === 'ORGANIZATION' && value.signingOrganizationId && !value.ownerUserId),
    { message: 'Credential owner must be exactly one user or organization.' },
  );

export const SigningCredentialGrantCreateRequestSchema = z
  .object({
    userId: z.string().uuid(),
    allowedAction: SigningGrantActionSchema,
    authorityReference: z.string().trim().min(1).max(200),
    expiresAt: z.string().datetime().optional(),
  })
  .strict()
  .refine(rejectSecretKeys, { message: 'Secret key material is not accepted.' });

export const SigningRequestCreateRequestSchema = z
  .object({
    kind: SigningKindSchema,
    signingCredentialId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(1).max(120),
    intendedSignerUserId: z.string().uuid().optional(),
    signingOrganizationId: z.string().uuid().optional(),
  })
  .strict()
  .refine(rejectSecretKeys, { message: 'Secret key material is not accepted.' })
  .refine(
    (value) =>
      (value.kind === 'PERSON_SIGNATURE' &&
        value.intendedSignerUserId &&
        !value.signingOrganizationId) ||
      (value.kind === 'ORGANIZATION_SEAL' &&
        value.signingOrganizationId &&
        !value.intendedSignerUserId),
    { message: 'Signing kind requires the matching identity target.' },
  );

export const SigningRequestApproveRequestSchema = z
  .object({
    confirmationSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine(rejectSecretKeys, { message: 'Secret key material is not accepted.' });

export const SigningRequestSummarySchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  sourceSha256: sha256Hex,
  sourceSnapshotSha256: sha256Hex.nullable(),
  kind: SigningKindSchema,
  state: SigningRequestStateSchema,
  methodIdentifier: z.string(),
  policyVersion: z.string(),
  expiresAt: z.string().datetime(),
  terminalReason: z.string().nullable(),
  bindingHash: sha256Hex,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const SigningRequestDetailResponseSchema = z.object({
  request: SigningRequestSummarySchema,
});

export const SigningEventSummarySchema = z.object({
  sequence: z.number().int().nonnegative(),
  action: z.string(),
  reasonCode: z.string().nullable(),
  metadataSummary: z.string(),
  occurredAt: z.string().datetime(),
});

export const SigningRequestAuditResponseSchema = z.object({
  requestId: z.string().uuid(),
  events: z.array(SigningEventSummarySchema),
});

export type SigningKind = z.infer<typeof SigningKindSchema>;
export type SigningRequestCreateRequest = z.infer<typeof SigningRequestCreateRequestSchema>;
export type SigningRequestApproveRequest = z.infer<typeof SigningRequestApproveRequestSchema>;
export type SigningRequestDetailResponse = z.infer<typeof SigningRequestDetailResponseSchema>;
export type SigningRequestAuditResponse = z.infer<typeof SigningRequestAuditResponseSchema>;
export type SigningCredentialCreateRequest = z.infer<typeof SigningCredentialCreateRequestSchema>;
export type SigningCredentialGrantCreateRequest = z.infer<
  typeof SigningCredentialGrantCreateRequestSchema
>;
export type SigningOrganizationCreateRequest = z.infer<
  typeof SigningOrganizationCreateRequestSchema
>;
