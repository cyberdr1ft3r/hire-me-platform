import { describe, expect, it } from 'vitest';

import {
  ExpenseListQuerySchema,
  MAX_ACCOUNTING_CENTS,
  MAX_ACCOUNTING_DATE_RANGE_DAYS,
  PaymentListQuerySchema,
  PositiveCentsSchema,
} from './accounting.js';

const DAY_MS = 86_400_000;
const FROM = '2026-01-01T00:00:00.000Z';

function offsetFrom(milliseconds: number): string {
  return new Date(Date.parse(FROM) + milliseconds).toISOString();
}

/**
 * Issue #39 requires bounded date ranges on accounting lists. A one-sided window is
 * rejected rather than silently widened, so a financial list can never sweep the whole
 * ledger in one request.
 */
describe('accounting list date windows', () => {
  const windows = [
    { name: 'payments', schema: PaymentListQuerySchema, from: 'receivedFrom', to: 'receivedTo' },
    { name: 'expenses', schema: ExpenseListQuerySchema, from: 'expenseFrom', to: 'expenseTo' },
  ] as const;

  for (const { name, schema, from, to } of windows) {
    describe(name, () => {
      it('accepts a query with no date filter', () => {
        expect(schema.safeParse({}).success).toBe(true);
      });

      it('accepts a complete window inside the limit', () => {
        expect(schema.safeParse({ [from]: FROM, [to]: offsetFrom(30 * DAY_MS) }).success).toBe(
          true,
        );
      });

      it('accepts a window of exactly the maximum interval', () => {
        const result = schema.safeParse({
          [from]: FROM,
          [to]: offsetFrom(MAX_ACCOUNTING_DATE_RANGE_DAYS * DAY_MS),
        });
        expect(result.success).toBe(true);
      });

      it('rejects the maximum interval exceeded by one millisecond', () => {
        const result = schema.safeParse({
          [from]: FROM,
          [to]: offsetFrom(MAX_ACCOUNTING_DATE_RANGE_DAYS * DAY_MS + 1),
        });
        expect(result.success).toBe(false);
      });

      it('rejects a window that runs backwards', () => {
        const result = schema.safeParse({ [from]: offsetFrom(DAY_MS), [to]: FROM });
        expect(result.success).toBe(false);
      });

      it('rejects a one-sided window', () => {
        expect(schema.safeParse({ [from]: FROM }).success).toBe(false);
        expect(schema.safeParse({ [to]: FROM }).success).toBe(false);
      });

      it('keeps the same instant on both endpoints valid', () => {
        expect(schema.safeParse({ [from]: FROM, [to]: FROM }).success).toBe(true);
      });
    });
  }

  it('documents the chosen finite window', () => {
    expect(MAX_ACCOUNTING_DATE_RANGE_DAYS).toBe(366);
  });
});

/** The per-row money bound matches the PostgreSQL integer range of the columns. */
describe('accounting money bounds', () => {
  it('accepts the largest storable amount', () => {
    expect(PositiveCentsSchema.safeParse(MAX_ACCOUNTING_CENTS).success).toBe(true);
    expect(MAX_ACCOUNTING_CENTS).toBe(2_147_483_647);
  });

  it('rejects one minor unit beyond the column range', () => {
    expect(PositiveCentsSchema.safeParse(MAX_ACCOUNTING_CENTS + 1).success).toBe(false);
  });
});
