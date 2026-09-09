import { describe, expect, it } from 'vitest';

import { createFormatters } from './format.js';
import { LOCALE_METADATA } from './locale.js';

const en = createFormatters(LOCALE_METADATA.en.formattingLocale);
const fr = createFormatters(LOCALE_METADATA.fr.formattingLocale);

/**
 * `Intl` picks a no-break or narrow no-break space as a group and currency
 * separator, and which one it picks moves between ICU releases. Collapsing them
 * to an ordinary space keeps these assertions about locale behavior rather than
 * about the bundled ICU build.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

/** One fixed instant, always formatted with an explicit timezone. */
const instant = new Date('2026-03-09T21:45:00.000Z');

describe('number formatting', () => {
  it('formats the same number differently in each locale', () => {
    expect(normalizeSpaces(en.formatNumber(1234.5))).toBe('1,234.5');
    expect(normalizeSpaces(fr.formatNumber(1234.5))).toBe('1 234,5');
  });

  it('passes explicit options through to Intl', () => {
    expect(normalizeSpaces(en.formatNumber(0.256, { style: 'percent' }))).toBe('26%');
    expect(normalizeSpaces(fr.formatNumber(0.256, { style: 'percent' }))).toBe('26 %');
  });
});

describe('date and date-time formatting', () => {
  it('formats one Date differently in each locale under a fixed timezone', () => {
    expect(normalizeSpaces(en.formatDate(instant, { timeZone: 'UTC' }))).toBe('9 Mar 2026');
    expect(normalizeSpaces(fr.formatDate(instant, { timeZone: 'UTC' }))).toBe('9 mars 2026');
  });

  it('formats date and time together', () => {
    expect(normalizeSpaces(en.formatDateTime(instant, { timeZone: 'UTC' }))).toBe(
      '9 Mar 2026, 21:45',
    );
    expect(normalizeSpaces(fr.formatDateTime(instant, { timeZone: 'UTC' }))).toBe(
      '9 mars 2026, 21:45',
    );
  });

  it('does not depend on the machine timezone when one is given', () => {
    expect(en.formatDateTime(instant, { timeZone: 'UTC' })).toBe(
      en.formatDateTime(instant.toISOString(), { timeZone: 'UTC' }),
    );
    // A fixed offset zone, so the assertion never depends on the runner's clock
    // or on a daylight-saving rule.
    expect(normalizeSpaces(fr.formatDateTime(instant, { timeZone: 'Asia/Tokyo' }))).toBe(
      '10 mars 2026, 06:45',
    );
  });

  it('rejects an unusable date instead of rendering a placeholder', () => {
    expect(() => en.formatDate('not-a-date')).toThrow(TypeError);
  });
});

describe('currency formatting', () => {
  it('formats MAD in both locales', () => {
    expect(normalizeSpaces(en.formatCurrency(1250, 'MAD'))).toBe('MAD 1,250.00');
    expect(normalizeSpaces(fr.formatCurrency(1250, 'MAD'))).toBe('1 250,00 MAD');
  });

  it('formats EUR in both locales', () => {
    expect(normalizeSpaces(en.formatCurrency(499, 'EUR'))).toBe('€499.00');
    expect(normalizeSpaces(fr.formatCurrency(499, 'EUR'))).toBe('499,00 €');
  });

  it('requires an explicit currency code and never assumes MAD', () => {
    expect(() => en.formatCurrency(1250, '')).toThrow(TypeError);
    expect(() => en.formatCurrency(1250, 'mad')).toThrow(TypeError);
    expect(() => en.formatCurrency(1250, 'DIRHAM')).toThrow(TypeError);
  });

  it('formats without converting: the same amount keeps its numeric value', () => {
    expect(normalizeSpaces(fr.formatCurrency(499, 'MAD'))).toBe('499,00 MAD');
    expect(normalizeSpaces(fr.formatCurrency(499, 'EUR'))).toBe('499,00 €');
  });
});
