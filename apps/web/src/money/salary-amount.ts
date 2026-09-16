import { CANDIDATE_SALARY_EXPECTATION_CENTS_MAX } from '@hire-me/contracts';

/**
 * The one place the web converts between a salary amount as a person types it
 * and the exact integer minor units every salary expectation contract carries.
 *
 * Both fields it serves are the same PostgreSQL `integer` column shape:
 * `Candidate.salaryExpectationCents` (internal compensation maintenance) and
 * `PublicCandidateApplication.submittedSalaryExpectationCents` (public
 * application snapshot, which also seeds a new Candidate). They therefore share
 * one bound, `CANDIDATE_SALARY_EXPECTATION_CENTS_MAX`.
 *
 * Nothing here converts currencies, looks up exchange rates, knows a currency
 * catalog, or assumes a default currency.
 */

/**
 * A salary expectation as a person types it: whole major units, optionally
 * followed by one decimal separator (a point, or the French comma) and at most
 * two digits. No sign, no exponent, no grouping.
 */
const MAJOR_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

const MAX_CENT_DIGITS = String(CANDIDATE_SALARY_EXPECTATION_CENTS_MAX).length;

export type SalaryAmountParse = { cents: number | null; ok: true } | { ok: false };

/**
 * Converts a typed major-unit amount into integer minor units.
 *
 * The conversion is done on the digit string, never as `Number(value) * 100`,
 * so no binary floating-point value is ever rounded: `36000.5` and `36000.50`
 * both become exactly `3600050`. Empty means "no value recorded" (`null`).
 * Anything malformed, with more than two decimals, or larger than the stored
 * column can hold is rejected.
 */
export function parseSalaryAmount(value: string): SalaryAmountParse {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { cents: null, ok: true };
  }
  const match = MAJOR_AMOUNT.exec(trimmed);
  if (!match) {
    return { ok: false };
  }
  const [, whole = '', fraction = ''] = match;
  const digits = `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  // Compared by length first, so an absurdly long input never becomes an imprecise number.
  if (digits.length > MAX_CENT_DIGITS) {
    return { ok: false };
  }
  const cents = Number(digits);
  return cents <= CANDIDATE_SALARY_EXPECTATION_CENTS_MAX ? { cents, ok: true } : { ok: false };
}

/**
 * Stored minor units as the exact major-unit text an amount field is pre-filled
 * with: `3600000` → `36000`, `3600050` → `36000.50`. Integer arithmetic only,
 * so what is shown is exactly what is stored.
 */
export function salaryAmountInput(cents: number | null): string {
  if (cents === null) {
    return '';
  }
  const fraction = cents % 100;
  const whole = (cents - fraction) / 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}
