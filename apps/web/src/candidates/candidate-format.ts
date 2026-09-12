import type {
  CandidateCompensation,
  CandidateEducation,
  CandidateWorkExperience,
} from './candidate-types.js';

/** City and country as one location line, or `null` when neither is recorded. */
export function formatCandidateLocation(
  city: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const parts = [city, country].filter((part): part is string => Boolean(part?.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Start and end dates are free text in the contract ("2021", "2021-03", or
 * whatever was recorded). They are shown exactly as recorded and only ordered
 * when both values are ISO-like, so an unfamiliar format is never reinterpreted.
 */
const ISO_LIKE_DATE = /^\d{4}(-\d{2}){0,2}$/;

function compareStartDescending(left: string | null, right: string | null): number {
  if (left && right && ISO_LIKE_DATE.test(left) && ISO_LIKE_DATE.test(right)) {
    return right.localeCompare(left);
  }
  return 0;
}

/**
 * Chronological reading order for work experience: current roles first, then
 * the most recent start date. The sort is stable, so records whose dates cannot
 * be compared keep the order the API returned them in.
 */
export function orderWorkExperiences(
  experiences: readonly CandidateWorkExperience[],
): CandidateWorkExperience[] {
  return [...experiences].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }
    return compareStartDescending(left.startDate, right.startDate);
  });
}

/** Most recent education first where dates are comparable; otherwise API order. */
export function orderEducation(education: readonly CandidateEducation[]): CandidateEducation[] {
  return [...education].sort((left, right) =>
    compareStartDescending(left.startDate, right.startDate),
  );
}

const CURRENCY_CODE = /^[A-Za-z]{3}$/;

interface MoneyFormatters {
  formatCurrency: (value: number, currency: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

/**
 * The salary expectation arrives in minor units (`salaryExpectationCents`), the
 * same convention the rest of HireMe formats by dividing by 100. It is always
 * formatted with its own recorded currency and never converted. `null` means no
 * value is recorded; zero is a real value and is shown as zero.
 */
export function formatSalaryExpectation(
  compensation: CandidateCompensation,
  { formatCurrency, formatNumber }: MoneyFormatters,
): string | null {
  const cents = compensation.salaryExpectationCents;
  if (cents === null) {
    return null;
  }
  const amount = cents / 100;
  const currency = compensation.salaryExpectationCurrency?.trim() ?? '';
  const plain = formatNumber(amount, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (!CURRENCY_CODE.test(currency)) {
    return currency ? `${plain} ${currency}` : plain;
  }
  try {
    return formatCurrency(amount, currency.toUpperCase());
  } catch {
    return `${plain} ${currency.toUpperCase()}`;
  }
}

/** A LinkedIn value is rendered as a link only for an http(s) URL; anything else stays text. */
export function safeProfileUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
