import { useI18n, type MessageKey } from '../i18n/index.js';
import type { CommercialKind, CommercialStatus, LifecycleAction } from './commercial-kinds.js';

const CURRENCY_CODE = /^[A-Z]{3}$/;

/** Every key a dynamic lookup may build; the dictionaries define each one per kind. */
export function statusKey(kind: CommercialKind, status: CommercialStatus): MessageKey {
  return `commercial.status.${kind}.${status}` as MessageKey;
}

export function actionKey(action: LifecycleAction): MessageKey {
  return `commercial.detail.actions.${action}` as MessageKey;
}

const HISTORY_ACTIONS = new Set([
  'ARCHIVED',
  'CANCELED',
  'CREATED',
  'ISSUED',
  'STATUS_CHANGED',
  'UPDATED',
]);

export function historyActionKey(action: string): MessageKey {
  return `commercial.detail.history.actions.${HISTORY_ACTIONS.has(action) ? action : 'OTHER'}` as MessageKey;
}

/**
 * Locale-aware labels for Commercial presentation values. Status, kind, and
 * action labels are presentation only; references, client names, mission
 * titles, terms, and line descriptions are business content and never pass
 * through the dictionary.
 */
export function useCommercialFormat() {
  const i18n = useI18n();
  const message = i18n.t as unknown as (key: MessageKey) => string;
  return {
    ...i18n,
    message,
    status: (kind: CommercialKind, status: CommercialStatus) => message(statusKey(kind, status)),
    /** Minor units to a localized amount. Integer cents stay exact below 2^53. */
    money: (cents: number, currency: string) =>
      CURRENCY_CODE.test(currency)
        ? i18n.formatCurrency(cents / 100, currency)
        : `${i18n.formatNumber(cents / 100, { minimumFractionDigits: 2 })} ${currency}`,
    taxRate: (bps: number) =>
      i18n.formatNumber(bps / 10_000, { maximumFractionDigits: 2, style: 'percent' }),
  };
}

export type CommercialFormat = ReturnType<typeof useCommercialFormat>;
