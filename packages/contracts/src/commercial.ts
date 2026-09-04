import { z } from 'zod';

export const QuotationStatusSchema = z.enum([
  'DRAFT',
  'ISSUED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELED',
  'ARCHIVED',
]);
export const CommercialContractBusinessTypeSchema = z.enum(['RECRUITMENT', 'TRAINING']);
export const CommercialContractStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'CANCELED',
  'ARCHIVED',
]);
export const PurchaseOrderStatusSchema = z.enum(['DRAFT', 'RECEIVED', 'CANCELED', 'ARCHIVED']);
export const InvoiceStatusSchema = z.enum(['DRAFT', 'ISSUED', 'CANCELED', 'ARCHIVED']);

const CurrencySchema = z.string().trim().min(3).max(3).toUpperCase();
const ReferenceSchema = z.string().trim().min(1).max(80);
const OptionalIsoDateSchema = z.string().datetime().optional();
const NullableIsoDateSchema = z.string().datetime().nullable().optional();
const MoneyCentsSchema = z.number().int().nonnegative().max(2_000_000_000);
const TaxRateBpsSchema = z.number().int().nonnegative().max(10_000);

export const CommercialLineInputSchema = z.object({
  description: z.string().trim().min(1).max(400),
  quantity: z.number().int().positive().max(1_000_000),
  unitPriceCents: MoneyCentsSchema,
  taxRateBps: TaxRateBpsSchema.default(0),
});

export const CommercialLineSchema = CommercialLineInputSchema.extend({
  id: z.string().uuid(),
  sortOrder: z.number().int().nonnegative(),
  lineSubtotalCents: MoneyCentsSchema,
  lineTaxCents: MoneyCentsSchema,
  lineTotalCents: MoneyCentsSchema,
});

export const CommercialHistoryEventSchema = z.object({
  id: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: z.string(),
  previousStatus: z.string().nullable(),
  nextStatus: z.string().nullable(),
  reason: z.string().nullable(),
  safeSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const CommercialAmountSummarySchema = z.object({
  currency: z.string(),
  subtotalCents: MoneyCentsSchema,
  taxCents: MoneyCentsSchema,
  totalCents: MoneyCentsSchema,
});

export const QuotationSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().nullable(),
  status: QuotationStatusSchema,
  issueDate: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  amounts: CommercialAmountSummarySchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const QuotationDetailSchema = QuotationSummarySchema.extend({
  lines: z.array(CommercialLineSchema).nullable(),
  history: z.array(CommercialHistoryEventSchema),
});

export const QuotationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  status: QuotationStatusSchema.optional(),
  reference: z.string().trim().min(1).max(80).optional(),
  issuedFrom: z.string().datetime().optional(),
  issuedTo: z.string().datetime().optional(),
});

export const QuotationCreateRequestSchema = z.object({
  reference: ReferenceSchema,
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().optional(),
  currency: CurrencySchema,
  issueDate: OptionalIsoDateSchema,
  validUntil: OptionalIsoDateSchema,
  lines: z.array(CommercialLineInputSchema).min(1).max(100),
});

export const QuotationUpdateRequestSchema = z
  .object({
    reference: ReferenceSchema.optional(),
    issueDate: NullableIsoDateSchema,
    validUntil: NullableIsoDateSchema,
    lines: z.array(CommercialLineInputSchema).min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable quotation field is required.',
  });

export const QuotationStatusActionRequestSchema = z.object({
  status: QuotationStatusSchema.exclude(['DRAFT', 'ARCHIVED']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const CommercialContractSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  businessType: CommercialContractBusinessTypeSchema,
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().nullable(),
  sourceQuotationId: z.string().uuid().nullable(),
  status: CommercialContractStatusSchema,
  effectiveDate: z.string().datetime().nullable(),
  startDate: z.string().datetime().nullable(),
  endDate: z.string().datetime().nullable(),
  termsSummary: z.string().nullable(),
  amounts: CommercialAmountSummarySchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CommercialContractDetailSchema = CommercialContractSummarySchema.extend({
  history: z.array(CommercialHistoryEventSchema),
});

export const CommercialContractListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  sourceQuotationId: z.string().uuid().optional(),
  businessType: CommercialContractBusinessTypeSchema.optional(),
  status: CommercialContractStatusSchema.optional(),
  reference: z.string().trim().min(1).max(80).optional(),
});

export const CommercialContractCreateRequestSchema = z.object({
  reference: ReferenceSchema,
  businessType: CommercialContractBusinessTypeSchema,
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().optional(),
  sourceQuotationId: z.string().uuid().optional(),
  currency: CurrencySchema,
  contractValueCents: MoneyCentsSchema,
  taxCents: MoneyCentsSchema.default(0),
  termsSummary: z.string().trim().min(1).max(2000).optional(),
  effectiveDate: OptionalIsoDateSchema,
  startDate: OptionalIsoDateSchema,
  endDate: OptionalIsoDateSchema,
});

export const CommercialContractUpdateRequestSchema = z
  .object({
    reference: ReferenceSchema.optional(),
    termsSummary: z.string().trim().min(1).max(2000).nullable().optional(),
    effectiveDate: NullableIsoDateSchema,
    startDate: NullableIsoDateSchema,
    endDate: NullableIsoDateSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable contract field is required.',
  });

export const CommercialContractStatusActionRequestSchema = z.object({
  status: CommercialContractStatusSchema.exclude(['DRAFT', 'ARCHIVED']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const PurchaseOrderSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().nullable(),
  quotationId: z.string().uuid().nullable(),
  contractId: z.string().uuid().nullable(),
  status: PurchaseOrderStatusSchema,
  issueDate: z.string().datetime().nullable(),
  receivedDate: z.string().datetime().nullable(),
  amounts: CommercialAmountSummarySchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PurchaseOrderDetailSchema = PurchaseOrderSummarySchema.extend({
  history: z.array(CommercialHistoryEventSchema),
});

export const PurchaseOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  status: PurchaseOrderStatusSchema.optional(),
  reference: z.string().trim().min(1).max(80).optional(),
});

export const PurchaseOrderCreateRequestSchema = z.object({
  reference: ReferenceSchema,
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  currency: CurrencySchema,
  amountCents: MoneyCentsSchema,
  taxCents: MoneyCentsSchema.default(0),
  issueDate: OptionalIsoDateSchema,
  receivedDate: OptionalIsoDateSchema,
});

export const PurchaseOrderUpdateRequestSchema = z
  .object({
    reference: ReferenceSchema.optional(),
    issueDate: NullableIsoDateSchema,
    receivedDate: NullableIsoDateSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable purchase order field is required.',
  });

export const PurchaseOrderStatusActionRequestSchema = z.object({
  status: PurchaseOrderStatusSchema.exclude(['DRAFT', 'ARCHIVED']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const InvoiceSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().nullable(),
  missionPlacementId: z.string().uuid().nullable(),
  quotationId: z.string().uuid().nullable(),
  contractId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  status: InvoiceStatusSchema,
  issueDate: z.string().datetime().nullable(),
  dueDate: z.string().datetime().nullable(),
  issuedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  correctionOfInvoiceId: z.string().uuid().nullable(),
  amounts: CommercialAmountSummarySchema.nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const InvoiceDetailSchema = InvoiceSummarySchema.extend({
  lines: z.array(CommercialLineSchema).nullable(),
  history: z.array(CommercialHistoryEventSchema),
});

export const InvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  missionPlacementId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  status: InvoiceStatusSchema.optional(),
  reference: z.string().trim().min(1).max(80).optional(),
  issuedFrom: z.string().datetime().optional(),
  issuedTo: z.string().datetime().optional(),
});

export const InvoiceCreateRequestSchema = z.object({
  reference: ReferenceSchema,
  clientId: z.string().uuid(),
  recruitmentMissionId: z.string().uuid().optional(),
  missionPlacementId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  currency: CurrencySchema,
  issueDate: OptionalIsoDateSchema,
  dueDate: OptionalIsoDateSchema,
  correctionOfInvoiceId: z.string().uuid().optional(),
  lines: z.array(CommercialLineInputSchema).min(1).max(100).optional(),
});

export const InvoiceUpdateRequestSchema = z
  .object({
    reference: ReferenceSchema.optional(),
    issueDate: NullableIsoDateSchema,
    dueDate: NullableIsoDateSchema,
    lines: z.array(CommercialLineInputSchema).min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable invoice field is required.',
  });

export const InvoiceIssueRequestSchema = z.object({
  issueDate: OptionalIsoDateSchema,
  dueDate: OptionalIsoDateSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export const InvoiceCancelRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const QuotationListResponseSchema = z.object({
  quotations: z.array(QuotationSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});
export const QuotationDetailResponseSchema = z.object({ quotation: QuotationDetailSchema });

export const CommercialContractListResponseSchema = z.object({
  contracts: z.array(CommercialContractSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});
export const CommercialContractDetailResponseSchema = z.object({
  contract: CommercialContractDetailSchema,
});

export const PurchaseOrderListResponseSchema = z.object({
  purchaseOrders: z.array(PurchaseOrderSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});
export const PurchaseOrderDetailResponseSchema = z.object({
  purchaseOrder: PurchaseOrderDetailSchema,
});

export const InvoiceListResponseSchema = z.object({
  invoices: z.array(InvoiceSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});
export const InvoiceDetailResponseSchema = z.object({ invoice: InvoiceDetailSchema });

export type QuotationStatus = z.infer<typeof QuotationStatusSchema>;
export type CommercialContractBusinessType = z.infer<typeof CommercialContractBusinessTypeSchema>;
export type CommercialContractStatus = z.infer<typeof CommercialContractStatusSchema>;
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type CommercialLineInput = z.infer<typeof CommercialLineInputSchema>;
export type CommercialLine = z.infer<typeof CommercialLineSchema>;
export type QuotationSummary = z.infer<typeof QuotationSummarySchema>;
export type QuotationDetail = z.infer<typeof QuotationDetailSchema>;
export type QuotationListQuery = z.infer<typeof QuotationListQuerySchema>;
export type QuotationCreateRequest = z.infer<typeof QuotationCreateRequestSchema>;
export type QuotationUpdateRequest = z.infer<typeof QuotationUpdateRequestSchema>;
export type QuotationStatusActionRequest = z.infer<typeof QuotationStatusActionRequestSchema>;
export type QuotationListResponse = z.infer<typeof QuotationListResponseSchema>;
export type QuotationDetailResponse = z.infer<typeof QuotationDetailResponseSchema>;
export type CommercialContractSummary = z.infer<typeof CommercialContractSummarySchema>;
export type CommercialContractDetail = z.infer<typeof CommercialContractDetailSchema>;
export type CommercialContractListQuery = z.infer<typeof CommercialContractListQuerySchema>;
export type CommercialContractCreateRequest = z.infer<typeof CommercialContractCreateRequestSchema>;
export type CommercialContractUpdateRequest = z.infer<typeof CommercialContractUpdateRequestSchema>;
export type CommercialContractStatusActionRequest = z.infer<
  typeof CommercialContractStatusActionRequestSchema
>;
export type CommercialContractListResponse = z.infer<typeof CommercialContractListResponseSchema>;
export type CommercialContractDetailResponse = z.infer<
  typeof CommercialContractDetailResponseSchema
>;
export type PurchaseOrderSummary = z.infer<typeof PurchaseOrderSummarySchema>;
export type PurchaseOrderDetail = z.infer<typeof PurchaseOrderDetailSchema>;
export type PurchaseOrderListQuery = z.infer<typeof PurchaseOrderListQuerySchema>;
export type PurchaseOrderCreateRequest = z.infer<typeof PurchaseOrderCreateRequestSchema>;
export type PurchaseOrderUpdateRequest = z.infer<typeof PurchaseOrderUpdateRequestSchema>;
export type PurchaseOrderStatusActionRequest = z.infer<
  typeof PurchaseOrderStatusActionRequestSchema
>;
export type PurchaseOrderListResponse = z.infer<typeof PurchaseOrderListResponseSchema>;
export type PurchaseOrderDetailResponse = z.infer<typeof PurchaseOrderDetailResponseSchema>;
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof InvoiceDetailSchema>;
export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;
export type InvoiceCreateRequest = z.infer<typeof InvoiceCreateRequestSchema>;
export type InvoiceUpdateRequest = z.infer<typeof InvoiceUpdateRequestSchema>;
export type InvoiceIssueRequest = z.infer<typeof InvoiceIssueRequestSchema>;
export type InvoiceCancelRequest = z.infer<typeof InvoiceCancelRequestSchema>;
export type InvoiceListResponse = z.infer<typeof InvoiceListResponseSchema>;
export type InvoiceDetailResponse = z.infer<typeof InvoiceDetailResponseSchema>;
