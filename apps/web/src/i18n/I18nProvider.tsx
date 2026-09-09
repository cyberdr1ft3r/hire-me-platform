import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { I18nContext, type I18nContextValue } from './context.js';
import { createFormatters } from './format.js';
import {
  isLocale,
  LOCALE_METADATA,
  readLocaleEnvironment,
  resolveInitialLocale,
  storeLocale,
  type Locale,
} from './locale.js';
import { DICTIONARIES } from './messages/index.js';
import { createTranslator } from './translate.js';

export interface I18nProviderProps {
  children: ReactNode;
  /** Fixes the locale, mainly for deterministic tests and previews. */
  initialLocale?: Locale;
}

/**
 * Owns the active locale for the whole application, authenticated and public
 * alike, so public routes can adopt localization later without a second
 * architecture and without a second stored preference.
 *
 * The dictionaries themselves are never exposed; consumers receive `t` and the
 * formatters only.
 */
export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? resolveInitialLocale(readLocaleEnvironment()),
  );

  useEffect(() => {
    // Keeps assistive technology and the browser's own language handling in
    // step. Direction stays at the document default: EN and FR are both LTR and
    // RTL layout is deliberately out of scope for this release.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) {
      return;
    }
    setLocaleState(next);
    storeLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const metadata = LOCALE_METADATA[locale];
    const formatters = createFormatters(metadata.formattingLocale);
    return {
      ...formatters,
      direction: metadata.direction,
      locale,
      setLocale,
      t: createTranslator({
        dictionary: DICTIONARIES[locale],
        formatNumber: formatters.formatNumber,
        formattingLocale: metadata.formattingLocale,
      }),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
