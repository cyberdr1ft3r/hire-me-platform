import { describe, expect, it } from 'vitest';

import { createFormatters } from '../i18n/format.js';
import { LOCALE_METADATA } from '../i18n/locale.js';
import { DICTIONARIES } from '../i18n/messages/index.js';
import { createTranslator } from '../i18n/translate.js';
import { formatAdminRoleName } from './role-labels.js';

function translatorFor(locale: 'en' | 'fr') {
  const { formattingLocale } = LOCALE_METADATA[locale];
  return createTranslator({
    dictionary: DICTIONARIES[locale],
    formatNumber: createFormatters(formattingLocale).formatNumber,
    formattingLocale,
  });
}

describe('formatAdminRoleName', () => {
  it('renders FINANCE_MANAGER in EN and FR', () => {
    expect(formatAdminRoleName(translatorFor('en'), 'FINANCE_MANAGER')).toBe('Finance manager');
    expect(formatAdminRoleName(translatorFor('fr'), 'FINANCE_MANAGER')).toBe('Responsable finance');
  });

  it('falls back to the raw enum for unknown values', () => {
    expect(formatAdminRoleName(translatorFor('en'), 'CUSTOM_ROLE')).toBe('CUSTOM_ROLE');
  });
});
