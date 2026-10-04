import type { ExpenseDetail, PaymentDetail } from '@hire-me/contracts';
import { vi } from 'vitest';

/** Synthetic fixtures for Accounting tests. No real client or person is represented. */

export const ACTOR_ID = '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a';
export const CLIENT_ID = '2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a';
export const MISSION_ID = '2b2b2b2b-2b2b-42b2-82b2-2b2b2b2b2b2b';
export const INVOICE_ID = '6a6a6a6a-6a6a-46a6-86a6-6a6a6a6a6a6a';
export const PAYMENT_ID = '3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a';
export const PAYMENT_B_ID = '3b3b3b3b-3b3b-43b3-83b3-3b3b3b3b3b3b';
export const ALLOCATION_ID = '4a4a4a4a-4a4a-44a4-84a4-4a4a4a4a4a4a';
export const EXPENSE_ID = '5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5a5a';
export const PLACEMENT_ID = '6b6b6b6b-6b6b-46b6-86b6-6b6b6b6b6b6b';
export const EVENT_ID = '6d6d6d6d-6d6d-46d6-86d6-6d6d6d6d6d6d';

export const FIXTURE_IDS = [
  ACTOR_ID,
  CLIENT_ID,
  MISSION_ID,
  INVOICE_ID,
  PAYMENT_ID,
  PAYMENT_B_ID,
  ALLOCATION_ID,
  EXPENSE_ID,
  PLACEMENT_ID,
  EVENT_ID,
];

export const TIMESTAMP = '2026-09-15T10:00:00.000Z';

export function syntheticPayment(overrides: Partial<PaymentDetail> = {}): PaymentDetail {
  return {
    id: PAYMENT_ID,
    reference: 'PAY-SYN-001',
    clientId: CLIENT_ID,
    display: { clientName: 'Synthetic Client' },
    receivedDate: TIMESTAMP,
    method: 'BANK_TRANSFER',
    externalReference: null,
    note: null,
    status: 'RECORDED',
    amounts: {
      currency: 'MAD',
      amountCents: 1_000_000,
      allocatedCents: 400_000,
      unallocatedCents: 600_000,
    },
    correctedAt: null,
    correctionReason: null,
    recordedByUserId: ACTOR_ID,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    allocations: [
      {
        id: ALLOCATION_ID,
        paymentId: PAYMENT_ID,
        invoiceId: INVOICE_ID,
        display: { invoiceReference: 'INV-SYN-001', paymentReference: 'PAY-SYN-001' },
        status: 'ACTIVE',
        amountCents: 400_000,
        allocatedByUserId: ACTOR_ID,
        reversedAt: null,
        reversalReason: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    history: [
      {
        id: EVENT_ID,
        action: 'created',
        actorUserId: ACTOR_ID,
        reason: null,
        safeSummary: 'Synthetic server summary',
        createdAt: TIMESTAMP,
      },
    ],
    ...overrides,
  };
}

export function syntheticExpense(overrides: Partial<ExpenseDetail> = {}): ExpenseDetail {
  return {
    id: EXPENSE_ID,
    reference: 'EXP-SYN-001',
    expenseDate: TIMESTAMP,
    category: 'TRAVEL',
    context: {
      clientId: CLIENT_ID,
      recruitmentMissionId: null,
      missionPlacementId: null,
      trainingProgramId: null,
    },
    display: {
      clientName: 'Synthetic Client',
      missionTitle: null,
      placement: null,
      trainingProgramName: null,
    },
    vendorLabel: 'Synthetic vendor',
    description: 'Synthetic travel expense',
    status: 'RECORDED',
    amounts: { currency: 'MAD', amountCents: 250_000 },
    correctedAt: null,
    correctionReason: null,
    createdByUserId: ACTOR_ID,
    archivedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    history: [
      {
        id: EVENT_ID,
        action: 'created',
        actorUserId: ACTOR_ID,
        reason: null,
        safeSummary: 'Synthetic server summary',
        createdAt: TIMESTAMP,
      },
    ],
    ...overrides,
  };
}

export const syntheticClient = {
  id: CLIENT_ID,
  name: 'Synthetic Client',
  normalizedName: 'synthetic client',
  status: 'ACTIVE' as const,
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

export interface RecordedCall {
  authorization: string | null;
  body: Record<string, unknown> | null;
  method: string;
  path: string;
  search: URLSearchParams;
}

export function mockAccountingApi(
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

/** Sees payments and expenses but not amounts or writes. */
export const READ_ONLY = [
  'clients:view',
  'payments:view',
  'expenses:view',
  'client_balances:view',
  'profitability:view',
];

/** Sees payments only, without commercial data access. */
export const LIMITED = ['clients:view', 'payments:view'];

/** Full accounting operator with mission scope through transfer. */
export const OPERATOR = [
  'clients:view',
  'commercial_data:access',
  'payments:view',
  'payments:manage',
  'payments:correct',
  'expenses:view',
  'expenses:manage',
  'client_balances:view',
  'profitability:view',
  'invoices:view',
  'missions:view',
  'mission_candidates:transfer',
  'placements:view',
  'training_programs:view',
];
