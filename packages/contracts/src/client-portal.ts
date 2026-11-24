import { z } from 'zod';

const id = z.string().uuid();
const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
export const clientPortalPermissions = {
  staff: ['clients:view', 'clients:update'],
  access: ['client_contacts:view', 'client_contacts:status:manage'],
  convert: ['missions:create'],
  publish: [
    'candidates:view',
    'candidate_profile:view',
    'candidate_consent:view',
    'candidates:update',
  ],
  shortlist: ['missions:view', 'mission_candidates:present'],
} as const;

export const ClientPortalConfigSchema = z.strictObject({ enabled: z.boolean() });
export const ClientPortalEmptyResponseSchema = z.undefined();
export const ClientPortalLoginSchema = z.strictObject({ email, password });
export const ClientPortalForgotSchema = z.strictObject({ email });
export const ClientPortalProofSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password,
});
export const ClientInvitationSchema = z.strictObject({ contactId: id });
export const ClientDemandStatuses = z.enum([
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CONVERTED',
]);
export const ClientDemandReasons = z.enum(['MORE_DETAILS', 'OUTSIDE_SCOPE', 'CAPACITY']);
export const ClientDemandFieldsSchema = z.strictObject({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(3000),
  location: z.string().trim().max(120),
  numberOfPositions: z.number().int().min(1).max(100),
});
export const ClientDemandRevisionSchema = z.strictObject({
  revision: z.number().int().positive().max(2147483646),
});
export const ClientDemandEditSchema = ClientDemandFieldsSchema.extend(
  ClientDemandRevisionSchema.shape,
);
export const ClientDemandDecisionSchema = ClientDemandRevisionSchema.extend({
  action: z.enum(['REVIEW', 'APPROVE', 'REJECT', 'REVISE', 'CONVERT']),
  reason: ClientDemandReasons.optional(),
}).superRefine(({ action, reason }, context) => {
  const valid =
    action === 'REVISE'
      ? reason === 'MORE_DETAILS'
      : action === 'REJECT'
        ? reason === 'OUTSIDE_SCOPE' || reason === 'CAPACITY'
        : !reason;
  if (!valid)
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Invalid decision reason.' });
});
export const ClientPublicationRequestSchema = z.strictObject({
  candidateId: id,
  demandId: id.optional(),
  summaryDocument: z.boolean(),
});
export const ClientOrganizationSchema = z.strictObject({
  name: z.string(),
  industry: z.string().nullable(),
  website: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});
export const ClientDemandSchema = ClientDemandFieldsSchema.extend({
  id,
  revision: z.number().int(),
  status: ClientDemandStatuses,
  editable: z.boolean(),
  updatedAt: z.string().datetime(),
  history: z.array(
    z.strictObject({
      status: ClientDemandStatuses,
      reason: ClientDemandReasons.nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export const ClientPortalStaffDemandSchema = ClientDemandSchema.extend({
  missionId: id.nullable(),
});
export const ClientPublicationSchema = z.strictObject({
  id,
  demandId: id.nullable(),
  title: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  summaryDocument: z.boolean(),
  publishedAt: z.string().datetime(),
});
export const ClientPortalDashboardSchema = z.strictObject({
  principal: z.literal('CLIENT'),
  organization: ClientOrganizationSchema,
  demands: z.array(ClientDemandSchema),
  nextCursor: id.nullable(),
});
export const ClientPortalPublicationsSchema = z.strictObject({
  publications: z.array(ClientPublicationSchema),
  nextCursor: id.nullable(),
});
export const ClientPortalStaffOrganizationSchema = z.strictObject({
  members: z.array(
    z.strictObject({
      id,
      contactId: id,
      name: z.string(),
      email: z.string(),
      state: z.enum(['INVITED', 'ACTIVE', 'REVOKED']),
    }),
  ),
  demands: z.array(ClientPortalStaffDemandSchema),
  publications: z.array(ClientPublicationSchema.extend({ revoked: z.boolean() })),
});
export const ClientPortalPreviewSchema = z.strictObject({
  title: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});
export type ClientPortalPreview = z.infer<typeof ClientPortalPreviewSchema>;
export const ClientPublicationCommitSchema = ClientPublicationRequestSchema.extend({
  preview: ClientPortalPreviewSchema,
  consentConfirmed: z.literal(true),
});
export type ClientPublicationCommit = z.infer<typeof ClientPublicationCommitSchema>;
export type ClientDemand = z.infer<typeof ClientDemandSchema>;
export type ClientDemandFields = z.infer<typeof ClientDemandFieldsSchema>;
export type ClientDemandDecision = z.infer<typeof ClientDemandDecisionSchema>;
export type ClientPublication = z.infer<typeof ClientPublicationSchema>;
export type ClientPublicationRequest = z.infer<typeof ClientPublicationRequestSchema>;
export type ClientPortalDashboard = z.infer<typeof ClientPortalDashboardSchema>;
export type ClientPortalPublications = z.infer<typeof ClientPortalPublicationsSchema>;
export type ClientPortalStaffOrganization = z.infer<typeof ClientPortalStaffOrganizationSchema>;
