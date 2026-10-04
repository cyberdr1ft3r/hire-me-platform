import type {
  ExpenseCategory,
  InvoiceSettlementState,
  PaymentAllocationStatus,
  PaymentMethod,
  PaymentRecordStatus,
  ProfitabilityContext,
} from '@hire-me/contracts';

import { useI18n, type MessageKey } from '../i18n/index.js';
import type { StatusTone } from '../ui/index.js';

const CURRENCY_CODE = /^[A-Z]{3}$/;

const HISTORY_ACTIONS = new Set([
  'allocated',
  'allocation_reversed',
  'archived',
  'corrected',
  'created',
  'updated',
]);

export function historyActionKey(action: string): MessageKey {
  return `accounting.history.actions.${HISTORY_ACTIONS.has(action) ? action : 'OTHER'}` as MessageKey;
}

export function recordStatusTone(status: PaymentRecordStatus): StatusTone {
  if (status === 'ARCHIVED') return 'neutral';
  if (status === 'CORRECTED') return 'warning';
  return 'success';
}

export function settlementTone(state: InvoiceSettlementState): StatusTone {
  switch (state) {
    case 'PAID':
      return 'success';
    case 'OVERDUE':
      return 'danger';
    case 'PARTIALLY_PAID':
      return 'warning';
    case 'UNPAID':
      return 'info';
    default:
      return 'neutral';
  }
}

/**
 * Locale-aware labels for Accounting presentation values. Status, method,
 * category, and action labels are presentation only; references, client names,
 * mission titles, vendors, notes, and reasons are business content and never
 * pass through the dictionary.
 */
export function useAccountingFormat() {
  const i18n = useI18n();
  const message = i18n.t as unknown as (key: MessageKey) => string;
  return {
    ...i18n,
    message,
    allocationStatus: (status: PaymentAllocationStatus) =>
      message(`accounting.allocationStatus.${status}` as MessageKey),
    category: (category: ExpenseCategory) =>
      message(`accounting.categories.${category}` as MessageKey),
    context: (context: ProfitabilityContext) =>
      message(`accounting.profitability.contexts.${context}` as MessageKey),
    method: (method: PaymentMethod) => message(`accounting.methods.${method}` as MessageKey),
    recordStatus: (status: PaymentRecordStatus) =>
      message(`accounting.recordStatus.${status}` as MessageKey),
    settlement: (state: InvoiceSettlementState) =>
      message(`accounting.settlement.${state}` as MessageKey),
    /** Minor units to a localized amount. Integer cents stay exact below 2^53. */
    money: (cents: number, currency: string) =>
      CURRENCY_CODE.test(currency)
        ? i18n.formatCurrency(cents / 100, currency)
        : `${i18n.formatNumber(cents / 100, { minimumFractionDigits: 2 })} ${currency}`,
  };
}

export type AccountingFormat = ReturnType<typeof useAccountingFormat>;
