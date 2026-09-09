/**
 * Locale identity for the HireMe web interface.
 *
 * Locale values reaching this module come from untrusted local sources (browser
 * storage, navigator hints, future query parameters), so every entry point
 * validates against the explicit allow-list below. A locale value is never used
 * to build a dynamic import specifier or a filesystem path; dictionaries are
 * resolved through a static map in `./messages/index.ts`.
 */

export type Locale = 'en' | 'fr';

export type TextDirection = 'ltr' | 'rtl';

export interface LocaleMetadata {
  /** The language's own name, shown identically in every locale. */
  readonly autonym: string;
  /**
   * Reserved for a future right-to-left locale. EN and FR are both `ltr`, and
   * this release deliberately does not implement RTL layout.
   */
  readonly direction: TextDirection;
  /** The BCP 47 tag handed to `Intl`. */
  readonly formattingLocale: string;
  readonly id: Locale;
}

/** The complete allow-list. Nothing outside it is ever accepted. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'fr'];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * HireMe English formats dates, numbers, and currency as `en-GB`: day-first
 * dates and a 24-hour clock match how the Moroccan and European teams read
 * operational data, and it avoids the month-first ambiguity of `en-US`.
 */
export const LOCALE_METADATA: Readonly<Record<Locale, LocaleMetadata>> = {
  en: { autonym: 'English', direction: 'ltr', formattingLocale: 'en-GB', id: 'en' },
  fr: { autonym: 'Français', direction: 'ltr', formattingLocale: 'fr-FR', id: 'fr' },
};

/**
 * Namespaced browser-storage key. It holds a display preference only: never a
 * token, permission, identifier, or any business information.
 */
export const LOCALE_STORAGE_KEY = 'hireme.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

export interface LocaleEnvironment {
  /** `navigator.language`, or `undefined` when unavailable. */
  readonly browserLanguage?: string;
  /** The raw stored value, which may be anything a browser holds. */
  readonly storedValue?: string | null;
}

/**
 * Selection order: a valid stored preference, then a browser language that
 * starts with `fr`, then English. Any unrecognised stored value is ignored.
 */
export function resolveInitialLocale(environment: LocaleEnvironment = {}): Locale {
  if (isLocale(environment.storedValue)) {
    return environment.storedValue;
  }
  const browserLanguage = environment.browserLanguage;
  if (typeof browserLanguage === 'string' && browserLanguage.toLowerCase().startsWith('fr')) {
    return 'fr';
  }
  return DEFAULT_LOCALE;
}

function localeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage can throw outright when the browser blocks site data.
    return null;
  }
}

export function readLocaleEnvironment(): LocaleEnvironment {
  let storedValue: string | null = null;
  try {
    storedValue = localeStorage()?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    storedValue = null;
  }
  const browserLanguage = typeof navigator === 'undefined' ? undefined : navigator.language;
  return { browserLanguage, storedValue };
}

export function storeLocale(locale: Locale): void {
  if (!isLocale(locale)) {
    return;
  }
  try {
    localeStorage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // A rejected write only costs the preference; it must never break the UI.
  }
}
