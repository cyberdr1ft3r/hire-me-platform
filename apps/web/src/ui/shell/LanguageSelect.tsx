import { useId } from 'react';

import { isLocale, LOCALE_METADATA, SUPPORTED_LOCALES, useI18n } from '../../i18n/index.js';

/**
 * The single language control for the internal shell.
 *
 * A native `<select>` keeps it keyboard accessible, screen-reader friendly, and
 * compact enough for the mobile drawer, and it communicates the active language
 * as its own text rather than through color. Options use each language's own
 * name and are identical in every locale. No flags: a language is not a country.
 */
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  const controlId = useId();

  return (
    <div className="app-shell__language">
      <label className="app-shell__language-label" htmlFor={controlId}>
        {t('shell.language.label')}
      </label>
      <select
        className="app-shell__language-select"
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
