import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_METADATA,
  LOCALE_STORAGE_KEY,
  readLocaleEnvironment,
  resolveInitialLocale,
  storeLocale,
  SUPPORTED_LOCALES,
} from './locale.js';

afterEach(() => {
  window.localStorage.clear();
});

describe('locale allow-list', () => {
  it('supports exactly English and French', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fr']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('accepts only the exact supported identifiers', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(true);

    for (const rejected of [
      'ar',
      'EN',
      'FR',
      'en-GB',
      'fr-FR',
      '',
      ' fr',
      '../en',
      'en/../../secrets',
      '__proto__',
      'constructor',
      null,
      undefined,
      42,
      { toString: () => 'fr' },
    ]) {
      expect(isLocale(rejected)).toBe(false);
    }
  });

  it('documents one explicit formatting locale per language and keeps both left-to-right', () => {
    expect(LOCALE_METADATA.en.formattingLocale).toBe('en-GB');
    expect(LOCALE_METADATA.fr.formattingLocale).toBe('fr-FR');
    expect(LOCALE_METADATA.en.direction).toBe('ltr');
    expect(LOCALE_METADATA.fr.direction).toBe('ltr');
    expect(LOCALE_METADATA.fr.autonym).toBe('Français');
  });
});

describe('initial locale selection', () => {
  it('defaults to English with no preference and no French browser hint', () => {
    expect(resolveInitialLocale({})).toBe('en');
    expect(resolveInitialLocale({ browserLanguage: 'en-US', storedValue: null })).toBe('en');
    expect(resolveInitialLocale({ browserLanguage: 'de-DE' })).toBe('en');
  });

  it('detects a French browser language', () => {
    expect(resolveInitialLocale({ browserLanguage: 'fr' })).toBe('fr');
    expect(resolveInitialLocale({ browserLanguage: 'fr-FR' })).toBe('fr');
    expect(resolveInitialLocale({ browserLanguage: 'FR-ca' })).toBe('fr');
  });

  it('prefers a valid stored preference over the browser language', () => {
    expect(resolveInitialLocale({ browserLanguage: 'en-US', storedValue: 'fr' })).toBe('fr');
    expect(resolveInitialLocale({ browserLanguage: 'fr-FR', storedValue: 'en' })).toBe('en');
  });

  it('ignores an unknown stored preference and falls back safely', () => {
    for (const stored of ['ar', 'EN', 'fr-FR', '', 'null', '{"locale":"fr"}', '__proto__']) {
      expect(resolveInitialLocale({ browserLanguage: 'en-US', storedValue: stored })).toBe('en');
    }
    // An invalid stored value must not suppress the browser hint either.
    expect(resolveInitialLocale({ browserLanguage: 'fr-FR', storedValue: 'ar' })).toBe('fr');
  });
});

describe('locale persistence', () => {
  it('writes only the namespaced preference key and reads it back', () => {
    storeLocale('fr');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
    expect(LOCALE_STORAGE_KEY).toBe('hireme.locale');
    expect(readLocaleEnvironment().storedValue).toBe('fr');
  });

  it('stores a display preference only, never credentials or business data', () => {
    storeLocale('fr');
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    expect(stored).toBe('fr');
    expect(window.localStorage.length).toBe(1);
  });

  it('surfaces an unrecognised stored value untouched so resolution can reject it', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ar');
    expect(readLocaleEnvironment().storedValue).toBe('ar');
    expect(resolveInitialLocale(readLocaleEnvironment())).toBe('en');
  });
});
