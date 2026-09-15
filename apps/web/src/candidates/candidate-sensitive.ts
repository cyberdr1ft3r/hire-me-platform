import {
  CANDIDATE_SALARY_EXPECTATION_CENTS_MAX,
  CandidateConsentStatusSchema,
  type CandidateConsentStatus,
  type CandidateUpdateRequest,
} from '@hire-me/contracts';

import { isoToLocalInput, localInputToIso } from '../tasks/task-datetime.js';
import type { CandidateFieldErrors } from './candidate-form.js';
import type { CandidateSensitiveValues } from './candidate-state.js';
import type { CandidateCompensation, CandidateConsent } from './candidate-types.js';

/**
 * Compensation and consent maintenance: the conversions between what an
 * operator types and the stored contract values, and the partial update each
 * restricted form sends.
 *
 * Nothing here converts currencies, looks up exchange rates, or knows a
 * currency catalog, and nothing reinterprets consent: a status and its
 * recorded instant are two independent values.
 */

/** The consent statuses, exactly as the contract defines them. */
export const CONSENT_STATUSES: readonly CandidateConsentStatus[] =
  CandidateConsentStatusSchema.options;

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
 * Stored minor units as the exact major-unit text the amount field is
 * pre-filled with: `3600000` → `36000`, `3600050` → `36000.50`. Integer
 * arithmetic only, so what is shown is exactly what is stored.
 */
export function salaryAmountInput(cents: number | null): string {
  if (cents === null) {
    return '';
  }
  const fraction = cents % 100;
  const whole = (cents - fraction) / 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export type CurrencyParse = { currency: string | null; ok: true } | { ok: false };

/**
 * The recorded currency: the existing three-character value, trimmed, kept as
 * typed. Empty means "no currency recorded" (`null`).
 */
export function parseCurrency(value: string): CurrencyParse {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { currency: null, ok: true };
  }
  return trimmed.length === 3 ? { currency: trimmed, ok: true } : { ok: false };
}

export function validateCompensationValues(
  values: CandidateSensitiveValues['compensation'],
): CandidateFieldErrors {
  const errors: CandidateFieldErrors = {};
  if (!parseSalaryAmount(values.amount).ok) {
    errors.amount = 'amount';
  }
  if (!parseCurrency(values.currency).ok) {
    errors.currency = 'currency';
  }
  return errors;
}

export type SensitiveUpdateRequest =
  { body: CandidateUpdateRequest; ok: true } | { fieldErrors: CandidateFieldErrors; ok: false };

/**
 * The partial update for the compensation form: only the fields whose value
 * changed. A cleared value is sent as `null`; nothing changed is an empty body,
 * which the container never sends. No other Candidate field is ever included.
 */
export function compensationUpdateRequest(
  current: CandidateCompensation,
  values: CandidateSensitiveValues['compensation'],
): SensitiveUpdateRequest {
  const amount = parseSalaryAmount(values.amount);
  const currency = parseCurrency(values.currency);
  if (!amount.ok || !currency.ok) {
    return { fieldErrors: validateCompensationValues(values), ok: false };
  }
  const body: CandidateUpdateRequest = {};
  if (amount.cents !== current.salaryExpectationCents) {
    body.salaryExpectationCents = amount.cents;
  }
  if (currency.currency !== current.salaryExpectationCurrency) {
    body.salaryExpectationCurrency = currency.currency;
  }
  return { body, ok: true };
}

function isConsentStatus(value: string): value is CandidateConsentStatus {
  return (CONSENT_STATUSES as readonly string[]).includes(value);
}

export function validateConsentValues(
  values: CandidateSensitiveValues['consent'],
): CandidateFieldErrors {
  const errors: CandidateFieldErrors = {};
  if (!isConsentStatus(values.consentStatus)) {
    errors.consentStatus = 'required';
  }
  if (values.consentRecordedAt !== '' && localInputToIso(values.consentRecordedAt) === null) {
    errors.consentRecordedAt = 'dateTime';
  }
  return errors;
}

/**
 * The partial update for the consent form.
 *
 * The recorded instant uses the Task due-date pattern: the stored instant is
 * shown with its local date and time, and an untouched field is not sent at
 * all, so the exact stored instant (seconds included) is kept. A changed value
 * is converted from local time back to an instant; a cleared one is `null`.
 * Changing the status never changes the recorded instant by itself.
 */
export function consentUpdateRequest(
  current: CandidateConsent,
  values: CandidateSensitiveValues['consent'],
): SensitiveUpdateRequest {
  const fieldErrors = validateConsentValues(values);
  if (Object.keys(fieldErrors).length > 0 || !isConsentStatus(values.consentStatus)) {
    return { fieldErrors, ok: false };
  }
  const body: CandidateUpdateRequest = {};
  if (values.consentStatus !== current.consentStatus) {
    body.consentStatus = values.consentStatus;
  }
  if (values.consentRecordedAt !== isoToLocalInput(current.consentRecordedAt)) {
    body.consentRecordedAt =
      values.consentRecordedAt === '' ? null : localInputToIso(values.consentRecordedAt);
  }
  return { body, ok: true };
}
