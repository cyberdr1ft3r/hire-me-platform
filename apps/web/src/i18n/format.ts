/**
 * Locale-aware formatting built directly on the platform `Intl` APIs.
 *
 * These helpers format only. They never convert currency, never infer a
 * currency from a locale, and never assume a default timezone on behalf of a
 * caller that cares about one.
 */

export type DateInput = Date | number | string;

export interface LocaleFormatters {
  /**
   * Formats a minor-unit-free amount in an explicit ISO 4217 currency. HireMe is
   * currency-aware, so the code is always required and never defaulted to MAD.
   */
  formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

const DATE_DEFAULTS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };
const DATE_TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Cannot format an invalid date.');
  }
  return date;
}

export function createFormatters(formattingLocale: string): LocaleFormatters {
  function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(formattingLocale, options).format(value);
  }

  return {
    formatCurrency(value, currency, options) {
      if (!CURRENCY_CODE.test(currency)) {
        throw new TypeError(`Expected an ISO 4217 currency code, received "${currency}".`);
      }
      return formatNumber(value, { ...options, currency, style: 'currency' });
    },
    formatDate(value, options) {
      return new Intl.DateTimeFormat(formattingLocale, { ...DATE_DEFAULTS, ...options }).format(
        toDate(value),
      );
    },
    formatDateTime(value, options) {
      return new Intl.DateTimeFormat(formattingLocale, {
        ...DATE_TIME_DEFAULTS,
        ...options,
      }).format(toDate(value));
    },
    formatNumber,
  };
}
