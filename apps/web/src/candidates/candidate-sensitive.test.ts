import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CONSENT_STATUSES,
  compensationUpdateRequest,
  consentUpdateRequest,
  parseCurrency,
  parseSalaryAmount,
  salaryAmountInput,
} from './candidate-sensitive.js';

/**
 * The conversions behind the restricted forms. Everything here is pure, so the
 * exact numbers and the exact partial bodies can be pinned directly.
 */

const originalTimezone = process.env.TZ;

beforeAll(() => {
  // A zone away from UTC, with daylight saving, so a shifted instant cannot pass unnoticed.
  process.env.TZ = 'Europe/Paris';
});

afterAll(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe('Salary expectation: major units typed, minor units stored', () => {
  it('converts the typed major-unit amount to exact integer cents', () => {
    expect(parseSalaryAmount('36000')).toEqual({ cents: 3_600_000, ok: true });
    expect(parseSalaryAmount('36000.5')).toEqual({ cents: 3_600_050, ok: true });
    expect(parseSalaryAmount('36000.50')).toEqual({ cents: 3_600_050, ok: true });
    expect(parseSalaryAmount('36000,50')).toEqual({ cents: 3_600_050, ok: true });
    expect(parseSalaryAmount('  36000.05  ')).toEqual({ cents: 3_600_005, ok: true });
  });

  it('keeps zero as a real value and reads an empty field as no value', () => {
    expect(parseSalaryAmount('0')).toEqual({ cents: 0, ok: true });
    expect(parseSalaryAmount('0.00')).toEqual({ cents: 0, ok: true });
    expect(parseSalaryAmount('')).toEqual({ cents: null, ok: true });
    expect(parseSalaryAmount('   ')).toEqual({ cents: null, ok: true });
  });

  it('never rounds through binary floating point', () => {
    // `Number(value) * 100` is not a whole number of cents for any of these.
    expect(Number('0.29') * 100).not.toBe(29);
    expect(Number('1.15') * 100).not.toBe(115);
    expect(Number('4.35') * 100).not.toBe(435);
    expect(parseSalaryAmount('0.29')).toEqual({ cents: 29, ok: true });
    expect(parseSalaryAmount('1.15')).toEqual({ cents: 115, ok: true });
    expect(parseSalaryAmount('4.35')).toEqual({ cents: 435, ok: true });
  });

  it('rejects malformed amounts, more than two decimals, and values the column cannot hold', () => {
    for (const value of [
      '-1',
      '-0.50',
      '+5',
      '1e5',
      '0x10',
      'abc',
      '12a',
      '.5',
      '5.',
      '1 000',
      '36,000',
      '36000.505',
      '36000.5.0',
      'NaN',
      'Infinity',
      '21474836.48',
      '99999999999999999999',
    ]) {
      expect(parseSalaryAmount(value), value).toEqual({ ok: false });
    }
    expect(parseSalaryAmount('21474836.47')).toEqual({ cents: 2_147_483_647, ok: true });
  });

  it('pre-fills stored cents as the exact major-unit text, and reads it back unchanged', () => {
    expect(salaryAmountInput(3_600_000)).toBe('36000');
    expect(salaryAmountInput(3_600_050)).toBe('36000.50');
    expect(salaryAmountInput(3_600_005)).toBe('36000.05');
    expect(salaryAmountInput(29)).toBe('0.29');
    expect(salaryAmountInput(0)).toBe('0');
    expect(salaryAmountInput(null)).toBe('');
    expect(salaryAmountInput(2_147_483_647)).toBe('21474836.47');
    for (const cents of [0, 1, 29, 99, 100, 115, 435, 3_600_050, 5_400_000, 2_147_483_647]) {
      expect(parseSalaryAmount(salaryAmountInput(cents))).toEqual({ cents, ok: true });
    }
  });
});

describe('Currency: the recorded three-character value', () => {
  it('keeps the trimmed value as typed, reads empty as none, and needs exactly three characters', () => {
    expect(parseCurrency('EUR')).toEqual({ currency: 'EUR', ok: true });
    expect(parseCurrency(' MAD ')).toEqual({ currency: 'MAD', ok: true });
    expect(parseCurrency('')).toEqual({ currency: null, ok: true });
    for (const value of ['EU', 'EURO', 'E']) {
      expect(parseCurrency(value)).toEqual({ ok: false });
    }
  });
});

describe('Compensation partial update', () => {
  const current = { salaryExpectationCents: 3_600_000, salaryExpectationCurrency: 'EUR' };
  const request = (amount: string, currency: string) =>
    compensationUpdateRequest(current, { amount, currency });

  it('sends only the field that changed, null for a cleared one, and nothing when unchanged', () => {
    expect(request('36000.5', 'EUR')).toEqual({
      body: { salaryExpectationCents: 3_600_050 },
      ok: true,
    });
    expect(request('36000', 'MAD')).toEqual({
      body: { salaryExpectationCurrency: 'MAD' },
      ok: true,
    });
    expect(request('', 'EUR')).toEqual({ body: { salaryExpectationCents: null }, ok: true });
    expect(request('36000', '')).toEqual({ body: { salaryExpectationCurrency: null }, ok: true });
    expect(request('36000', 'EUR')).toEqual({ body: {}, ok: true });
    // The same amount written differently is the same stored value.
    expect(request('36000.00', ' EUR ')).toEqual({ body: {}, ok: true });
    expect(request('0', 'EUR')).toEqual({ body: { salaryExpectationCents: 0 }, ok: true });
  });

  it('records a first value where none was stored', () => {
    expect(
      compensationUpdateRequest(
        { salaryExpectationCents: null, salaryExpectationCurrency: null },
        { amount: '0', currency: 'MAD' },
      ),
    ).toEqual({ body: { salaryExpectationCents: 0, salaryExpectationCurrency: 'MAD' }, ok: true });
  });

  it('returns field errors instead of a body for an invalid amount or currency', () => {
    expect(request('36000.505', 'EURO')).toEqual({
      fieldErrors: { amount: 'amount', currency: 'currency' },
      ok: false,
    });
  });
});

describe('Consent partial update', () => {
  const stored = '2026-07-21T12:00:30.500Z';
  const current = { consentRecordedAt: stored, consentStatus: 'GRANTED' as const };
  // 12:00:30 UTC is 14:00 in Paris in July; the control shows minutes only.
  const storedLocal = '2026-07-21T14:00';

  it('uses exactly the four contract statuses', () => {
    expect(CONSENT_STATUSES).toEqual(['UNKNOWN', 'GRANTED', 'REVOKED', 'EXPIRED']);
  });

  it('keeps the exact stored instant when the date is untouched, and changes only the status', () => {
    expect(
      consentUpdateRequest(current, { consentRecordedAt: storedLocal, consentStatus: 'REVOKED' }),
    ).toEqual({ body: { consentStatus: 'REVOKED' }, ok: true });
    expect(
      consentUpdateRequest(current, { consentRecordedAt: storedLocal, consentStatus: 'GRANTED' }),
    ).toEqual({ body: {}, ok: true });
  });

  it('sends only a changed instant, converted from local time, or null when cleared', () => {
    expect(
      consentUpdateRequest(current, {
        consentRecordedAt: '2026-08-01T11:30',
        consentStatus: 'GRANTED',
      }),
    ).toEqual({ body: { consentRecordedAt: '2026-08-01T09:30:00.000Z' }, ok: true });
    expect(
      consentUpdateRequest(current, { consentRecordedAt: '', consentStatus: 'GRANTED' }),
    ).toEqual({ body: { consentRecordedAt: null }, ok: true });
    expect(
      consentUpdateRequest(
        { consentRecordedAt: null, consentStatus: 'UNKNOWN' },
        { consentRecordedAt: '', consentStatus: 'UNKNOWN' },
      ),
    ).toEqual({ body: {}, ok: true });
  });

  it('rejects a status outside the contract and an unreadable date', () => {
    expect(
      consentUpdateRequest(current, { consentRecordedAt: storedLocal, consentStatus: 'Granted' }),
    ).toEqual({ fieldErrors: { consentStatus: 'required' }, ok: false });
    expect(
      consentUpdateRequest(current, { consentRecordedAt: 'not-a-date', consentStatus: 'GRANTED' }),
    ).toEqual({ fieldErrors: { consentRecordedAt: 'dateTime' }, ok: false });
  });
});
