import { z } from 'zod';

export const ClientStatusSchema = z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const ClientContactStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const PortalAccessStatusSchema = z.enum(['DISABLED', 'INVITED', 'ENABLED', 'ARCHIVED']);

export const ClientCommercialFieldsSchema = z.object({
  commercialOwnerUserId: z.string().uuid().nullable(),
  commercialSummary: z.string().nullable(),
});

export const ClientSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  normalizedName: z.string(),
  status: ClientStatusSchema,
  industry: z.string().nullable(),
  website: z.string().nullable(),
  mainPhone: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  commercial: ClientCommercialFieldsSchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ClientContactSummarySchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  normalizedEmail: z.string().email(),
  phone: z.string().nullable(),
  roleTitle: z.string().nullable(),
  status: ClientContactStatusSchema,
  portalStatus: PortalAccessStatusSchema,
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ClientListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: ClientStatusSchema.optional(),
  industry: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
});

export const ClientContactListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: ClientContactStatusSchema.optional(),
});

export const ClientCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(180),
  status: ClientStatusSchema.exclude(['ARCHIVED']).optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  website: z.string().trim().min(1).max(2048).optional(),
  mainPhone: z.string().trim().min(1).max(60).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  commercialOwnerUserId: z.string().uuid().optional(),
  commercialSummary: z.string().trim().min(1).max(2000).optional(),
});

export const ClientUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(180).optional(),
    industry: z.string().trim().min(1).max(120).nullable().optional(),
    website: z.string().trim().min(1).max(2048).nullable().optional(),
    mainPhone: z.string().trim().min(1).max(60).nullable().optional(),
    country: z.string().trim().min(1).max(120).nullable().optional(),
    city: z.string().trim().min(1).max(120).nullable().optional(),
    commercialOwnerUserId: z.string().uuid().nullable().optional(),
    commercialSummary: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable client field is required.',
  });

export const ClientStatusUpdateRequestSchema = z.object({
  status: ClientStatusSchema,
});

export const ClientContactCreateRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.string().email().max(254),
  phone: z.string().trim().min(1).max(60).optional(),
  roleTitle: z.string().trim().min(1).max(120).optional(),
  status: ClientContactStatusSchema.exclude(['ARCHIVED']).optional(),
});

export const ClientContactUpdateRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    email: z.string().email().max(254).optional(),
    phone: z.string().trim().min(1).max(60).nullable().optional(),
    roleTitle: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable client contact field is required.',
  });

export const ClientContactStatusUpdateRequestSchema = z.object({
  status: ClientContactStatusSchema,
});

export const ClientListResponseSchema = z.object({
  clients: z.array(ClientSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const ClientDetailResponseSchema = z.object({
  client: ClientSummarySchema,
});

export const ClientContactListResponseSchema = z.object({
  contacts: z.array(ClientContactSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export const ClientContactDetailResponseSchema = z.object({
  contact: ClientContactSummarySchema,
});

export type ClientStatus = z.infer<typeof ClientStatusSchema>;
export type ClientContactStatus = z.infer<typeof ClientContactStatusSchema>;
export type ClientSummary = z.infer<typeof ClientSummarySchema>;
export type ClientContactSummary = z.infer<typeof ClientContactSummarySchema>;
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;
export type ClientContactListQuery = z.infer<typeof ClientContactListQuerySchema>;
export type ClientCreateRequest = z.infer<typeof ClientCreateRequestSchema>;
export type ClientUpdateRequest = z.infer<typeof ClientUpdateRequestSchema>;
export type ClientStatusUpdateRequest = z.infer<typeof ClientStatusUpdateRequestSchema>;
export type ClientContactCreateRequest = z.infer<typeof ClientContactCreateRequestSchema>;
export type ClientContactUpdateRequest = z.infer<typeof ClientContactUpdateRequestSchema>;
export type ClientContactStatusUpdateRequest = z.infer<
  typeof ClientContactStatusUpdateRequestSchema
>;
export type ClientListResponse = z.infer<typeof ClientListResponseSchema>;
export type ClientDetailResponse = z.infer<typeof ClientDetailResponseSchema>;
export type ClientContactListResponse = z.infer<typeof ClientContactListResponseSchema>;
export type ClientContactDetailResponse = z.infer<typeof ClientContactDetailResponseSchema>;
