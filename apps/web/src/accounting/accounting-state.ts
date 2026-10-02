import {
  MAX_ACCOUNTING_CENTS,
  type ExpenseCategory,
  type ExpenseCreateRequest,
  type ExpenseDetail,
  type ExpenseUpdateRequest,
  type PaymentCreateRequest,
  type PaymentDetail,
  type PaymentMethod,
  type PaymentRecordStatus,
  type PaymentUpdateRequest,
} from '@hire-me/contracts';

import { AccountingRequestError, type AccountingListOptions } from '../api.js';
import type { CommercialPickerOption } from '../commercial/commercial-state.js';
import type { MessageKey } from '../i18n/index.js';
import { dateInputStartIso } from '../tasks/task-datetime.js';

export const ACCOUNTING_PAGE_SIZE = 20;
export const OPTION_LIMIT = 20;

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'BANK_TRANSFER',
  'CHECK',
  'CASH',
  'CARD',
  'DIRECT_DEBIT',
  'OTHER',
];

export const PAYMENT_STATUSES: readonly PaymentRecordStatus[] = ['RECORDED', 'CORRECTED', 'ARCHIVED'];

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'RECRUITMENT_SOURCING',
  'TRAINING_DELIVERY',
  'TRAVEL',
  'SUBCONTRACTING',
  'SOFTWARE',
  'MARKETING',
  'OFFICE',
  'OTHER',
];

export type ListState<Item> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Item[]; page: number; pageSize: number; total: number };

export type DetailState<Detail> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; messageKey: MessageKey }
  | { status: 'ready'; detail: Detail };

/**
 * A record chosen through a permission-checked option source (D-079, D-081).
 * The label is the record's own data, kept so it survives a locale switch
 * without a refetch; the ID only travels back to the API and is never rendered.
 */
export type PickerOption = CommercialPickerOption;

export type LoadOptions = (search: string) => Promise<PickerOption[]>;

export type AccountingFeedback = { tone: 'success' | 'danger'; messageKey: MessageKey };

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export type PaymentFilters = {
  client: PickerOption | null;
  status: PaymentRecordStatus | '';
  includeArchived: boolean;
};

export const EMPTY_PAYMENT_FILTERS: PaymentFilters = {
  client: null,
  status: '',
  includeArchived: false,
};

export type ExpenseFilters = {
  client: PickerOption | null;
  category: ExpenseCategory | '';
  includeArchived: boolean;
};

export const EMPTY_EXPENSE_FILTERS: ExpenseFilters = {
  client: null,
  category: '',
  includeArchived: false,
};

export type ListQuery<Filters> = { page: number; filters: Filters };

export function hasPaymentFilters(filters: PaymentFilters): boolean {
  return Boolean(filters.client || filters.status || filters.includeArchived);
}

export function hasExpenseFilters(filters: ExpenseFilters): boolean {
  return Boolean(filters.client || filters.category || filters.includeArchived);
}

export function paymentListOptions(
  query: ListQuery<PaymentFilters>,
): AccountingListOptions & { status?: PaymentRecordStatus } {
  const { client, includeArchived, status } = query.filters;
  return {
    page: query.page,
    pageSize: ACCOUNTING_PAGE_SIZE,
    ...(client ? { clientId: client.id } : {}),
    ...(status ? { status } : {}),
    // Archived payments carry ARCHIVED as their status, so that filter needs them listed.
    includeArchived: includeArchived || status === 'ARCHIVED',
  };
}

export function expenseListOptions(
  query: ListQuery<ExpenseFilters>,
): AccountingListOptions & { category?: ExpenseCategory } {
  const { category, client, includeArchived } = query.filters;
  return {
    page: query.page,
    pageSize: ACCOUNTING_PAGE_SIZE,
    ...(client ? { clientId: client.id } : {}),
    ...(category ? { category } : {}),
    includeArchived,
  };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type MoneyParse = { ok: true; cents: number | null } | { ok: false };

const MAJOR_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Typed major units (point or French comma, at most two decimals) to exact
 * integer minor units, converted on the digit string so no float is rounded.
 */
export function parseMoney(value: string): MoneyParse {
  const trimmed = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (trimmed === '') return { cents: null, ok: true };
  const match = MAJOR_AMOUNT.exec(trimmed);
  if (!match) return { ok: false };
  const [, whole = '', fraction = ''] = match;
  const digits = `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  if (digits.length > String(MAX_ACCOUNTING_CENTS).length) return { ok: false };
  const cents = Number(digits);
  return cents <= MAX_ACCOUNTING_CENTS ? { cents, ok: true } : { ok: false };
}

/** Exact minor units back to the typed form (`12345` → `123.45`), for prefilled amounts. */
export function centsToInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** An instant as the local calendar day a `type="date"` control shows. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayDateInput(): string {
  return isoToDateInput(new Date().toISOString());
}

const CURRENCY = /^[A-Z]{3}$/;

export type FormErrorKey =
  | 'accounting.form.errors.reference'
  | 'accounting.form.errors.client'
  | 'accounting.form.errors.date'
  | 'accounting.form.errors.currency'
  | 'accounting.form.errors.amount'
  | 'accounting.form.errors.reason'
  | 'accounting.form.errors.invoice'
  | 'accounting.form.errors.unchanged';

export type FormErrors = Partial<Record<string, FormErrorKey>>;

type Built<Value> = { ok: true; value: Value } | { ok: false; errors: FormErrors };

function finish<Value>(errors: FormErrors, value: Value): Built<Value> {
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

function positiveCents(value: string, errors: FormErrors, field = 'amount'): number {
  const amount = parseMoney(value);
  if (!amount.ok || amount.cents === null || amount.cents <= 0) {
    errors[field] = 'accounting.form.errors.amount';
    return 0;
  }
  return amount.cents;
}

function optionalText(value: string, max: number): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentFormValues = {
  reference: string;
  client: PickerOption | null;
  receivedDate: string;
  currency: string;
  amount: string;
  method: PaymentMethod;
  externalReference: string;
  note: string;
};

export function emptyPaymentForm(prefill: Partial<PaymentFormValues> = {}): PaymentFormValues {
  return {
    reference: '',
    client: null,
    receivedDate: todayDateInput(),
    currency: 'MAD',
    amount: '',
    method: 'BANK_TRANSFER',
    externalReference: '',
    note: '',
    ...prefill,
  };
}

export function toPaymentCreateRequest(values: PaymentFormValues): Built<PaymentCreateRequest> {
  const errors: FormErrors = {};
  const reference = values.reference.trim();
  if (!reference || reference.length > 80) errors.reference = 'accounting.form.errors.reference';
  if (!values.client) errors.client = 'accounting.form.errors.client';
  const receivedDate = dateInputStartIso(values.receivedDate);
  if (!receivedDate) errors.receivedDate = 'accounting.form.errors.date';
  const currency = values.currency.trim().toUpperCase();
  if (!CURRENCY.test(currency)) errors.currency = 'accounting.form.errors.currency';
  const amountCents = positiveCents(values.amount, errors);
  const externalReference = optionalText(values.externalReference, 140);
  const note = optionalText(values.note, 2000);
  return finish(errors, {
    reference,
    clientId: values.client?.id ?? '',
    receivedDate: receivedDate ?? '',
    currency,
    amountCents,
    method: values.method,
    ...(externalReference ? { externalReference } : {}),
    ...(note ? { note } : {}),
  });
}

export type PaymentEditValues = {
  receivedDate: string;
  method: PaymentMethod;
  externalReference: string;
  note: string;
};

export function paymentEditValues(payment: PaymentDetail): PaymentEditValues {
  return {
    receivedDate: isoToDateInput(payment.receivedDate),
    method: payment.method,
    externalReference: payment.externalReference ?? '',
    note: payment.note ?? '',
  };
}

/** Only the fields that changed are sent; clearing a text field sends `null`. */
export function toPaymentUpdateRequest(
  payment: PaymentDetail,
  values: PaymentEditValues,
): Built<PaymentUpdateRequest> {
  const errors: FormErrors = {};
  const initial = paymentEditValues(payment);
  const request: PaymentUpdateRequest = {};
  if (values.receivedDate !== initial.receivedDate) {
    const receivedDate = dateInputStartIso(values.receivedDate);
    if (receivedDate) request.receivedDate = receivedDate;
    else errors.receivedDate = 'accounting.form.errors.date';
  }
  if (values.method !== initial.method) request.method = values.method;
  if (values.externalReference.trim() !== initial.externalReference.trim()) {
    request.externalReference = optionalText(values.externalReference, 140) ?? null;
  }
  if (values.note.trim() !== initial.note.trim()) {
    request.note = optionalText(values.note, 2000) ?? null;
  }
  if (Object.keys(errors).length === 0 && Object.keys(request).length === 0) {
    errors.form = 'accounting.form.errors.unchanged';
  }
  return finish(errors, request);
}

export type CorrectionValues = { amount: string; reason: string };

export function toCorrection(
  values: CorrectionValues,
): Built<{ amountCents: number; correctionReason: string }> {
  const errors: FormErrors = {};
  const amountCents = positiveCents(values.amount, errors);
  const correctionReason = values.reason.trim();
  if (!correctionReason || correctionReason.length > 500) {
    errors.reason = 'accounting.form.errors.reason';
  }
  return finish(errors, { amountCents, correctionReason });
}

export type AllocationValues = { invoice: PickerOption | null; amount: string };

export function toAllocation(
  values: AllocationValues,
): Built<{ invoiceId: string; amountCents: number }> {
  const errors: FormErrors = {};
  if (!values.invoice) errors.invoice = 'accounting.form.errors.invoice';
  const amountCents = positiveCents(values.amount, errors);
  return finish(errors, { invoiceId: values.invoice?.id ?? '', amountCents });
}

/** One key per submit attempt, so a retried request cannot allocate twice; never shown. */
export function allocationIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseFormValues = {
  reference: string;
  expenseDate: string;
  category: ExpenseCategory;
  currency: string;
  amount: string;
  client: PickerOption | null;
  mission: PickerOption | null;
  placement: PickerOption | null;
  trainingProgram: PickerOption | null;
  vendorLabel: string;
  description: string;
};

export function emptyExpenseForm(): ExpenseFormValues {
  return {
    reference: '',
    expenseDate: todayDateInput(),
    category: 'OTHER',
    currency: 'MAD',
    amount: '',
    client: null,
    mission: null,
    placement: null,
    trainingProgram: null,
    vendorLabel: '',
    description: '',
  };
}

export function toExpenseCreateRequest(values: ExpenseFormValues): Built<ExpenseCreateRequest> {
  const errors: FormErrors = {};
  const reference = values.reference.trim();
  if (!reference || reference.length > 80) errors.reference = 'accounting.form.errors.reference';
  const expenseDate = dateInputStartIso(values.expenseDate);
  if (!expenseDate) errors.expenseDate = 'accounting.form.errors.date';
  const currency = values.currency.trim().toUpperCase();
  if (!CURRENCY.test(currency)) errors.currency = 'accounting.form.errors.currency';
  const amountCents = positiveCents(values.amount, errors);
  const vendorLabel = optionalText(values.vendorLabel, 160);
  const description = optionalText(values.description, 2000);
  return finish(errors, {
    reference,
    expenseDate: expenseDate ?? '',
    category: values.category,
    currency,
    amountCents,
    ...(values.client ? { clientId: values.client.id } : {}),
    ...(values.mission ? { recruitmentMissionId: values.mission.id } : {}),
    ...(values.placement ? { missionPlacementId: values.placement.id } : {}),
    ...(values.trainingProgram ? { trainingProgramId: values.trainingProgram.id } : {}),
    ...(vendorLabel ? { vendorLabel } : {}),
    ...(description ? { description } : {}),
  });
}

export type ExpenseEditValues = {
  expenseDate: string;
  category: ExpenseCategory;
  vendorLabel: string;
  description: string;
};

export function expenseEditValues(expense: ExpenseDetail): ExpenseEditValues {
  return {
    expenseDate: isoToDateInput(expense.expenseDate),
    category: expense.category,
    vendorLabel: expense.vendorLabel ?? '',
    description: expense.description ?? '',
  };
}

export function toExpenseUpdateRequest(
  expense: ExpenseDetail,
  values: ExpenseEditValues,
): Built<ExpenseUpdateRequest> {
  const errors: FormErrors = {};
  const initial = expenseEditValues(expense);
  const request: ExpenseUpdateRequest = {};
  if (values.expenseDate !== initial.expenseDate) {
    const expenseDate = dateInputStartIso(values.expenseDate);
    if (expenseDate) request.expenseDate = expenseDate;
    else errors.expenseDate = 'accounting.form.errors.date';
  }
  if (values.category !== initial.category) request.category = values.category;
  if (values.vendorLabel.trim() !== initial.vendorLabel.trim()) {
    request.vendorLabel = optionalText(values.vendorLabel, 160) ?? null;
  }
  if (values.description.trim() !== initial.description.trim()) {
    request.description = optionalText(values.description, 2000) ?? null;
  }
  if (Object.keys(errors).length === 0 && Object.keys(request).length === 0) {
    errors.form = 'accounting.form.errors.unchanged';
  }
  return finish(errors, request);
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

type FailureKey = `accounting.feedback.failure.${
  | 'allocationExists'
  | 'archived'
  | 'clientMismatch'
  | 'conflict'
  | 'contextMismatch'
  | 'correctionBelowAllocated'
  | 'currencyMismatch'
  | 'duplicateReference'
  | 'exceedsInvoice'
  | 'exceedsPayment'
  | 'forbidden'
  | 'generic'
  | 'invalid'
  | 'invoiceNotReceivable'
  | 'notFound'
  | 'paymentAllocated'}`;

const EXACT_CODES: Record<string, FailureKey> = {
  ACCOUNTING_PERMISSION_REQUIRED: 'accounting.feedback.failure.forbidden',
  ACCOUNTING_RECORD_NOT_FOUND: 'accounting.feedback.failure.notFound',
  ALLOCATION_ALREADY_EXISTS: 'accounting.feedback.failure.allocationExists',
  ALLOCATION_CLIENT_MISMATCH: 'accounting.feedback.failure.clientMismatch',
  ALLOCATION_CURRENCY_MISMATCH: 'accounting.feedback.failure.currencyMismatch',
  ALLOCATION_EXCEEDS_INVOICE_REMAINING: 'accounting.feedback.failure.exceedsInvoice',
  ALLOCATION_EXCEEDS_PAYMENT_REMAINING: 'accounting.feedback.failure.exceedsPayment',
  ALLOCATION_IDEMPOTENCY_KEY_CONFLICT: 'accounting.feedback.failure.conflict',
  CLIENT_SCOPE_REQUIRED: 'accounting.feedback.failure.forbidden',
  COMMERCIAL_DATA_ACCESS_REQUIRED: 'accounting.feedback.failure.forbidden',
  EXPENSE_ARCHIVED: 'accounting.feedback.failure.archived',
  EXPENSE_CONTEXT_MISMATCH: 'accounting.feedback.failure.contextMismatch',
  EXPENSE_REFERENCE_TAKEN: 'accounting.feedback.failure.duplicateReference',
  INVOICE_NOT_RECEIVABLE: 'accounting.feedback.failure.invoiceNotReceivable',
  PAYMENT_ARCHIVED: 'accounting.feedback.failure.archived',
  PAYMENT_CORRECTION_BELOW_ALLOCATED: 'accounting.feedback.failure.correctionBelowAllocated',
  PAYMENT_HAS_ACTIVE_ALLOCATIONS: 'accounting.feedback.failure.paymentAllocated',
  PAYMENT_REFERENCE_TAKEN: 'accounting.feedback.failure.duplicateReference',
};

/** Stable API code (or HTTP status) to localized copy; server text is never shown. */
export function accountingFailureKey(error: unknown): MessageKey {
  if (!(error instanceof AccountingRequestError)) return 'accounting.feedback.failure.generic';
  const exact = error.code ? EXACT_CODES[error.code] : undefined;
  if (exact) return exact;
  if (error.status === 404) return 'accounting.feedback.failure.notFound';
  if (error.status === 403) return 'accounting.feedback.failure.forbidden';
  if (error.status === 409) return 'accounting.feedback.failure.conflict';
  if (error.status === 400) return 'accounting.feedback.failure.invalid';
  return 'accounting.feedback.failure.generic';
}
