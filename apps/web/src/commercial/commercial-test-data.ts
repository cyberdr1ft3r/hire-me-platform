import type {
  CommercialContractDetail,
  InvoiceDetail,
  PurchaseOrderDetail,
  QuotationDetail,
} from '@hire-me/contracts';
import { vi } from 'vitest';

/** Synthetic fixtures for Commercial tests. No real client, mission, or person is represented. */

export const ACTOR_ID = '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a';
export const CLIENT_ID = '2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a';
export const MISSION_ID = '2b2b2b2b-2b2b-42b2-82b2-2b2b2b2b2b2b';
export const QUOTATION_ID = '3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a';
export const QUOTATION_B_ID = '3b3b3b3b-3b3b-43b3-83b3-3b3b3b3b3b3b';
export const CONTRACT_ID = '4a4a4a4a-4a4a-44a4-84a4-4a4a4a4a4a4a';
export const PURCHASE_ORDER_ID = '5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5a5a';
export const INVOICE_ID = '6a6a6a6a-6a6a-46a6-86a6-6a6a6a6a6a6a';
export const PLACEMENT_ID = '6b6b6b6b-6b6b-46b6-86b6-6b6b6b6b6b6b';
export const LINE_ID = '6c6c6c6c-6c6c-46c6-86c6-6c6c6c6c6c6c';
export const EVENT_ID = '6d6d6d6d-6d6d-46d6-86d6-6d6d6d6d6d6d';
export const DOCUMENT_ID = '7a7a7a7a-7a7a-47a7-87a7-7a7a7a7a7a7a';
export const VERSION_ID = '7b7b7b7b-7b7b-47b7-87b7-7b7b7b7b7b7b';

/** Every fixture ID, so a test can prove none of them is ever rendered as text. */
export const FIXTURE_IDS = [
  ACTOR_ID,
  CLIENT_ID,
  MISSION_ID,
  QUOTATION_ID,
  QUOTATION_B_ID,
  CONTRACT_ID,
  PURCHASE_ORDER_ID,
  INVOICE_ID,
  PLACEMENT_ID,
  LINE_ID,
  EVENT_ID,
  DOCUMENT_ID,
  VERSION_ID,
];

export const TIMESTAMP = '2026-09-15T10:00:00.000Z';

const DISPLAY = {
  clientName: 'Synthetic Client',
  missionTitle: null,
  linkedQuotationReference: null,
  linkedContractReference: null,
  linkedPurchaseOrderReference: null,
  correctionOfInvoiceReference: null,
  placement: null,
};

const AMOUNTS = {
  currency: 'MAD',
  subtotalCents: 1_000_000,
  taxCents: 200_000,
  totalCents: 1_200_000,
};

export function syntheticLine() {
  return {
    id: LINE_ID,
    description: 'Synthetic recruitment fee',
    quantity: 1,
    unitPriceCents: 1_000_000,
    taxRateBps: 2000,
    sortOrder: 0,
    lineSubtotalCents: 1_000_000,
    lineTaxCents: 200_000,
    lineTotalCents: 1_200_000,
  };
}

export function syntheticEvent(overrides: Partial<QuotationDetail['history'][number]> = {}) {
  return {
    id: EVENT_ID,
    actorUserId: ACTOR_ID,
    action: 'CREATED',
    previousStatus: null,
    nextStatus: 'DRAFT',
    reason: null,
    safeSummary: 'Synthetic server summary',
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

export function syntheticQuotation(overrides: Partial<QuotationDetail> = {}): QuotationDetail {
  return {
    id: QUOTATION_ID,
    reference: 'Q-SYN-001',
    clientId: CLIENT_ID,
    recruitmentMissionId: null,
    display: DISPLAY,
    status: 'ACCEPTED',
    issueDate: TIMESTAMP,
    validUntil: null,
    amounts: AMOUNTS,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    lines: [syntheticLine()],
    history: [syntheticEvent()],
    ...overrides,
  };
}

export function syntheticContract(
  overrides: Partial<CommercialContractDetail> = {},
): CommercialContractDetail {
  return {
    id: CONTRACT_ID,
    reference: 'C-SYN-001',
    businessType: 'RECRUITMENT',
    clientId: CLIENT_ID,
    recruitmentMissionId: null,
    sourceQuotationId: QUOTATION_ID,
    display: { ...DISPLAY, linkedQuotationReference: 'Q-SYN-001' },
    status: 'ACTIVE',
    effectiveDate: TIMESTAMP,
    startDate: null,
    endDate: null,
    termsSummary: 'Synthetic terms summary',
    amounts: AMOUNTS,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    history: [],
    ...overrides,
  };
}

export function syntheticPurchaseOrder(
  overrides: Partial<PurchaseOrderDetail> = {},
): PurchaseOrderDetail {
  return {
    id: PURCHASE_ORDER_ID,
    reference: 'PO-SYN-001',
    clientId: CLIENT_ID,
    recruitmentMissionId: null,
    quotationId: QUOTATION_ID,
    contractId: null,
    display: { ...DISPLAY, linkedQuotationReference: 'Q-SYN-001' },
    status: 'RECEIVED',
    issueDate: TIMESTAMP,
    receivedDate: TIMESTAMP,
    amounts: AMOUNTS,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    history: [],
    ...overrides,
  };
}

export function syntheticInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: INVOICE_ID,
    reference: 'INV-SYN-001',
    clientId: CLIENT_ID,
    recruitmentMissionId: null,
    missionPlacementId: null,
    quotationId: QUOTATION_ID,
    contractId: null,
    purchaseOrderId: PURCHASE_ORDER_ID,
    display: {
      ...DISPLAY,
      linkedPurchaseOrderReference: 'PO-SYN-001',
      linkedQuotationReference: 'Q-SYN-001',
    },
    status: 'DRAFT',
    issueDate: null,
    dueDate: null,
    issuedAt: null,
    canceledAt: null,
    correctionOfInvoiceId: null,
    amounts: AMOUNTS,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    lines: [syntheticLine()],
    history: [],
    ...overrides,
  };
}

/** A record as a list returns it: the summary fields only. */
export function summary<Record extends { history: unknown; lines?: unknown }>(
  record: Record,
): Omit<Record, 'history' | 'lines'> {
  const rest: Partial<Record> = { ...record };
  delete rest.history;
  delete rest.lines;
  return rest as Omit<Record, 'history' | 'lines'>;
}

export const syntheticClient = {
  id: CLIENT_ID,
  name: 'Synthetic Client',
  normalizedName: 'synthetic client',
  status: 'ACTIVE',
  industry: null,
  website: null,
  mainPhone: null,
  country: null,
  city: 'Synthetic City',
  commercial: null,
  archivedAt: null,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

export function page<Key extends string, Item>(
  key: Key,
  items: Item[],
  options: { page?: number; pageSize?: number; total?: number } = {},
) {
  return {
    [key]: items,
    pagination: {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      total: options.total ?? items.length,
    },
  } as Record<Key, Item[]> & { pagination: { page: number; pageSize: number; total: number } };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string): Response {
  return jsonResponse({ error: { code, message: 'Synthetic failure.' } }, status);
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T = Response>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export interface RecordedCall {
  authorization: string | null;
  body: Record<string, unknown> | null;
  method: string;
  path: string;
  search: URLSearchParams;
}

/**
 * Routes every `fetch` to `handler` by method and pathname. An unrouted
 * request rejects, so a test fails loudly on a read it did not expect.
 */
export function mockCommercialApi(
  handler: (call: RecordedCall) => Promise<Response> | Response | undefined,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const rawBody = typeof init?.body === 'string' ? init.body : null;
    const call: RecordedCall = {
      authorization: new Headers(init?.headers).get('Authorization'),
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
    };
    calls.push(call);
    const response = handler(call);
    return response === undefined
      ? Promise.reject(new Error(`Unexpected request ${call.method} ${call.path}`))
      : Promise.resolve(response);
  });
  return calls;
}

const VIEW_ALL = [
  'clients:view',
  'quotations:view',
  'contracts:view',
  'purchase_orders:view',
  'invoices:view',
];

/** Sees every record type and its amounts, changes nothing. */
export const READ_ONLY = [...VIEW_ALL, 'commercial_data:access'];

/** Sees invoice references and statuses only: no amounts, no other record type, no writes. */
export const LIMITED = ['clients:view', 'invoices:view'];

/** A commercial operator with mission scope through `mission_candidates:transfer`. */
export const OPERATOR = [
  ...VIEW_ALL,
  'commercial_data:access',
  'quotations:manage',
  'contracts:manage',
  'purchase_orders:manage',
  'invoices:manage',
  'missions:view',
  'mission_candidates:transfer',
  'placements:view',
  'placement_commercial_eligibility:view',
  'documents:generate',
  'documents:view',
  'documents:download',
];
