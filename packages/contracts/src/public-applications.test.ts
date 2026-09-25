import { describe, expect, it } from 'vitest';

import { CANDIDATE_SALARY_EXPECTATION_CENTS_MAX } from './candidates.js';
import {
  normalizePublicSalaryExpectationCurrency,
  PublicApplicationSubmitRequestSchema,
} from './public-applications.js';

/**
 * `salaryExpectationCents` is a minor-unit integer for every caller of the
 * public endpoint. A browser form converts what a person typed before it gets
 * here; a direct API caller keeps sending cents. These tests hold that meaning
 * and the storage bound, not the browser's conversion.
 */
function submission(extra: Record<string, unknown> = {}) {
  return {
    consentGranted: true,
    email: 'ada@example.test',
    files: [],
    fullName: 'Ada Example',
    ...extra,
  };
}

describe('public application salary expectation', () => {
  it('accepts whole minor units from zero up to what the integer column holds', () => {
    for (const salaryExpectationCents of [
      0,
      3_600_050,
      1_500_000,
      CANDIDATE_SALARY_EXPECTATION_CENTS_MAX,
    ]) {
      expect(
        PublicApplicationSubmitRequestSchema.parse(submission({ salaryExpectationCents })),
      ).toMatchObject({ salaryExpectationCents });
    }
  });

  it('treats the amount as optional and never invents one', () => {
    const parsed = PublicApplicationSubmitRequestSchema.parse(submission());
    expect(parsed.salaryExpectationCents).toBeUndefined();
    expect('salaryExpectationCents' in parsed).toBe(false);
  });

  it('rejects negative, fractional, textual, and out-of-range amounts', () => {
    for (const salaryExpectationCents of [
      -1,
      -0.5,
      36_000.5,
      '3600000',
      Number.NaN,
      CANDIDATE_SALARY_EXPECTATION_CENTS_MAX + 1,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(
        PublicApplicationSubmitRequestSchema.safeParse(submission({ salaryExpectationCents }))
          .success,
        String(salaryExpectationCents),
      ).toBe(false);
    }
  });
});

/**
 * Issue #86 / A-75-05: the optional currency is exactly three ASCII letters
 * after trimming, stored in uppercase, for the browser and a direct caller
 * alike. Empty means omitted. Nothing else is inferred or converted.
 */
describe('public application salary expectation currency', () => {
  it('omits an absent, empty, or whitespace-only currency', () => {
    for (const extra of [
      {},
      { salaryExpectationCurrency: '' },
      { salaryExpectationCurrency: '   ' },
    ]) {
      const parsed = PublicApplicationSubmitRequestSchema.parse(submission(extra));
      expect(parsed.salaryExpectationCurrency, JSON.stringify(extra)).toBeUndefined();
    }
  });

  it('accepts three ASCII letters in any case and stores them in uppercase', () => {
    for (const [input, stored] of [
      ['EUR', 'EUR'],
      ['mad', 'MAD'],
      ['uSd', 'USD'],
      [' EUR ', 'EUR'],
      ['\teur\n', 'EUR'],
    ] as const) {
      expect(
        PublicApplicationSubmitRequestSchema.parse(submission({ salaryExpectationCurrency: input }))
          .salaryExpectationCurrency,
        JSON.stringify(input),
      ).toBe(stored);
    }
  });

  it('does not require a salary amount with a currency, or a currency with an amount', () => {
    expect(
      PublicApplicationSubmitRequestSchema.parse(submission({ salaryExpectationCurrency: 'EUR' })),
    ).not.toHaveProperty('salaryExpectationCents');
    expect(
      PublicApplicationSubmitRequestSchema.parse(submission({ salaryExpectationCents: 3_600_050 }))
        .salaryExpectationCurrency,
    ).toBeUndefined();
  });

  it('rejects every other shape without echoing it', () => {
    for (const salaryExpectationCurrency of [
      'E',
      'EU',
      'EURO',
      'E'.repeat(4000),
      '123',
      'EU1',
      'E-R',
      'EU.',
      'E R',
      'ÉUR',
      'EUŘ',
      '€€€',
      'ＥＵＲ',
      `EU${String.fromCodePoint(0x0301)}`,
      null,
      840,
    ]) {
      const result = PublicApplicationSubmitRequestSchema.safeParse(
        submission({ salaryExpectationCurrency }),
      );
      expect(result.success, JSON.stringify(salaryExpectationCurrency)).toBe(false);
      if (
        !result.success &&
        typeof salaryExpectationCurrency === 'string' &&
        salaryExpectationCurrency.length > 1
      ) {
        expect(JSON.stringify(result.error.issues)).not.toContain(salaryExpectationCurrency);
      }
    }
  });

  it('exposes the same rule to the browser form', () => {
    expect(normalizePublicSalaryExpectationCurrency('')).toEqual({ ok: true, currency: undefined });
    expect(normalizePublicSalaryExpectationCurrency(' eUr ')).toEqual({
      ok: true,
      currency: 'EUR',
    });
    expect(normalizePublicSalaryExpectationCurrency('EU')).toEqual({ ok: false });
    expect(normalizePublicSalaryExpectationCurrency('EURO')).toEqual({ ok: false });
  });
});
