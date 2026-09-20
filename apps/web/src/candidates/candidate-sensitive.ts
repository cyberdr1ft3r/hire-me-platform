import {
  CandidateConsentStatusSchema,
  type CandidateConsentStatus,
  type CandidateUpdateRequest,
} from '@hire-me/contracts';

import { parseSalaryAmount } from '../money/index.js';
import { isoToLocalInput, localInputToIso } from '../tasks/task-datetime.js';
import type { CandidateFieldErrors } from './candidate-form.js';
import type { CandidateSensitiveValues } from './candidate-state.js';
import type { CandidateCompensation, CandidateConsent } from './candidate-types.js';

/**
 * Compensation and consent maintenance: the conversions between what an
 * operator types and the stored contract values, and the partial update each
 * restricted form sends.
 *
 * The major-unit amount conversion itself lives in the neutral `../money`
 * helper, because the public application form converts the same way into the
 * same integer minor-unit contract.
 *
 * Nothing here converts currencies, looks up exchange rates, or knows a
 * currency catalog, and nothing reinterprets consent: a status and its
 * recorded instant are two independent values.
 */

export { parseSalaryAmount, salaryAmountInput, type SalaryAmountParse } from '../money/index.js';

/** The consent statuses, exactly as the contract defines them. */
export const CONSENT_STATUSES: readonly CandidateConsentStatus[] =
  CandidateConsentStatusSchema.options;

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
