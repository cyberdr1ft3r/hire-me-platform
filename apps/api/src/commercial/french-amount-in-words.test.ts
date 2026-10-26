import { describe, expect, it } from 'vitest';

import { frenchMadAmountInWords } from './french-amount-in-words.js';

describe('frenchMadAmountInWords', () => {
  it('renders the approved synthetic total exactly from integer cents', () => {
    expect(frenchMadAmountInWords(119_000)).toBe(
      'mille cent quatre-vingt-dix dirhams et zéro centime',
    );
  });

  it('handles French agreement and centimes without floating-point arithmetic', () => {
    expect(frenchMadAmountInWords(101)).toBe('un dirham et un centime');
    expect(frenchMadAmountInWords(280_80)).toBe(
      'deux cent quatre-vingts dirhams et quatre-vingts centimes',
    );
  });
});
