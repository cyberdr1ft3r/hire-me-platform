import { describe, expect, it } from 'vitest';

import { createFormatters } from './format.js';
import { LOCALE_METADATA, SUPPORTED_LOCALES, type Locale } from './locale.js';
import type { PluralForms } from './message.js';
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

function isPluralNode(node: unknown): node is PluralForms {
  return (
    typeof node === 'object' && node !== null && typeof (node as PluralForms).other === 'string'
  );
}

function leafPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }
  if (isPluralNode(node)) {
    return [prefix];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

function leafAt(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    return (node as Record<string, unknown>)[segment];
  }, dictionary);
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

/**
 * The placeholder names one template uses, deduplicated and ordered so two
 * locales can be compared directly.
 */
function placeholderNames(template: string): string[] {
  const names = [...template.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
  return [...new Set(names)].sort();
}

/**
 * `count` is the plural-selection input rather than ordinary interpolation, so
 * it is compared separately from the placeholders a form must print.
 */
function nonCountPlaceholders(template: string): string[] {
  return placeholderNames(template).filter((name) => name !== 'count');
}

function pluralFormTexts(node: PluralForms): string[] {
  return Object.values(node).filter((form): form is string => typeof form === 'string');
}

const canonicalLeafPaths = leafPaths(DICTIONARIES.en).sort();
const canonicalPluralPaths = canonicalLeafPaths.filter((key) =>
  isPluralNode(leafAt(DICTIONARIES.en, key)),
);
const canonicalOrdinaryPaths = canonicalLeafPaths.filter(
  (key) => !canonicalPluralPaths.includes(key),
);

describe('dictionary contract', () => {
  it('gives every locale the same leaf keys as canonical English', () => {
    expect(canonicalLeafPaths.length).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      expect(leafPaths(DICTIONARIES[locale]).sort()).toEqual(canonicalLeafPaths);
    }
  });

  it('pins which entries are count-sensitive, so runtime detection matches the dictionary', () => {
    expect(canonicalPluralPaths).toEqual([
      'common.counts.candidates',
      'common.pagination.results',
      'publicOpportunity.list.count',
      'task.list.assignees',
    ]);
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of canonicalPluralPaths) {
        expect(isPluralNode(leafAt(DICTIONARIES[locale], key))).toBe(true);
      }
      for (const key of canonicalOrdinaryPaths) {
        expect(typeof leafAt(DICTIONARIES[locale], key)).toBe('string');
      }
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

/**
 * Structural typing proves both locales carry the same keys. It cannot prove
 * that a translator kept the same placeholder names inside a template, so a
 * French `{courriel}` where English has `{email}` would otherwise fail only for
 * French users at run time.
 */
describe('cross-locale placeholder parity', () => {
  it('gives every ordinary message the same placeholder names as canonical English', () => {
    for (const key of canonicalOrdinaryPaths) {
      const canonical = placeholderNames(leafAt(DICTIONARIES.en, key) as string);
      for (const locale of SUPPORTED_LOCALES) {
        const translated = placeholderNames(leafAt(DICTIONARIES[locale], key) as string);
        expect({ key, locale, placeholders: translated }).toEqual({
          key,
          locale,
          placeholders: canonical,
        });
      }
    }
  });

  it('keeps every form of a plural entry consistent within its own locale', () => {
    for (const key of canonicalPluralPaths) {
      for (const locale of SUPPORTED_LOCALES) {
        const forms = pluralFormTexts(leafAt(DICTIONARIES[locale], key) as PluralForms);
        const [first] = forms;
        expect(first).toBeTypeOf('string');
        const expected = nonCountPlaceholders(first ?? '');
        for (const form of forms) {
          expect({ key, locale, form, placeholders: nonCountPlaceholders(form) }).toEqual({
            key,
            locale,
            form,
            placeholders: expected,
          });
        }
      }
    }
  });

  it('gives every plural entry the same non-count placeholders as canonical English', () => {
    for (const key of canonicalPluralPaths) {
      const canonical = [
        ...new Set(
          pluralFormTexts(leafAt(DICTIONARIES.en, key) as PluralForms).flatMap(
            nonCountPlaceholders,
          ),
        ),
      ].sort();
      for (const locale of SUPPORTED_LOCALES) {
        const translated = [
          ...new Set(
            pluralFormTexts(leafAt(DICTIONARIES[locale], key) as PluralForms).flatMap(
              nonCountPlaceholders,
            ),
          ),
        ].sort();
        expect({ key, locale, placeholders: translated }).toEqual({
          key,
          locale,
          placeholders: canonical,
        });
      }
    }
  });

  it('detects a renamed placeholder, which is the mistake this contract exists to catch', () => {
    // A French copy of the canonical entry with `{email}` renamed to `{courriel}`.
    const canonical = placeholderNames('Signed in as {email}');
    const drifted = placeholderNames('Session ouverte : {courriel}');
    expect(canonical).toEqual(['email']);
    expect(drifted).not.toEqual(canonical);
  });

  it('does not require French to expose the same plural categories as English', () => {
    const englishCategories = Object.keys(
      leafAt(DICTIONARIES.en, 'common.pagination.results') as PluralForms,
    ).sort();
    const frenchCategories = Object.keys(
      leafAt(DICTIONARIES.fr, 'common.pagination.results') as PluralForms,
    ).sort();
    expect(englishCategories).toEqual(['one', 'other']);
    expect(frenchCategories).toEqual(['many', 'one', 'other']);
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
    // Typed call sites cannot reach these; the casts prove the runtime boundary
    // still fails closed when a key arrives untyped.
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
