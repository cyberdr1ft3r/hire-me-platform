import type { PublicOpportunity } from '@hire-me/contracts';

import type { LocaleFormatters, PlainMessageKey, Translator } from '../i18n/index.js';

/**
 * Presentation helpers for the public contract's own fields.
 *
 * Opportunity text is the staff's published copy and is shown as written; only
 * HireMe-owned labels are translated. Nothing here invents a value: a field
 * that is absent from the payload produces nothing.
 */

/** Published text, or `null` when the field is empty or only whitespace. */
export function publishedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Location, work arrangement, and contract type, as published, for scanning. */
export function opportunityHeadline(opportunity: PublicOpportunity): string[] {
  return [
    opportunity.publicLocation,
    opportunity.publicWorkArrangement,
    opportunity.publicEngagementType,
  ]
    .map(publishedText)
    .filter((value): value is string => value !== null);
}

const CURRENCY_CODE = /^[A-Za-z]{3}$/;
const AMOUNT_OPTIONS: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
};

/**
 * Salary figures arrive in minor units, the convention the rest of HireMe
 * formats by dividing by 100. They use the opportunity's own currency and are
 * never converted.
 */
function formatAmount(
  cents: number,
  currency: string | null,
  { formatCurrency, formatNumber }: Pick<LocaleFormatters, 'formatCurrency' | 'formatNumber'>,
): string {
  const amount = cents / 100;
  const code = currency?.trim() ?? '';
  if (CURRENCY_CODE.test(code)) {
    try {
      return formatCurrency(amount, code.toUpperCase(), AMOUNT_OPTIONS);
    } catch {
      // An unrecognised code falls through to a plain number with the code beside it.
    }
  }
  const plain = formatNumber(amount, AMOUNT_OPTIONS);
  return code ? `${plain} ${code}` : plain;
}

/**
 * The published salary, only when the server includes it. The API sends
 * `salary` as `null` unless staff chose to show it, so this never reveals a
 * figure that was not approved for the public page.
 */
export function formatPublishedSalary(
  salary: PublicOpportunity['salary'],
  formatters: Pick<LocaleFormatters, 'formatCurrency' | 'formatNumber'>,
  t: Translator,
): string | null {
  if (!salary) {
    return null;
  }
  const { salaryCurrency, salaryMaxCents, salaryMinCents } = salary;
  const format = (cents: number) => formatAmount(cents, salaryCurrency, formatters);
  if (salaryMinCents !== null && salaryMaxCents !== null) {
    return salaryMinCents === salaryMaxCents
      ? format(salaryMinCents)
      : t('publicOpportunity.values.salaryRange', {
          max: format(salaryMaxCents),
          min: format(salaryMinCents),
        });
  }
  if (salaryMinCents !== null) {
    return t('publicOpportunity.values.salaryFrom', { amount: format(salaryMinCents) });
  }
  if (salaryMaxCents !== null) {
    return t('publicOpportunity.values.salaryUpTo', { amount: format(salaryMaxCents) });
  }
  return null;
}

/**
 * The application deadline is an instant. It is shown in UTC and says so, so
 * every reader and every review environment sees the same wall-clock value.
 */
export function formatDeadline(
  deadline: string,
  formatDateTime: LocaleFormatters['formatDateTime'],
  t: Translator,
): string {
  return t('publicOpportunity.values.deadline', {
    date: formatDateTime(deadline, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }),
  });
}

/** Decimal megabytes, which is how the server's limits are written. */
export function formatMegabytes(
  bytes: number,
  formatNumber: LocaleFormatters['formatNumber'],
): string {
  return formatNumber(bytes / 1_000_000, {
    maximumFractionDigits: 1,
    style: 'unit',
    unit: 'megabyte',
  });
}

const FILE_TYPE_LABELS = new Map<string, PlainMessageKey>([
  ['application/pdf', 'publicOpportunity.fileTypes.pdf'],
  ['image/jpeg', 'publicOpportunity.fileTypes.jpeg'],
  ['image/png', 'publicOpportunity.fileTypes.png'],
  ['text/plain', 'publicOpportunity.fileTypes.text'],
]);

/**
 * The accepted formats as one readable phrase ("PDF, JPEG, PNG or plain text").
 * A type this page has no label for is shown as its media type, untranslated.
 */
export function formatAcceptedTypes(
  mimeTypes: readonly string[],
  formattingLocale: string,
  t: Translator,
): string {
  const labels = mimeTypes.map((mimeType) => {
    const key = FILE_TYPE_LABELS.get(mimeType);
    return key ? t(key) : mimeType;
  });
  return new Intl.ListFormat(formattingLocale, { style: 'long', type: 'disjunction' }).format(
    labels,
  );
}
