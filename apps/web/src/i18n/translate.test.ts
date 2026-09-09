import { describe, expect, it } from 'vitest';

import { createFormatters } from './format.js';
import { LOCALE_METADATA, SUPPORTED_LOCALES, type Locale } from './locale.js';
import type { PluralMessage } from './message.js';
import { DICTIONARIES } from './messages/index.js';
import { createTranslator, type Translator } from './translate.js';

function translatorFor(locale: Locale): Translator {
  const { formattingLocale } = LOCALE_METADATA[locale];
  return createTranslator({
    dictionary: DICTIONARIES[locale],
    formatNumber: createFormatters(formattingLocale).formatNumber,
    formattingLocale,
  });
}

const en = translatorFor('en');
const fr = translatorFor('fr');

function normalizeSpaces(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

function leafPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }
  if (typeof (node as PluralMessage).other === 'string') {
    return [prefix];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

function stringValues(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  return Object.values(node as Record<string, unknown>).flatMap(stringValues);
}

describe('dictionary contract', () => {
  it('gives every locale the same leaf keys as canonical English', () => {
    const canonical = leafPaths(DICTIONARIES.en).sort();
    expect(canonical.length).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      expect(leafPaths(DICTIONARIES[locale]).sort()).toEqual(canonical);
    }
  });

  it('answers every plural entry for every plural category its locale can select', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const translate = translatorFor(locale);
      for (const count of [0, 1, 2, 5, 1_000_000]) {
        expect(translate('common.counts.candidates', { count })).not.toBe('');
        expect(translate('common.pagination.results', { count })).not.toBe('');
      }
    }
  });

  it('carries no markup, so nothing in a dictionary can execute HTML or JavaScript', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const value of stringValues(DICTIONARIES[locale])) {
        expect(value).not.toMatch(/[<>]/);
        expect(value).not.toContain('javascript:');
      }
    }
  });

  it('keeps domain labels keyed by the language-neutral stored value', () => {
    expect(Object.keys(DICTIONARIES.en.domain.recordState).sort()).toEqual([
      'ACTIVE',
      'ARCHIVED',
      'DRAFT',
    ]);
    expect(Object.keys(DICTIONARIES.fr.domain.recordState).sort()).toEqual([
      'ACTIVE',
      'ARCHIVED',
      'DRAFT',
    ]);
    expect(en('domain.recordState.ACTIVE')).toBe('Active');
    expect(fr('domain.recordState.ACTIVE')).toBe('Actif');
    expect(fr('domain.recordState.DRAFT')).toBe('Brouillon');
  });
});

describe('translation lookup', () => {
  it('resolves the same key to each locale', () => {
    expect(en('navigation.destinations.overview')).toBe('Overview');
    expect(fr('navigation.destinations.overview')).toBe('Vue d’ensemble');
    expect(en('shell.session.signOut')).toBe('Sign out');
    expect(fr('shell.session.signOut')).toBe('Se déconnecter');
    expect(fr('shell.session.refreshProfile')).toBe('Actualiser le profil');
    expect(fr('navigation.destinations.accounting')).toBe('Comptabilité');
    expect(fr('navigation.destinations.reporting')).toBe('Rapports');
    expect(fr('navigation.destinations.training')).toBe('Formation');
  });

  it('refuses an unknown key instead of falling back silently', () => {
    // The typed signature makes this unreachable from application code; the cast
    // proves the runtime does not hide a development mistake either.
    const untyped = en as unknown as (key: string) => string;
    expect(() => untyped('shell.session.missing')).toThrow(/Missing translation key/);
    expect(() => untyped('shell')).toThrow(/does not resolve to a message/);
    expect(() => untyped('constructor')).toThrow(/Missing translation key/);
    expect(() => untyped('__proto__.polluted')).toThrow(/Missing translation key/);
  });
});

describe('interpolation', () => {
  it('inserts values as text', () => {
    expect(en('overview.signedInAs', { email: 'operator@example.test' })).toBe(
      'Signed in as operator@example.test',
    );
    expect(fr('overview.signedInAs', { email: 'operator@example.test' })).toContain(
      'Session ouverte',
    );
  });

  it('never interprets a value as markup', () => {
    const injected = '<img src=x onerror=alert(1)>';
    expect(en('overview.signedInAs', { email: injected })).toBe(`Signed in as ${injected}`);
  });

  it('formats a numeric value with the active locale', () => {
    expect(normalizeSpaces(en('common.pagination.results', { count: 1234 }))).toBe('1,234 results');
    expect(normalizeSpaces(fr('common.pagination.results', { count: 1234 }))).toBe(
      '1 234 résultats',
    );
  });

  it('refuses a missing interpolation value', () => {
    const untyped = en as unknown as (key: string) => string;
    expect(() => untyped('overview.signedInAs')).toThrow(/interpolation value/);
  });
});

describe('pluralization through Intl.PluralRules', () => {
  it('uses English one/other', () => {
    expect(en('common.counts.candidates', { count: 1 })).toBe('1 candidate');
    expect(en('common.counts.candidates', { count: 2 })).toBe('2 candidates');
    expect(en('common.counts.candidates', { count: 0 })).toBe('0 candidates');
  });

  it('uses French one/other, where zero and one share a form', () => {
    expect(new Intl.PluralRules('fr-FR').select(0)).toBe('one');
    expect(fr('common.counts.candidates', { count: 0 })).toBe('0 candidat');
    expect(fr('common.counts.candidates', { count: 1 })).toBe('1 candidat');
    expect(fr('common.counts.candidates', { count: 2 })).toBe('2 candidats');
  });

  it('uses the French many category for large counts', () => {
    expect(new Intl.PluralRules('fr-FR').select(1_000_000)).toBe('many');
    expect(normalizeSpaces(fr('common.pagination.results', { count: 1_000_000 }))).toBe(
      '1 000 000 de résultats',
    );
    expect(normalizeSpaces(en('common.pagination.results', { count: 1_000_000 }))).toBe(
      '1,000,000 results',
    );
  });

  it('refuses a count-sensitive key used without a numeric count', () => {
    const untyped = en as unknown as (key: string, values?: Record<string, unknown>) => string;
    expect(() => untyped('common.counts.candidates')).toThrow(/count-sensitive/);
    expect(() => untyped('common.counts.candidates', { count: 'two' })).toThrow(/count-sensitive/);
  });
});
