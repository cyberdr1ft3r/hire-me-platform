import { createContext } from 'react';

import type { LocaleFormatters } from './format.js';
import type { Locale, TextDirection } from './locale.js';
import type { Translator } from './translate.js';

export interface I18nContextValue extends LocaleFormatters {
  /** Reserved for a future RTL locale; both current locales are `ltr`. */
  readonly direction: TextDirection;
  readonly locale: Locale;
  /** Ignores any value outside the supported allow-list. */
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translator;
}

/**
 * Null until a provider supplies a value. `useI18n` refuses to guess a locale so
 * a component rendered outside the provider fails visibly in tests instead of
 * silently rendering English in production.
 */
export const I18nContext = createContext<I18nContextValue | null>(null);
