import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';

import { fontAsset, fontBytes } from './font-registry.js';
import { splitUnbrokenToken } from './line-breaking.js';
import { ShapedTextWriter } from './pdf-text-mapping.js';
import { runGroups, visualRuns } from './text-runs.js';

/**
 * The long-token splitter, driven by deterministic width models instead of a font.
 *
 * The PDF renderer supplies a width check that really shapes each candidate; here a
 * counting stand-in makes both correctness and the amount of measuring observable. No
 * assertion depends on wall-clock time.
 */

type WidthModel = (text: string) => number;

function productionMeasure() {
  const pdf = new PDFDocument({ autoFirstPage: false });
  for (const script of ['latin', 'arabic'] as const) {
    pdf.registerFont(fontAsset(script, 'regular').id, fontBytes(script, 'regular'));
  }
  const writer = new ShapedTextWriter(pdf);
  return (text: string, base: 'ltr' | 'rtl' = 'ltr'): number =>
    runGroups(visualRuns(text, 'regular', base)).reduce(
      (total, group) =>
        total + writer.measure(fontAsset(group.script, 'regular').id, 10, group.segments),
      0,
    );
}

const measureProductionText = productionMeasure();

/** Wraps a width model as a `fits` check that records every measurement it performs. */
function countingFits(width: WidthModel, limit: number) {
  const measured: string[] = [];
  const accepted = new Set<string>();
  const fits = (text: string): boolean => {
    measured.push(text);
    const ok = width(text) <= limit;
    if (ok) {
      accepted.add(text);
    }
    return ok;
  };
  return { accepted, fits, measured };
}

/** Uneven per-character advances, so no chunk length can be derived from a count. */
const unevenWidth: WidthModel = (text) =>
  [...text].reduce((total, character) => {
    if (character === 'W' || character === 'M') {
      return total + 3;
    }
    if (character === 'i' || character === 'l') {
      return total + 1;
    }
    return total + 2;
  }, 0);

/**
 * A width that is not monotonic in the prefix length, like an Arabic letter whose final
 * form is wider than the medial form it takes once another letter follows it.
 */
const contextualWidth: WidthModel = (text) =>
  [...text].reduce((total, character, index) => {
    const isLast = index === text.length - 1;
    return total + (character === 'x' ? (isLast ? 5 : 1) : 2);
  }, 0);

/** How many measurements the replaced decrement-by-one scan needed for the same input. */
function decrementScanMeasurements(token: string, fits: (text: string) => boolean): number {
  let measurements = 0;
  let remainder = token;
  while (remainder.length > 0) {
    let take = remainder.length;
    while (take > 1) {
      measurements += 1;
      if (fits(remainder.slice(0, take))) {
        break;
      }
      take -= 1;
    }
    remainder = remainder.slice(take);
  }
  return measurements;
}

function expectLosslessFittingChunks(token: string, chunks: string[], accepted: Set<string>): void {
  expect(chunks.join('')).toBe(token);
  for (const chunk of chunks) {
    expect(chunk.length).toBeGreaterThan(0);
    // Every chunk was explicitly accepted by the authoritative check; the only
    // exception is a lone character too wide for the line even by itself.
    if (chunk.length > 1) {
      expect(accepted.has(chunk)).toBe(true);
    }
  }
}

describe('splitUnbrokenToken', () => {
  it('keeps a token that fits whole as one chunk', () => {
    const token = 'A'.repeat(40);
    const { accepted, fits } = countingFits((text) => text.length, 40);

    const chunks = splitUnbrokenToken(token, fits);

    expect(chunks).toEqual([token]);
    expectLosslessFittingChunks(token, chunks, accepted);
  });

  it('moves only the overflow of a token slightly wider than the line', () => {
    const token = 'A'.repeat(41);
    const { accepted, fits } = countingFits((text) => text.length, 40);

    const chunks = splitUnbrokenToken(token, fits);

    expect(chunks).toEqual(['A'.repeat(40), 'A']);
    expectLosslessFittingChunks(token, chunks, accepted);
  });

  it('splits a very long token into the longest fitting chunks without losing text', () => {
    const token = 'WiMlAb'.repeat(100);
    const { accepted, fits } = countingFits(unevenWidth, 60);

    const chunks = splitUnbrokenToken(token, fits);

    expectLosslessFittingChunks(token, chunks, accepted);
    // Each chunk is the longest that fits: one more character would overflow.
    chunks.slice(0, -1).forEach((chunk, index) => {
      const next = chunks[index + 1] ?? '';
      expect(unevenWidth(chunk + next.slice(0, 1))).toBeGreaterThan(60);
    });
  });

  it('never accepts an unmeasured chunk when widths are not monotonic', () => {
    const token = 'axbxcx'.repeat(80);
    const { accepted, fits } = countingFits(contextualWidth, 25);

    const chunks = splitUnbrokenToken(token, fits);

    expectLosslessFittingChunks(token, chunks, accepted);
    for (const chunk of chunks) {
      expect(contextualWidth(chunk)).toBeLessThanOrEqual(25);
    }
  });

  it('keeps a longer fitting prefix when the first character alone rejects', () => {
    const { fits } = countingFits(contextualWidth, 4);

    expect(splitUnbrokenToken('xa', fits)).toEqual(['xa']);
  });

  it('does not stop at a rejected prefix when a later prefix fits', () => {
    const recoveringWidth: WidthModel = (text) => {
      if (text === 'ab') {
        return 6;
      }
      if (text === 'abc' || text === 'abcd') {
        return 4;
      }
      return text.length;
    };
    const { fits } = countingFits(recoveringWidth, 4);

    expect(splitUnbrokenToken('abcde', fits)).toEqual(['abcd', 'e']);
  });

  it('handles a rejected-shorter, accepted-longer prefix from the production Arabic shaper', () => {
    const isolated = measureProductionText('ئ', 'rtl');
    const joined = measureProductionText('ئآ', 'rtl');
    const limit = (isolated + joined) / 2;

    expect(isolated).toBeGreaterThan(joined);
    expect(splitUnbrokenToken('ئآ', (text) => measureProductionText(text, 'rtl') <= limit)).toEqual(
      ['ئآ'],
    );
  });

  it('measures supported shaping categories through the production writer', () => {
    const cases = [
      { base: 'ltr' as const, text: 'ToAV' },
      { base: 'ltr' as const, text: 'fi' },
      { base: 'ltr' as const, text: 'ffi' },
      { base: 'ltr' as const, text: 'ffl' },
      { base: 'rtl' as const, text: 'شركةالأطلس' },
      { base: 'ltr' as const, text: 'HireMeشركة2026' },
      { base: 'ltr' as const, text: 'A\u0301e\u0327' },
      { base: 'rtl' as const, text: '٠١٢٣' },
    ];

    for (const { base, text } of cases) {
      const width = measureProductionText(text, base);
      expect(Number.isFinite(width) && width >= 0).toBe(true);
    }
  });

  it('still emits a character wider than the whole line instead of dropping it', () => {
    const token = 'WWW';
    const { fits } = countingFits(unevenWidth, 2);

    expect(splitUnbrokenToken(token, fits)).toEqual(['W', 'W', 'W']);
  });

  it('bounds the measuring work for a 600-character token', () => {
    const token = 'A'.repeat(600);
    const limit = 50;
    const { accepted, fits, measured } = countingFits((text) => text.length, limit);

    const chunks = splitUnbrokenToken(token, fits);

    expect(chunks).toHaveLength(12);
    expectLosslessFittingChunks(token, chunks, accepted);

    // A galloping probe plus a binary search: about two measurements per doubling of
    // the chunk length, for each chunk.
    const perChunk = 2 * Math.ceil(Math.log2(limit + 1)) + 1;
    expect(measured.length).toBeLessThanOrEqual(chunks.length * perChunk);
    expect(measured.length).toBeLessThan(200);

    // The decrement-by-one scan this replaces needs over three thousand measurements
    // here, so reintroducing it fails this test.
    const scan = decrementScanMeasurements(token, countingFits((text) => text.length, limit).fits);
    expect(scan).toBeGreaterThan(3_000);
    expect(measured.length * 10).toBeLessThan(scan);

    // No candidate is ever much longer than a line, so no measurement reshapes the whole
    // remaining token.
    expect(Math.max(...measured.map((text) => text.length))).toBeLessThanOrEqual(2 * limit);
  });

  it('keeps measuring work near-linear when the token length doubles to 1200 characters', () => {
    const measure = (length: number) => {
      const token = 'A'.repeat(length);
      const { fits, measured } = countingFits((text) => text.length, 50);
      const chunks = splitUnbrokenToken(token, fits);
      expectLosslessFittingChunks(
        token,
        chunks,
        new Set(measured.filter((text) => text.length <= 50)),
      );
      return { chunks, measurements: measured.length };
    };
    const shorter = measure(600);
    const longer = measure(1200);

    expect(shorter.measurements).toBe(86);
    expect(longer.measurements).toBe(170);
    expect(longer.measurements).toBeLessThanOrEqual(shorter.measurements * 2);
    expect(longer.chunks).toHaveLength(shorter.chunks.length * 2);
  });
});
