import { useId } from 'react';

import { isLocale, LOCALE_METADATA, SUPPORTED_LOCALES, useI18n } from '../../i18n/index.js';

/**
 * The single language control for the internal shell.
 *
 * A native `<select>` keeps it keyboard accessible, screen-reader friendly, and
 * compact enough for the mobile drawer, and it communicates the active language
 * as its own text rather than through color. Options use each language's own
 * name and are identical in every locale. No flags: a language is not a country.
 *
 * The public opportunity pages reuse the same control under their own class
 * prefix, so both surfaces share one behaviour and one stored preference.
 */
export function LanguageSelect({ classPrefix = 'app-shell__language' }: { classPrefix?: string }) {
  const { locale, setLocale, t } = useI18n();
  const controlId = useId();

  return (
    <div className={classPrefix}>
      <label className={`${classPrefix}-label`} htmlFor={controlId}>
        {t('shell.language.label')}
      </label>
      <select
        className={`${classPrefix}-select`}
        id={controlId}
        onChange={(event) => {
          const next = event.target.value;
          // A locale only ever changes through the allow-list.
          if (isLocale(next)) {
            setLocale(next);
          }
        }}
        value={locale}
      >
        {SUPPORTED_LOCALES.map((supported) => (
          <option key={supported} value={supported}>
            {LOCALE_METADATA[supported].autonym}
          </option>
        ))}
      </select>
    </div>
  );
}
