import { describe, expect, it } from 'vitest';

import { splitUnbrokenToken } from './line-breaking.js';

/**
 * The long-token splitter, driven by deterministic width models instead of a font.
 *
 * The PDF renderer supplies a width check that really shapes each candidate; here a
 * counting stand-in makes both correctness and the amount of measuring observable. No
 * assertion depends on wall-clock time.
 */

type WidthModel = (text: string) => number;

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
});
