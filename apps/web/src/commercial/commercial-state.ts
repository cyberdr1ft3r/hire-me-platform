import type {
  CommercialContractBusinessType,
  CommercialContractCreateRequest,
  CommercialLineInput,
  InvoiceCreateRequest,
  PurchaseOrderCreateRequest,
  QuotationCreateRequest,
} from '@hire-me/contracts';

import { CommercialRequestError } from '../api.js';
import type { CommercialListParameters } from './commercial-api.js';
import type { MessageKey } from '../i18n/index.js';
import { dateInputStartIso } from '../tasks/task-datetime.js';
import type {
  CommercialDetail,
  CommercialKind,
  CommercialStatus,
  CommercialSummary,
} from './commercial-kinds.js';

export const COMMERCIAL_PAGE_SIZE = 20;
export const OPTION_LIMIT = 20;
const MONEY_CENTS_MAX = 2_000_000_000;
const QUANTITY_MAX = 1_000_000;
const TAX_RATE_BPS_MAX = 10_000;

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
 * A record chosen through a permission-checked option source. Labels are the
 * record's own data, kept so they survive a locale switch without a refetch; the
 * ID only ever travels back to the API and is never rendered.
 */
export type CommercialPickerOption = {
  id: string;
  label: string;
  detail: string | null;
  /** Business context a linked source carries into the new record. */
  context?: {
    recruitmentMissionId: string | null;
    missionTitle: string | null;
    currency: string | null;
    sourceQuotationId?: string | null;
    quotationId?: string | null;
    contractId?: string | null;
  };
  /** Placement options are described by dates, formatted at render time. */
  placement?: { integrationStartDate: string; confirmedAt: string };
};

export type LoadCommercialOptions = (search: string) => Promise<CommercialPickerOption[]>;

export type CommercialListFilters = {
  reference: string;
  status: CommercialStatus | '';
  client: CommercialPickerOption | null;
  includeArchived: boolean;
};

export const EMPTY_LIST_FILTERS: CommercialListFilters = {
  reference: '',
  status: '',
  client: null,
  includeArchived: false,
};

export type CommercialListQuery = { page: number; filters: CommercialListFilters };

export const FIRST_LIST_QUERY: CommercialListQuery = { page: 1, filters: EMPTY_LIST_FILTERS };

export function hasActiveFilters(filters: CommercialListFilters): boolean {
  return Boolean(
    filters.reference.trim() || filters.status || filters.client || filters.includeArchived,
  );
}

export function toListParameters(query: CommercialListQuery): CommercialListParameters {
  const reference = query.filters.reference.trim().slice(0, 80);
  const { status } = query.filters;
  return {
    page: query.page,
    pageSize: COMMERCIAL_PAGE_SIZE,
    ...(reference ? { reference } : {}),
    ...(query.filters.client ? { clientId: query.filters.client.id } : {}),
    // Archived records carry ARCHIVED as their status, so that filter needs them listed.
    ...(status ? { status } : {}),
    includeArchived: query.filters.includeArchived || status === 'ARCHIVED',
  };
}

export const STATUS_FILTERS: Record<CommercialKind, readonly CommercialStatus[]> = {
  contract: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELED', 'ARCHIVED'],
  invoice: ['DRAFT', 'ISSUED', 'CANCELED', 'ARCHIVED'],
  purchaseOrder: ['DRAFT', 'RECEIVED', 'CANCELED', 'ARCHIVED'],
  quotation: ['DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELED', 'ARCHIVED'],
};

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

export type LineValues = {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export type CreateFormValues = {
  reference: string;
  client: CommercialPickerOption | null;
  mission: CommercialPickerOption | null;
  quotation: CommercialPickerOption | null;
  contract: CommercialPickerOption | null;
  purchaseOrder: CommercialPickerOption | null;
  placement: CommercialPickerOption | null;
  businessType: CommercialContractBusinessType;
  currency: string;
  amount: string;
  tax: string;
  termsSummary: string;
  issueDate: string;
  validUntil: string;
  effectiveDate: string;
  startDate: string;
  endDate: string;
  receivedDate: string;
  dueDate: string;
  useSourceLines: boolean;
  lines: LineValues[];
};

let lineSequence = 0;

export function emptyLine(): LineValues {
  lineSequence += 1;
  return { key: lineSequence, description: '', quantity: '1', unitPrice: '', taxRate: '0' };
}

export function emptyCreateForm(): CreateFormValues {
  return {
    reference: '',
    client: null,
    mission: null,
    quotation: null,
    contract: null,
    purchaseOrder: null,
    placement: null,
    businessType: 'RECRUITMENT',
    currency: 'MAD',
    amount: '',
    tax: '0',
    termsSummary: '',
    issueDate: '',
    validUntil: '',
    effectiveDate: '',
    startDate: '',
    endDate: '',
    receivedDate: '',
    dueDate: '',
    useSourceLines: true,
    lines: [emptyLine()],
  };
}

export type SourceField = 'quotation' | 'contract' | 'purchaseOrder' | 'placement';

/** The lifecycle state a record must be in before another record may link to it. */
export const SOURCE_STATUS: Record<'quotation' | 'contract' | 'purchaseOrder', CommercialStatus> = {
  contract: 'ACTIVE',
  purchaseOrder: 'RECEIVED',
  quotation: 'ACCEPTED',
};

/** A linkable record as a picker option: its reference, mission title, and chain context. */
export function sourceOption(summary: CommercialSummary): CommercialPickerOption {
  return {
    id: summary.id,
    label: summary.reference,
    detail: summary.display.missionTitle,
    context: {
      recruitmentMissionId: summary.recruitmentMissionId,
      missionTitle: summary.display.missionTitle,
      currency: summary.amounts?.currency ?? null,
      ...('sourceQuotationId' in summary ? { sourceQuotationId: summary.sourceQuotationId } : {}),
      ...('quotationId' in summary ? { quotationId: summary.quotationId } : {}),
      ...('contractId' in summary ? { contractId: summary.contractId } : {}),
    },
  };
}

/**
 * A new record's form pre-filled from the record it follows in the chain, so
 * the devis → commande → facture link is chosen, not retyped.
 */
export function followUpForm(source: CommercialDetail): CreateFormValues {
  const field = sourceFieldFor(source.kind);
  const values = emptyCreateForm();
  values.client = {
    id: source.record.clientId,
    label: source.record.display.clientName,
    detail: null,
  };
  if (field && field !== 'placement') values[field] = sourceOption(source.record);
  if (source.record.amounts) values.currency = source.record.amounts.currency;
  for (const [ancestorField, ancestor] of upstreamLinks(source)) values[ancestorField] = ancestor;
  return values;
}

/**
 * The records the source itself links to, so a follow-up keeps the whole
 * chain. A link is carried only when the server sent its reference, that is
 * when the actor may read that record type; otherwise it stays unlinked.
 */
function upstreamLinks(
  source: CommercialDetail,
): ['quotation' | 'contract', CommercialPickerOption][] {
  const { record } = source;
  const context = {
    recruitmentMissionId: record.recruitmentMissionId,
    missionTitle: record.display.missionTitle,
    currency: record.amounts?.currency ?? null,
  };
  const link = (
    id: string | null,
    label: string | null,
    extra: { sourceQuotationId?: string | null } = {},
  ): CommercialPickerOption | null =>
    id && label
      ? { id, label, detail: record.display.missionTitle, context: { ...context, ...extra } }
      : null;
  const links: ['quotation' | 'contract', CommercialPickerOption | null][] = [];
  if (source.kind === 'contract') {
    links.push([
      'quotation',
      link(source.record.sourceQuotationId, record.display.linkedQuotationReference),
    ]);
  }
  if (source.kind === 'purchaseOrder') {
    links.push([
      'quotation',
      link(source.record.quotationId, record.display.linkedQuotationReference),
    ]);
    links.push([
      'contract',
      link(source.record.contractId, record.display.linkedContractReference, {
        sourceQuotationId: source.record.quotationId,
      }),
    ]);
  }
  return links.filter(
    (entry): entry is ['quotation' | 'contract', CommercialPickerOption] => entry[1] !== null,
  );
}

/** Which linked sources each create form offers, in chain order. */
export const SOURCE_FIELDS: Record<CommercialKind, readonly SourceField[]> = {
  contract: ['quotation'],
  invoice: ['quotation', 'contract', 'purchaseOrder', 'placement'],
  purchaseOrder: ['quotation', 'contract'],
  quotation: [],
};

/** The source a follow-up action pre-selects in the new record's form. */
export function sourceFieldFor(kind: CommercialKind): SourceField | null {
  if (kind === 'quotation') return 'quotation';
  if (kind === 'contract') return 'contract';
  if (kind === 'purchaseOrder') return 'purchaseOrder';
  return null;
}

export type DerivedContext =
  | { status: 'none' }
  | {
      status: 'derived';
      recruitmentMissionId: string | null;
      missionTitle: string | null;
      currency: string | null;
      from: SourceField;
    }
  | { status: 'conflict' };

/**
 * The mission context and currency a new record inherits from its linked
 * sources. The API rejects sources that disagree; the form says so first.
 */
export function deriveContext(kind: CommercialKind, values: CreateFormValues): DerivedContext {
  const chosen = SOURCE_FIELDS[kind]
    .map((field) => ({ field, option: values[field] }))
    .filter(
      (entry): entry is { field: SourceField; option: CommercialPickerOption } =>
        entry.option !== null && entry.option.context !== undefined,
    );
  const first = chosen[0];
  if (!first?.option.context) return { status: 'none' };
  const missions = new Set(chosen.map((entry) => entry.option.context?.recruitmentMissionId));
  const currencies = new Set(
    chosen
      .map((entry) => entry.option.context?.currency)
      .filter((currency): currency is string => Boolean(currency)),
  );
  if (missions.size > 1 || currencies.size > 1) return { status: 'conflict' };
  const quotationId = values.quotation?.id ?? null;
  const chainMismatch = chosen.some((entry) => {
    const linked =
      entry.option.context?.sourceQuotationId ?? entry.option.context?.quotationId ?? null;
    return quotationId !== null && linked !== null && linked !== quotationId;
  });
  const contractMismatch =
    values.contract !== null &&
    values.purchaseOrder?.context?.contractId != null &&
    values.purchaseOrder.context.contractId !== values.contract.id;
  if (chainMismatch || contractMismatch) return { status: 'conflict' };
  const withMission = chosen.find((entry) => entry.option.context?.missionTitle !== undefined);
  return {
    status: 'derived',
    recruitmentMissionId: first.option.context.recruitmentMissionId,
    missionTitle: withMission?.option.context?.missionTitle ?? null,
    currency: [...currencies][0] ?? null,
    from: first.field,
  };
}

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
  if (digits.length > String(MONEY_CENTS_MAX).length) return { ok: false };
  const cents = Number(digits);
  return cents <= MONEY_CENTS_MAX ? { cents, ok: true } : { ok: false };
}

const PERCENT = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

/** A tax rate typed as a percentage (`20`, `7,5`) to basis points (`2000`, `750`). */
export function parseTaxRate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const match = PERCENT.exec(trimmed);
  if (!match) return null;
  const [, whole = '', fraction = ''] = match;
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bps <= TAX_RATE_BPS_MAX ? bps : null;
}

function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= 1 && quantity <= QUANTITY_MAX ? quantity : null;
}

export type FormErrorKey =
  | 'commercial.form.errors.reference'
  | 'commercial.form.errors.client'
  | 'commercial.form.errors.currency'
  | 'commercial.form.errors.amount'
  | 'commercial.form.errors.tax'
  | 'commercial.form.errors.lines'
  | 'commercial.form.errors.lineDescription'
  | 'commercial.form.errors.lineQuantity'
  | 'commercial.form.errors.linePrice'
  | 'commercial.form.errors.lineTax'
  | 'commercial.form.errors.context'
  | 'commercial.form.errors.trainingMission';

export type FormErrors = Partial<Record<string, FormErrorKey>>;

export type CreateRequest =
  | { kind: 'quotation'; request: QuotationCreateRequest }
  | { kind: 'contract'; request: CommercialContractCreateRequest }
  | { kind: 'purchaseOrder'; request: PurchaseOrderCreateRequest }
  | { kind: 'invoice'; request: InvoiceCreateRequest };

function optionalDate(value: string): string | undefined {
  return value ? dateInputStartIso(value) : undefined;
}

function toLines(lines: LineValues[], errors: FormErrors): CommercialLineInput[] {
  return lines.map((line) => {
    const description = line.description.trim();
    const quantity = parseQuantity(line.quantity);
    const price = parseMoney(line.unitPrice);
    const taxRateBps = parseTaxRate(line.taxRate);
    if (!description || description.length > 400) {
      errors[`line-${line.key}-description`] = 'commercial.form.errors.lineDescription';
    }
    if (quantity === null)
      errors[`line-${line.key}-quantity`] = 'commercial.form.errors.lineQuantity';
    if (!price.ok || price.cents === null) {
      errors[`line-${line.key}-unitPrice`] = 'commercial.form.errors.linePrice';
    }
    if (taxRateBps === null) errors[`line-${line.key}-taxRate`] = 'commercial.form.errors.lineTax';
    return {
      description,
      quantity: quantity ?? 1,
      unitPriceCents: price.ok ? (price.cents ?? 0) : 0,
      taxRateBps: taxRateBps ?? 0,
    };
  });
}

/** Whether an invoice may take its lines from its linked quotation, contract, or purchase order. */
export function invoiceHasLineSource(values: CreateFormValues): boolean {
  return Boolean(values.quotation || values.contract || values.purchaseOrder);
}

export function toCreateRequest(
  kind: CommercialKind,
  values: CreateFormValues,
):
  | { ok: true; value: CreateRequest }
  | {
      ok: false;
      errors: FormErrors;
    } {
  const errors: FormErrors = {};
  const reference = values.reference.trim();
  if (!reference || reference.length > 80) errors.reference = 'commercial.form.errors.reference';
  if (!values.client) errors.client = 'commercial.form.errors.client';
  const derived = deriveContext(kind, values);
  if (derived.status === 'conflict') errors.context = 'commercial.form.errors.context';
  const derivedCurrency = derived.status === 'derived' ? derived.currency : null;
  const currency = (derivedCurrency ?? values.currency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'commercial.form.errors.currency';
  const placementMission = values.placement?.context?.recruitmentMissionId ?? null;
  const recruitmentMissionId =
    (derived.status === 'derived' ? derived.recruitmentMissionId : null) ??
    placementMission ??
    values.mission?.id ??
    undefined;
  const clientId = values.client?.id ?? '';
  let value: CreateRequest | null = null;

  switch (kind) {
    case 'quotation': {
      const lines = toLines(values.lines, errors);
      if (lines.length === 0) errors.lines = 'commercial.form.errors.lines';
      value = {
        kind,
        request: {
          reference,
          clientId,
          ...(recruitmentMissionId ? { recruitmentMissionId } : {}),
          currency,
          issueDate: optionalDate(values.issueDate),
          validUntil: optionalDate(values.validUntil),
          lines,
        },
      };
      break;
    }
    case 'contract': {
      const amount = parseMoney(values.amount);
      const tax = parseMoney(values.tax);
      if (!amount.ok || amount.cents === null) errors.amount = 'commercial.form.errors.amount';
      if (!tax.ok) errors.tax = 'commercial.form.errors.tax';
      if (values.businessType === 'TRAINING' && recruitmentMissionId) {
        errors.context = 'commercial.form.errors.trainingMission';
      }
      const termsSummary = values.termsSummary.trim();
      value = {
        kind,
        request: {
          reference,
          businessType: values.businessType,
          clientId,
          ...(recruitmentMissionId ? { recruitmentMissionId } : {}),
          ...(values.quotation ? { sourceQuotationId: values.quotation.id } : {}),
          currency,
          contractValueCents: amount.ok ? (amount.cents ?? 0) : 0,
          taxCents: tax.ok ? (tax.cents ?? 0) : 0,
          ...(termsSummary ? { termsSummary: termsSummary.slice(0, 2000) } : {}),
          effectiveDate: optionalDate(values.effectiveDate),
          startDate: optionalDate(values.startDate),
          endDate: optionalDate(values.endDate),
        },
      };
      break;
    }
    case 'purchaseOrder': {
      const amount = parseMoney(values.amount);
      const tax = parseMoney(values.tax);
      if (!amount.ok || amount.cents === null) errors.amount = 'commercial.form.errors.amount';
      if (!tax.ok) errors.tax = 'commercial.form.errors.tax';
      value = {
        kind,
        request: {
          reference,
          clientId,
          ...(recruitmentMissionId ? { recruitmentMissionId } : {}),
          ...(values.quotation ? { quotationId: values.quotation.id } : {}),
          ...(values.contract ? { contractId: values.contract.id } : {}),
          currency,
          amountCents: amount.ok ? (amount.cents ?? 0) : 0,
          taxCents: tax.ok ? (tax.cents ?? 0) : 0,
          issueDate: optionalDate(values.issueDate),
          receivedDate: optionalDate(values.receivedDate),
        },
      };
      break;
    }
    case 'invoice': {
      const usesSourceLines = invoiceHasLineSource(values) && values.useSourceLines;
      const lines = usesSourceLines ? undefined : toLines(values.lines, errors);
      if (lines && lines.length === 0) errors.lines = 'commercial.form.errors.lines';
      value = {
        kind,
        request: {
          reference,
          clientId,
          ...(recruitmentMissionId ? { recruitmentMissionId } : {}),
          ...(values.placement ? { missionPlacementId: values.placement.id } : {}),
          ...(values.quotation ? { quotationId: values.quotation.id } : {}),
          ...(values.contract ? { contractId: values.contract.id } : {}),
          ...(values.purchaseOrder ? { purchaseOrderId: values.purchaseOrder.id } : {}),
          currency,
          issueDate: optionalDate(values.issueDate),
          dueDate: optionalDate(values.dueDate),
          ...(lines ? { lines } : {}),
        },
      };
      break;
    }
  }
  if (Object.keys(errors).length > 0 || !value) return { ok: false, errors };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

type FailureKey = `commercial.feedback.failure.${
  | 'amountTooLarge'
  | 'archiveBlocked'
  | 'chain'
  | 'clientArchived'
  | 'clientMismatch'
  | 'contextMismatch'
  | 'currencyMismatch'
  | 'duplicateReference'
  | 'forbidden'
  | 'generic'
  | 'invalid'
  | 'lifecycle'
  | 'linesRequired'
  | 'missionTerminal'
  | 'notFound'
  | 'paymentsAllocated'
  | 'placementIneligible'
  | 'sourceState'
  | 'trainingMission'}`;

const EXACT_CODES: Record<string, FailureKey> = {
  CLIENT_ARCHIVED: 'commercial.feedback.failure.clientArchived',
  COMMERCIAL_MONEY_BOUNDS_EXCEEDED: 'commercial.feedback.failure.amountTooLarge',
  INVOICE_HAS_ACTIVE_ALLOCATIONS: 'commercial.feedback.failure.paymentsAllocated',
  INVOICE_SOURCE_OR_LINES_REQUIRED: 'commercial.feedback.failure.linesRequired',
  MISSION_TERMINAL: 'commercial.feedback.failure.missionTerminal',
  PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED: 'commercial.feedback.failure.placementIneligible',
  TRAINING_CONTRACT_RECRUITMENT_CONTEXT_BLOCKED: 'commercial.feedback.failure.trainingMission',
};

const SUFFIX_CODES: [RegExp, FailureKey][] = [
  [
    /(REFERENCE_EXISTS|REFERENCE_OR_SOURCE_EXISTS)$/,
    'commercial.feedback.failure.duplicateReference',
  ],
  [/CLIENT_MISMATCH$/, 'commercial.feedback.failure.clientMismatch'],
  [/(CONTEXT_MISMATCH|PLACEMENT_MISSION_MISMATCH)$/, 'commercial.feedback.failure.contextMismatch'],
  [/CURRENCY_MISMATCH$/, 'commercial.feedback.failure.currencyMismatch'],
  [/SOURCE_CHAIN_MISMATCH$/, 'commercial.feedback.failure.chain'],
  [
    /(ACCEPTED_QUOTATION_REQUIRED|ACTIVE_CONTRACT_REQUIRED|RECEIVED_PO_REQUIRED)$/,
    'commercial.feedback.failure.sourceState',
  ],
  [
    /(INVALID_TRANSITION|MUTATION_BLOCKED|CANCEL_BLOCKED)$/,
    'commercial.feedback.failure.lifecycle',
  ],
  [/ARCHIVE_BLOCKED$/, 'commercial.feedback.failure.archiveBlocked'],
  [/NOT_FOUND$/, 'commercial.feedback.failure.notFound'],
];

/** Stable API code (or HTTP status) to localized copy; server text is never shown. */
export function commercialFailureKey(error: unknown): MessageKey {
  if (!(error instanceof CommercialRequestError)) return 'commercial.feedback.failure.generic';
  if (error.code) {
    const exact = EXACT_CODES[error.code];
    if (exact) return exact;
    const suffix = SUFFIX_CODES.find(([pattern]) => pattern.test(error.code ?? ''));
    if (suffix) return suffix[1];
  }
  if (error.status === 404) return 'commercial.feedback.failure.notFound';
  if (error.status === 403) return 'commercial.feedback.failure.forbidden';
  if (error.status === 409) return 'commercial.feedback.failure.lifecycle';
  if (error.status === 400) return 'commercial.feedback.failure.invalid';
  return 'commercial.feedback.failure.generic';
}

export type CommercialFeedback = { tone: 'success' | 'danger'; messageKey: MessageKey };
