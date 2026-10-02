import { FINANCE_MANAGER_PERMISSION_CODES } from '@hire-me/contracts';
import { describe, expect, it } from 'vitest';

import { AccountingRequestError } from '../api.js';
import { resolveAccountingAccess, visibleAreas } from './accounting-access.js';
import {
  accountingFailureKey,
  emptyPaymentForm,
  parseMoney,
  paymentListOptions,
  toPaymentCreateRequest,
  EMPTY_PAYMENT_FILTERS,
} from './accounting-state.js';
import { LIMITED, OPERATOR, READ_ONLY } from './accounting-test-data.js';

describe('resolveAccountingAccess', () => {
  it('gives the Finance Manager every area with writes but no mission, placement, or training pickers', () => {
    const access = resolveAccountingAccess(FINANCE_MANAGER_PERMISSION_CODES);
    expect(visibleAreas(access)).toEqual(['payments', 'expenses', 'balances', 'profitability']);
    expect(access.amounts).toBe(true);
    expect(access.clients).toBe(true);
    expect(access.payments.record).toBe(true);
    expect(access.payments.correct).toBe(true);
    expect(access.expenses.record).toBe(true);
    expect(access.balances).toBe(true);
    expect(access.profitability).toBe(true);
    expect(access.profitabilityContexts).toEqual(['CLIENT']);
    expect(access.pickMissions).toBe(false);
    expect(access.pickPlacements).toBe(false);
    expect(access.pickTrainingPrograms).toBe(false);
    expect(access.readOnly).toBe(false);
  });

  it('requires commercial data access for amounts, balances, profitability, and writes', () => {
    const withoutData = resolveAccountingAccess(
      OPERATOR.filter((code) => code !== 'commercial_data:access'),
    );
    expect(withoutData.amounts).toBe(false);
    expect(withoutData.balances).toBe(false);
    expect(withoutData.profitability).toBe(false);
    expect(withoutData.payments.record).toBe(false);
    expect(withoutData.expenses.record).toBe(false);
    expect(withoutData.readOnly).toBe(true);
  });

  it('keeps read-only and limited accounts free of writes', () => {
    expect(resolveAccountingAccess(READ_ONLY).readOnly).toBe(true);
    const limited = resolveAccountingAccess(LIMITED);
    expect(limited.amounts).toBe(false);
    expect(limited.payments.record).toBe(false);
    expect(limited.readOnly).toBe(true);
  });

  it('scopes mission choices to assignments without transfer and needs placement capability', () => {
    expect(resolveAccountingAccess(OPERATOR).missionsAssignedOnly).toBe(false);
    expect(resolveAccountingAccess(OPERATOR).pickPlacements).toBe(true);
    const withoutTransfer = OPERATOR.filter((code) => code !== 'mission_candidates:transfer');
    expect(resolveAccountingAccess(withoutTransfer).missionsAssignedOnly).toBe(true);
    for (const code of ['placements:view', 'missions:view']) {
      const access = resolveAccountingAccess(OPERATOR.filter((item) => item !== code));
      expect(access.pickPlacements, code).toBe(false);
    }
  });
});

describe('accounting form and list helpers', () => {
  it('parses major units to exact minor units', () => {
    expect(parseMoney('1250.50')).toEqual({ ok: true, cents: 125_050 });
    expect(parseMoney('1250,50')).toEqual({ ok: true, cents: 125_050 });
    expect(parseMoney('')).toEqual({ ok: true, cents: null });
    expect(parseMoney('abc').ok).toBe(false);
  });

  it('builds payment list parameters from filters', () => {
    expect(
      paymentListOptions({
        page: 2,
        filters: { ...EMPTY_PAYMENT_FILTERS, includeArchived: true, status: 'ARCHIVED' },
      }).includeArchived,
    ).toBe(true);
  });

  it('validates payment create requests', () => {
    const invalid = toPaymentCreateRequest(emptyPaymentForm());
    expect(invalid.ok).toBe(false);
    const valid = toPaymentCreateRequest({
      ...emptyPaymentForm(),
      reference: 'PAY-NEW',
      client: {
        id: '2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a',
        label: 'Synthetic Client',
        detail: null,
      },
      amount: '100.00',
      receivedDate: '2026-09-15',
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.value.amountCents).toBe(10_000);
  });
});

describe('accountingFailureKey', () => {
  it('maps stable API codes to localized keys', () => {
    expect(
      accountingFailureKey(new AccountingRequestError(409, 'PAYMENT_CORRECTION_BELOW_ALLOCATED')),
    ).toBe('accounting.feedback.failure.correctionBelowAllocated');
    expect(
      accountingFailureKey(new AccountingRequestError(404, 'ACCOUNTING_RECORD_NOT_FOUND')),
    ).toBe('accounting.feedback.failure.notFound');
    expect(accountingFailureKey(new AccountingRequestError(403, null))).toBe(
      'accounting.feedback.failure.forbidden',
    );
  });
});
