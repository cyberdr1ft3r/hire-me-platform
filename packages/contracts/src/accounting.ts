import { z } from 'zod';

/**
 * Issue #39 accounting contracts.
 *
 * Prisma-independent. Covers payment records, payment-to-invoice allocation,
 * operational expenses, invoice settlement, client receivables, and operational
 * profitability.
 *
 * Deliberately absent:
 * - FX conversion; every aggregate stays separated per currency;
 * - payroll cost allocation;
 * - statutory, accrual, or tax accounting;
 * - receipt files, which remain owned by the Document module.
 */

export const PaymentMethodSchema = z.enum([
  'BANK_TRANSFER',
  'CHECK',
  'CASH',
  'CARD',
  'DIRECT_DEBIT',
  'OTHER',
]);

export const PaymentRecordStatusSchema = z.enum(['RECORDED', 'CORRECTED', 'ARCHIVED']);

export const PaymentAllocationStatusSchema = z.enum(['ACTIVE', 'REVERSED']);

export const ExpenseCategorySchema = z.enum([
  'RECRUITMENT_SOURCING',
  'TRAINING_DELIVERY',
  'TRAVEL',
  'SUBCONTRACTING',
  'SOFTWARE',
  'MARKETING',
  'OFFICE',
  'OTHER',
]);

export const ExpenseStatusSchema = z.enum(['RECORDED', 'CORRECTED', 'ARCHIVED']);

/**
 * Derived invoice settlement state.
 *
 * `NOT_RECEIVABLE` covers invoices that are not issued, or are canceled or archived,
 * and therefore never contribute to receivables. `OVERDUE` takes precedence over
 * `UNPAID` and `PARTIALLY_PAID` once the due date has passed and a balance remains.
 */
export const InvoiceSettlementStateSchema = z.enum([
  'NOT_RECEIVABLE',
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
]);

export const AccountingSortDirectionSchema = z.enum(['asc', 'desc']);

/**
 * HTTP query values arrive as strings, and `Boolean('false')` is `true`, so query
 * booleans are parsed explicitly rather than coerced.
 */
export const AccountingQueryBooleanSchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 'true');

/** ISO 4217 style code. Stored and compared exactly; never converted. */
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code.');

/**
 * Money is always minor units (cents) to avoid floating point drift.
 *
 * The input bound matches the PostgreSQL `integer` range the accounting columns use,
 * so an oversized amount is rejected deterministically as request validation instead
 * of failing later at persistence.
 */
export const MAX_ACCOUNTING_CENTS = 2_147_483_647;
export const PositiveCentsSchema = z.number().int().positive().max(MAX_ACCOUNTING_CENTS);

/**
 * Response-side money is deliberately uncapped: a receivable or profitability total
 * sums many rows and can legitimately exceed the per-row column range.
 */
export const NonNegativeCentsSchema = z.number().int().nonnegative();
export const SignedCentsSchema = z.number().int();

export const AccountingPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * `amounts` is null when the caller may read the payment record but not financial
 * amounts, matching the merged commercial redaction rule.
 */
export const PaymentAmountsSchema = z.object({
  currency: CurrencyCodeSchema,
  amountCents: NonNegativeCentsSchema,
  allocatedCents: NonNegativeCentsSchema,
  unallocatedCents: NonNegativeCentsSchema,
});

export const PaymentSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  clientId: z.string().uuid(),
  receivedDate: z.string().datetime(),
  method: PaymentMethodSchema,
  externalReference: z.string().nullable(),
  note: z.string().nullable(),
  status: PaymentRecordStatusSchema,
  amounts: PaymentAmountsSchema.nullable(),
  correctedAt: z.string().datetime().nullable(),
  correctionReason: z.string().nullable(),
  recordedByUserId: z.string().uuid().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PaymentAllocationSummarySchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  status: PaymentAllocationStatusSchema,
  amountCents: NonNegativeCentsSchema.nullable(),
  allocatedByUserId: z.string().uuid().nullable(),
  reversedAt: z.string().datetime().nullable(),
  reversalReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AccountingEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  actorUserId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  safeSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const PaymentDetailSchema = PaymentSummarySchema.extend({
  allocations: z.array(PaymentAllocationSummarySchema),
  history: z.array(AccountingEventSchema),
});

export const PaymentCreateRequestSchema = z.object({
  reference: z.string().trim().min(1).max(80),
  clientId: z.string().uuid(),
  receivedDate: z.string().datetime({ offset: true }),
  currency: CurrencyCodeSchema,
  amountCents: PositiveCentsSchema,
  method: PaymentMethodSchema,
  externalReference: z.string().trim().min(1).max(140).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
});

export const PaymentUpdateRequestSchema = z
  .object({
    receivedDate: z.string().datetime({ offset: true }).optional(),
    method: PaymentMethodSchema.optional(),
    externalReference: z.string().trim().min(1).max(140).nullable().optional(),
    note: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable payment field is required.',
  });

/**
 * Correcting a recorded amount is a distinct, reason-carrying action. It can never
 * reduce the amount below what is already allocated; the caller must reverse
 * allocations first.
 */
export const PaymentCorrectRequestSchema = z.object({
  amountCents: PositiveCentsSchema,
  correctionReason: z.string().trim().min(1).max(500),
});

export const PaymentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  status: PaymentRecordStatusSchema.optional(),
  method: PaymentMethodSchema.optional(),
  currency: CurrencyCodeSchema.optional(),
  receivedFrom: z.string().datetime({ offset: true }).optional(),
  receivedTo: z.string().datetime({ offset: true }).optional(),
  includeArchived: AccountingQueryBooleanSchema.default(false),
  sortDirection: AccountingSortDirectionSchema.default('desc'),
});

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * `idempotencyKey` makes a retried allocation safe: replaying the same key on the
 * same payment returns the existing allocation instead of allocating twice.
 */
export const PaymentAllocationCreateRequestSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: PositiveCentsSchema,
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

export const PaymentAllocationReverseRequestSchema = z.object({
  reversalReason: z.string().trim().min(1).max(500),
});

// ---------------------------------------------------------------------------
// Invoice settlement
// ---------------------------------------------------------------------------

export const InvoiceSettlementSchema = z.object({
  invoiceId: z.string().uuid(),
  clientId: z.string().uuid(),
  status: z.string(),
  settlementState: InvoiceSettlementStateSchema,
  overdue: z.boolean(),
  dueDate: z.string().datetime().nullable(),
  amounts: z
    .object({
      currency: CurrencyCodeSchema,
      totalCents: NonNegativeCentsSchema,
      allocatedCents: NonNegativeCentsSchema,
      outstandingCents: NonNegativeCentsSchema,
    })
    .nullable(),
  allocations: z.array(PaymentAllocationSummarySchema),
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const ExpenseContextSchema = z.object({
  clientId: z.string().uuid().nullable(),
  recruitmentMissionId: z.string().uuid().nullable(),
  missionPlacementId: z.string().uuid().nullable(),
  trainingProgramId: z.string().uuid().nullable(),
});

export const ExpenseAmountsSchema = z.object({
  currency: CurrencyCodeSchema,
  amountCents: NonNegativeCentsSchema,
});

export const ExpenseSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  expenseDate: z.string().datetime(),
  category: ExpenseCategorySchema,
  context: ExpenseContextSchema,
  vendorLabel: z.string().nullable(),
  description: z.string().nullable(),
  status: ExpenseStatusSchema,
  amounts: ExpenseAmountsSchema.nullable(),
  correctedAt: z.string().datetime().nullable(),
  correctionReason: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ExpenseDetailSchema = ExpenseSummarySchema.extend({
  history: z.array(AccountingEventSchema),
});

export const ExpenseCreateRequestSchema = z.object({
  reference: z.string().trim().min(1).max(80),
  expenseDate: z.string().datetime({ offset: true }),
  category: ExpenseCategorySchema,
  currency: CurrencyCodeSchema,
  amountCents: PositiveCentsSchema,
  clientId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  missionPlacementId: z.string().uuid().optional(),
  trainingProgramId: z.string().uuid().optional(),
  vendorLabel: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
});

export const ExpenseUpdateRequestSchema = z
  .object({
    expenseDate: z.string().datetime({ offset: true }).optional(),
    category: ExpenseCategorySchema.optional(),
    vendorLabel: z.string().trim().min(1).max(160).nullable().optional(),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable expense field is required.',
  });

export const ExpenseCorrectRequestSchema = z.object({
  amountCents: PositiveCentsSchema,
  correctionReason: z.string().trim().min(1).max(500),
});

export const ExpenseListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  recruitmentMissionId: z.string().uuid().optional(),
  trainingProgramId: z.string().uuid().optional(),
  category: ExpenseCategorySchema.optional(),
  currency: CurrencyCodeSchema.optional(),
  status: ExpenseStatusSchema.optional(),
  expenseFrom: z.string().datetime({ offset: true }).optional(),
  expenseTo: z.string().datetime({ offset: true }).optional(),
  includeArchived: AccountingQueryBooleanSchema.default(false),
  sortDirection: AccountingSortDirectionSchema.default('desc'),
});

// ---------------------------------------------------------------------------
// Receivables and profitability
// ---------------------------------------------------------------------------

/** One row per currency. Unlike currencies are never summed together. */
export const ClientReceivableCurrencyTotalSchema = z.object({
  currency: CurrencyCodeSchema,
  invoicedCents: NonNegativeCentsSchema,
  allocatedCents: NonNegativeCentsSchema,
  outstandingCents: SignedCentsSchema,
  overdueOutstandingCents: SignedCentsSchema,
});

export const ClientReceivableSummarySchema = z.object({
  clientId: z.string().uuid(),
  asOf: z.string().datetime(),
  totalsByCurrency: z.array(ClientReceivableCurrencyTotalSchema),
});

export const OverdueReceivableRowSchema = z.object({
  invoiceId: z.string().uuid(),
  clientId: z.string().uuid(),
  reference: z.string(),
  dueDate: z.string().datetime().nullable(),
  daysOverdue: z.number().int().nonnegative(),
  amounts: z
    .object({
      currency: CurrencyCodeSchema,
      totalCents: NonNegativeCentsSchema,
      allocatedCents: NonNegativeCentsSchema,
      outstandingCents: NonNegativeCentsSchema,
    })
    .nullable(),
});

export const OverdueReceivableListResponseSchema = z.object({
  asOf: z.string().datetime(),
  rows: z.array(OverdueReceivableRowSchema),
  pagination: AccountingPaginationSchema,
});

/**
 * Profitability context.
 *
 * Training-program profitability is deliberately absent: the merged commercial model
 * has no authoritative link from an invoice to a training program, so training
 * revenue cannot be derived without inventing one. Training expenses are still
 * recorded and readable through the expense endpoints.
 */
export const ProfitabilityContextSchema = z.enum(['CLIENT', 'RECRUITMENT_MISSION', 'PLACEMENT']);

export const ProfitabilityCurrencyRowSchema = z.object({
  currency: CurrencyCodeSchema,
  revenueCents: NonNegativeCentsSchema,
  expenseCents: NonNegativeCentsSchema,
  marginCents: SignedCentsSchema,
});

export const ProfitabilitySummarySchema = z.object({
  context: ProfitabilityContextSchema,
  contextId: z.string().uuid(),
  revenuePolicy: z.literal('ISSUED_INVOICE_REVENUE'),
  asOf: z.string().datetime(),
  totalsByCurrency: z.array(ProfitabilityCurrencyRowSchema),
});

export const ProfitabilityQuerySchema = z.object({
  context: ProfitabilityContextSchema,
  contextId: z.string().uuid(),
});

export const ClientReceivableQuerySchema = z.object({
  clientId: z.string().uuid(),
});

export const OverdueReceivableQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: z.string().uuid().optional(),
  currency: CurrencyCodeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const PaymentListResponseSchema = z.object({
  payments: z.array(PaymentSummarySchema),
  pagination: AccountingPaginationSchema,
});

export const PaymentDetailResponseSchema = z.object({ payment: PaymentDetailSchema });

export const PaymentAllocationDetailResponseSchema = z.object({
  allocation: PaymentAllocationSummarySchema,
  payment: PaymentDetailSchema,
});

export const InvoiceSettlementResponseSchema = z.object({ settlement: InvoiceSettlementSchema });

export const ExpenseListResponseSchema = z.object({
  expenses: z.array(ExpenseSummarySchema),
  pagination: AccountingPaginationSchema,
});

export const ExpenseDetailResponseSchema = z.object({ expense: ExpenseDetailSchema });

export const ClientReceivableSummaryResponseSchema = z.object({
  receivables: ClientReceivableSummarySchema,
});

export const ProfitabilitySummaryResponseSchema = z.object({
  profitability: ProfitabilitySummarySchema,
});

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type PaymentRecordStatus = z.infer<typeof PaymentRecordStatusSchema>;
export type PaymentAllocationStatus = z.infer<typeof PaymentAllocationStatusSchema>;
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;
export type InvoiceSettlementState = z.infer<typeof InvoiceSettlementStateSchema>;
export type PaymentSummary = z.infer<typeof PaymentSummarySchema>;
export type PaymentDetail = z.infer<typeof PaymentDetailSchema>;
export type PaymentAllocationSummary = z.infer<typeof PaymentAllocationSummarySchema>;
export type PaymentCreateRequest = z.infer<typeof PaymentCreateRequestSchema>;
export type PaymentUpdateRequest = z.infer<typeof PaymentUpdateRequestSchema>;
export type PaymentCorrectRequest = z.infer<typeof PaymentCorrectRequestSchema>;
export type PaymentListQuery = z.infer<typeof PaymentListQuerySchema>;
export type PaymentAllocationCreateRequest = z.infer<typeof PaymentAllocationCreateRequestSchema>;
export type PaymentAllocationReverseRequest = z.infer<typeof PaymentAllocationReverseRequestSchema>;
export type InvoiceSettlement = z.infer<typeof InvoiceSettlementSchema>;
export type ExpenseSummary = z.infer<typeof ExpenseSummarySchema>;
export type ExpenseDetail = z.infer<typeof ExpenseDetailSchema>;
export type ExpenseCreateRequest = z.infer<typeof ExpenseCreateRequestSchema>;
export type ExpenseUpdateRequest = z.infer<typeof ExpenseUpdateRequestSchema>;
export type ExpenseCorrectRequest = z.infer<typeof ExpenseCorrectRequestSchema>;
export type ExpenseListQuery = z.infer<typeof ExpenseListQuerySchema>;
export type ClientReceivableSummary = z.infer<typeof ClientReceivableSummarySchema>;
export type ClientReceivableQuery = z.infer<typeof ClientReceivableQuerySchema>;
export type OverdueReceivableQuery = z.infer<typeof OverdueReceivableQuerySchema>;
export type OverdueReceivableListResponse = z.infer<typeof OverdueReceivableListResponseSchema>;
export type ProfitabilityContext = z.infer<typeof ProfitabilityContextSchema>;
export type ProfitabilitySummary = z.infer<typeof ProfitabilitySummarySchema>;
export type ProfitabilityQuery = z.infer<typeof ProfitabilityQuerySchema>;
export type PaymentListResponse = z.infer<typeof PaymentListResponseSchema>;
export type PaymentDetailResponse = z.infer<typeof PaymentDetailResponseSchema>;
export type PaymentAllocationDetailResponse = z.infer<typeof PaymentAllocationDetailResponseSchema>;
export type InvoiceSettlementResponse = z.infer<typeof InvoiceSettlementResponseSchema>;
export type ExpenseListResponse = z.infer<typeof ExpenseListResponseSchema>;
export type ExpenseDetailResponse = z.infer<typeof ExpenseDetailResponseSchema>;
export type ClientReceivableSummaryResponse = z.infer<typeof ClientReceivableSummaryResponseSchema>;
export type ProfitabilitySummaryResponse = z.infer<typeof ProfitabilitySummaryResponseSchema>;
